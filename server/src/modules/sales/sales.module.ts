import { Module } from '@nestjs/common'
import { OrderLifecycle, OrderLifecycleController } from './order-lifecycle.ts'
import { AccountsModule } from '../accounts/accounts.module.ts'
import { FilesModule } from '../files/files.module.ts'
import { AfterReads } from './after-query.ts'
import { AfterWrites } from './after-writes.ts'
import { AftersController } from './afters.controller.ts'
import { CatalogCategoryService } from './catalog-categories.ts'
import { CatalogService } from './catalog.ts'
import { CatalogCopyService } from './catalog-copy.ts'
import { CatalogReader } from './catalog-read.ts'
import { CustomerService } from './customers.ts'
import { CatalogController, CustomersController } from './masters.controller.ts'
import { OrderReads } from './order-query.ts'
import { OrdersController } from './orders.controller.ts'
import { SalesOrderWrites } from './sales-orders.ts'
import { SalesService } from './sales.service.ts'
import { StoreCatalogService } from './store-catalog.ts'
import { StoreInviteService } from './store-invites.ts'
import { StoreOrderWrites } from './store-orders.ts'
import { StoreWrites } from './stores.ts'
import { StoreNotices, StoreNoticesController } from './store-notices.ts'

// 销售、发货、门店端：订单、售后、客户门店、订货目录（含产品）、门店邀请
@Module({
  imports: [AccountsModule, FilesModule],
  controllers: [
    OrderLifecycleController,
    OrdersController,
    AftersController,
    CustomersController,
    CatalogController,
    StoreNoticesController,
  ],
  providers: [
    OrderLifecycle,
    OrderReads,
    SalesOrderWrites,
    StoreOrderWrites,
    AfterReads,
    AfterWrites,
    CustomerService,
    StoreWrites,
    StoreInviteService,
    CatalogReader,
    CatalogService,
    CatalogCopyService,
    CatalogCategoryService,
    StoreCatalogService,
    SalesService,
    StoreNotices,
  ],
  exports: [SalesService],
})
export class SalesModule {}
