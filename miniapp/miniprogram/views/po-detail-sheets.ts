// 采购单详情（06 章 C4、W3）的退货 / 改价弹层和收货表单输入：从 po-detail 拆出来，页面方法合在一起用
import { contract, copy } from '@huazhong/shared'
import type { DetailEvent } from '../core/events'
import { checkedOf, unplacedErrorOf } from '../core/form'
import { syncUnloadAlert } from '../core/guard'
import { centsOfText } from '../core/money'
import { request } from '../core/request'
import type { PoHost } from './po-detail'

export const poSheetMethods = {
  onQty(this: PoHost, event: DetailEvent<{ index: number; qty: number }>) {
    this.setData({ fields: {}, error: '' })
    this.render(
      this.data.lines.map((line, i) =>
        i === event.detail.index ? { ...line, qty: event.detail.qty } : line,
      ),
    )
  },
  onPrice(this: PoHost, event: DetailEvent<{ index: number; text: string }>) {
    this.setData({ fields: {}, error: '' })
    this.render(
      this.data.lines.map((line, i) =>
        i === event.detail.index ? { ...line, priceText: event.detail.text } : line,
      ),
    )
  },
  onReason(this: PoHost, event: DetailEvent<string>) {
    this.setData({ reason: event.detail, fields: {}, error: '' })
    this.render(this.data.lines)
  },
  onRecvNote(this: PoHost, event: DetailEvent<string>) {
    this.setData({ recvNote: event.detail, fields: {}, error: '' })
    this.render(this.data.lines)
  },
  onCloseSheet(this: PoHost) {
    this.setData({ sheet: '', changed: false })
    syncUnloadAlert(false)
    if (this.order) this.show(this.order)
  },
  async onSaveSheet(this: PoHost) {
    if (!this.order) return
    const common = { version: this.order.version, reason: this.data.reason }
    const result =
      this.data.sheet === 'return'
        ? contract.returnPurchaseOrder.body.safeParse({
            ...common,
            lines: this.data.lines
              .filter((l) => l.qty > 0)
              .map((l) => ({ poLineId: l.key, qty: l.qty })),
          })
        : contract.repricePurchaseOrder.body.safeParse({
            ...common,
            lines: this.data.lines.map((l) => ({
              poLineId: l.key,
              priceCents: centsOfText(l.priceText),
            })),
          })
    const checked = checkedOf<unknown>(result)
    if (!checked.ok) {
      this.setData({
        error: unplacedErrorOf(checked.fields, ['reason', 'lines.*.qty', 'lines.*.priceCents']),
        fields: checked.fields,
      })
      this.render(this.data.lines)
      return
    }
    this.setData({ busy: this.data.sheet, error: '' })
    const input = { params: { id: this.id }, body: checked.body }
    const saved =
      this.data.sheet === 'return'
        ? await request(contract.returnPurchaseOrder, {
            ...input,
            body: contract.returnPurchaseOrder.body.parse(checked.body),
          })
        : await request(contract.repricePurchaseOrder, {
            ...input,
            body: contract.repricePurchaseOrder.body.parse(checked.body),
          })
    this.settle(saved, copy.action.saved)
  },
}
