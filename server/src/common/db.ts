// 数据库连接池的注入令牌；连接池随应用关闭
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common'
import type pg from 'pg'

export const DB = Symbol('DB')
export const POOL = Symbol('POOL')

@Injectable()
export class PoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}
