/**
 * 数据库迁移脚本
 *
 * 使用：pnpm tsx tools/migrate.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/mall_fee_agent';

async function main() {
  const client = postgres(dbUrl, { max: 1 });

  console.log('🔗 数据库连接中...');
  try {
    await client`SELECT 1`;
    console.log('✅ 数据库连接成功');
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }

  // 创建迁移记录表
  await client`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // 获取所有迁移文件
  const migrationsDir = join(__dirname, '..', 'src', 'db', 'migrations');
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  // 获取已执行的迁移
  const executedRows = await client<{ name: string }[]>`SELECT name FROM _migrations`;
  const executedSet = new Set(executedRows.map((r) => r.name));

  // 执行未执行的迁移
  for (const file of files) {
    if (executedSet.has(file)) {
      console.log(`⏭️  跳过已执行: ${file}`);
      continue;
    }

    console.log(`🚀 执行迁移: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    try {
      await client.unsafe(sql);
      await client`INSERT INTO _migrations (name) VALUES (${file})`;
      console.log(`✅ 完成: ${file}`);
    } catch (error) {
      console.error(`❌ 失败: ${file}`, error);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('🎉 所有迁移已完成');
}

main();