// 批量发货结果弹层（06 章 H2，2026-10-06 第 3 批）：头行「已发货 n 单，m 单没发出」；
// 成功每单一行（客户 · 门店 / 单号 · 已发货）右侧「送货单 ›」，没发出的写原因、右侧「查看 ›」进这张单
import type { contract } from '@huazhong/shared'
import { copy, labels, type OutputOf } from '@huazhong/shared'
import { CARD_SEPARATOR } from './card'

type BatchResult = OutputOf<typeof contract.batchShipOrders>

export interface ShipResultRow {
  id: string
  title: string
  sub: string
  link: string
  failed: boolean
}

export function shipResultOf(result: BatchResult): { head: string; rows: ShipResultRow[] } {
  const { ship } = copy.flow
  const title = (row: { customerName: string; storeName: string }) =>
    copy.org.store(row.customerName, row.storeName)
  return {
    head: ship.resultHead(result.succeeded.length, result.failed.length),
    rows: [
      ...result.succeeded.map((row) => ({
        id: row.id,
        title: title(row),
        sub: [row.no, labels.orderStatus.shipped].join(CARD_SEPARATOR),
        link: ship.deliveryLink,
        failed: false,
      })),
      ...result.failed.map((row) => ({
        id: row.id,
        title: title(row),
        sub: ship.notShipped(row.reason),
        link: ship.viewLink,
        failed: true,
      })),
    ],
  }
}
