// 下拉、日期（02 章第 4 节）：同 hz-field 外观。日期点开是微信原生 picker（2026-10-02 确认）；
// 选一个（定稿 108）点开底部弹层：多于 6 项上面有搜索，一行一个（名称 + 可选一行小字 sub），
// 选中的红字 + 右边对勾，点一下就选好并关掉。本身在弹层里时用 inline，直接列出选项，不再套一层弹层。
// 选项带 group 时按组列出、组名也能搜（X4 客户门店：按客户分组列门店），选中后框里显示 shown；
// title、search 可另给弹层标题和搜索占位（给了 search 就总有搜索）。
// mode 为 selector 时 value 是选项 id；为 date 时 value 是 YYYY-MM-DD，start / end 限定可选范围
import { copy } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../core/events'

interface Option {
  id: string
  name: string
  sub?: string
  group?: string
  shown?: string
}

type Row = Option & { head: string }

// 过滤后重算组标题：一组的第一行带组名
function rowsOf(options: readonly Option[], keyword: string): Row[] {
  const rows = keyword
    ? options.filter(
        (o) => o.name.includes(keyword) || o.sub?.includes(keyword) || o.group?.includes(keyword),
      )
    : options
  return rows.map((row, index) => ({
    ...row,
    head: row.group && row.group !== rows[index - 1]?.group ? row.group : '',
  }))
}

// 标成 string：copy 是 as const，直接放进 data 会被推成字面量类型
const DEFAULT_HINT: string = copy.placeholder.choose
const SEARCH_FROM = 7

Component({
  properties: {
    label: { type: String, value: '' },
    mode: { type: String, value: 'selector' },
    options: { type: Array, value: [] as Option[] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    error: { type: String, value: '' },
    start: { type: String, value: '' },
    end: { type: String, value: '' },
    inline: { type: Boolean, value: false },
    title: { type: String, value: '' },
    search: { type: String, value: '' },
  },
  data: {
    shown: '',
    hint: DEFAULT_HINT,
    open: false,
    keyword: '',
    rows: [] as Row[],
    searchable: false,
    searchHint: '',
  },
  observers: {
    'options, value, mode, placeholder, label, search'() {
      const { options, value, mode, placeholder, label, search } = this.data
      const picked = options.find((o) => o.id === value)
      const shown = mode === 'date' ? value : (picked?.shown ?? picked?.name ?? '')
      this.setData({
        shown,
        hint: placeholder || DEFAULT_HINT,
        searchable: !!search || options.length >= SEARCH_FROM,
        searchHint: search || copy.filter.search(label),
      })
      this.filter()
    },
  },
  methods: {
    filter() {
      this.setData({ rows: rowsOf(this.data.options, this.data.keyword.trim()) })
    },
    onDate(event: DetailEvent<{ value: string }>) {
      this.triggerEvent('change', event.detail.value)
    },
    onOpen() {
      this.setData({ open: true, keyword: '' })
      this.filter()
    },
    onClose() {
      this.setData({ open: false })
    },
    onSearch(event: DetailEvent<string>) {
      this.setData({ keyword: event.detail })
      this.filter()
    },
    onPick(event: KeyEvent) {
      this.setData({ open: false })
      const id = event.currentTarget.dataset.key
      if (id !== this.data.value) this.triggerEvent('change', id)
    },
  },
})
