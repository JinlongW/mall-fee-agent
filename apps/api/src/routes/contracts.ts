/**
 * 合同相关 API 路由
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parseContract } from '../agents/contract-parser.js';

const app = new Hono();

// 解析合同
app.post('/parse', zValidator('json', z.object({
  contract_text: z.string().min(100, '合同文本过短'),
  model: z.enum(['claude', 'deepseek', 'auto']).optional(),
})), async (c) => {
  const { contract_text, model } = c.req.valid('json');

  try {
    const rules = await parseContract(contract_text, {
      model: model === 'auto' ? undefined : model,
    });

    return c.json({
      success: true,
      data: rules,
      needs_review: rules.confidence < 0.8,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '解析失败',
    }, 500);
  }
});

// 健康检查
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
