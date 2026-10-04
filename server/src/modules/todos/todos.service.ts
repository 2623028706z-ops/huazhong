// 模块首页待办（05 章第 3 节）：各模块从自己的 service 取，这里只按模块分发、查权限
import {
  appError,
  todoModules,
  type OutputOf,
  type TodoModule,
  type contract,
} from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { FinanceService } from '../finance/finance.service.ts'
import { SalesService } from '../sales/sales.service.ts'
import { PurchaseService } from '../purchase/purchase.service.ts'

@Injectable()
export class TodosService {
  constructor(
    private readonly sales: SalesService,
    private readonly finance: FinanceService,
    private readonly purchase: PurchaseService,
  ) {}

  todos(viewer: Viewer, key: TodoModule): Promise<OutputOf<typeof contract.moduleTodos>> {
    if (!viewer.modules.includes(key)) throw appError.forbidden()
    switch (key) {
      case 'sales':
        return this.sales.salesTodos(viewer)
      case 'shipping':
        return this.sales.shippingTodos(viewer)
      case 'finance':
        return this.finance.todos(viewer)
      case 'purchase':
        return this.purchase.purchaseTodos(viewer)
      case 'warehouse':
        return this.purchase.warehouseTodos(viewer)
    }
  }

  // 首页角标：只算账号有权限的模块，数字和各模块首页待办的 count 同一口径
  async counts(viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodoCounts>> {
    const keys = todoModules.filter((key) => viewer.modules.includes(key))
    const counts = await Promise.all(
      keys.map(async (key) => ({ key, count: (await this.todos(viewer, key)).count })),
    )
    return { counts }
  }
}
