// 模块首页待办（05 章第 3 节）：各模块从自己的 service 取，这里只按模块分发、查权限
import { appError, type OutputOf, type TodoModule, type contract } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { FinanceService } from '../finance/finance.service.ts'
import { SalesService } from '../sales/sales.service.ts'

@Injectable()
export class TodosService {
  constructor(
    private readonly sales: SalesService,
    private readonly finance: FinanceService,
  ) {}

  todos(viewer: Viewer, key: TodoModule): Promise<OutputOf<typeof contract.moduleTodos>> {
    if (!viewer.modules.includes(key)) throw appError.forbidden()
    switch (key) {
      case 'sales':
        return this.sales.salesTodos(viewer)
      case 'shipping':
        return this.sales.shippingTodos(viewer)
      case 'finance':
        return this.finance.prepaidTodos()
    }
  }
}
