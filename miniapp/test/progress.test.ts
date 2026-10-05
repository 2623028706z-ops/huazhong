import { describe, expect, it } from 'vitest'
import {
  afterProgress,
  inviteProgress,
  orderProgress,
  poProgress,
} from '../miniprogram/views/progress'

const order = {
  orderDate: '2026-10-01',
  status: 'pending_confirm' as const,
  confirmedAt: null,
  shippedAt: null,
  shipDate: '2026-10-04',
  cancelledAt: null,
  voidedAt: null,
}
const po = {
  orderDate: '2026-10-01',
  status: 'to_receive' as const,
  receivedAt: null,
  cancelledAt: null,
  voidedAt: null,
}
const after = {
  afterDate: '2026-10-01',
  status: 'pending' as const,
  processedAt: null,
  closedAt: null,
  voidedAt: null,
}
const invite = {
  inviteDate: '2026-10-01',
  status: 'pending' as const,
  submittedAt: null,
  cancelledAt: null,
}

describe('详情进度的当前状态与灰色终点', () => {
  it('缺少确认时间的待发货单仍定位到待发货，确认日期不编造', () => {
    const steps = orderProgress({ ...order, status: 'to_ship' })
    expect(steps[1]).toMatchObject({ label: '已确认', date: '', state: 'done' })
    expect(steps[2]).toMatchObject({
      label: '待发货',
      date: '出货日期 / 2026-10-04',
      state: 'current',
    })
    expect(
      orderProgress(order)
        .filter((step) => step.state === 'current')
        .map((step) => step.label),
    ).toEqual(['待确认'])
  })
  it('实际节点使用上海完整日期，走完不留红圈，作废追加灰格', () => {
    const shipped = {
      ...order,
      status: 'shipped' as const,
      confirmedAt: '2026-10-01T20:00:00.000Z',
      shippedAt: '2026-10-03T20:00:00.000Z',
    }
    expect(orderProgress(shipped).map((step) => step.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
    ])
    // 流程走完：最后一格「已发货」也算已走过，不再留红圈（2026-10-05）
    expect(orderProgress(shipped).at(-1)).toMatchObject({ label: '已发货', state: 'done' })
    expect(orderProgress(shipped).some((step) => step.state === 'current')).toBe(false)
    const steps = orderProgress({
      ...shipped,
      status: 'voided',
      voidedAt: '2026-10-04T01:00:00.000Z',
    })
    expect(steps.at(-1)).toEqual({ label: '已作废', date: '2026-10-04', state: 'ended' })
    expect(steps.some((step) => step.state === 'current')).toBe(false)
  })
  it('取消、关闭、拒收和邀请取消均只有灰色终点，不遗留红圈', () => {
    const states = [
      orderProgress({ ...order, status: 'cancelled', cancelledAt: '2026-10-02T00:00:00.000Z' }),
      afterProgress({ ...after, status: 'closed', closedAt: '2026-10-01T20:00:00.000Z' }),
      poProgress({ ...po, status: 'rejected', receivedAt: '2026-10-02T00:00:00.000Z' }),
      inviteProgress({ ...invite, status: 'cancelled', cancelledAt: '2026-10-02T00:00:00.000Z' }),
    ]
    for (const steps of states) {
      expect(steps.at(-1)?.state).toBe('ended')
      expect(steps.some((step) => step.state === 'current')).toBe(false)
    }
    expect(states[1]?.at(-1)?.date).toBe('2026-10-02')
  })
  it('售后处理、采购收货和邀请提交是走完的最后一格，不留红圈', () => {
    expect(
      afterProgress({ ...after, status: 'processed', processedAt: '2026-10-02T00:00:00.000Z' }).at(
        -1,
      ),
    ).toEqual({ label: '已处理', date: '2026-10-02', state: 'done' })
    expect(
      poProgress({ ...po, status: 'received', receivedAt: '2026-10-02T00:00:00.000Z' }).at(-1),
    ).toEqual({ label: '已收货', date: '2026-10-02', state: 'done' })
    expect(
      inviteProgress({
        ...invite,
        status: 'submitted',
        submittedAt: '2026-10-02T00:00:00.000Z',
      }).at(-1),
    ).toEqual({ label: '已提交', date: '2026-10-02', state: 'done' })
  })
})
