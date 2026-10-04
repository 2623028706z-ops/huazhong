import {
  contract,
  financeCopy as f,
  financeTexts,
  shanghaiDateOf,
  monthStartOf,
  addDays,
  type StatementDraft,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { markChanged, syncUnloadAlert } from '../../../../core/guard'
import { watch, unwatchOnLeave } from '../../../../core/live'
import { newIdempotencyKey, request, type Failure } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { sourceRowOf, sourceRoute } from '../../../../views/statement'
import { draftTotalsOf, checkStatement, selectedSourcesOf } from './form'
type SelectedRow = ReturnType<typeof sourceRowOf> & { selected: boolean }
function sourceGroupsOf(rows: SelectedRow[], partyName: string) {
  const groups = new Map<string, { id: string; title: string; rows: SelectedRow[] }>()
  for (const row of rows) {
    const id = row.source?.storeId ?? ''
    if (!groups.has(id)) groups.set(id, { id, title: row.source?.storeName ?? partyName, rows: [] })
    groups.get(id)?.rows.push(row)
  }
  return [...groups.values()]
}
function statementKindOf(): 'customer' | 'supplier' {
  return 'customer'
}
Page({
  ...unwatchOnLeave,
  data: {
    title: f.statementCreate,
    kind: statementKindOf(),
    partyId: '',
    partyName: '',
    today: shanghaiDateOf(Date.now()),
    periodFrom: monthStartOf(shanghaiDateOf(Date.now())),
    periodTo: shanghaiDateOf(Date.now()),
    note: '',
    dueDate: '',
    selected: [] as string[],
    rows: [] as SelectedRow[],
    sourceGroups: [] as ReturnType<typeof sourceGroupsOf>,
    cells: [] as { label: string; amountCents: number; due: boolean }[],
    loaded: false,
    changed: false,
    needsReview: false,
    saving: false,
    error: '',
    changes: [] as string[],
    failure: null as FailureView | null,
    texts: financeTexts,
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
        from: this.data.periodFrom,
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
    const selectedSources = selectedSourcesOf(this.draft, this.data.selected)
    const primary = selectedSources
      .filter((item) => item.carriesAmount && item.amountCents >= 0)
      .reduce((sum, item) => sum + item.amountCents, 0)
    const negative = selectedSources
      .filter((item) => item.carriesAmount && item.amountCents < 0)
      .reduce((sum, item) => sum - item.amountCents, 0)
    const supplierReturns = selectedSources
      .filter((item) => item.type === 'purchase_return')
      .reduce((sum, item) => sum + Math.abs(item.amountCents), 0)
    const rows = this.draft.sources.map((item) => ({
      ...sourceRowOf(item),
      selected: this.data.selected.includes(`${item.type}:${item.id}`),
    }))
    this.setData({
      rows,
      sourceGroups: sourceGroupsOf(rows, this.data.partyName),
      cells: [
        { label: supplier ? f.received : f.shipped, amountCents: primary, due: false },
        {
          label: supplier ? f.returned : f.after,
          amountCents: supplier ? supplierReturns : negative,
          due: false,
        },
        {
          label: supplier ? f.supplierDeducted : f.deducted,
          amountCents: totals.creditDeductedCents,
          due: false,
        },
        { label: f.openingDebt, amountCents: this.draft.openingDebtCents, due: false },
        { label: supplier ? f.payable : f.receivable, amountCents: totals.dueCents, due: true },
      ],
    })
  },
  onSource(event: KeyEvent) {
    const id = event.currentTarget.dataset.key,
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
  onSourceDetail(event: KeyEvent) {
    const source = this.draft?.sources.find(
      (item) => `${item.type}:${item.id}` === event.currentTarget.dataset.key,
    )
    if (source) void wx.navigateTo({ url: sourceRoute(source) })
  },
  async onPeriod(event: DetailEvent<string, { key: 'periodFrom' | 'periodTo' }>) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail, error: '' })
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
