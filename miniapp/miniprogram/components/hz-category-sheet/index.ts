// 管理分类弹层（06 章 X9、X11）：产品内部分类和订货分类共用。改名、新增切到名称表单（左上换成返回）。
// 只发事件，请求和报错由页面做：save（id 为空是新增）、up（下标）、remove（id）。
// 分类列表变了（保存成功后页面刷新）就回到列表
import { copy } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'

interface Category {
  id: string
  name: string
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    categories: { type: Array, value: [] as Category[] },
    error: { type: String, value: '' },
    loading: { type: Boolean, value: false },
  },
  data: {
    editing: false,
    editingId: '',
    editTitle: '',
    oldName: '',
    nameText: '',
    texts: {
      name: copy.screen.label.name,
      up: copy.screen.action.moveUp,
      save: copy.action.save,
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
      this.setData({ editing: true, editingId: '', editTitle, nameText: '' })
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
      })
    },
    onNameText(event: DetailEvent<string>) {
      this.setData({ nameText: event.detail })
    },
    onSave() {
      this.triggerEvent('save', { id: this.data.editingId, name: this.data.nameText })
    },
    onUp(event: DetailEvent<unknown, { index: number }>) {
      this.triggerEvent('up', event.currentTarget.dataset.index)
    },
    onRemove(event: KeyEvent) {
      this.triggerEvent('remove', event.currentTarget.dataset.key)
    },
  },
})
