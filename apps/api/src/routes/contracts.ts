/**
 * 合同 + 账单 API 路由
 *
 * 合同：
 *   POST /parse              - 传文本解析（不保存）
 *   POST /upload-pdf         - 上传 PDF → 解析
 *   POST /                   - 保存合同到数据库
 *   GET  /list               - 合同列表
 *   GET  /:id                - 合同详情
 *
 * 账单：
 *   POST /bills/generate     - 生成并保存账单
 *   GET  /bills/list         - 账单列表
 *   GET  /bills/:id          - 账单详情（含明细）
 *
 * 其他：
 *   GET  /health             - 健康检查
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parseContract } from '../agents/contract-parser.js';
import { extractPdfFromBase64, isPdfFile } from '../services/pdf-parser.js';
import { ContractService } from '../services/contract-service.js';
import { BillService } from '../services/bill-service.js';

const app = new Hono();

// =============================================================
// 合同路由
// =============================================================

// 解析合同（不保存）
app.post('/parse', zValidator('json', z.object({
  contract_text: z.string().min(100, '合同文本过短'),
  model: z.enum(['claude', 'deepseek', 'mock']).optional(),
})), async (c) => {
  const { contract_text, model } = c.req.valid('json');
  try {
    const rules = await parseContract(contract_text, { model });
    return c.json({ success: true, data: rules, needs_review: rules.confidence < 0.8 });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '解析失败' }, 500);
  }
});

// 上传 PDF 解析（不保存）
app.post('/upload-pdf', zValidator('json', z.object({
  file_base64: z.string().min(100),
  model: z.enum(['claude', 'deepseek', 'mock']).optional(),
})), async (c) => {
  const { file_base64, model } = c.req.valid('json');
  try {
    const extraction = await extractPdfFromBase64(file_base64);
    const text = extraction.text.trim();
    if (text.length < 100) {
      return c.json({ success: false, error: `PDF 内容过短（${text.length} 字符）`, pages: extraction.pages }, 400);
    }
    const rules = await parseContract(text, { model });
    return c.json({
      success: true, data: rules, needs_review: rules.confidence < 0.8,
      pages: extraction.pages, text_length: text.length,
    });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '解析失败' }, 500);
  }
});

// 保存合同到数据库
const SaveContractSchema = z.object({
  contract_id: z.string().min(1),
  merchant_name: z.string().min(1),
  business_type: z.string().min(1),
  unit_id: z.string().min(1),
  floor: z.string().min(1),
  area: z.number().positive(),
  lease_start: z.string(),
  lease_end: z.string(),
  free_rent_start: z.string().nullable().optional(),
  free_rent_end: z.string().nullable().optional(),
  rent_type: z.string().min(1),
  rent_rules: z.any(),
  property_fee_rules: z.any().nullable().optional(),
  utility_rules: z.any().nullable().optional(),
  other_fee_rules: z.any().nullable().optional(),
  late_fee_rules: z.any().nullable().optional(),
  raw_contract_text: z.string().nullable().optional(),
  ai_confidence: z.number(),
  needs_review: z.boolean().optional(),
  notes: z.array(z.string()).nullable().optional(),
});

app.post('/', zValidator('json', SaveContractSchema), async (c) => {
  const data = c.req.valid('json');
  const contract = await ContractService.create({
    contractId: data.contract_id,
    merchantName: data.merchant_name,
    businessType: data.business_type,
    unitId: data.unit_id,
    floor: data.floor,
    area: data.area.toString(),
    leaseStart: data.lease_start,
    leaseEnd: data.lease_end,
    freeRentStart: data.free_rent_start ?? null,
    freeRentEnd: data.free_rent_end ?? null,
    rentType: data.rent_type,
    rentRules: data.rent_rules,
    propertyFeeRules: data.property_fee_rules ?? null,
    utilityRules: data.utility_rules ?? null,
    otherFeeRules: data.other_fee_rules ?? null,
    lateFeeRules: data.late_fee_rules ?? null,
    rawContractText: data.raw_contract_text ?? null,
    aiConfidence: data.ai_confidence.toString(),
    needsReview: data.needs_review ?? false,
    notes: data.notes ?? null,
    status: (data.needs_review ?? false) ? 'draft' : 'active',
  });
  return c.json({ success: true, data: contract }, 201);
});

// 合同列表
app.get('/list', async (c) => {
  const page = Number(c.req.query('page') ?? '1');
  const pageSize = Number(c.req.query('pageSize') ?? '20');
  const status = c.req.query('status');
  const businessType = c.req.query('businessType');
  const unitId = c.req.query('unitId');

  const result = await ContractService.list({ status, businessType, unitId }, page, pageSize);
  return c.json(result);
});

// 合同详情
app.get('/:id', async (c) => {
  const contract = await ContractService.getById(c.req.param('id'));
  if (!contract) return c.json({ success: false, error: '合同不存在' }, 404);
  return c.json({ success: true, data: contract });
});

// 更新合同
app.put('/:id', zValidator('json', SaveContractSchema.partial()), async (c) => {
  const data = c.req.valid('json');
  const updates: Record<string, unknown> = {};
  if (data.merchant_name) updates.merchantName = data.merchant_name;
  if (data.business_type) updates.businessType = data.business_type;
  if (data.area) updates.area = data.area.toString();
  if (data.rent_rules) updates.rentRules = data.rent_rules;
  if (data.property_fee_rules !== undefined) updates.propertyFeeRules = data.property_fee_rules;
  if (data.utility_rules !== undefined) updates.utilityRules = data.utility_rules;
  if (data.ai_confidence) updates.aiConfidence = data.ai_confidence.toString();

  const contract = await ContractService.update(c.req.param('id'), updates as any);
  if (!contract) return c.json({ success: false, error: '合同不存在' }, 404);
  return c.json({ success: true, data: contract });
});

// 删除合同
app.delete('/:id', async (c) => {
  await ContractService.delete(c.req.param('id'));
  return c.json({ success: true });
});

// =============================================================
// 账单路由
// =============================================================

const GenerateBillSchema = z.object({
  contract_id: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, '格式 YYYY-MM'),
  sales: z.number().min(0),
  elec_current: z.number().min(0),
  elec_previous: z.number().min(0),
  water_current: z.number().min(0),
  water_previous: z.number().min(0),
});

// 生成并保存账单
app.post('/bills/generate', zValidator('json', GenerateBillSchema), async (c) => {
  const data = c.req.valid('json');
  try {
    const bill = await BillService.generate({
      contractId: data.contract_id,
      period: data.period,
      sales: data.sales,
      elecCurrent: data.elec_current,
      elecPrevious: data.elec_previous,
      waterCurrent: data.water_current,
      waterPrevious: data.water_previous,
    });
    return c.json({ success: true, data: bill }, 201);
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '生成失败' }, 500);
  }
});

// 账单列表
app.get('/bills/list', async (c) => {
  const page = Number(c.req.query('page') ?? '1');
  const pageSize = Number(c.req.query('pageSize') ?? '20');
  const contractId = c.req.query('contractId');
  const period = c.req.query('period');
  const status = c.req.query('status');

  const result = await BillService.list({ contractId, period, status }, page, pageSize);
  return c.json(result);
});

// 账单详情
app.get('/bills/:id', async (c) => {
  const bill = await BillService.getById(c.req.param('id'));
  if (!bill) return c.json({ success: false, error: '账单不存在' }, 404);
  return c.json({ success: true, data: bill });
});

// 确认账单
app.post('/bills/:id/confirm', async (c) => {
  const bill = await BillService.confirm(c.req.param('id'));
  if (!bill) return c.json({ success: false, error: '账单不存在' }, 404);
  return c.json({ success: true, data: bill });
});

// 标记已付款
app.post('/bills/:id/paid', async (c) => {
  const bill = await BillService.markPaid(c.req.param('id'));
  if (!bill) return c.json({ success: false, error: '账单不存在' }, 404);
  return c.json({ success: true, data: bill });
});

// 删除账单
app.delete('/bills/:id', async (c) => {
  await BillService.delete(c.req.param('id'));
  return c.json({ success: true });
});

// =============================================================
// 健康检查
// =============================================================

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;