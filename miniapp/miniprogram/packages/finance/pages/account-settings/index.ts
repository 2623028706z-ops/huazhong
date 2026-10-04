import { contract, financeCopy as f, financeTexts } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { centsOfText, textOfCents } from '../../../../core/money'
import { checkedOf } from '../../../../core/form'
import { request, type Failure } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
Page({
  data: {
    title: f.terms,
    supplier: false,
    partyId: '',
    partyName: '',
    version: 0,
    termText: '',
    openingText: '',
    initial: { termText: '', openingText: '' },
    openingEditable: false,
    changed: false,
    loaded: false,
    needsReview: false,
    saving: false,
    error: '',
    failure: null as FailureView | null,
    texts: financeTexts,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      supplier: query.kind === 'supplier',
      partyId: query.partyId ?? '',
      partyName: query.name ?? '',
    })
    void this.load(true)
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load(reset = false) {
    const result = await request(
      this.data.supplier ? contract.supplierTerms : contract.customerTerms,
      { params: { id: this.data.partyId } },
    )
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return false
    }
    const terms = result.data,
      form = {
        termText: terms.termDays === null ? '' : String(terms.termDays),
        openingText: textOfCents(terms.openingDebtCents),
      }
    this.setData({
      loaded: true,
      failure: null,
      version: terms.version,
      openingEditable: terms.openingDebtEditable,
      ...(reset ? { ...form, initial: form } : {}),
    })
    return true
  },
  onField(event: DetailEvent<string, { key: 'termText' | 'openingText' }>) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail, error: '' })
    markChanged(
      this,
      isChanged(this.data.initial, {
        termText: this.data.termText,
        openingText: this.data.openingText,
      }),
    )
  },
  onFailureAction() {
    void this.load()
  },
  checkBody() {
    const termDays = this.data.termText.trim() === '' ? null : Number(this.data.termText)
    return checkedOf(
      contract.updateCustomerTerms.body.safeParse({
        version: this.data.version,
        termDays,
        ...(this.data.openingEditable
          ? { openingDebtCents: centsOfText(this.data.openingText) }
          : {}),
      }),
    )
  },
  showSubmitFailure(failure: Failure) {
    const fail = failureOf(failure, 'submit')
    this.setData({ error: fail?.message ?? '' })
    if (fail?.kind === 'stale') this.setData({ needsReview: true })
  },
  async onSubmit() {
    if (this.data.saving) return
    if (this.data.needsReview) {
      if (await this.load()) this.setData({ needsReview: false, error: '' })
      return
    }
    const checked = this.checkBody()
    if (!checked.ok) {
      this.setData({ error: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ saving: true, error: '' })
    const result = await request(
      this.data.supplier ? contract.updateSupplierTerms : contract.updateCustomerTerms,
      { params: { id: this.data.partyId }, body: checked.body },
    )
    this.setData({ saving: false })
    if (result.ok) {
      syncUnloadAlert(false)
      void wx.navigateBack()
    } else {
      this.showSubmitFailure(result.failure)
    }
  },
})
