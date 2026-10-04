import { contract, copy, type WhDocDetail } from '@huazhong/shared'
import { buttonsOf, canDo } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import {
  confirmLeave,
  formOnLeave,
  isChanged,
  markChanged,
  syncUnloadAlert,
} from '../../../../core/guard'
import { watch } from '../../../../core/live'
import { centsOfText, textOfCents } from '../../../../core/money'
import { request } from '../../../../core/request'
import { failureOf, messageOf, type ShownFailure } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { stockViewOf } from '../../../../views/stock'

interface PriceLine {
  lineId: string
  name: string
  code: string
  unit: string
  qty: number
  priceText: string
}
const blank = { reason: '', lines: [] as PriceLine[] }
const blankFields: Record<string, string> = {}
Page({
  ...formOnLeave,
  data: {
    title: copy.stock.screen.detail,
    loaded: false,
    failure: null as FailureView | null,
    view: null as ReturnType<typeof stockViewOf> | null,
    buttons: [] as ReturnType<typeof buttonsOf>,
    sheet: '',
    sheetTitle: '',
    confirmText: '',
    changed: false,
    form: blank,
    initial: blank,
    lines: [] as {
      key: string
      name: string
      code: string
      unit: string
      qty: number
      priceText: string
      priceCents: number
      amountCents: number
      tags: never[]
      priceError: string
    }[],
    fields: blankFields,
    error: '',
    saving: false,
    realtime: '',
    texts: {
      reason: copy.screen.label.reason,
      repriceReason: copy.screen.label.repriceReason,
      materials: copy.screen.section.materials,
    },
  },
  id: '',
  financeScope: false,
  readonlyScope: false,
  document: null as WhDocDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.financeScope = query.scope === 'finance'
    this.readonlyScope = query.scope === 'internal'
  },
  onShow() {
    syncUnloadAlert(this.data.changed)
    void this.load()
    watch(this, [`wh_doc:${this.id}`], () => void this.load())
  },
  async load(replace = false) {
    const result = await request(this.financeScope ? contract.getFinanceWhDoc : contract.getWhDoc, {
      params: { id: this.id },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    if (!replace && this.preserve(result.data)) return
    this.document = result.data
    this.setData({
      loaded: true,
      failure: null,
      realtime: '',
      view: stockViewOf(result.data, this.financeScope),
      buttons: this.readonlyScope
        ? []
        : buttonsOf(result.data.actions, [{ code: 'void', secondary: true }, { code: 'reprice' }]),
    })
  },
  preserve(doc: WhDocDetail) {
    const { sheet, saving } = this.data
    if ((sheet !== 'void' && sheet !== 'reprice') || saving) return false
    if (canDo(doc.actions, sheet)) {
      this.setData({ realtime: copy.screen.realtime.editing })
      return true
    }
    markChanged(this, false)
    this.setData({ sheet: '' })
    return false
  },
  async onRealtime() {
    await this.load(true)
  },
  onFailureAction() {
    void this.load()
  },
  onAction(event: CodeEvent) {
    const code = event.currentTarget.dataset.code
    if (
      !this.document ||
      (code !== 'void' && code !== 'reprice') ||
      !canDo(this.document.actions, code)
    )
      return
    const form = {
      reason: '',
      lines:
        code === 'reprice'
          ? this.document.lines.map((line) => ({
              lineId: line.id,
              name: line.name,
              code: line.code,
              unit: line.unit,
              qty: line.qty,
              priceText: textOfCents(line.priceCents ?? 0),
            }))
          : [],
    }
    this.setData({
      sheet: code,
      sheetTitle: code === 'void' ? copy.stock.screen.void : copy.screen.action.reprice,
      confirmText: code === 'void' ? copy.screen.action.confirmVoid : copy.screen.action.reprice,
      initial: form,
      error: '',
      fields: {},
    })
    this.render(form)
  },
  render(form: typeof blank) {
    this.setData({
      form,
      lines: form.lines.map((line, index) => ({
        ...line,
        key: line.lineId,
        priceCents: centsOfText(line.priceText) ?? 0,
        amountCents: line.qty * (centsOfText(line.priceText) ?? 0),
        tags: [],
        priceError: this.data.fields[`lines.${index}.priceCents`] ?? '',
      })),
    })
    markChanged(this, isChanged(this.data.initial, form))
  },
  onReason(event: DetailEvent<string>) {
    this.setData({ fields: {}, error: '' })
    this.render({ ...this.data.form, reason: event.detail })
  },
  onPrice(event: DetailEvent<{ index: number; text: string }>) {
    this.setData({ fields: {}, error: '' })
    this.render({
      ...this.data.form,
      lines: this.data.form.lines.map((line, index) =>
        index === event.detail.index ? { ...line, priceText: event.detail.text } : line,
      ),
    })
  },
  async onCloseSheet() {
    if (this.data.saving || !(await confirmLeave(this, this.data.changed))) return
    markChanged(this, false)
    this.setData({ sheet: '' })
  },
  onPreview(event: DetailEvent<unknown, { url: string; urls: string[] }>) {
    void wx.previewImage({
      current: event.currentTarget.dataset.url,
      urls: event.currentTarget.dataset.urls,
    })
  },
  async showFailure(failure: ShownFailure | null) {
    if (!failure) return
    if (failure.kind === 'fields') {
      this.setData({
        fields: failure.fields,
        error: unplacedErrorOf(failure.fields, ['reason', 'lines.*.priceCents']),
      })
      this.render(this.data.form)
      return
    }
    this.setData({ error: messageOf(failure) })
    if (failure.kind === 'stale') await this.load(true)
  },
  async onSave() {
    if (this.data.saving || !this.document || !this.data.sheet) return
    const input = {
      version: this.document.version,
      reason: this.data.form.reason,
      lines: this.data.form.lines.map((line) => ({
        lineId: line.lineId,
        priceCents: centsOfText(line.priceText),
      })),
    }
    const checked =
      this.data.sheet === 'void'
        ? checkedOf(contract.voidWhDoc.body.safeParse(input))
        : checkedOf(contract.repriceWhDoc.body.safeParse(input))
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        error: unplacedErrorOf(checked.fields, ['reason', 'lines.*.priceCents']),
      })
      this.render(this.data.form)
      return
    }
    this.setData({ saving: true, error: '', fields: {} })
    try {
      const result =
        this.data.sheet === 'void'
          ? await request(contract.voidWhDoc, {
              params: { id: this.id },
              body: { version: this.document.version, reason: this.data.form.reason },
            })
          : await request(contract.repriceWhDoc, {
              params: { id: this.id },
              body: contract.repriceWhDoc.body.parse(checked.body),
            })
      if (!result.ok) {
        await this.showFailure(failureOf(result.failure, 'submit'))
        return
      }
      markChanged(this, false)
      this.setData({ sheet: '' })
      this.document = result.data
      await this.load()
      showSuccess(copy.action.saved)
    } finally {
      this.setData({ saving: false })
    }
  },
})
