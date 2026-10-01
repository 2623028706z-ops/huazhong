// 公共层：环境变量、数据库、时间、身份、写操作。全局注入，业务模块直接用
import { Global, Module, type DynamicModule } from '@nestjs/common'
import type pg from 'pg'
import { createDb, createPool } from '../../db/client.ts'
import { ENV, type Env } from '../env.ts'
import { Clock } from './clock.ts'
import { DB, POOL, PoolLifecycle } from './db.ts'
import { IdentityService } from './identity.ts'
import { FileStorage, MemoryFileStorage } from './storage.ts'
import { WriteService } from './write.service.ts'

@Global()
@Module({})
export class CommonModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: CommonModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: POOL, useFactory: () => createPool(env.DATABASE_URL) },
        { provide: DB, inject: [POOL], useFactory: (pool: pg.Pool) => createDb(pool) },
        PoolLifecycle,
        Clock,
        IdentityService,
        WriteService,
        // COS 在阶段 6 接入，之前开发和接口测试都用内存实现
        { provide: FileStorage, useClass: MemoryFileStorage },
      ],
      exports: [ENV, DB, Clock, IdentityService, WriteService, FileStorage],
    }
  }
}
