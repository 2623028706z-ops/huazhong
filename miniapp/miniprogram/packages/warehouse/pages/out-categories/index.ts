import { contract, copy, type OutCategory } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { confirmLeave, isChanged } from '../../../../core/guard'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { canDo } from '../../../../core/actions'

const blank = { name: '', enabled: true }
Page({
  data: {
    title: copy.stock.screen.titles.categories,
    loaded: false,
    items: [] as OutCategory[],
    canCreate: false,
    sheet: false,
    sheetTitle: '',
    form: { ...blank },
    fields: {},
    error: '',
    sheetError: '',
    saving: false,
    texts: {
      add: copy.screen.action.addCategory,
      name: copy.field.name,
      status: copy.field.status,
      enabled: copy.statusValue.enabled,
      disabled: copy.statusValue.disabled,
      save: copy.action.saveCategory,
    },
  },
  id: '',
  key: '',
  initial: { ...blank },
  onShow() {
    void this.load()
  },
  async load() {
    const result = await request(contract.listOutCategories)
    if (result.ok)
      this.setData({
        loaded: true,
        items: result.data.items,
        error: '',
        canCreate: canDo(result.data.actions, 'create'),
      })
    else this.setData({ error: failureOf(result.failure, 'load')?.message ?? '' })
  },
  onFailureAction() {
    void this.load()
  },
  onAdd() {
    if (!this.data.canCreate) return
    this.id = ''
    this.key = newIdempotencyKey()
    this.initial = { ...blank }
    this.setData({
      sheet: true,
      sheetTitle: copy.screen.title.addCategory,
      form: { ...blank },
      fields: {},
      sheetError: '',
    })
  },
  onEdit(event: KeyEvent) {
    const item = this.data.items.find((row) => row.id === event.currentTarget.dataset.key)
    if (!item) return
    this.id = item.id
    this.initial = { name: item.name, enabled: item.enabled }
    this.setData({
      sheet: true,
      sheetTitle: copy.screen.title.renameCategory,
      form: { ...this.initial },
      fields: {},
      sheetError: '',
    })
  },
  onName(event: DetailEvent<string>) {
    this.setData({ 'form.name': event.detail, fields: {}, sheetError: '' })
  },
  onEnabled(event: DetailEvent<boolean>) {
    this.setData({ 'form.enabled': event.detail, fields: {}, sheetError: '' })
  },
  async onClose() {
    if (!this.data.saving && (await confirmLeave(this, isChanged(this.initial, this.data.form))))
      this.setData({ sheet: false })
  },
  async onSave() {
    if (this.data.saving) return
    const checked = checkedOf(contract.createOutCategory.body.safeParse(this.data.form))
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        sheetError: unplacedErrorOf(checked.fields, ['name']),
      })
      return
    }
    this.setData({ saving: true, sheetError: '', fields: {} })
    try {
      const result = this.id
        ? await request(contract.updateOutCategory, { params: { id: this.id }, body: checked.body })
        : await request(
            contract.createOutCategory,
            { body: checked.body },
            { idempotencyKey: this.key },
          )
      if (!result.ok) {
        const failure = failureOf(result.failure, 'submit')
        if (!failure) return
        this.setData({
          fields: failure.kind === 'fields' ? failure.fields : {},
          sheetError:
            failure.kind === 'fields'
              ? unplacedErrorOf(failure.fields, ['name'])
              : messageOf(failure),
        })
        return
      }
      this.setData({ sheet: false })
      await this.load()
    } finally {
      this.setData({ saving: false })
    }
  },
})
