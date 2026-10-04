import {
  contract,
  statementCopy,
  financeCopy as f,
  financeTexts,
  type StatementDetail,
  type StatementSource,
  type Topic,
} from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { watch, unwatchOnLeave } from '../../../../core/live'
import {
  statementInfoOf,
  statementAmountCells,
  statementSectionsOf,
  settlementListRowsOf,
  sourceRoute,
  type ListSection,
} from '../../../../views/statement'
function statementActions(detail: StatementDetail, internal: boolean) {
  const supplier = detail.kind === 'supplier'
  const voidAction = detail.actions.find((action) => action.code === 'voidStatement')
  return {
    canShare: !internal && canDo(detail.actions, 'shareStatement'),
    canRegister:
      !internal && canDo(detail.actions, supplier ? 'registerPayment' : 'registerReceipt'),
    // 作废对账单是页面最下面的灰字；已结清且能作废时不显示，
    // 但作废被挡住（已收过款等）时一定显示灰字并写明原因
    canVoid:
      !internal &&
      voidAction !== undefined &&
      (detail.status === 'unsettled' || !canDo(detail.actions, 'voidStatement')),
    voidDisabled: !canDo(detail.actions, 'voidStatement'),
    voidReason: voidAction?.disabledReason ?? '',
  }
}
function detailInfo(detail: StatementDetail) {
  return {
    title: detail.partyName,
    status: detail.status,
    statusKind: 'statementStatus',
    rows: statementInfoOf(detail),
  }
}
function detailPatch(detail: StatementDetail, internal: boolean) {
  const supplier = detail.kind === 'supplier'
  const sections = statementSectionsOf(
    detail.groups.flatMap((group) => group.sources),
    { supplier, count: false },
  )
  return {
    loaded: true,
    failure: null,
    supplier,
    info: detailInfo(detail),
    amountCells: statementAmountCells(detail),
    main: sections.main,
    afterSection: sections.after,
    receiptSection: {
      title: supplier ? f.payments : f.receipts,
      meta: '',
      emptyText: supplier ? f.noPayment : f.noReceipt,
      groups: detail.settlements.length
        ? [
            {
              key: '',
              head: '',
              meta: '',
              rows: settlementListRowsOf(detail.settlements, supplier),
            },
          ]
        : [],
    },
    ...statementActions(detail, internal),
    overdue: detail.overdueDays ? f.overdue(detail.overdueDays) : '',
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
      rows: { label: string; value: string; wide?: boolean }[]
    } | null,
    amountCells: [] as ReturnType<typeof statementAmountCells>,
    main: null as ListSection | null,
    afterSection: null as ListSection | null,
    receiptSection: null as ListSection | null,
    canShare: false,
    canRegister: false,
    canVoid: false,
    voidDisabled: false,
    voidReason: '',
    voidSheet: false,
    busy: false,
    error: '',
    overdue: '',
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
  onSource(event: DetailEvent<string>) {
    const source = this.statement?.groups
      .flatMap((group) => group.sources)
      .find((item) => `${item.type}:${item.id}` === event.detail)
    if (source)
      void wx.navigateTo({ url: sourceRoute(source, this.data.internal ? 'internal' : 'finance') })
  },
  onFund(event: DetailEvent<string>) {
    if (this.data.internal) return
    const [kind, id] = event.detail.split(':')
    if (kind && id)
      void wx.navigateTo({ url: `/packages/finance/pages/money/index?kind=${kind}&id=${id}` })
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
      this.setData({ error: statementCopy.voidReasonRequired })
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
