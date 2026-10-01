// 客户下拉和筛选项（06 章 X2、X4、X5、X8、X11）：客户门店列表按页取全
import { contract, PAGE_SIZE_MAX, type CustomerItem } from '@huazhong/shared'
import { request, type Result } from '../core/request'

export async function loadCustomers(): Promise<Result<CustomerItem[]>> {
  const customers: CustomerItem[] = []
  let cursor: string | undefined
  for (;;) {
    const result = await request(contract.listCustomers, {
      query: { cursor, limit: PAGE_SIZE_MAX },
    })
    if (!result.ok) return result
    customers.push(...result.data.items)
    if (result.data.nextCursor === null) return { ok: true, data: customers }
    cursor = result.data.nextCursor
  }
}
