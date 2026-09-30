// 应用的全局设置：main.ts 和接口测试共用，保证测试跑的就是线上那一套
import { API_PREFIX } from '@huazhong/shared'
import type { INestApplication } from '@nestjs/common'
import { requestContextMiddleware } from './common/request-context.ts'

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX)
  app.use(requestContextMiddleware)
}
