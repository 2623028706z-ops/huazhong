// pnpm gen：重新生成全部生成物；pnpm gen:check：只比对，过期就失败（CI 跑）
import { relative } from 'node:path'
import { fontOutput } from './gen-font.ts'
import { iconNamesOutput, iconOutput } from './gen-icons.ts'
import { wxsOutput } from './gen-wxs.ts'
import { isFresh, repoRoot, writeOutput } from './generated.ts'

const outputs = [wxsOutput, fontOutput, iconOutput, iconNamesOutput]

if (process.argv.includes('--check')) {
  const stale = outputs.filter((output) => !isFresh(output))
  for (const output of stale) console.error(`Stale: ${relative(repoRoot, output.file)}`)
  if (stale.length > 0) {
    console.error('Generated files are out of date. Run: pnpm gen')
    process.exitCode = 1
  } else {
    console.log('Generated files are up to date.')
  }
} else {
  for (const output of outputs) {
    await writeOutput(output)
    console.log(`Wrote ${relative(repoRoot, output.file)}`)
  }
}
