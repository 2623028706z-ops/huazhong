// 筛选栏（02 章第 4 节，方案丙）：搜索 + 筛选按钮；状态标签行（等待类带数）；设了条件出圆点和胶囊；
// 筛选弹层里日期分段和对象单选。改一项立即发 change（detail 是新的 FilterValue），弹层不关。
// 页面拿到 value 后用 core/filter 的 queryOf 换成列表接口的条件，并把新 value 传回来
import { copy, shanghaiDateOf } from '@huazhong/shared'
import type { DetailEvent, IndexEvent, KeyEvent } from '../../core/events'
import {
  chipsOf,
  clearConditions,
  dimensionRowsOf,
  emptyFilter,
  hasConditions,
  optionRowsOf,
  pick,
  removeChip,
  segmentsOf,
  tabsOf,
  type DatePreset,
  type FilterDimension,
  type FilterValue,
  type StatusTab,
} from '../../core/filter'

Component({
  properties: {
    // 状态标签：状态种类 + 要列出的状态码；空数组就没有状态标签行
    statusKind: { type: String, value: '' },
    statuses: { type: Array, value: [] as string[] },
    counts: { type: Object, value: {} },
    // 有值才出搜索框
    searchPlaceholder: { type: String, value: '' },
    // 有值才有日期筛选，例如「下单日期」
    dateLabel: { type: String, value: '' },
    dimensions: { type: Array, value: [] as FilterDimension[] },
    value: { type: Object, value: emptyFilter },
  },
  data: {
    today: '',
    tabs: [] as StatusTab[],
    chips: [] as { key: string; text: string }[],
    dot: false,
    hasFilter: false,
    show: false,
    // main：日期和对象；pick：某个对象的单选列表
    view: 'main',
    segments: [] as { key: DatePreset; text: string }[],
    active: 'all',
    draftFrom: '',
    draftTo: '',
    rows: [] as { key: string; label: string; text: string }[],
    pickKey: '',
    pickTitle: '',
    pickSearch: '',
    pickKeyword: '',
    options: [] as { id: string; name: string; picked: boolean }[],
    title: copy.title.filter,
    clearText: copy.action.clear,
    fromLabel: copy.filter.dateFrom,
    toLabel: copy.filter.dateTo,
  },
  observers: {
    'statusKind, statuses, counts'(
      kind: string,
      statuses: string[],
      counts: Record<string, number>,
    ) {
      this.setData({ tabs: tabsOf(kind, statuses, counts) })
    },
    'value, dimensions, dateLabel'() {
      this.refresh()
    },
  },
  lifetimes: {
    attached() {
      this.setData({ today: shanghaiDateOf(Date.now()) })
      this.refresh()
    },
  },
  methods: {
    current(): FilterValue {
      return this.data.value
    },
    refresh() {
      const value = this.current()
      const dimensions = this.data.dimensions
      const { today, show, active } = this.data
      this.setData({
        chips: chipsOf(value, dimensions, today),
        dot: hasConditions(value),
        hasFilter: Boolean(this.data.dateLabel) || dimensions.length > 0,
        segments: segmentsOf(value, today),
        rows: dimensionRowsOf(value, dimensions),
        // 弹层开着、正在选自定义日期时保持「自定义」选中
        active: show && active === 'custom' ? 'custom' : value.date,
      })
      if (this.data.view === 'pick') this.refreshOptions()
    },
    emit(value: FilterValue) {
      this.triggerEvent('change', value)
    },
    onTab(event: IndexEvent) {
      const tab = this.data.tabs[event.currentTarget.dataset.index]
      if (tab) this.emit({ ...this.current(), status: tab.code })
    },
    onSearch(event: DetailEvent<string>) {
      this.emit({ ...this.current(), keyword: event.detail })
    },
    onOpen() {
      const value = this.current()
      this.setData({
        show: true,
        view: 'main',
        active: value.date,
        draftFrom: value.range?.from ?? '',
        draftTo: value.range?.to ?? '',
      })
    },
    onClose() {
      this.setData({ show: false })
    },
    onBack() {
      this.setData({ view: 'main' })
    },
    onPreset(event: KeyEvent) {
      const date = event.currentTarget.dataset.key as DatePreset
      this.setData({ active: date })
      if (date === 'custom') this.emitDraft()
      else this.emit({ ...this.current(), date, range: null })
    },
    onDraftFrom(event: DetailEvent<string>) {
      this.setData({ draftFrom: event.detail })
      this.emitDraft()
    },
    onDraftTo(event: DetailEvent<string>) {
      this.setData({ draftTo: event.detail })
      this.emitDraft()
    },
    // 起止都选好才生效
    emitDraft() {
      const { draftFrom, draftTo } = this.data
      if (!draftFrom || !draftTo) return
      this.emit({ ...this.current(), date: 'custom', range: { from: draftFrom, to: draftTo } })
    },
    onDimension(event: KeyEvent) {
      const dimension = this.data.dimensions.find(
        (item) => item.key === event.currentTarget.dataset.key,
      )
      if (!dimension) return
      this.setData({
        view: 'pick',
        pickKey: dimension.key,
        pickTitle: copy.filter.choose(dimension.label),
        pickSearch: copy.filter.search(dimension.label),
        pickKeyword: '',
      })
      this.refreshOptions()
    },
    refreshOptions() {
      const { pickKey, pickKeyword } = this.data
      const dimension = this.data.dimensions.find((item) => item.key === pickKey)
      if (!dimension) return
      const pickedId = this.current().picks[pickKey] ?? ''
      this.setData({ options: optionRowsOf(dimension, pickedId, pickKeyword) })
    },
    onPickSearch(event: DetailEvent<string>) {
      this.setData({ pickKeyword: event.detail })
      this.refreshOptions()
    },
    onPick(event: KeyEvent) {
      this.setData({ view: 'main' })
      this.emit(pick(this.current(), this.data.pickKey, event.currentTarget.dataset.key))
    },
    onRemoveChip(event: KeyEvent) {
      this.emit(removeChip(this.current(), event.currentTarget.dataset.key))
    },
    onClear() {
      this.emit(clearConditions(this.current()))
    },
  },
})
