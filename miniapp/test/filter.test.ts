import { describe, expect, it } from 'vitest'
import {
  chipsOf,
  clearConditions,
  dimensionRowsOf,
  emptyFilter,
  hasConditions,
  optionRowsOf,
  pick,
  queryOf,
  rangeOf,
  removeChip,
  segmentsOf,
  tabsOf,
  type FilterDimension,
  type FilterValue,
} from '../miniprogram/core/filter'

const today = '2026-09-30'
const customers: FilterDimension = {
  key: 'customerId',
  label: '客户',
  options: [
    { id: '1', name: '静安花艺工作室' },
    { id: '2', name: '云间花事' },
  ],
}

function withDate(date: FilterValue['date'], range: FilterValue['range'] = null): FilterValue {
  return { ...emptyFilter, date, range }
}

describe('筛选日期按上海日期算', () => {
  it('全部不限日期', () => {
    expect(rangeOf(emptyFilter, today)).toBeNull()
  })
  it('今天是今天到今天', () => {
    expect(rangeOf(withDate('today'), today)).toEqual({ from: today, to: today })
  })
  it('明天和未来七天支持跨月', () => {
    expect(rangeOf(withDate('tomorrow'), today)).toEqual({ from: '2026-10-01', to: '2026-10-01' })
    expect(rangeOf(withDate('next7Days'), today)).toEqual({ from: today, to: '2026-10-06' })
  })
  it('近 7 天是今天往前 6 天到今天', () => {
    expect(rangeOf(withDate('last7Days'), today)).toEqual({ from: '2026-09-24', to: today })
  })
  it('本月是 1 号到今天', () => {
    expect(rangeOf(withDate('thisMonth'), today)).toEqual({ from: '2026-09-01', to: today })
  })
  it('自定义用选好的起止', () => {
    const range = { from: '2026-09-01', to: '2026-09-15' }
    expect(rangeOf(withDate('custom', range), today)).toEqual(range)
  })
})

describe('条件胶囊', () => {
  it('没设条件没有胶囊，也没有圆点', () => {
    expect(chipsOf(emptyFilter, [customers], today)).toEqual([])
    expect(hasConditions(emptyFilter)).toBe(false)
  })
  it('日期在前、对象在后，写中文名', () => {
    const value = pick(withDate('last7Days'), 'customerId', '1')
    expect(chipsOf(value, [customers], today)).toEqual([
      { key: 'date', text: '近 7 天' },
      { key: 'customerId', text: '静安花艺工作室' },
    ])
    expect(hasConditions(value)).toBe(true)
  })
  it('自定义日期写完整年月日', () => {
    const value = withDate('custom', { from: '2026-09-01', to: '2026-09-15' })
    expect(chipsOf(value, [customers], today)).toEqual([
      { key: 'date', text: '2026-09-01 至 2026-09-15' },
    ])
  })
  it('只选了状态不出圆点', () => {
    expect(hasConditions({ ...emptyFilter, status: 'to_ship' })).toBe(false)
  })
  it('选中的对象不在选项里就不出胶囊', () => {
    expect(chipsOf(pick(emptyFilter, 'customerId', '9'), [customers], today)).toEqual([])
  })
})

describe('去掉条件', () => {
  const value: FilterValue = {
    ...pick(withDate('today'), 'customerId', '2'),
    status: 'to_ship',
    keyword: '静安',
  }
  it('点 × 只去掉这一项', () => {
    expect(removeChip(value, 'date')).toMatchObject({ date: 'all', picks: { customerId: '2' } })
    expect(removeChip(value, 'customerId')).toMatchObject({ date: 'today', picks: {} })
  })
  it('点清除去掉日期和对象，不动状态和搜索', () => {
    expect(clearConditions(value)).toEqual({
      status: 'to_ship',
      keyword: '静安',
      date: 'all',
      range: null,
      picks: {},
    })
  })
  it('选「全部客户」等于去掉客户条件', () => {
    expect(pick(value, 'customerId', '').picks).toEqual({})
  })
})

describe('状态标签行', () => {
  it('全部在最前；等待类带数，完成、结束类不带', () => {
    const tabs = tabsOf('orderStatus', ['pending_confirm', 'to_ship', 'shipped'], {
      pending_confirm: 2,
      to_ship: 0,
    })
    expect(tabs).toEqual([
      { code: '', text: '全部', count: 0 },
      { code: 'pending_confirm', text: '待确认', count: 2 },
      { code: 'to_ship', text: '待发货', count: 0 },
      { code: 'shipped', text: '已发货', count: 0 },
    ])
  })
  it('状态表里没有的码不出标签', () => {
    expect(tabsOf('orderStatus', ['nope'], {})).toHaveLength(1)
  })
  it('收付款记录可显示全部状态的独立计数，其他列表规则不变', () => {
    expect(tabsOf('recordStatus', ['valid', 'voided'], { valid: 3, voided: 2 }, true)).toEqual([
      { code: '', text: '全部', count: 0 },
      { code: 'valid', text: '有效', count: 3 },
      { code: 'voided', text: '已作废', count: 2 },
    ])
  })
})

describe('筛选弹层', () => {
  it('日期分段默认写名字，自定义选好后写起止', () => {
    expect(segmentsOf(emptyFilter, today).map((s) => s.text)).toEqual([
      '全部',
      '今天',
      '明天',
      '未来 7 天',
      '近 7 天',
      '本月',
      '自定义',
    ])
    const custom = withDate('custom', { from: '2026-09-01', to: '2026-09-15' })
    expect(segmentsOf(custom, today).at(-1)?.text).toBe('2026-09-01 至 2026-09-15')
  })
  it('对象行没选写「全部客户」，选了写名字', () => {
    expect(dimensionRowsOf(emptyFilter, [customers])[0]?.text).toBe('全部客户')
    expect(dimensionRowsOf(pick(emptyFilter, 'customerId', '2'), [customers])[0]?.text).toBe(
      '云间花事',
    )
  })
  it('单选列表第一项是全部，按名称搜索，选中项打勾', () => {
    expect(optionRowsOf(customers, '2', '云间')).toEqual([
      { id: '', name: '全部客户', picked: false },
      { id: '2', name: '云间花事', picked: true },
    ])
    expect(optionRowsOf(customers, '', '').map((row) => row.picked)).toEqual([true, false, false])
  })
})

describe('列表接口的条件', () => {
  it('没设的传 null，搜索去掉首尾空格', () => {
    expect(queryOf({ ...emptyFilter, keyword: '  ' }, today)).toEqual({
      status: null,
      keyword: null,
      dateFrom: null,
      dateTo: null,
      picks: {},
    })
  })
  it('日期换成起止', () => {
    const value = { ...withDate('thisMonth'), status: 'to_ship', keyword: ' SO-1 ' }
    expect(queryOf(value, today)).toEqual({
      status: 'to_ship',
      keyword: 'SO-1',
      dateFrom: '2026-09-01',
      dateTo: today,
      picks: {},
    })
  })
})
