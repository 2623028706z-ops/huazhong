import { Module } from '@nestjs/common'
import { StoreController } from './store.controller.ts'
import { StoreService } from './store.service.ts'

@Module({ controllers: [StoreController], providers: [StoreService] })
export class StoreModule {}
