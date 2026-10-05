// 往来汇总页的「退回」（06 章 F2、F9）：多收（多付）退回弹层，退回记录行点开看这一笔、作废放弹层底栏
// （2026-10-06 第 4 批：操作只放底栏，记录行里不放按钮）
import {
  contract,
  copy,
  financeCopy as f,
  formatMoney,
  formatTime,
  labels,
  shanghaiDateOf,
  type PartyLedger,
} from '@huazhong/shared'
import { canDo, findAction } from '../core/actions'
import type { DetailEvent, KeyEvent } from '../core/events'
import { checkedOf } from '../core/form'
import { centsOfText } from '../core/money'
import { newIdempotencyKey, request } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { rowsOf } from './order'

type Refund = PartyLedger['refunds'][number]

// 退回记录行：单号 + 状态、日期、金额；点开看全部
export function refundRowsOf(ledger: PartyLedger) {
  return ledger.refunds.map((item) => ({
    id: item.id,
    no: item.no,
    date: item.refundDate,
    amount: formatMoney(item.amountCents),
    status: labels.recordStatus[item.status],
    reason: item.voidReason ?? '',
  }))
}

// 弹层里这一笔：「标签 值」一行一项；作废按钮看 actions（禁用的写原因）
function refundDetailOf(item: Refund) {
  const action = findAction(item.actions, 'voidRefund')
  return {
    id: item.id,
    title: item.no,
    rows: rowsOf([
      [f.no, item.no],
      [f.status, labels.recordStatus[item.status]],
      [f.refundDate, item.refundDate],
      [f.refundAmount, formatMoney(item.amountCents)],
      [f.refundMethod, item.methodName],
      [f.note, item.note],
      [f.voidReason, item.voidReason],
      [f.voidedBy, item.voidedBy?.name ?? null],
      [f.voidedAt, item.voidedAt ? formatTime(item.voidedAt) : null],
    ]),
    hasVoid: action !== null,
    voidDisabled: !canDo(item.actions, 'voidRefund'),
    voidReason: action?.disabledReason ?? '',
  }
}

export const refundData = {
  refundSheet: false,
  refundChanged: false,
  refundError: '',
  refundBusy: false,
  today: shanghaiDateOf(Date.now()),
  refundForm: { refundDate: shanghaiDateOf(Date.now()), amountText: '', methodName: '', note: '' },
  refundMethods: [] as { id: string; name: string }[],
  refundRows: [] as ReturnType<typeof refundRowsOf>,
  refundDetail: null as ReturnType<typeof refundDetailOf> | null,
  voidRefundId: '',
}

interface Host {
  data: typeof refundData & { supplier: boolean; canRefund: boolean }
  id: string
  ledger: PartyLedger | null
  list: { refresh(): Promise<void> } | null
  refundKey: string
  setData(patch: Record<string, unknown>): void
}

function checkedRefund(host: Host) {
  const form = host.data.refundForm,
    amount = centsOfText(form.amountText)
  return checkedOf(
    contract.createRefund.body.safeParse({
      kind: host.data.supplier ? 'payment' : 'receipt',
      ...(host.data.supplier ? { supplierId: host.id } : { customerId: host.id }),
      refundDate: form.refundDate,
      amountCents: amount,
      methodName: form.methodName,
      note: form.note,
    }),
  )
}
function refundProblem(host: Host) {
  if (host.data.refundForm.refundDate > host.data.today) return copy.rework.refundDateFuture
  const amount = centsOfText(host.data.refundForm.amountText)
  return amount === null || amount > (host.ledger?.creditCents ?? 0)
    ? f.maxRefund(formatMoney(host.ledger?.creditCents ?? 0))
    : ''
}

export const refundHandlers = {
  async onRefund(this: Host) {
    if (!this.data.canRefund) return
    this.refundKey = newIdempotencyKey()
    this.setData({
      refundSheet: true,
      refundChanged: false,
      refundError: '',
      refundForm: { refundDate: this.data.today, amountText: '', methodName: '', note: '' },
    })
    const result = await request(contract.listMethods)
    if (result.ok)
      this.setData({
        refundMethods: result.data.items
          .filter((item) => item.enabled)
          .map((item) => ({ id: item.name, name: item.name })),
      })
    else this.setData({ refundError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseRefund(this: Host) {
    if (this.data.refundBusy) return
    this.setData({ refundSheet: false, refundChanged: false, refundError: '' })
  },
  onRefundField(this: Host, event: DetailEvent<string, { key: string }>) {
    const form = { ...this.data.refundForm, [event.currentTarget.dataset.key]: event.detail }
    this.setData({
      refundForm: form,
      refundChanged:
        form.refundDate !== this.data.today ||
        Boolean(form.amountText || form.methodName || form.note),
      refundError: '',
    })
  },
  async onSubmitRefund(this: Host) {
    if (this.data.refundBusy || !this.ledger) return
    const problem = refundProblem(this)
    if (problem) {
      this.setData({ refundError: problem })
      return
    }
    const checked = checkedRefund(this)
    if (!checked.ok) {
      this.setData({ refundError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ refundBusy: true })
    const result = await request(
      contract.createRefund,
      { body: checked.body },
      { idempotencyKey: this.refundKey },
    )
    this.setData({ refundBusy: false })
    if (result.ok) {
      this.setData({ refundSheet: false, refundChanged: false })
      void this.list?.refresh()
      showSuccess(copy.action.saved)
    } else this.setData({ refundError: failureOf(result.failure, 'submit')?.message ?? '' })
  },
  // 点退回记录行：打开这一笔
  onRefundRow(this: Host, event: KeyEvent) {
    const refund = this.ledger?.refunds.find((item) => item.id === event.currentTarget.dataset.key)
    if (refund) this.setData({ refundDetail: refundDetailOf(refund), refundError: '' })
  },
  onCloseRefundDetail(this: Host) {
    this.setData({ refundDetail: null })
  },
  // 弹层底栏「作废退回」：换成原因弹层
  onVoidRefund(this: Host) {
    const id = this.data.refundDetail?.id ?? ''
    this.setData({ refundDetail: null, voidRefundId: id, refundError: '' })
  },
  onCloseVoidRefund(this: Host) {
    this.setData({ voidRefundId: '' })
  },
  async onSubmitVoidRefund(this: Host, event: DetailEvent<string>) {
    const refund = this.ledger?.refunds.find((item) => item.id === this.data.voidRefundId)
    if (!refund || !canDo(refund.actions, 'voidRefund')) return
    this.setData({ refundBusy: true })
    const result = await request(contract.voidRefund, {
      params: { id: refund.id },
      body: { version: refund.version, reason: event.detail },
    })
    this.setData({ refundBusy: false })
    if (result.ok) {
      this.setData({ voidRefundId: '' })
      void this.list?.refresh()
    } else {
      const view = failureOf(result.failure, 'submit')
      this.setData({ refundError: view ? messageOf(view) : '' })
      if (view?.kind === 'stale') void this.list?.refresh()
    }
  },
}
