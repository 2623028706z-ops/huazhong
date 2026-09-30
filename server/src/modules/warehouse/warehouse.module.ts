import { Module } from '@nestjs/common'
import { WarehouseController } from './warehouse.controller.ts'
import { WarehouseService } from './warehouse.service.ts'

@Module({ controllers: [WarehouseController], providers: [WarehouseService] })
export class WarehouseModule {}
