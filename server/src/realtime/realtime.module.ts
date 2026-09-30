import { Module } from '@nestjs/common'
import { ChangeListener } from './change.listener.ts'
import { RealtimeGateway } from './realtime.gateway.ts'

@Module({ providers: [RealtimeGateway, ChangeListener] })
export class RealtimeModule {}
