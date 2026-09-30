import { Module, type DynamicModule } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AccessGuard } from './common/access.guard.ts'
import { CommonModule } from './common/common.module.ts'
import { ErrorFilter } from './common/error.filter.ts'
import { ResponseInterceptor } from './common/response.interceptor.ts'
import type { Env } from './env.ts'
import { JobsModule } from './jobs/jobs.module.ts'
import { AccountsModule } from './modules/accounts/accounts.module.ts'
import { LogsModule } from './modules/logs/logs.module.ts'
import { StoreModule } from './modules/store/store.module.ts'
import { WarehouseModule } from './modules/warehouse/warehouse.module.ts'
import { RealtimeModule } from './realtime/realtime.module.ts'

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CommonModule.forRoot(env),
        RealtimeModule,
        JobsModule,
        AccountsModule,
        LogsModule,
        WarehouseModule,
        StoreModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
      ],
    }
  }
}
