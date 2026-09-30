// pnpm gen:backdrop：用本机 Chrome 无头渲染 backdrop.html，写出主包品牌背景 assets/backdrop.jpg
// 要 Chrome，所以不进 pnpm gen / gen:check；改了 backdrop.html 手动跑一次再提交图片
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { miniprogramDir, repoRoot } from './generated.ts'

const KB = 1024
const MAX_BYTES = 204_800 // 200KB，02 章第 3 节
const DOM_BUFFER_BYTES = 67_108_864 // 64MB：dump-dom 输出里整张图的 base64
const chrome =
  process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const page = pathToFileURL(join(repoRoot, 'scripts/src/backdrop.html'))
page.searchParams.set('max', String(MAX_BYTES))
const file = join(miniprogramDir, 'assets/backdrop.jpg')

const dom = execFileSync(
  chrome,
  ['--headless=new', '--disable-gpu', '--virtual-time-budget=60000', '--dump-dom', page.href],
  { encoding: 'utf8', maxBuffer: DOM_BUFFER_BYTES, stdio: ['ignore', 'pipe', 'ignore'] },
)
const base64 = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/.exec(dom)?.[1]
if (base64 === undefined) throw new Error('backdrop.html did not produce a JPEG')
const jpg = Buffer.from(base64, 'base64')
if (jpg.length > MAX_BYTES)
  throw new Error(`backdrop.jpg is ${jpg.length} bytes, over ${MAX_BYTES}`)

mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, jpg)
console.log(`Wrote ${file.slice(repoRoot.length + 1)} (${Math.round(jpg.length / KB)} KB)`)
