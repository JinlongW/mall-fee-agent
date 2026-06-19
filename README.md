# 🏬 购物中心合同费用自动核算 AI Agent

> 现有物业系统的"AI 大脑" — 读取合同 → 理解规则 → 自动核算 → 智能催缴

## 产品定位

不做又一个 ERP，而是让现有系统变聪明：

```
┌─────────────────────────────────────────┐
│     客户现有的物业/ERP 系统（不动它）      │
└──────────────┬──────────────────────────┘
               │
    ┌──────────▼──────────┐
    │  🧠 Mall Fee Agent  │
    │                     │
    │  读取合同 → 理解规则  │
    │  读取数据 → 智能核算  │
    │  生成账单 → 推送通知  │
    │  对账催缴 → 自动闭环  │
    │  异常发现 → 主动预警  │
    └──────────┬──────────┘
               │
    输出：PDF 账单 / Excel / API 回推
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 20+ |
| 语言 | TypeScript 5.x (strict) |
| 后端 | Hono |
| 前端 | React 19 + Ant Design 5 |
| AI | Vercel AI SDK + Claude / DeepSeek |
| Schema | Zod |
| 数据库 | PostgreSQL + Drizzle ORM |
| 缓存 | Redis |
| 队列 | BullMQ |
| 部署 | Docker |

## 项目结构

```
mall-fee-agent/
├── packages/
│   ├── shared/              # 共享 Zod Schema + 类型
│   └── fee-engine/          # 费用核算引擎
├── apps/
│   ├── api/                 # Hono 后端 API
│   └── web/                 # React 前端
├── docs/                    # 设计文档
├── docker-compose.yml       # PostgreSQL + Redis
└── pnpm-workspace.yaml
```

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库
docker compose up -d

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key

# 4. 开发模式
pnpm dev
```

## 费用计算模式

| 模式 | 说明 | 示例 |
|------|------|------|
| 固定租金 | 面积 × 单价 + 递增 | 100㎡ × ¥150/㎡ = ¥15,000/月 |
| 扣率租金 | 营业额 × 扣率 | ¥200,000 × 12% = ¥24,000 |
| 两者取高 | MAX(固定, 扣率) | MAX(15000, 24000) = 24000 |
| 阶梯扣率 | 分段计算累加 | ≤10万: 8%, 10-30万: 12%, >30万: 15% |

## 开发路线图

- **Phase 1 (1-2月)**：合同解析 Agent + 费用核算引擎 MVP
- **Phase 2 (3-4月)**：账单生成 + 自动对账 + 催缴
- **Phase 3 (5-8月)**：异常检测 + 风控 + 集团化

## License

Private
