// 开发前准备：生成 miniprogram/config/env.ts（云托管环境，来自环境变量），
// 把 @huazhong/shared 连同 Zod 打成一个 CommonJS 文件放进 miniprogram_npm（01 章第 3.1 节）。
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { sharedBundleOptions, sharedBundleOutfile } from './shared-bundle.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const envKeys = [
  'HZ_CLOUD_ENV_DEV',
  'HZ_CLOUD_ENV_PROD',
  'HZ_SERVICE_DEV',
  'HZ_SERVICE_PROD',
] as const
type EnvKey = (typeof envKeys)[number]
const BYTES_PER_KB = 1024

function readExample(): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of readFileSync(join(root, '.env.example'), 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2]
  }
  return values
}

function resolveEnv(): Record<EnvKey, string> {
  const example = readExample()
  const missing = envKeys.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.warn(
      `Missing ${missing.join(', ')}; using placeholders from .env.example (cloud calls will fail)`,
    )
  }
  const pick = (key: EnvKey): string => process.env[key] ?? example[key] ?? ''
  return {
    HZ_CLOUD_ENV_DEV: pick('HZ_CLOUD_ENV_DEV'),
    HZ_CLOUD_ENV_PROD: pick('HZ_CLOUD_ENV_PROD'),
    HZ_SERVICE_DEV: pick('HZ_SERVICE_DEV'),
    HZ_SERVICE_PROD: pick('HZ_SERVICE_PROD'),
  }
}

function writeEnvConfig(): void {
  const env = resolveEnv()
  const cloudEnvs = {
    dev: { env: env.HZ_CLOUD_ENV_DEV, service: env.HZ_SERVICE_DEV },
    prod: { env: env.HZ_CLOUD_ENV_PROD, service: env.HZ_SERVICE_PROD },
  }
  const file = join(root, 'miniprogram/config/env.ts')
  mkdirSync(dirname(file), { recursive: true })
  const body = `// Generated file, do not edit. Source: miniapp/scripts/prepare.ts (from environment variables)\nexport const cloudEnvs = ${JSON.stringify(cloudEnvs, null, 2)} as const\n`
  writeFileSync(file, body)
}

async function bundleShared(): Promise<void> {
  const outfile = sharedBundleOutfile
  await build({ ...sharedBundleOptions, outfile })
  console.log(`@huazhong/shared bundled: ${(statSync(outfile).size / BYTES_PER_KB).toFixed(1)} KB`)
}

// TDesign 连同它自带的 miniprogram_npm（dayjs 等）原样复制；pnpm 的软链接要解开，开发者工具认不了
function copyTdesign(): void {
  const source = join(
    dirname(require.resolve('tdesign-miniprogram/package.json')),
    'miniprogram_dist',
  )
  const target = join(root, 'miniprogram/miniprogram_npm/tdesign-miniprogram')
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true, dereference: true })
  console.log('tdesign-miniprogram copied')
}

writeEnvConfig()
await bundleShared()
copyTdesign()
