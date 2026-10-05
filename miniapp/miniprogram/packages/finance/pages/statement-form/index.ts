import {
  contract,
  copy,
  financeCopy as f,
  financeTexts,
  shanghaiDateOf,
  addDays,
  formatMoney,
  type StatementDraft,
} from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { markChanged, syncUnloadAlert } from '../../../../core/guard'
import { watch, unwatchOnLeave } from '../../../../core/live'
import { newIdempotencyKey, request, type Failure } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import {
  periodTextOf,
  sourceRoute,
  statementSectionsOf,
  type ListSection,
} from '../../../../views/statement'
import { draftTotalsOf, draftCellsOf, checkStatement } from './form'
function sectionsOf(draft: StatementDraft, selected: string[], supplier: boolean) {
  return statementSectionsOf(draft.sources, {
    supplier,
    emptyAfter: supplier ? f.noReturnInPeriod : f.noAfterInPeriod,
    selected: new Set(selected),
  })
}
function initialKind(): 'customer' | 'supplier' {
  return 'customer'
}
Page({
  ...unwatchOnLeave,
  data: {
    title: f.statementCreate,
    kind: initialKind(),
    partyId: '',
    partyName: '',
    today: shanghaiDateOf(Date.now()),
    // 空 = 让服务端给默认起点（上一张对账单截止日次日 / 最早一笔未对账单据日期），可改
    periodFrom: '',
    periodTo: shanghaiDateOf(Date.now()),
    note: '',
    dueDate: '',
    selected: [] as string[],
    main: null as ListSection | null,
    afterSection: null as ListSection | null,
    periodSheet: false,
    periodText: '',
    cells: [] as ReturnType<typeof draftCellsOf>,
    dueText: '',
    loaded: false,
    changed: false,
    needsReview: false,
    saving: false,
    error: '',
    changes: [] as string[],
    failure: null as FailureView | null,
    texts: { ...financeTexts, optional: copy.placeholder.optional },
  },
  draft: null as StatementDraft | null,
  key: '',
  loadSeq: 0,
  onLoad(query: Record<string, string | undefined>) {
    this.key = newIdempotencyKey()
    this.setData({
      kind: query.kind === 'supplier' ? 'supplier' : 'customer',
      partyId: query.partyId ?? '',
    })
    void Promise.all([this.load(true), this.loadTerms()])
  },
  async loadTerms() {
    const result = await request(
      this.data.kind === 'supplier' ? contract.supplierTerms : contract.customerTerms,
      { params: { id: this.data.partyId } },
    )
    if (result.ok)
      this.setData({
        dueDate:
          result.data.termDays === null ? '' : addDays(this.data.today, result.data.termDays),
      })
  },
  onShow() {
    watch(
      this,
      [this.data.kind === 'supplier' ? `ap:${this.data.partyId}` : `ar:${this.data.partyId}`],
      () => {
        this.setData({ needsReview: true, error: f.sourceChanged })
      },
    )
  },
  async load(reset = false) {
    const seq = ++this.loadSeq
    const result = await request(contract.statementDraft, {
      query: {
        kind: this.data.kind,
        partyId: this.data.partyId,
        ...(this.data.periodFrom ? { from: this.data.periodFrom } : {}),
        to: this.data.periodTo,
      },
    })
    if (seq !== this.loadSeq) return false
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return false
    }
    const old = this.draft
    this.draft = result.data
    const selected = reset
      ? result.data.sources.filter((item) => item.selected).map((item) => `${item.type}:${item.id}`)
      : this.data.selected.filter((id) =>
          result.data.sources.some((item) => `${item.type}:${item.id}` === id),
        )
    const changes = old
      ? old.sources
          .filter((item) => this.data.selected.includes(`${item.type}:${item.id}`))
          .flatMap((item) => {
            const latest = result.data.sources.find(
              (next) => next.id === item.id && next.type === item.type,
            )
            return !latest
              ? [`${item.sourceNo} · ${f.sourceChanged}`]
              : latest.version !== item.version || latest.amountCents !== item.amountCents
                ? [`${item.sourceNo} · ${f.sourceChanged}`]
                : []
          })
      : []
    this.setData({
      loaded: true,
      failure: null,
      partyName: result.data.partyName,
      periodFrom: result.data.periodFrom,
      periodTo: result.data.periodTo,
      selected,
      changes,
    })
    this.render()
    return true
  },
  render() {
    if (!this.draft) return
    const totals = draftTotalsOf(this.draft, this.data.selected),
      supplier = this.data.kind === 'supplier'
    const sections = sectionsOf(this.draft, this.data.selected, supplier)
    this.setData({
      main: sections.main,
      afterSection: sections.after,
      periodText: periodTextOf(this.data.periodFrom, this.data.periodTo),
      cells: draftCellsOf(this.draft, this.data.selected, supplier),
      dueText: formatMoney(totals.dueCents),
    })
  },
  onToggle(event: DetailEvent<string>) {
    const id = event.detail,
      source = this.draft?.sources.find((item) => `${item.type}:${item.id}` === id)
    if (!source || !source.carriesAmount) return
    this.setData({
      selected: this.data.selected.includes(id)
        ? this.data.selected.filter((item) => item !== id)
        : [...this.data.selected, id],
    })
    markChanged(this, true)
    this.render()
  },
  onSourceDetail(event: DetailEvent<string>) {
    const source = this.draft?.sources.find((item) => `${item.type}:${item.id}` === event.detail)
    if (source) void wx.navigateTo({ url: sourceRoute(source) })
  },
  onOpenPeriod() {
    this.setData({ periodSheet: true })
  },
  onClosePeriod() {
    this.setData({ periodSheet: false })
  },
  async onPeriod(event: DetailEvent<string, { key: 'periodFrom' | 'periodTo' }>) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail, error: '' })
    this.setData({ periodText: periodTextOf(this.data.periodFrom, this.data.periodTo) })
    markChanged(this, true)
    await this.load(true)
  },
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail, error: '' })
    markChanged(this, true)
  },
  onFailureAction() {
    void this.load()
  },
  async onSubmit() {
    if (this.data.saving || !this.draft) return
    if (this.data.needsReview) {
      if (await this.load(false)) this.setData({ needsReview: false, error: '' })
      return
    }
    const checked = checkStatement(this.draft, this.data.selected, this.data.note)
    if (!checked.ok) {
      this.setData({ error: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ saving: true, error: '' })
    const result = await request(
      contract.createStatement,
      { body: checked.body },
      { idempotencyKey: this.key },
    )
    this.setData({ saving: false })
    if (result.ok) {
      syncUnloadAlert(false)
      void wx.redirectTo({
        url: `/packages/finance/pages/statement-detail/index?id=${result.data.id}`,
      })
      return
    }
    await this.showSubmitFailure(result.failure)
  },
  async showSubmitFailure(failure: Failure) {
    const fail = failureOf(failure, 'submit')
    if (fail?.kind === 'stale') {
      await this.load(false)
      this.key = newIdempotencyKey()
      this.setData({ needsReview: true, error: f.sourceChanged })
    } else this.setData({ error: fail?.message ?? '' })
  },
})
