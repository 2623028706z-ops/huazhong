// 筛选栏（02 章第 4 节，方案丙）：搜索 + 筛选按钮；状态标签行（等待类带数）；设了条件出圆点和胶囊；
// 筛选弹层里日期分段和对象单选。改一项立即发 change（detail 是新的 FilterValue），弹层不关。
// 页面拿到 value 后用 core/filter 的 queryOf 换成列表接口的条件，并把新 value 传回来
import { copy, redesignCopy, statusOf, shanghaiDateOf } from '@huazhong/shared'
import type { DetailEvent, IndexEvent, KeyEvent } from '../../core/events'
import {
  chipsOf,
  clearConditions,
  dimensionRowsOf,
  emptyFilter,
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
    endedTabs: { type: Boolean, value: false },
    // 有值才出搜索框
    searchPlaceholder: { type: String, value: '' },
    // 有值才有日期筛选，例如「下单日期」
    datePresets: {
      type: Array,
      value: ['all', 'today', 'last7Days', 'thisMonth', 'custom'] as string[],
    },
    dateLabel: { type: String, value: '' },
    // 页面默认的日期条件；和它一样时不算「改过」（不变红、不出胶囊）
    defaultDate: { type: String, value: 'all' },
    // 页面自己的分段（不是状态），和状态标签同一行，例如采购需求「全部 / 缺货 / 待填报」
    sections: { type: Array, value: [] as { key: string; text: string; count?: number }[] },
    section: { type: String, value: '' },
    dimensions: { type: Array, value: [] as FilterDimension[] },
    value: { type: Object, value: emptyFilter },
  },
  data: {
    today: '',
    tabs: [] as StatusTab[],
    chips: [] as { key: string; text: string }[],
    dot: false,
    filterCount: 0,
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
    filterText: redesignCopy.filter,
    clearText: copy.action.clear,
    fromLabel: copy.filter.dateFrom,
    toLabel: copy.filter.dateTo,
  },
  observers: {
    'statusKind, statuses, counts, endedTabs'() {
      const { statusKind: kind, statuses, counts, endedTabs } = this.data
      this.setData({
        tabs: tabsOf(kind, statuses, counts).filter(
          (tab) => endedTabs || !tab.code || statusOf(kind, tab.code)?.tone !== 'ended',
        ),
      })
    },
    'value, dimensions, dateLabel, defaultDate'() {
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
    endedStatus() {
      return (
        !this.data.endedTabs &&
        statusOf(this.data.statusKind, this.current().status)?.tone === 'ended'
      )
    },
    allDimensions(): FilterDimension[] {
      const options = (this.data.endedTabs ? [] : this.data.statuses)
        .filter((code) => statusOf(this.data.statusKind, code)?.tone === 'ended')
        .map((id) => ({ id, name: statusOf(this.data.statusKind, id)?.text ?? id }))
      return [
        ...this.data.dimensions,
        ...(options.length ? [{ key: '__status', label: copy.field.status, options }] : []),
      ]
    },
    filterValue(): FilterValue {
      return {
        ...this.current(),
        picks: {
          ...this.current().picks,
          ...(this.endedStatus() ? { __status: this.current().status } : {}),
        },
      }
    },
    base(): DatePreset {
      return this.data.defaultDate as DatePreset
    },
    current(): FilterValue {
      // 页面数据还没准备好时会传进 null，当作没筛
      const value: unknown = this.data.value
      return typeof value === 'object' && value !== null ? (value as FilterValue) : emptyFilter
    },
    refresh() {
      const value = this.current()
      const dimensions = this.allDimensions()
      const { today, show, active } = this.data
      const dateChanged = value.date !== this.base()
      this.setData({
        chips: chipsOf(this.filterValue(), dimensions, today, this.base()),
        dot: dateChanged || Object.values(value.picks).some(Boolean) || this.endedStatus(),
        filterCount:
          Number(dateChanged) +
          Object.values(value.picks).filter(Boolean).length +
          Number(this.endedStatus()),
        hasFilter: Boolean(this.data.dateLabel) || dimensions.length > 0,
        segments: segmentsOf(value, today).filter((row) => this.data.datePresets.includes(row.key)),
        rows: dimensionRowsOf(this.filterValue(), dimensions),
        // 弹层开着、正在选自定义日期时保持「自定义」选中
        active: show && active === 'custom' ? 'custom' : value.date,
      })
      if (this.data.view === 'pick') this.refreshOptions()
    },
    emit(value: FilterValue) {
      this.triggerEvent('change', value)
    },
    onSection(event: KeyEvent) {
      this.triggerEvent('section', event.currentTarget.dataset.key)
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
      const dimension = this.allDimensions().find(
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
      const dimension = this.allDimensions().find((item) => item.key === pickKey)
      if (!dimension) return
      const pickedId =
        pickKey === '__status' ? this.current().status : (this.current().picks[pickKey] ?? '')
      this.setData({ options: optionRowsOf(dimension, pickedId, pickKeyword) })
    },
    onPickSearch(event: DetailEvent<string>) {
      this.setData({ pickKeyword: event.detail })
      this.refreshOptions()
    },
    onPick(event: KeyEvent) {
      this.setData({ view: 'main' })
      this.emit(
        this.data.pickKey === '__status'
          ? { ...this.current(), status: event.currentTarget.dataset.key }
          : pick(this.current(), this.data.pickKey, event.currentTarget.dataset.key),
      )
    },
    onRemoveChip(event: KeyEvent) {
      this.emit(
        event.currentTarget.dataset.key === '__status'
          ? { ...this.current(), status: '' }
          : removeChip(this.current(), event.currentTarget.dataset.key, this.base()),
      )
    },
    onClear() {
      this.emit({
        ...clearConditions(this.current(), this.base()),
        status: this.endedStatus() ? '' : this.current().status,
      })
    },
  },
})
