/**
 * 合同解析 Agent
 * 使用 LLM 从合同文本中提取费用规则
 *
 * 包含 5 个 Few-shot 示例，覆盖：
 * 1. 固定租金
 * 2. 扣率租金
 * 3. 两者取高
 * 4. 阶梯扣率
 * 5. 含免租期 + 递增 + 保底的复杂组合
 */
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ContractFeeRulesSchema, type ContractFeeRules } from '@mall/shared';

// =============================================================
// Few-shot 示例库
// =============================================================

const FEW_SHOT_EXAMPLES = `

## 示例 1：纯固定租金 + 递增

合同原文：
"第二条 租赁期限：2026年1月1日至2028年12月31日，共3年。
第三条 租金：铺位B1-012，面积80平方米。每月每平方米120元，月租金9,600元。
自第二年起每年递增6%，递增基数为签约时单价。"

正确提取：
{
  "contract_id": "HT-2026-001",
  "merchant": { "name": "示例商户1", "business_type": "零售" },
  "unit": { "unit_id": "B1-012", "floor": "B1", "area": 80 },
  "lease_period": {
    "start": "2026-01-01",
    "end": "2028-12-31",
    "free_rent": null
  },
  "rent": {
    "type": "fixed",
    "fixed": {
      "base_price": 120,
      "base_amount": 9600,
      "escalation": { "frequency": "yearly", "rate": 0.06, "base": "contract_start" }
    },
    "turnover": null,
    "tiered": null
  },
  "property_fee": null,
  "utilities": null,
  "other_fees": null,
  "late_fee": null,
  "confidence": 0.95,
  "notes": null
}

---

## 示例 2：纯扣率租金

合同原文：
"第二条 租赁期限：2026年3月1日至2029年2月28日。
第三条 租金：铺位L2-005，面积150平方米。按当月营业额的10%计算租金，无保底。"

正确提取：
{
  "contract_id": "HT-2026-002",
  "merchant": { "name": "示例商户2", "business_type": "餐饮" },
  "unit": { "unit_id": "L2-005", "floor": "L2", "area": 150 },
  "lease_period": {
    "start": "2026-03-01",
    "end": "2029-02-28",
    "free_rent": null
  },
  "rent": {
    "type": "turnover",
    "fixed": null,
    "turnover": { "rate": 0.10, "minimum": null, "minimum_escalates": false },
    "tiered": null
  },
  "property_fee": null,
  "utilities": null,
  "other_fees": null,
  "late_fee": null,
  "confidence": 0.93,
  "notes": null
}

---

## 示例 3：两者取高（最常见）

合同原文：
"第三条 租金：铺位B1-023，面积120.5平方米。
租金采用固定租金与营业额扣率两者取高：
（一）固定租金：每月每平方米150元，即月固定租金18,075元。
自第二年起每年递增5%，递增基数为签约时单价。
（二）扣率：按当月营业额的12%计算。
（三）保底租金18,075元，随固定租金同步递增。
免租期3个月（2026年1月1日至2026年3月31日），免租期内免收租金，物业费正常收取。"

正确提取：
{
  "contract_id": "HT-2026-003",
  "merchant": { "name": "示例商户3", "business_type": "餐饮" },
  "unit": { "unit_id": "B1-023", "floor": "B1", "area": 120.5 },
  "lease_period": {
    "start": "2026-01-01",
    "end": "2028-12-31",
    "free_rent": {
      "start": "2026-01-01",
      "end": "2026-03-31",
      "rent_free": true,
      "property_fee_free": false,
      "method": "direct"
    }
  },
  "rent": {
    "type": "take_higher",
    "fixed": {
      "base_price": 150,
      "base_amount": 18075,
      "escalation": { "frequency": "yearly", "rate": 0.05, "base": "contract_start" }
    },
    "turnover": { "rate": 0.12, "minimum": 18075, "minimum_escalates": true },
    "tiered": null
  },
  "property_fee": null,
  "utilities": null,
  "other_fees": null,
  "late_fee": null,
  "confidence": 0.97,
  "notes": null
}

---

## 示例 4：阶梯扣率

合同原文：
"第三条 租金：铺位L3-008，面积200平方米。
按营业额阶梯扣率计算租金：
月营业额≤10万部分：扣率8%
月营业额10-30万部分：扣率12%
月营业额>30万部分：扣率15%
无保底租金。"

正确提取：
{
  "contract_id": "HT-2026-004",
  "merchant": { "name": "示例商户4", "business_type": "零售" },
  "unit": { "unit_id": "L3-008", "floor": "L3", "area": 200 },
  "lease_period": {
    "start": "2026-01-01",
    "end": "2028-12-31",
    "free_rent": null
  },
  "rent": {
    "type": "tiered",
    "fixed": null,
    "turnover": null,
    "tiered": {
      "tiers": [
        { "limit": 100000, "rate": 0.08 },
        { "limit": 300000, "rate": 0.12 },
        { "limit": null, "rate": 0.15 }
      ]
    }
  },
  "property_fee": null,
  "utilities": null,
  "other_fees": null,
  "late_fee": null,
  "confidence": 0.94,
  "notes": null
}

---

## 示例 5：完整复杂合同（固定 + 物业费 + 水电费 + 其他）

合同原文：
"第二条 租赁期限：2026年1月1日至2030年12月31日，共5年。
免租期6个月（2026年1月1日至2026年6月30日），免租期内免收租金及物业费。
第三条 租金：铺位L1-105，面积300平方米。
固定租金：每月每平方米180元，月租金54,000元。
每两年递增8%，递增基数为上期租金。
第四条 物业管理费：每月每平方米35元（含中央空调），公摊比例15%。
第五条 水电费：
电费按表实抄，执行商业分时电价，线损率2%，公摊比例15%。
水费4.5元/吨，污水处理费0.9元/吨。
第六条 其他费用：
推广费：固定每月2,000元；
POS系统使用费：固定每月500元；
垃圾清运费：固定每月300元。
第七条 滞纳金：逾期每日按应付款项万分之五计算，宽限期15天。"

正确提取：
{
  "contract_id": "HT-2026-005",
  "merchant": { "name": "示例商户5", "business_type": "超市" },
  "unit": { "unit_id": "L1-105", "floor": "L1", "area": 300 },
  "lease_period": {
    "start": "2026-01-01",
    "end": "2030-12-31",
    "free_rent": {
      "start": "2026-01-01",
      "end": "2026-06-30",
      "rent_free": true,
      "property_fee_free": true,
      "method": "direct"
    }
  },
  "rent": {
    "type": "fixed",
    "fixed": {
      "base_price": 180,
      "base_amount": 54000,
      "escalation": { "frequency": "bi_yearly", "rate": 0.08, "base": "previous" }
    },
    "turnover": null,
    "tiered": null
  },
  "property_fee": {
    "price": 35,
    "includes_ac": true,
    "shared_ratio": 0.15
  },
  "utilities": {
    "electricity": {
      "type": "tou",
      "price": null,
      "tiers": null,
      "loss_rate": 0.02,
      "shared_ratio": 0.15
    },
    "water": {
      "price": 4.5,
      "sewage_rate": 0.9
    }
  },
  "other_fees": {
    "marketing": { "type": "fixed", "amount": 2000 },
    "pos_fee": { "type": "fixed", "amount": 500 },
    "garbage": { "type": "fixed", "amount": 300 }
  },
  "late_fee": {
    "rate": 0.0005,
    "grace_days": 15
  },
  "confidence": 0.92,
  "notes": null
}`;

