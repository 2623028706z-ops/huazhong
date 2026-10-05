import { contract, copy, redesignCopy, type StocktakeDraft } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { formOnLeave, isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { watch } from '../../../../core/live'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf, type ShownFailure } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'

interface Line {
  materialId: string
  name: string
  unit: string
  enabled: boolean
  bookQty: number
  actualText: string
}
interface Form {
  reason: string
  lines: Line[]
}
const blank: Form = { reason: '', lines: [] }
function rowsOf(form: Form, fields: Record<string, string>) {
  return form.lines.map((line, index) => ({
    ...line,
    diffQty:
      line.actualText.trim() === '' || !Number.isInteger(Number(line.actualText))
        ? ''
        : String(Number(line.actualText) - line.bookQty),
    error: fields[`lines.${index}.actualQty`] ?? '',
  }))
}
Page({
  ...formOnLeave,
  data: {
    title: copy.stock.screen.stocktakeForm,
    loaded: false,
    changed: false,
    saving: false,
    failure: null as FailureView | null,
    formError: '',
    fields: {},
    form: blank,
    initial: blank,
    rows: [] as ReturnType<typeof rowsOf>,
    categories: '',
    realtime: '',
    optional: copy.placeholder.optional,
    texts: {
      ...copy.stock.screen,
      materials: redesignCopy.materialLines,
      disabled: copy.statusValue.disabled,
      unit: copy.field.unit,
    },
  },
  categoryIds: [] as string[],
  key: '',
  onLoad(query: Record<string, string | undefined>) {
    this.categoryIds = (query.categoryIds ?? '').split(',').filter(Boolean)
    this.key = newIdempotencyKey()
  },
  onShow() {
    syncUnloadAlert(this.data.changed)
    if (!this.data.loaded) void this.load()
    watch(this, ['stock'], () => {
      this.setData({ realtime: copy.stock.screen.refreshStock })
    })
  },
  async load() {
    const result = await request(contract.getStocktakeDraft, {
      query: { categoryIds: this.categoryIds.join(',') },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.applyDraft(result.data)
  },
  applyDraft(draft: StocktakeDraft) {
    const previous = new Map(this.data.form.lines.map((line) => [line.materialId, line.actualText]))
    const form = {
      reason: this.data.form.reason,
      lines: draft.lines.map((line) => ({
        ...line,
        actualText: previous.get(line.materialId) ?? String(line.bookQty),
      })),
    }
    if (!this.data.loaded) this.setData({ initial: form })
    this.setData({
      loaded: true,
      failure: null,
      categories: draft.categories.map((row) => row.name).join(copy.separator),
    })
    this.render(form)
  },
  render(form: Form) {
    this.setData({ form, rows: rowsOf(form, this.data.fields) })
    const normalize = (value: Form) => ({
      reason: value.reason,
      lines: value.lines.map((line) => ({
        materialId: line.materialId,
        actualText: line.actualText,
      })),
    })
    markChanged(this, isChanged(normalize(this.data.initial), normalize(form)))
  },
  onActualInput(event: DetailEvent<{ value: string }, { index: number }>) {
    this.onActual({
      detail: event.detail.value,
      currentTarget: event.currentTarget,
    } as DetailEvent<string, { index: number }>)
  },
  onActual(event: DetailEvent<string, { index: number }>) {
    this.setData({ fields: {}, formError: '' })
    this.render({
      ...this.data.form,
      lines: this.data.form.lines.map((line, index) =>
        index === event.currentTarget.dataset.index ? { ...line, actualText: event.detail } : line,
      ),
    })
  },
  onReason(event: DetailEvent<string>) {
    this.setData({ fields: {}, formError: '' })
    this.render({ ...this.data.form, reason: event.detail })
  },
  onFailureAction() {
    void this.load()
  },
  async onRealtime() {
    await this.load()
    this.setData({ realtime: '' })
  },
  showFailure(failure: ShownFailure | null) {
    if (!failure) return
    if (failure.kind === 'stale') {
      const latest = contract.getStocktakeDraft.response.safeParse(failure.latest)
      if (latest.success) this.applyDraft(latest.data)
      this.setData({ realtime: failure.message })
    } else if (failure.kind === 'fields') {
      this.setData({
        fields: failure.fields,
        formError: unplacedErrorOf(failure.fields, ['reason', 'lines.*.actualQty']),
      })
      this.render(this.data.form)
    } else this.setData({ formError: messageOf(failure) })
  },
  async onSubmit() {
    if (this.data.saving) return
    const input = {
      categoryIds: this.categoryIds,
      reason: this.data.form.reason,
      lines: this.data.form.lines.map((line) => ({
        materialId: line.materialId,
        bookQty: line.bookQty,
        actualQty: line.actualText.trim() === '' ? null : Number(line.actualText),
      })),
    }
    const checked = checkedOf(contract.createStocktake.body.safeParse(input))
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        formError: unplacedErrorOf(checked.fields, ['reason', 'lines.*.actualQty']),
      })
      this.render(this.data.form)
      return
    }
    this.setData({ saving: true, fields: {}, formError: '' })
    try {
      const result = await request(
        contract.createStocktake,
        { body: checked.body },
        { idempotencyKey: this.key },
      )
      if (!result.ok) {
        this.showFailure(failureOf(result.failure, 'submit'))
        return
      }
      markChanged(this, false)
      showSuccess(copy.action.saved)
      void wx.redirectTo({
        url: `/packages/warehouse/pages/stocktake-detail/index?id=${result.data.id}`,
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
