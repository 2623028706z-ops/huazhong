import type { Action } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { buttonsOf, canDo, hasAction, isReasonRequired } from '../miniprogram/core/actions'

const actions: Action[] = [
  {
    code: 'confirm',
    enabled: false,
    disabledReason: '门店已停用，启用后才能确认',
    reasonRequired: false,
  },
  { code: 'cancel', enabled: true, disabledReason: null, reasonRequired: true },
]

describe('按后端 actions 显示按钮', () => {
  it('只放 actions 里有的，按页面给的顺序，次按钮在左', () => {
    const buttons = buttonsOf(actions, [
      { code: 'cancel', secondary: true },
      { code: 'edit' },
      { code: 'confirm' },
    ])
    expect(buttons.map((button) => [button.code, button.kind])).toEqual([
      ['cancel', 'secondary'],
      ['confirm', 'primary'],
    ])
  })

  it('enabled 为 false 显示禁用并写 disabledReason', () => {
    const [confirm] = buttonsOf(actions, [{ code: 'confirm' }])
    expect(confirm).toMatchObject({ disabled: true, reason: '门店已停用，启用后才能确认' })
  })

  it('能不能点、要不要原因只看 actions', () => {
    expect(hasAction(actions, 'confirm')).toBe(true)
    expect(canDo(actions, 'confirm')).toBe(false)
    expect(canDo(actions, 'edit')).toBe(false)
    expect(isReasonRequired(actions, 'cancel')).toBe(true)
    expect(isReasonRequired(actions, 'confirm')).toBe(false)
  })
})
