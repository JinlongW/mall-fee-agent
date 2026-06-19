# 购物中心费用核算 Agent — 多 Agent 划分与编排设计指南

> Agent 划分原则、ERP 多 Agent 架构参考、成熟方案对比 | 2026-06-19

---

## 一、Agent 划分四原则

```
1. 单一职责：一个 Agent 只做一件事
   ✗ "合同管理 Agent"（太宽泛）
   ✓ "合同费用规则提取 Agent"（具体明确）

2. 领域边界：按业务领域划分，不按技术层划分
   ✗ "PDF 解析 Agent"（技术层）
   ✓ "租金核算 Agent"（业务域）

3. 自治性：每个 Agent 能独立运行、独立测试、独立部署

4. 数据内聚：操作相同数据的 Agent 放一起，不同数据的分开
```

---

## 二、ERP 多 Agent 划分依据

```
维度 1：按业务流程链
├── 招商流程 → 招商辅助 Agent、品牌匹配 Agent
├── 计费流程 → 合同解析 Agent、费用核算 Agent、账单 Agent
├── 催缴流程 → 催缴策略 Agent
└── 决策流程 → 分析 Agent、风控 Agent

维度 2：按决策层级
├── 操作层（每天）→ 核算、出账、发送
├── 战术层（每周/月）→ 异常检测、催缴策略
└── 战略层（季度/年）→ 铺位优化、租金定价

维度 3：按数据域（DDD）
├── 合同域 → 合同解析 Agent
├── 财务域 → 账单 Agent、对账 Agent
├── 运营域 → 数据采集 Agent
└── 分析域 → 分析 Agent
```

---

## 三、四种架构模式

```
模式 1：Supervisor（主管模式）⭐ 先用这个
┌──────────┐
│Supervisor│ ← 统一调度
└────┬─────┘
  ┌──┼──┐
  ▼  ▼  ▼
  A  B  C   ← Worker Agent

模式 2：Pipeline（流水线）⭐ 核心流程用
A → B → C → D → E

模式 3：Peer-to-Peer（对等协作）
A ←→ B  ← 协商决策

模式 4：Hierarchical（层级）⭐ 后期规模化用
Director → Manager → Worker
```

---

## 四、你的 Agent 划分方案

### V1（5 个 Agent）

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
│ 合同解析 │→│ 费用核算 │→│ 账单生成 │  │ 对账催缴  │  │ 查询问答  │
│(LLM)    │  │(规则引擎)│  │(模板)    │  │(LLM+规则)│  │(LLM)     │
└─────────┘  └─────────┘  └─────────┘  └──────────┘  └──────────┘
```

| Agent | 职责 | 模型 | 触发 |
|-------|------|------|------|
| 合同解析 | 合同→费用规则 JSON | Claude/DeepSeek-V3 | 新合同上传 |
| 费用核算 | 按规则计算每户费用 | 不需要 LLM（TS 代码） | 每月初批量 |
| 账单生成 | PDF + 多渠道发送 | 不需要 LLM | 核算完成 |
| 对账催缴 | 应收vs实收+分级催缴 | DeepSeek-V3 | 收款/逾期 |
| 查询问答 | 自然语言查费用 | DeepSeek-V3 | 用户提问 |

### V2 扩展（+3 个）

| Agent | 职责 | 为什么独立 |
|-------|------|-----------|
| 异常检测 | 费用/营业额异常 | 单一职责：核算不做分析 |
| 商户风控 | 欠费/退租风险评估 | 决策类与操作类分开 |
| 铺位优化 | 每平米产出分析 | 战略层，按月/季度运行 |

---

## 五、划分决策流程

```
新需求来了：
├── 职责与已有 Agent 重叠？ → Yes → 扩展现有
└── No → 需要不同模型？ → Yes → 新建 Agent
    └── No → 数据域不同？ → Yes → 新建 Agent
        └── No → 独立触发？ → Yes → 新建 Agent
            └── No → 扩展现有 Agent

简单记：不同模型/不同触发/不同数据 → 新建；否则扩展
```

---

## 六、成熟方案对比

| 框架 | 核心概念 | TS 支持 | 推荐度 |
|------|---------|---------|--------|
| **LangGraph** | State+Node+Edge 状态机 | ✅ langgraphjs | ⭐⭐⭐⭐⭐ |
| **CrewAI** | Agent+Task+Crew 角色 | ❌ Python 为主 | ⭐⭐⭐（学思路）|
| **AutoGen** | 对话式多 Agent 协作 | ⚠️ 有限 | ⭐⭐⭐ |

### 推荐实施路径

```
V1（5-8 个 Agent）：自己实现轻量编排器
├── TS 函数 + Zod Schema + BullMQ
└── 足够应对初期

V2（> 8 个 Agent）：引入 LangGraph.js
├── 状态管理清晰、可视化工作流
└── 条件分支+循环

V3（集团化）：自建 Agent 平台
├── Agent 注册中心 + 市场 + 可视化编排
└── 监控和治理
```

---

## 七、国内大模型支持

### 切换只需一行代码

```typescript
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 使用方式与 Claude 完全一样
const { object } = await generateObject({
  model: deepseek('deepseek-chat'),
  schema: ContractFeeRulesSchema,
  prompt: contractText,
});
```

### 推荐组合

```
├── 合同解析 → Claude Sonnet 或 DeepSeek-V3（准确率优先）
├── 简单查询 → DeepSeek-V3（便宜快速）
├── 长合同 → Kimi（200K 上下文）
└── 交叉验证 → 不同模型互相校验
```
