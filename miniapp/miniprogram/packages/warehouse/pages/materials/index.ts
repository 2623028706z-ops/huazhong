import { contract, copy, type Material, type MaterialCategory } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import type { PagedList } from '../../../../core/list'
import type { Failure } from '../../../../core/request'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { listHandlers, listOf, showList } from '../../../../views/list'
import { pullToRefresh } from '../../../../core/live'

function blank(code = '') {
  return { code, name: '', unit: '', categoryId: '', enabled: true }
}
function formOf(m: Material) {
  return { code: m.code, name: m.name, unit: m.unit, categoryId: m.categoryId, enabled: m.enabled }
}
function rowOf(m: Material) {
  return {
    id: m.id,
    fields: [
      { label: copy.field.code, value: m.code },
      { label: copy.field.unit, value: m.unit },
      { label: copy.field.category, value: m.categoryName, wide: true },
    ],
    title: m.name,
    total: m.unit,
    meta: [m.code, m.categoryName].join(copy.separator),
    tags: m.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }
}
Page({
  ...pullToRefresh,
  ...listHandlers,
  data: {
    title: copy.screen.title.materials,
    filter: emptyFilter,
    dimensions: [] as FilterDimension[],
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.materials,
    allLoaded: copy.state.allLoaded,
    canCreate: false,
    canManage: false,
    nextCode: '',
    sheet: false,
    sheetTitle: '',
    form: blank(),
    initial: blank(),
    changed: false,
    fields: {},
    error: '',
    saving: false,
    categories: [] as MaterialCategory[],
    categorySheet: false,
    categoryError: '',
    categorySaving: false,
    texts: {
      ...copy.field,
      ...copy.screen.label,
      enabled: copy.statusValue.enabled,
      create: copy.screen.action.createMaterial,
      save: copy.screen.action.saveMaterial,
      search: copy.filter.search(copy.object.material),
      manage: copy.screen.action.manageCategories,
    },
  },
  list: null as PagedList<Material> | null,
  material: null as Material | null,
  key: '',
  editId: '',
  categoryKey: '',
  // 从库存页底栏进来：直接打开「管理分类」或「新建花材」
  openAction: '',
  // 从花材详情「编辑」或库存页「新建花材」进来的，保存后回到来源页
  leaveAfterSave: false,
  onLoad(query: Record<string, string | undefined>) {
    this.editId = query.editId ?? ''
    this.openAction = query.open ?? ''
    this.leaveAfterSave = !!this.editId || this.openAction === 'create'
    this.list = listOf(
      this,
      async (cursor) => {
        const picks = this.data.filter.picks
        const result = await request(contract.listMaterials, {
          query: {
            cursor,
            q: this.data.filter.keyword,
            categoryId: picks.category,
            enabled: picks.enabled as 'true' | 'false' | undefined,
          },
        })
        if (result.ok)
          this.setData({
            nextCode: result.data.nextCode,
            canCreate: canDo(result.data.actions, 'create'),
            canManage: canDo(result.data.actions, 'manageCategories'),
          })
        if (result.ok && this.openAction) {
          const action = this.openAction
          this.openAction = ''
          if (action === 'create') this.onCreate()
          else if (action === 'categories') this.onCategories()
        }
        return result
      },
      rowOf,
    )
  },
  onShow() {
    void this.loadCategories()
    if (this.editId) {
      void this.onOpen({ currentTarget: { dataset: { key: this.editId } } } as KeyEvent)
      this.editId = ''
    }
    showList(this, ['stock'])
  },
  onUnload() {
    listHandlers.onUnload.call(this)
    syncUnloadAlert(false)
  },
  async loadCategories() {
    const result = await request(contract.listMaterialCategories)
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.setData({
      categories: result.data.items,
      dimensions: [
        { key: 'category', label: copy.object.category, options: result.data.items },
        {
          key: 'enabled',
          label: copy.field.status,
          options: [
            { id: 'true', name: copy.statusValue.enabled },
            { id: 'false', name: copy.statusValue.disabled },
          ],
        },
      ],
    })
  },
  onCreate() {
    this.material = null
    this.key = newIdempotencyKey()
    const form = blank(this.data.nextCode)
    this.setData({
      sheet: true,
      sheetTitle: copy.screen.action.createMaterial,
      form,
      initial: form,
      error: '',
      fields: {},
      changed: false,
    })
  },
  async onOpen(event: KeyEvent) {
    const result = await request(contract.getMaterial, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.material = result.data
    const form = formOf(result.data)
    this.setData({
      sheet: true,
      sheetTitle: copy.screen.title.material,
      form,
      initial: form,
      error: '',
      fields: {},
      changed: false,
    })
  },
  update(patch: Partial<ReturnType<typeof blank>>) {
    const form = { ...this.data.form, ...patch },
      changed = isChanged(this.data.initial, form)
    this.setData({ form, changed, error: '', fields: {} })
    syncUnloadAlert(changed)
  },
  onText(event: DetailEvent<string, { field: 'name' | 'unit' | 'code' }>) {
    this.update({ [event.currentTarget.dataset.field]: event.detail })
  },
  onCategory(event: DetailEvent<string>) {
    this.update({ categoryId: event.detail })
  },
  onEnabled(event: DetailEvent<boolean>) {
    this.update({ enabled: event.detail })
  },
  onClose() {
    this.setData({ sheet: false, changed: false })
    syncUnloadAlert(false)
  },
  async onSave() {
    const body = { ...this.data.form, ...(this.material ? { version: this.material.version } : {}) }
    const checked = checkedOf(
      this.material
        ? contract.updateMaterial.body.safeParse(body)
        : contract.createMaterial.body.safeParse(body),
    )
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        error: unplacedErrorOf(checked.fields, ['code', 'name', 'unit', 'categoryId']),
      })
      return
    }
    this.setData({ saving: true, error: '' })
    const result = this.material
      ? await request(contract.updateMaterial, {
          params: { id: this.material.id },
          body: contract.updateMaterial.body.parse(checked.body),
        })
      : await request(contract.createMaterial, { body: checked.body }, { idempotencyKey: this.key })
    this.setData({ saving: false })
    if (result.ok) {
      this.onClose()
      showSuccess(copy.action.saved)
      if (this.leaveAfterSave) {
        void wx.navigateBack()
        return
      }
      void this.list?.refresh()
      return
    }
    this.showFailure(result.failure)
  },
  showFailure(failure: Failure) {
    const view = failureOf(failure, 'submit')
    if (!view) return
    if (view.kind === 'page') this.setData({ failure: view })
    else {
      if (view.kind === 'stale') {
        this.material = view.latest as Material
        const form = formOf(this.material)
        this.setData({ form, initial: form, changed: false })
        syncUnloadAlert(false)
      }
      this.setData({
        error:
          view.kind === 'fields'
            ? unplacedErrorOf(view.fields, ['code', 'name', 'unit', 'categoryId'])
            : messageOf(view),
        fields: view.kind === 'fields' ? view.fields : {},
      })
    }
  },
  onCategories() {
    this.categoryKey = newIdempotencyKey()
    this.setData({ categorySheet: true, categoryError: '' })
  },
  onCloseCategories() {
    this.setData({ categorySheet: false })
  },
  async onSaveCategory(event: DetailEvent<{ id: string; name: string }>) {
    const { id, name } = event.detail
    const sort = this.categorySort(id)
    const checked = checkedOf(contract.createMaterialCategory.body.safeParse({ name, sort }))
    if (!checked.ok) {
      this.setData({ categoryError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ categorySaving: true })
    const result = id
      ? await request(contract.updateMaterialCategory, { params: { id }, body: checked.body })
      : await request(
          contract.createMaterialCategory,
          { body: checked.body },
          { idempotencyKey: this.categoryKey },
        )
    this.setData({ categorySaving: false })
    if (result.ok) {
      this.categoryKey = newIdempotencyKey()
      await this.loadCategories()
      void this.list?.refresh()
    } else this.setData({ categoryError: failureOf(result.failure, 'submit')?.message ?? '' })
  },
  categorySort(id: string): number {
    if (!id) return this.data.categories.length
    return this.data.categories.find((c) => c.id === id)?.sort ?? 0
  },
})
