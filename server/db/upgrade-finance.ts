import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { createDb } from './client.ts'
import { runMigrations } from './migrate.ts'
import {
  alreadyContracted,
  backfillSources,
  balances,
  lockLegacySources,
  mappedAnomalies,
  sourceAnomalies,
  verifySources,
  type LegacyPayment,
  type UpgradeOptions,
  type UpgradeReport,
} from './upgrade-finance-data.ts'

export type { UpgradeOptions, UpgradeReport } from './upgrade-finance-data.ts'
const EXPANSION_STAGE = 5
export function assertLocalUpgradeUrl(value: string): void {
  const url = new URL(value)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/(?:hz_|test|huazhong_test)/.test(url.pathname) ||
    url.search.length !== 0
  )
    throw new Error('Finance upgrade is restricted to explicitly named local test databases')
}
async function writeReport(options: UpgradeOptions, report: UpgradeReport): Promise<void> {
  if (report.phase === 'already-contracted') return
  if (options.reportPath) await writeFile(options.reportPath, JSON.stringify(report, null, 2))
}
async function backfill(
  pool: pg.Pool,
  sources: LegacyPayment[],
  report: UpgradeReport,
  failAt: UpgradeOptions['failAt'],
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await lockLegacySources(client, report)
    await backfillSources(client, sources, report)
    if (failAt === 'backfill') throw new Error('Injected backfill failure')
    await verifySources(client, sources, report)
    if (failAt === 'verify') throw new Error('Injected verification failure')
    await client.query('COMMIT')
    report.phase = 'verified'
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
async function expandAndApply(
  pool: pg.Pool,
  sources: LegacyPayment[],
  report: UpgradeReport,
  options: UpgradeOptions,
): Promise<void> {
  await runMigrations(createDb(pool), EXPANSION_STAGE)
  report.phase = 'expanded'
  if (options.failAt === 'expand') throw new Error('Injected failure after committed expansion')
  await backfill(pool, sources, report, options.failAt)
  await writeReport(options, report)
  if (!options.contract) return
  if (!options.reportPath) throw new Error('Contraction requires an exported reconciliation report')
  await runMigrations(createDb(pool))
  report.phase = 'contracted'
}
export async function upgradeFinance(options: UpgradeOptions): Promise<UpgradeReport> {
  assertLocalUpgradeUrl(options.url)
  if (options.apply && options.contract && !options.reportPath)
    throw new Error('Contraction requires an exported reconciliation report')
  const pool = new pg.Pool({ connectionString: options.url })
  const report: UpgradeReport = {
    phase: 'dry-run',
    payments: 0,
    anomalies: [],
    rows: [],
    documents: [],
    suppliers: [],
  }
  try {
    if (await alreadyContracted(pool, report)) return report
    const sources = (
      await pool.query<LegacyPayment>('SELECT * FROM payments ORDER BY created_at,id')
    ).rows
    report.payments = sources.length
    report.anomalies.push(
      ...(await sourceAnomalies(pool)),
      ...(await mappedAnomalies(pool, sources)),
    )
    const oldBalances = await balances(pool, false)
    report.documents = oldBalances.documents
    report.suppliers = oldBalances.suppliers
    if (report.anomalies.length || !options.apply) return report
    await expandAndApply(pool, sources, report, options)
    return report
  } catch (error) {
    report.anomalies.push(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    await pool.end()
    await writeReport(options, report)
  }
}
function cliOptions(args: string[]): UpgradeOptions {
  const value = (key: string) => args[args.indexOf(key) + 1]
  if (!args.includes('--url'))
    throw new Error('Supply --url for a local test database; environment URLs are never read')
  const url = value('--url')
  if (!url) throw new Error('Missing --url value')
  const reportPath = args.includes('--report') ? value('--report') : undefined
  if (args.includes('--report') && !reportPath) throw new Error('Missing --report value')
  return {
    url,
    apply: args.includes('--apply'),
    contract: args.includes('--contract'),
    ...(reportPath ? { reportPath } : {}),
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await upgradeFinance(cliOptions(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.anomalies.length) process.exitCode = 1
}
