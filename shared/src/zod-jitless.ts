// 小程序里 new Function 不报错却返回不可调用的对象，Zod 误以为能用 JIT，第一次校验对象就崩。
// 要在任何结构定义之前关掉 JIT（Zod 建结构时读这个开关），所以单独成文件、在 miniapp.ts 第一个导入。
import * as z from 'zod'

z.config({ jitless: true })
