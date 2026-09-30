// 后台任务（pg-boss，01 章第 1 节）。阶段 0 只有每天清理过期幂等键
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { PgBoss } from 'pg-boss'
import type { Db } from '../../db/client.ts'
import { Clock } from '../common/clock.ts'
import { DB } from '../common/db.ts'
import { logger } from '../common/logger.ts'
import { ENV, type Env } from '../env.ts'
import { deleteExpiredIdempotencyKeys } from './cleanup.ts'

export const CLEANUP_QUEUE = 'cleanup-idempotency-keys'
// 每天 UTC 19:10 = 上海 03:10，避开营业时间
const CLEANUP_CRON = '10 19 * * *'

@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly boss: PgBoss

  constructor(
    @Inject(ENV) env: Env,
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {
    this.boss = new PgBoss(env.DATABASE_URL)
  }

  async onApplicationBootstrap(): Promise<void> {
    this.boss.on('error', (error: Error) => {
      logger.error('pg-boss', { error: error.message })
    })
    await this.boss.start()
    await this.boss.createQueue(CLEANUP_QUEUE)
    await this.boss.schedule(CLEANUP_QUEUE, CLEANUP_CRON)
    await this.boss.work(CLEANUP_QUEUE, async () => {
      const deleted = await deleteExpiredIdempotencyKeys(this.db, this.clock.now())
      logger.info('idempotency keys cleaned', { deleted })
    })
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: false })
  }
}
