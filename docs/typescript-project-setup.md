# 购物中心费用核算 AI Agent — TypeScript 项目搭建指南

> 全栈 TypeScript，从项目初始化到生产部署 | 2026-06-19

---

## 一、技术栈选型

```
运行时：Node.js 20+ / Bun（可选）
语言：TypeScript 5.x（严格模式）
后端：Hono（轻量，同份代码可部署到 Node/Deno/边缘）
前端：React 19 + Ant Design 5
AI SDK：Vercel AI SDK + @ai-sdk/anthropic
Schema：Zod（类型安全 + 运行时校验）
数据库：PostgreSQL + Drizzle ORM
缓存：Redis
PDF：unpdf（解析）+ @react-pdf/renderer（生成）
任务队列：BullMQ
部署：Docker + 阿里云 / Vercel
包管理：pnpm
测试：Vitest
代码规范：Biome
```

### 选型理由

```
Hono（不是 Express/NestJS）：极轻量 < 15KB，TS 类型推导完美，10 分钟上手
Drizzle ORM（不是 Prisma）：类型安全，无生成步骤，性能更好
Vercel AI SDK：统一接口切模型只改一行，内置 structured output + Zod
Zod（不是 JSON Schema）：Schema → Type 自动推导，与 AI SDK 深度集成
```

---

## 二、项目结构

```
mall-fee-agent/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml
├── packages/
│   ├── shared/              # 共享 Zod Schema + 类型
│   │   └── src/schemas/
│   │       ├── contract.ts  # ContractFeeRulesSchema
│   │       └── billing.ts   # BillDetailSchema
│   └── fee-engine/          # 费用核算引擎（核心）
│       ├── src/
│       │   ├── engine.ts    # 主引擎
│       │   ├── rent.ts      # 租金（4 种模式）
│       │   ├── utilities.ts # 水电费
│       │   └── anomaly.ts   # 异常检测
│       └── tests/
├── apps/
│   ├── api/                 # Hono 后端
│   │   └── src/
│   │       ├── agents/      # AI Agent（合同解析/账单生成/对账）
│   │       ├── routes/      # API 路由
│   │       └── db/          # Drizzle 表定义
│   └── web/                 # React 前端
└── tools/
```

---

## 三、核心代码

### 3.1 合同费用规则 Schema（Zod）

```typescript
// packages/shared/src/schemas/contract.ts
import { z } from 'zod';

export const ContractFeeRulesSchema = z.object({
  contract_id: z.string(),
  merchant: z.object({
    name: z.string(),
    business_type: z.enum(['餐饮','零售','娱乐','服务','超市','其他']),
  }),
  unit: z.object({
    unit_id: z.string(),
    floor: z.string(),
    area: z.number(),
  }),
  lease_period: z.object({
    start: z.string(),
    end: z.string(),
    free_rent: z.object({
      start: z.string().nullable(),
      end: z.string().nullable(),
      rent_free: z.boolean(),
      property_fee_free: z.boolean(),
      method: z.enum(['direct','spread','refund']).nullable(),
    }).nullable(),
  }),
  rent: z.object({
    type: z.enum(['fixed','turnover','take_higher','tiered']),
    fixed: z.object({
      base_price: z.number().nullable(),
      escalation: z.object({
        frequency: z.enum(['yearly','bi_yearly','tri_yearly']).nullable(),
        rate: z.number().nullable(),
        base: z.enum(['contract_start','previous']).nullable(),
      }).nullable(),
    }).nullable(),
    turnover: z.object({
      rate: z.number().nullable(),
      minimum: z.number().nullable(),
      minimum_escalates: z.boolean().nullable(),
    }).nullable(),
    tiered: z.object({
      tiers: z.array(z.object({
        limit: z.number().nullable(),
        rate: z.number(),
      })),
    }).nullable(),
  }),
  property_fee: z.object({
    price: z.number(),
    includes_ac: z.boolean(),
    shared_ratio: z.number(),
  }).nullable(),
  utilities: z.object({
    electricity: z.object({
      type: z.enum(['flat','tiered','tou','tiered_tou']),
      price: z.number().nullable(),
      tiers: z.array(z.any()).nullable(),
      loss_rate: z.number(),
      shared_ratio: z.number(),
    }).nullable(),
    water: z.object({
      price: z.number(),
      sewage_rate: z.number(),
    }).nullable(),
  }).nullable(),
  other_fees: z.record(z.any()).nullable(),
  late_fee: z.object({
    rate: z.number(),
    grace_days: z.number(),
  }).nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).nullable(),
});

export type ContractFeeRules = z.infer<typeof ContractFeeRulesSchema>;
```

### 3.2 费用核算引擎

