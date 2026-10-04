// 环境变量：只在启动时读一次，校验不过直接退出
import * as z from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().nonnegative(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  CONTACT_PHONE: z.string().trim().optional(),
  INVITE_SIGNING_KEY: z.string().min(1).optional(),
})
export type Env = z.infer<typeof envSchema>

export const ENV = Symbol('ENV')

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid environment variables: ${names}`)
  }
  return result.data
}
