// 确认订单弹层（06 章 X2、X3）：只选出货日期（默认今天往后 SHIP_DATE_DEFAULT_OFFSET_DAYS 天）再确认；
// X2 列表勾选批量确认和 X3 详情单张确认共用，一单也走批量确认接口。确认完发 done（带提示语），失败写在弹层里
import {
  contract,
  copy,
  redesignCopy,
  addDays,
  shanghaiDateOf,
  SHIP_DATE_DEFAULT_OFFSET_DAYS,
} from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'

const PREVIEW_COUNT = 3

interface Target {
  id: string
  version: number
  no: string
  title: string
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    // 要确认的订单；title 是「客户 · 门店」
    orders: { type: Array, value: [] as Target[] },
    // 欠款提示，每个客户一条
    overdue: { type: Array, value: [] as string[] },
    // 一单且不显示「产品都不改」说明时传 false
    withNote: { type: Boolean, value: true },
  },
  data: {
    date: '',
    error: '',
    busy: false,
    title: '',
    rows: [] as { id: string; title: string; no: string }[],
    more: '',
    note: '',
    texts: {
      shipDate: redesignCopy.shipDate,
      back: copy.action.back,
      confirm: redesignCopy.confirmOrders,
    },
  },
  observers: {
    show(show: boolean) {
      if (show) this.open()
    },
  },
  methods: {
    open() {
      const orders = this.data.orders
      this.setData({
        date: addDays(shanghaiDateOf(Date.now()), SHIP_DATE_DEFAULT_OFFSET_DAYS),
        error: '',
        busy: false,
        title: redesignCopy.confirmSheetTitle(orders.length),
        rows: orders.slice(0, PREVIEW_COUNT).map(({ id, title, no }) => ({ id, title, no })),
        more: orders.length > PREVIEW_COUNT ? redesignCopy.moreOrders(orders.length) : '',
        note: this.data.withNote ? redesignCopy.confirmSheetNote : '',
      })
    },
    onDate(event: DetailEvent<string>) {
      this.setData({ date: event.detail, error: '' })
    },
    onClose() {
      if (!this.data.busy) this.triggerEvent('close')
    },
    async onConfirm() {
      if (this.data.busy) return
      this.setData({ busy: true, error: '' })
      const orders = this.data.orders
      const result = await request(contract.batchConfirmOrders, {
        body: {
          orders: orders.map(({ id, version }) => ({ id, version })),
          shipDate: this.data.date,
        },
      })
      this.setData({ busy: false })
      if (!result.ok) {
        this.setData({ error: failureOf(result.failure, 'submit')?.message ?? '' })
        return
      }
      const { failed, succeeded } = result.data
      const message = failed.length
        ? redesignCopy.confirmationResult(
            failed.length,
            [...new Set(failed.map((row) => row.reason))].join(copy.separator),
          )
        : redesignCopy.confirmedMany(succeeded.length)
      this.triggerEvent('done', { message })
    },
  },
})
