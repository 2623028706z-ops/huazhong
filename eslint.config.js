// ESLint：00 章第 5、7、11 节的规则能用工具查的都放在这里，CI 不过不合并。
import path from 'node:path'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// 中文只允许写在文案、状态表、格式化和测试里（00 章第 5 节）
const noChineseLiteral = {
  selector:
    'Literal[value=/[\\u3400-\\u9fff\\uff00-\\uffef\\u3000-\\u303f]/], TemplateElement[value.raw=/[\\u3400-\\u9fff\\uff00-\\uffef\\u3000-\\u303f]/]',
  message: '界面文案放 shared/copy，状态中文名放 shared/labels，不写在业务代码里。',
}
const noColorLiteral = {
  selector: 'Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
  message: '颜色只在 styles/tokens.wxss 定义。',
}

// WXS 只支持 ES5 的一个子集：shared/src/format.ts 会被原样转成 .wxs
const wxsSubset = [
  'ForOfStatement',
  'SpreadElement',
  'RestElement',
  'ObjectPattern',
  'ArrayPattern',
  'ClassDeclaration',
  'ClassExpression',
  'ChainExpression',
  'LogicalExpression[operator="??"]',
  'Literal[regex]',
  'NewExpression[callee.name=/^(Date|RegExp|Map|Set|Promise)$/]',
  'Identifier[name=/^(Date|RegExp|Intl|Symbol|JSON)$/]',
  'FunctionDeclaration[generator=true]',
  'FunctionExpression[generator=true]',
  'AwaitExpression',
].map((selector) => ({ selector, message: 'WXS 不支持这种写法（这个文件会生成 .wxs）。' }))

// 后端模块之间只能通过对方的 <name>.service.ts 调用；common、db 不能依赖 modules（00 章第 11.2 节）
const moduleOf = (file) => {
  const match = /server\/src\/modules\/([^/]+)\//.exec(file)
  return match ? match[1] : null
}
const boundaries = {
  rules: {
    'module-boundaries': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const importer = context.filename
        return {
          ImportDeclaration(node) {
            const source = node.source.value
            if (typeof source !== 'string' || !source.startsWith('.')) return
            const target = path.resolve(path.dirname(importer), source)
            const targetModule = moduleOf(target)
            if (!targetModule) return
            const importerModule = moduleOf(importer)
            if (importerModule === targetModule) return
            const base = path.basename(target)
            const isAppModule = importer.endsWith('server/src/app.module.ts')
            const allowed = importerModule
              ? base === `${targetModule}.service.ts`
              : isAppModule && base === `${targetModule}.module.ts`
            if (!allowed) {
              context.report({
                node,
                message: `不能直接引用 ${targetModule} 模块的内部文件，只能调用它的 ${targetModule}.service.ts。`,
              })
            }
          },
        }
      },
    },
    // 具名导入 z 会把 Zod 全部语言包打进小程序（约 450KB），命名空间导入能摇树（约 120KB）
    'zod-namespace-import': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        return {
          ImportDeclaration(node) {
            if (node.source.value !== 'zod') return
            if (node.specifiers.every((s) => s.type === 'ImportNamespaceSpecifier')) return
            context.report({
              node,
              message: "写成 import * as z from 'zod'，否则小程序包体会带上 Zod 全部语言包。",
            })
          },
        }
      },
    },
  },
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'miniapp/miniprogram/miniprogram_npm/**',
      'miniapp/miniprogram/config/env.ts',
      'server/db/migrations/**',
      'scripts/.cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', '*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { hz: boundaries },
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' },
      ],
      'no-console': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreNumericLiteralTypes: true,
          ignoreTypeIndexes: true,
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Nest 的模块、控制器是只有装饰器的类
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // 参数装饰器触发校验、但处理函数不用它的参数，以 _ 开头
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', noChineseLiteral, noColorLiteral],
      'hz/module-boundaries': 'error',
      'hz/zod-namespace-import': 'error',
    },
  },
  {
    // 小程序源码由开发者工具自己编译：它不认带成员名的元组（[options: …]），整个文件会被丢掉、运行时报
    // module is not defined。shared 由 esbuild 打包，不受影响
    files: ['miniapp/miniprogram/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noChineseLiteral,
        noColorLiteral,
        {
          selector: 'TSNamedTupleMember',
          message: '元组不写成员名：开发者工具的编译器不认，整个文件会被丢掉。',
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.ts', '**/*.config.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // 本文件是规则本身：报错文案和阈值就写在这里
    files: ['eslint.config.js'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // 配置表、文案、状态表、格式化：这些文件本身就是「唯一出处」，允许中文和数字
    files: [
      'shared/src/config.ts',
      'shared/src/copy.ts',
      'shared/src/labels.ts',
      'shared/src/errors.ts',
      'shared/src/format.ts',
      'server/db/seed/**/*.ts',
      // 组件总览的示例数据（只在开发环境出现），同种子数据
      'miniapp/miniprogram/pages/dev-gallery/samples.ts',
    ],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'no-restricted-syntax': ['error', noColorLiteral],
    },
  },
  {
    // WXS 没有模板字符串，数字转文字只能写 '' + n
    files: ['shared/src/format.ts'],
    rules: {
      'no-restricted-syntax': ['error', noColorLiteral, ...wxsSubset],
      '@typescript-eslint/restrict-plus-operands': 'off',
    },
  },
  {
    // 测试名写业务结果（00 章第 11.5 节），测试数据可以有数字
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
      'no-restricted-syntax': ['error', noColorLiteral],
      // 单元测试直接测模块里的纯函数
      'hz/module-boundaries': 'off',
    },
  },
  {
    // 日志只从 common/logger 输出到标准输出（云托管收集），命令行脚本直接打印
    files: [
      'server/src/common/logger.ts',
      'server/db/seed/run.ts',
      'scripts/**/*.ts',
      'miniapp/scripts/**/*.ts',
    ],
    rules: { 'no-console': 'off' },
  },
)