const SYSTEM_PROMPT = `你是购物中心租赁合同费用规则提取专家。

从合同文本中提取费用计算规则，输出符合 JSON Schema 的结构化数据。

【关键边界规则】
1. "两者取高" = 每月比较固定租金和扣率租金，取高者 → rent.type = "take_higher"
2. 递增基准"按签约价"/"按原单价" → base = "contract_start"
3. 递增基准"按上期"/"按上年度" → base = "previous"
4. 免租期未提物业费 → property_fee_free = false
5. 免租期明确"含物业费"或"全免" → property_fee_free = true
6. 保底递增：合同写"保底随固定租金同步递增"或"保底按比例递增" → minimum_escalates = true
7. 阶梯断点理解：limit 表示"该段上限"，最后一段 limit = null 表示无上限
8. "中央空调"包含在物业费中 → includes_ac = true
9. 滞纳金"万分之五" = 0.0005；"千分之三" = 0.003

【数据格式】
- 没有明确写明的字段填 null
- 数值类型不加引号
- 日期格式 YYYY-MM-DD
- 面积单位平方米（㎡）

【输出顺序】
按以下顺序提取：contract_id → merchant → unit → lease_period → rent → property_fee → utilities → other_fees → late_fee → confidence → notes

【置信度评估】
- 0.95+：所有关键信息齐全无歧义
- 0.85-0.95：关键信息齐全，个别细节模糊
- 0.70-0.85：缺少关键字段（如免租期、保底规则）或存在歧义
- < 0.70：信息严重缺失

${FEW_SHOT_EXAMPLES}`;

/**
 * 使用 Claude 解析合同（准确率最高）
 */
export async function parseContractWithClaude(text: string): Promise<ContractFeeRules> {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: ContractFeeRulesSchema,
    system: SYSTEM_PROMPT,
    prompt: `请提取以下合同的费用规则：\n\n${text}`,
  });
  return object;
}

/**
 * 使用 DeepSeek 解析合同（便宜快速）
 */
export async function parseContractWithDeepSeek(text: string): Promise<ContractFeeRules> {
  const deepseek = createOpenAICompatible({
    name: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  });

  const { object } = await generateObject({
    model: deepseek('deepseek-chat'),
    schema: ContractFeeRulesSchema,
    system: SYSTEM_PROMPT,
    prompt: `请提取以下合同的费用规则：\n\n${text}`,
  });
  return object;
}

