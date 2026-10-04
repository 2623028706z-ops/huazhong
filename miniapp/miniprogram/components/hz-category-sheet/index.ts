// 管理分类弹层（06 章 X9、X11、W5）：产品内部分类、订货分类、花材分类、出库分类共用。改名、新增切到名称表单（左上换成返回）。
// 只发事件，请求和报错由页面做：save（id 为空是新增；toggleable 时带 enabled）、up（下标）、remove（id）。
// 分类列表变了（保存成功后页面刷新）就回到列表
import { copy } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'

interface Category {
  id: string
  name: string
  enabled?: boolean
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    categories: { type: Array, value: [] as Category[] },
    error: { type: String, value: '' },
    loading: { type: Boolean, value: false },
    sortable: { type: Boolean, value: true },
    removable: { type: Boolean, value: true },
    // 名称表单里多一个「启用」开关，列表里停用的标「已停用」（出库分类）
    toggleable: { type: Boolean, value: false },
  },
  data: {
    editing: false,
    editingId: '',
    editTitle: '',
    oldName: '',
    nameText: '',
    enabledValue: true,
    texts: {
      enabled: copy.statusValue.enabled,
      disabled: copy.statusValue.disabled,
      name: copy.screen.label.name,
      up: copy.screen.action.moveUp,
      save: copy.action.saveCategory,
      add: copy.screen.action.addCategory,
      empty: copy.state.empty(copy.screen.empty.categories),
    },
  },
  observers: {
    show(show: boolean) {
      if (show) this.setData({ editing: false })
    },
    categories() {
      this.setData({ editing: false })
    },
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
    onBack() {
      this.setData({ editing: false })
    },
    onNew() {
      const editTitle = copy.screen.title.addCategory
      this.setData({ editing: true, editingId: '', editTitle, nameText: '', enabledValue: true })
    },
    onRename(event: KeyEvent) {
      const category = this.data.categories.find((c) => c.id === event.currentTarget.dataset.key)
      if (!category) return
      this.setData({
        editing: true,
        editingId: category.id,
        editTitle: copy.screen.title.renameCategory,
        oldName: category.name,
        nameText: category.name,
        enabledValue: category.enabled ?? true,
      })
    },
    onNameText(event: DetailEvent<string>) {
      this.setData({ nameText: event.detail })
    },
    onEnabled(event: DetailEvent<boolean>) {
      this.setData({ enabledValue: event.detail })
    },
    onSave() {
      const { editingId, nameText, enabledValue } = this.data
      this.triggerEvent('save', { id: editingId, name: nameText, enabled: enabledValue })
    },
    onUp(event: DetailEvent<unknown, { index: number }>) {
      this.triggerEvent('up', event.currentTarget.dataset.index)
    },
    onRemove(event: KeyEvent) {
      this.triggerEvent('remove', event.currentTarget.dataset.key)
    },
  },
})
