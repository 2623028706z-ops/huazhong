import { Module } from '@nestjs/common'
import { PurchaseModule } from '../purchase/purchase.module.ts'
import { MaterialCategories } from './material-categories.ts'
import { MaterialReads } from './material-reads.ts'
import { MaterialWrites } from './material-writes.ts'
import { MaterialsController } from './materials.controller.ts'
import { PoReceiving } from './po-receiving.ts'
import { PurchaseWarehouseController } from './purchase-warehouse.controller.ts'
import { WarehouseController } from './warehouse.controller.ts'
import { WarehouseService } from './warehouse.service.ts'

@Module({
  imports: [PurchaseModule],
  controllers: [WarehouseController, MaterialsController, PurchaseWarehouseController],
  providers: [WarehouseService, MaterialReads, MaterialWrites, MaterialCategories, PoReceiving],
})
export class WarehouseModule {}