/**
 * Mock 解析器（用于本地开发，无 API Key 时使用）
 * 根据文本特征智能返回匹配的示例
 */
function parseMock(text: string): ContractFeeRules {
  const hasTakeHigher = text.includes('两者取高') || text.includes('取高');
  const hasFreeRent = text.includes('免租期') || text.includes('免租');

  // 提取合同编号
  const contractMatch = text.match(/HT[-\s]?(\d{4})[-\s]?(\w+)/);
  const contractId = contractMatch ? contractMatch[0].replace(/\s/g, '') : 'HT-2026-MOCK';

  // 提取面积
  const areaMatch = text.match(/面积\s*(\d+(?:\.\d+)?)\s*平方米/);
  const area = areaMatch ? Number(areaMatch[1]) : 100;

  // 提取铺位编号
  const unitMatch = text.match(/铺位\s*([A-Z]?\d+[-\w]+)/);
  const unitId = unitMatch ? unitMatch[1] : 'B1-001';

  // 提取单价
  const priceMatch = text.match(/每平方米\s*(\d+(?:\.\d+)?)\s*元/);
  const basePrice = priceMatch ? Number(priceMatch[1]) : 150;

  // 提取扣率（优先匹配"营业额...X%"或"扣率...X%"附近）
  const turnoverRateMatch = text.match(/(?:营业额|扣率|扣点)[^。；]*?(\d+(?:\.\d+)?)\s*%/);
  const rate = turnoverRateMatch ? Number(turnoverRateMatch[1]) / 100 : 0.12;

  if (hasTakeHigher) {
    const monthlyRent = basePrice * area;
    return {
      contract_id: contractId,
      merchant: { name: 'Mock 商户', business_type: '餐饮' },
      unit: { unit_id: unitId, floor: unitId.charAt(0), area },
      lease_period: {
        start: '2026-01-01',
        end: '2028-12-31',
        free_rent: hasFreeRent
          ? {
              start: '2026-01-01',
              end: '2026-03-31',
              rent_free: true,
              property_fee_free: false,
              method: 'direct',
            }
          : null,
      },
      rent: {
        type: 'take_higher',
        fixed: {
          base_price: basePrice,
          base_amount: monthlyRent,
          escalation: { frequency: 'yearly', rate: 0.05, base: 'contract_start' },
        },
        turnover: { rate, minimum: monthlyRent, minimum_escalates: true },
        tiered: null,
      },
      property_fee: { price: 25, includes_ac: true, shared_ratio: 0.15 },
      utilities: {
        electricity: {
          type: 'flat' as const,
          price: 0.85,
          tiers: null,
          loss_rate: 0.02,
          shared_ratio: 0.15,
        },
        water: { price: 4.5, sewage_rate: 0.9 },
      },
      other_fees: null,
      late_fee: { rate: 0.0005, grace_days: 10 },
      confidence: 0.88,
      notes: ['【Mock 模式】未配置 API Key，使用本地规则匹配'],
    };
  }

  // 默认固定租金
  return {
    contract_id: contractId,
    merchant: { name: 'Mock 商户', business_type: '零售' },
    unit: { unit_id: unitId, floor: unitId.charAt(0), area },
    lease_period: {
      start: '2026-01-01',
      end: '2028-12-31',
      free_rent: null,
    },
    rent: {
      type: 'fixed',
      fixed: {
        base_price: basePrice,
        base_amount: basePrice * area,
        escalation: null,
      },
      turnover: null,
      tiered: null,
    },
    property_fee: { price: 25, includes_ac: false, shared_ratio: 0.15 },
    utilities: {
      electricity: {
        type: 'flat' as const,
        price: 0.85,
        tiers: null,
        loss_rate: 0.02,
        shared_ratio: 0.15,
      },
      water: { price: 4.5, sewage_rate: 0.9 },
    },
    other_fees: null,
    late_fee: null,
    confidence: 0.82,
    notes: ['【Mock 模式】未配置 API Key'],
  };
}

/**
 * 解析合同（自动选择模型 + 低置信度升级）
 */
export async function parseContract(
  text: string,
  options?: { model?: 'claude' | 'deepseek' | 'mock' }
): Promise<ContractFeeRules> {
  const model = options?.model ?? 'deepseek';

  // Mock 模式：本地规则匹配，无 API Key 也能演示
  if (model === 'mock' || !process.env.DEEPSEEK_API_KEY) {
    console.log('[ContractParser] 使用 Mock 模式（未配置 DEEPSEEK_API_KEY）');
    return parseMock(text);
  }

  if (model === 'claude') {
    return parseContractWithClaude(text);
  }

  // 先用 DeepSeek，低置信度升级到 Claude
  const result = await parseContractWithDeepSeek(text);
  if (result.confidence < 0.8) {
    console.log(`[ContractParser] 置信度 ${result.confidence} < 0.8，升级到 Claude 重新解析`);
    return parseContractWithClaude(text);
  }

  return result;
}