import { defineConfig } from 'drizzle-kit'

// 数据库结构变更只用这里生成的迁移文件（01 章第 5 节）
export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  casing: 'snake_case',
})
