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
import { FilesModule } from '../files/files.module.ts'
import { WhDocReads } from './wh-doc-reads.ts'
import { WhDocWrites } from './wh-doc-writes.ts'
import { StockController, StockInventoryController } from './stock.controller.ts'
import { Stocktakes } from './stocktakes.ts'
import { OutCategories } from './out-categories.ts'
import { StockMoves } from './stock-moves.ts'

@Module({
  imports: [PurchaseModule, FilesModule],
  controllers: [
    WarehouseController,
    MaterialsController,
    PurchaseWarehouseController,
    StockController,
    StockInventoryController,
  ],
  providers: [
    WarehouseService,
    MaterialReads,
    MaterialWrites,
    MaterialCategories,
    PoReceiving,
    WhDocReads,
    WhDocWrites,
    Stocktakes,
    OutCategories,
    StockMoves,
  ],
  exports: [WarehouseService],
})
export class WarehouseModule {}
