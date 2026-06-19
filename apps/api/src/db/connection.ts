/**
 * 数据库连接配置
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// 数据库连接参数
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/mall_fee_agent';

// 创建 postgres 客户端
const client = postgres(dbUrl, {
  max: 10, // 最大连接数
  idle_timeout: 20, // 空闲超时（秒）
  connect_timeout: 10, // 连接超时（秒）
});

// 创建 drizzle 实例
export const db = drizzle(client, { schema });

export type DbClient = typeof db;

/**
 * 数据库连接测试
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await client`SELECT 1 as test`;
    return result.length > 0 && result[0].test === 1;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

/**
 * 关闭数据库连接
 */
export async function closeConnection(): Promise<void> {
  await client.end();
}
