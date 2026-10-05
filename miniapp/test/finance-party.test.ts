// 财务往来卡（06 章 F1、F8，2026-10-06 第 4 批）：右边只放一个数，小字有才写，什么都没有写「还没有往来」
import { copy, financeCopy as f } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { partyRowOf } from '../miniprogram/views/statement'

const base = {
  partyId: 'p1',
  partyName: '晨曦花艺',
  enabled: true,
  kind: 'customer' as const,
  outstandingCents: 0,
  unsettledCount: 0,
  unstatementedCents: 0,
  creditCents: 0,
  lastStatementTo: null,
  lastFundDate: null,
  overdue: false,
}

describe('财务往来卡', () => {
  it('有未收：右边放未收，小字写未结清张数', () => {
    const row = partyRowOf({
      ...base,
      outstandingCents: 358800,
      unsettledCount: 1,
      creditCents: 100,
    })
    expect(row).toMatchObject({ main: '晨曦花艺', amount: '¥3,588.00', note: f.outstanding })
    expect(row.sub).toContain(f.unsettledCount(1))
  })
  it('只有多收：右边放多收；供应商写多付', () => {
    expect(partyRowOf({ ...base, creditCents: 6400 })).toMatchObject({
      amount: '¥64.00',
      note: f.credited,
    })
    expect(partyRowOf({ ...base, kind: 'supplier', creditCents: 6400 }).note).toBe(
      f.supplierCredited,
    )
  })
  it('什么都没有：小字「还没有往来」，右边不放数', () => {
    const row = partyRowOf(base)
    expect(row.sub).toBe(copy.flow.finance.noActivity)
    expect(row.amount).toBe('')
    expect(row.note).toBe('')
    expect(row.headText).toBeUndefined()
  })
  it('有逾期标「逾期」；未对账大于 0 小字写金额', () => {
    const row = partyRowOf({
      ...base,
      overdue: true,
      outstandingCents: 100,
      unstatementedCents: 12000,
    })
    expect(row.tags).toContainEqual(
      expect.objectContaining({ text: copy.flow.finance.overdueTag, danger: true }),
    )
    expect(row.sub).toContain(`${f.unstatemented} ¥120.00`)
  })
})
