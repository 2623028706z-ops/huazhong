// shared/src/format.ts → miniapp/miniprogram/core/format.wxs（02 章第 7 节：全站一份格式化）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { miniprogramDir, repoRoot, type Output } from './generated.ts'

export const formatSource = join(repoRoot, 'shared/src/format.ts')
const HEADER =
  '// Generated file, do not edit. Source: shared/src/format.ts (scripts/src/gen-wxs.ts)\n'

// WXS 不认识的东西：转换后出现就说明 format.ts 用了不该用的写法
const forbidden = [
  /\bexports\./,
  /\bvoid 0\b/,
  /\bDate\b/,
  /\bRegExp\b/,
  /=>/,
  /\blet\b/,
  /\bconst\b/,
  /`/,
]

// WXS 只认 ES5 + CommonJS；TS 6 把 ES5 标成弃用，用 JSON 写法并声明忽略弃用提示
function wxsCompilerOptions(): ts.CompilerOptions {
  const json = {
    target: 'es5',
    module: 'commonjs',
    removeComments: true,
    ignoreDeprecations: '6.0',
  }
  const { options, errors } = ts.convertCompilerOptionsFromJson(json, repoRoot)
  if (errors.length > 0)
    throw new Error(ts.flattenDiagnosticMessageText(errors[0]?.messageText, '\n'))
  return options
}

export function toWxs(source: string): string {
  const { outputText } = ts.transpileModule(source, { compilerOptions: wxsCompilerOptions() })
  const names: string[] = []
  const body = outputText
    .split('\n')
    .filter((line) => {
      const exported = /^exports\.(\w+) = (\w+);$/.exec(line)
      if (exported?.[1] && exported[1] === exported[2]) names.push(exported[1])
      return !/^"use strict";$|__esModule|^exports\.\w+ = /.test(line)
    })
    .join('\n')
    .trim()
  for (const pattern of forbidden) {
    if (pattern.test(body))
      throw new Error(`format.ts produced WXS-incompatible code: ${String(pattern)}`)
  }
  const exportsLine = `module.exports = {\n${names.map((name) => `  ${name}: ${name},`).join('\n')}\n};\n`
  return `${HEADER}${body}\n\n${exportsLine}`
}

const content = toWxs(readFileSync(formatSource, 'utf8'))

export const wxsOutput: Output = {
  file: join(miniprogramDir, 'core/format.wxs'),
  content: () => Promise.resolve(content),
  fingerprint: content,
}
