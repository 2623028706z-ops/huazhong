// 执行 db/migrations 里 Drizzle Kit 生成的迁移（接口测试的模板库也用这里）
import path from 'node:path'
import { mkdtemp, readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client.ts'

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations')

export async function runMigrations(db: Db, through?: number): Promise<void> {
  if (through === undefined) {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    return
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'huazhong-migrations-'))
  try {
    const journal = JSON.parse(
      await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { idx: number; tag: string }[] }
    journal.entries = journal.entries.filter((entry) => entry.idx <= through)
    await mkdir(path.join(directory, 'meta'))
    await writeFile(path.join(directory, 'meta/_journal.json'), JSON.stringify(journal))
    for (const entry of journal.entries)
      await copyFile(
        path.join(MIGRATIONS_DIR, `${entry.tag}.sql`),
        path.join(directory, `${entry.tag}.sql`),
      )
    await migrate(db, { migrationsFolder: directory })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
