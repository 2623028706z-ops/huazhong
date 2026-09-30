import { describe, expect, it } from 'vitest'
import type { LogDetail, LogItem } from '@huazhong/shared'
import { detailOf, groupsOf } from '../miniprogram/pages/logs/view'

const item = (id: string, createdAt: string, over: Partial<LogItem> = {}): LogItem => ({
  id,
  createdAt,
  module: 'sales',
  kind: '订单',
  action: '确认订单',
  targetLabel: `SO-${id}`,
  actorLabel: '李敏',
  ...over,
})

describe('操作日志按天分组', () => {
  it('同一个上海日期的放一组，组头写 月-日 周几', () => {
    const groups = groupsOf(
      [
        item('3', '2026-10-03T01:40:00.000Z'),
        item('2', '2026-10-02T16:05:00.000Z'),
        item('1', '2026-10-02T10:00:00.000Z'),
      ],
      '2026-10-03',
    )
    expect(groups.map((g) => [g.header, g.rows.map((r) => r.id)])).toEqual([
      ['10-03 周六', ['3', '2']],
      ['10-02 周五', ['1']],
    ])
  })
  it('卡片写 操作 · 对象、模块、时:分 · 操作人；公共日志写「公共」', () => {
    const [group] = groupsOf(
      [
        item('9', '2026-10-03T01:12:00.000Z', {
          module: null,
          action: '修改员工',
          targetLabel: '李敏',
          actorLabel: '周总',
        }),
      ],
      '2026-10-03',
    )
    expect(group?.rows[0]).toEqual({
      id: '9',
      title: '修改员工 · 李敏',
      total: '公共',
      meta: '09:12 · 周总',
    })
  })
  it('不是今年的组头写全', () => {
    expect(groupsOf([item('1', '2025-12-28T02:00:00.000Z')], '2026-10-03')[0]?.header).toBe(
      '2025-12-28 周日',
    )
  })
})

const detail = (before: LogDetail['before'], after: LogDetail['after']): LogDetail => ({
  ...item('9', '2026-10-03T01:12:00.000Z', {
    module: null,
    action: '修改员工',
    targetLabel: '李敏',
    actorLabel: '周总',
  }),
  reason: '同时解绑微信',
  before,
  after,
})

describe('日志详情', () => {
  it('先写是哪一条：操作 · 对象，时间 · 操作人 · 模块', () => {
    const view = detailOf(detail(null, null))
    expect([view.title, view.meta, view.reason]).toEqual([
      '修改员工 · 李敏',
      '2026-10-03 09:12 · 周总 · 公共',
      '同时解绑微信',
    ])
    expect(view.sections).toEqual([])
  })
  it('修改前后都有：只列改了的字段，旧 → 新', () => {
    const view = detailOf(
      detail(
        { 名字: '李敏', 登录手机号: '13700000002', 状态: '启用' },
        { 名字: '李敏', 登录手机号: '13700000018', 状态: '启用' },
      ),
    )
    expect(view.sections).toEqual([
      {
        title: '改动',
        rows: [{ label: '登录手机号', from: '13700000002 → ', value: '13700000018' }],
      },
    ])
  })
  it('前后一样就不写改动', () => {
    expect(detailOf(detail({ 名字: '李敏' }, { 名字: '李敏' })).sections).toEqual([])
  })
  it('只有修改后（新增类）：全部字段列在「修改后」', () => {
    expect(detailOf(detail(null, { 名字: '王芳', 岗位: '销售' })).sections).toEqual([
      {
        title: '修改后',
        rows: [
          { label: '名字', from: '', value: '王芳' },
          { label: '岗位', from: '', value: '销售' },
        ],
      },
    ])
  })
  it('只有修改前：全部字段列在「修改前」', () => {
    expect(detailOf(detail({ 名字: '陈青' }, null)).sections).toEqual([
      { title: '修改前', rows: [{ label: '名字', from: '', value: '陈青' }] },
    ])
  })
})
