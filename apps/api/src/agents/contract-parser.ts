/**
 * 合同解析 Agent
 * 使用 LLM 从合同文本中提取费用规则
 */
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ContractFeeRulesSchema } from '@mall/shared';

const SYSTEM_PROMPT = `你是购物中心租赁合同费用规则提取专家。

从合同文本中提取费用计算规则，输出符合 JSON Schema 的结构化数据。

注意事项：
- "两者取高" = 每月比较固定租金和扣率租金，取高者
- 递增基准"按签约价" → base: "contract_start"
- 递增基准"按上期" → base: "previous"
- 免租期物业费未提及 → property_fee_free: false
- 保底递增需合同明确写"保底随固定租金同步递增"
- 没有明确写明的字段填 null
- 数值类型不加引号
- 日期格式 YYYY-MM-DD`;

/**
 * 使用 Claude 解析合同（准确率最高）
 */
export async function parseContractWithClaude(text: string) {
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
export async function parseContractWithDeepSeek(text: string) {
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
 * 解析合同（自动选择模型）
 * confidence < 阈值时升级到 Claude
 */
export async function parseContract(text: string, options?: { model?: 'claude' | 'deepseek' }) {
  const model = options?.model ?? 'deepseek';

  if (model === 'claude') {
    return parseContractWithClaude(text);
  }

  // 先用 DeepSeek，低置信度升级到 Claude
  const result = await parseContractWithDeepSeek(text);
  if (result.confidence < 0.8) {
    console.log(`置信度 ${result.confidence} < 0.8，升级到 Claude 重新解析`);
    return parseContractWithClaude(text);
  }

  return result;
}