```typescript
// packages/fee-engine/src/rent.ts

export function calcFixedRent(rules: ContractFeeRules, period: string): number {
  const fixed = rules.rent.fixed!;
  const basePrice = fixed.base_price ?? (fixed.base_amount! / rules.unit.area);
  const yearsElapsed = Math.floor(monthsBetween(rules.lease_period.start, period) / 12);

  const price = fixed.escalation?.base === 'previous'
    ? Array.from({length: yearsElapsed}).reduce(
        (p) => p * (1 + (fixed.escalation?.rate ?? 0)), basePrice)
    : basePrice * Math.pow(1 + (fixed.escalation?.rate ?? 0), yearsElapsed);

  return rules.unit.area * price;
}

export function calcTieredRent(
  tiers: Array<{limit: number|null; rate: number}>, sales: number
): number {
  let total = 0, remaining = sales, prevLimit = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierSize = tier.limit !== null ? tier.limit - prevLimit : Infinity;
    total += Math.min(remaining, tierSize) * tier.rate;
    remaining -= tierSize;
    prevLimit = tier.limit ?? prevLimit;
  }
  return total;
}

export function calcRent(rules: ContractFeeRules, period: string, sales: number): number {
  if (isFreeRentPeriod(rules, period)) return 0;
  const fixed = calcFixedRent(rules, period);
  const turnover = Math.max(sales * (rules.rent.turnover?.rate ?? 0), rules.rent.turnover?.minimum ?? 0);

  switch (rules.rent.type) {
    case 'fixed': return fixed;
    case 'turnover': return turnover;
    case 'take_higher': return Math.max(fixed, turnover);
    case 'tiered': return calcTieredRent(rules.rent.tiered!.tiers, sales);
  }
}
```

```typescript
// packages/fee-engine/src/engine.ts

export function calcMonthlyFees(input: CalcInput): BillDetail {
  const { rules, period, meters, sales } = input;

  const bill: BillDetail = {
    rent: calcRent(rules, period, sales),
    property_fee: rules.property_fee ? rules.unit.area * rules.property_fee.price : 0,
    electricity: calcElectricity(meters, rules.utilities?.electricity),
    water: rules.utilities?.water
      ? (meters.water_current - meters.water_previous) * rules.utilities.water.price : 0,
    sewage: rules.utilities?.water
      ? (meters.water_current - meters.water_previous) * rules.utilities.water.sewage_rate : 0,
    other_fees: calcOtherFees(rules.other_fees, sales),
  };

  bill.total = bill.rent + bill.property_fee + bill.electricity
    + bill.water + bill.sewage + Object.values(bill.other_fees).reduce((a,b) => a+b, 0);

  bill.anomalies = detectAnomalies(bill, input.history);
  return bill;
}
```

### 3.3 合同解析 Agent

```typescript
// apps/api/src/agents/contract-parser.ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { ContractFeeRulesSchema } from '@mall/shared';

export async function parseContract(text: string) {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: ContractFeeRulesSchema,
    system: `你是购物中心租赁合同费用规则提取专家。
    注意事项：
    - "两者取高"=每月比较固定租金和扣率租金取高者
    - 递增"按签约价"→ contract_start，"按上期"→ previous
    - 免租期物业费未提及→ property_fee_free: false
    - 保底递增需合同明确写"保底随固定租金同步递增"`,
    prompt: `请提取以下合同的费用规则：\n\n${text}`,
  });
  return object;  // 100% 符合 Schema
}
```

### 3.4 API 路由

```typescript
// apps/api/src/routes/contracts.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parseContract } from '../agents/contract-parser.js';

const app = new Hono();

app.post('/parse', zValidator('json', z.object({
  contract_text: z.string().min(100),
})), async (c) => {
  const { contract_text } = c.req.valid('json');
  const rules = await parseContract(contract_text);
  return c.json({
    success: true,
    data: rules,
    needs_review: rules.confidence < 0.8,
  });
});

export default app;
```

---

## 四、开发路线图

```
Week 1-2：基础
├── pnpm monorepo 初始化
├── Zod Schema（ContractFeeRulesSchema）
├── 费用核算引擎 + Vitest 测试（覆盖 4 种租金模式）
└── Docker 环境（PostgreSQL + Redis）

Week 3-4：合同解析
├── PDF → 文本（unpdf）
├── Claude API + JSON Schema 约束
├── 3 个 Few-shot 示例
└── 10 份测试合同验证

Week 5-6：账单 + UI
├── PDF 账单生成
├── React UI（合同上传/解析/核算/审核）
└── API 联调

Week 7-8：种子验证
├── 2-3 个购物中心试用
└── 准确率 > 95%
```

---

## 五、关键依赖

```json
{
  "ai": "^4.0.0",
  "@ai-sdk/anthropic": "^1.0.0",
  "zod": "^3.23.0",
  "hono": "^4.0.0",
  "@hono/zod-validator": "^0.4.0",
  "drizzle-orm": "^0.36.0",
  "postgres": "^3.4.0",
  "unpdf": "^0.12.0",
  "@react-pdf/renderer": "^4.0.0",
  "bullmq": "^5.0.0",
  "typescript": "^5.6.0",
  "vitest": "^2.0.0",
  "biome": "^1.9.0",
  "tsup": "^8.0.0"
}
```

---

## 六、快速开始

```bash
# 1. 创建项目
mkdir mall-fee-agent && cd mall-fee-agent
pnpm init

# 2. 启动基础设施
docker compose up -d  # PostgreSQL + Redis

# 3. 安装依赖
pnpm add ai @ai-sdk/anthropic zod hono @hono/zod-validator drizzle-orm postgres
pnpm add -D typescript vitest tsup

# 4. 初始化 monorepo 结构
mkdir -p packages/shared/src packages/fee-engine/src apps/api/src apps/web/src

# 5. 开发
cd apps/api && pnpm dev   # http://localhost:3000
cd apps/web && pnpm dev   # http://localhost:5173
```
