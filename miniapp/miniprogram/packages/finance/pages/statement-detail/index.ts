import {
  contract,
  copy,
  financeCopy as f,
  financeTexts,
  formatTime,
  formatMoney,
  type StatementDetail,
  type StatementSource,
  type Topic,
} from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { watch, unwatchOnLeave } from '../../../../core/live'
import {
  statementInfoOf,
  statementAmountRows,
  sourceRowOf,
  sourceRoute,
  settlementRowsOf,
} from '../../../../views/statement'
function statementActions(detail: StatementDetail, internal: boolean) {
  const supplier = detail.kind === 'supplier'
  return {
    canShare: !internal && canDo(detail.actions, 'shareStatement'),
    canRegister:
      !internal && canDo(detail.actions, supplier ? 'registerPayment' : 'registerReceipt'),
    canVoid: !internal && detail.actions.some((action) => action.code === 'voidStatement'),
    voidDisabled: !canDo(detail.actions, 'voidStatement'),
    voidReason:
      detail.actions.find((action) => action.code === 'voidStatement')?.disabledReason ?? '',
  }
}
function detailInfo(detail: StatementDetail) {
  return {
    title: detail.partyName,
    status: detail.status,
    statusKind: 'statementStatus',
    rows: [
      ...statementInfoOf(detail),
      ...(detail.settledAt ? [{ label: f.settledDate, value: formatTime(detail.settledAt) }] : []),
    ],
  }
}
function detailPatch(detail: StatementDetail, internal: boolean) {
  const supplier = detail.kind === 'supplier'
  return {
    loaded: true,
    failure: null,
    supplier,
    info: detailInfo(detail),
    amountRows: statementAmountRows(detail),
    groups: detail.groups.map((group) => ({
      title: [
        group.storeName ?? detail.partyName,
        f.sourceCount(
          group.sources.filter((source) => ['order', 'po', 'wh'].includes(source.type)).length,
          supplier,
        ),
        formatMoney(group.amountCents),
      ].join(copy.separator),
      rows: group.sources.map(sourceRowOf),
    })),
    settlements: settlementRowsOf(detail.settlements),
    hasAfter: detail.groups.some((group) =>
      group.sources.some((source) =>
        ['after', 'purchase_return', 'price_change'].includes(source.type),
      ),
    ),
    ...statementActions(detail, internal),
    notice: detail.overdueDays ? f.overdue(detail.overdueDays) : (detail.lockedReason ?? ''),
  }
}
function sourceTopic(source: StatementSource): Topic | null {
  const id = source.parentId ?? source.id,
    type = source.parentType ?? source.type
  if (type === 'order' || type === 'after' || type === 'po') return `${type}:${id}`
  return type === 'wh' ? `wh_doc:${id}` : null
}
function statementTopics(detail: StatementDetail, internal: boolean): Topic[] {
  if (!internal)
    return [detail.kind === 'supplier' ? `ap:${detail.partyId}` : `ar:${detail.partyId}`]
  return detail.groups
    .flatMap((group) => group.sources)
    .map(sourceTopic)
    .filter((topic): topic is Topic => topic !== null)
}
Page({
  ...unwatchOnLeave,
  data: {
    title: f.statementDetail,
    loaded: false,
    internal: false,
    failure: null as FailureView | null,
    info: null as {
      title: string
      status: string
      statusKind: string
      rows: { label: string; value: string }[]
    } | null,
    amountRows: [] as ReturnType<typeof statementAmountRows>,
    groups: [] as { title: string; rows: ReturnType<typeof sourceRowOf>[] }[],
    settlements: [] as ReturnType<typeof settlementRowsOf>,
    hasAfter: false,
    canShare: false,
    canRegister: false,
    canVoid: false,
    voidDisabled: false,
    voidReason: '',
    voidSheet: false,
    busy: false,
    error: '',
    notice: '',
    supplier: false,
    texts: financeTexts,
  },
  id: '',
  statement: null as StatementDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.setData({ internal: query.scope === 'internal' })
    void this.load()
  },
  onShow() {
    if (this.statement) {
      void this.load()
      watch(this, statementTopics(this.statement, this.data.internal), () => void this.load())
    }
  },
  async load() {
    const result = await request(
      this.data.internal ? contract.getBusinessStatement : contract.getStatement,
      { params: { id: this.id } },
    )
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.statement = result.data
    const detail = result.data
    this.setData(detailPatch(detail, this.data.internal))
    watch(this, statementTopics(detail, this.data.internal), () => void this.load())
  },
  onFailureAction() {
    void this.load()
  },
  onSource(event: KeyEvent) {
    const source = this.statement?.groups
      .flatMap((group) => group.sources)
      .find((item) => `${item.type}:${item.id}` === event.currentTarget.dataset.key)
    if (source)
      void wx.navigateTo({ url: sourceRoute(source, this.data.internal ? 'internal' : 'finance') })
  },
  onFund(event: KeyEvent) {
    if (this.data.internal) return
    const item = this.data.settlements.find((item) => item.id === event.currentTarget.dataset.key)
    if (item)
      void wx.navigateTo({
        url: `/packages/finance/pages/money/index?kind=${item.kind}&id=${item.id}`,
      })
  },
  onShare() {
    if (this.data.internal) return
    void wx.navigateTo({ url: `/packages/finance/pages/statement-image/index?id=${this.id}` })
  },
  onRegister() {
    if (!this.statement || this.data.internal) return
    void wx.navigateTo({
      url: `/packages/finance/pages/receive/index?kind=${this.data.supplier ? 'payment' : 'receipt'}&${this.data.supplier ? 'supplierId' : 'customerId'}=${this.statement.partyId}&statementId=${this.id}`,
    })
  },
  onVoid() {
    if (this.data.internal) return
    this.setData({ voidSheet: true, error: '' })
  },
  onCloseVoid() {
    this.setData({ voidSheet: false })
  },
  async onSubmitVoid(event: DetailEvent<string>) {
    if (!this.statement || this.data.busy || this.data.internal) return
    const reason = event.detail.trim()
    if (!reason) {
      this.setData({ error: f.voidReason })
      return
    }
    this.setData({ busy: true, error: '' })
    const result = await request(contract.voidStatement, {
      params: { id: this.id },
      body: { version: this.statement.version, reason },
    })
    this.setData({ busy: false })
    if (result.ok) {
      this.setData({ voidSheet: false })
      await this.load()
    } else {
      const fail = failureOf(result.failure, 'submit')
      this.setData({ error: fail?.message ?? '' })
      if (fail?.kind === 'stale') await this.load()
    }
  },
})
