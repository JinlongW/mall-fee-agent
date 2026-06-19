/**
 * API 入口
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import contracts from './routes/contracts.js';

const app = new Hono();

// 中间件
app.use('*', cors());

// 路由
app.route('/api/contracts', contracts);

// 根路由
app.get('/', (c) => {
  return c.json({
    name: 'mall-fee-agent',
    version: '0.1.0',
    description: '购物中心合同费用自动核算 + 账单生成 AI Agent',
  });
});

// 启动
const port = Number(process.env.API_PORT) || 3000;
console.log(`🚀 API Server running at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
