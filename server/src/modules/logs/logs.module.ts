import { Module } from '@nestjs/common'
import { LogsController } from './logs.controller.ts'
import { LogsService } from './logs.service.ts'

@Module({ controllers: [LogsController], providers: [LogsService] })
export class LogsModule {}
