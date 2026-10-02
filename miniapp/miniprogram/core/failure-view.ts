// 请求失败 → 界面状态（02 章第 5.2、5.3 节）。页面只接这个结果，不自己判断错误码。
import { copy, type ErrorCode } from '@huazhong/shared'
import type { Failure } from './request'

// load = 首次加载；refresh = 下拉刷新、翻页、实时刷新；submit = 提交表单或操作
export type Phase = 'load' | 'refresh' | 'submit'

export type FailureView =
  // 回登录页，走手机号快速验证
  | { kind: 'login' }
  // 整页 hz-state；首次加载遇 INTERNAL 也是整页，另显示请求编号
  | {
      kind: 'page'
      state: 'accountDisabled' | 'forbidden' | 'notFound' | 'network' | 'internal'
      message: string
      requestId?: string | null
    }
  // 页面或弹层里的 hz-error；INTERNAL 另显示请求编号
  | { kind: 'inline'; message: string; requestId: string | null; retry?: boolean }
  | { kind: 'fields'; message: string; fields: Record<string, string> }
  // 用 latest 刷新成最新内容，并写后端给的状态句
  | { kind: 'stale'; message: string; latest: unknown }

type ServerFailure = Extract<Failure, { kind: 'server' }>

// 每个错误码对应一种界面状态；后端给的句子原样显示
const serverViews: Record<ErrorCode, (failure: ServerFailure) => FailureView> = {
  UNAUTHENTICATED: () => ({ kind: 'login' }),
  ACCOUNT_DISABLED: ({ message }) => ({ kind: 'page', state: 'accountDisabled', message }),
  FORBIDDEN: ({ message }) => ({ kind: 'page', state: 'forbidden', message }),
  NOT_FOUND: ({ message }) => ({ kind: 'page', state: 'notFound', message }),
  VALIDATION_FAILED: ({ message, fields }) => ({ kind: 'fields', message, fields: fields ?? {} }),
  STALE: ({ message, latest }) => ({ kind: 'stale', message, latest }),
  BUSINESS_RULE: ({ message }) => ({ kind: 'inline', message, requestId: null }),
  INTERNAL: ({ message, requestId }) => ({ kind: 'inline', message, requestId, retry: true }),
}

function networkView(phase: Phase): FailureView {
  if (phase === 'load') return { kind: 'page', state: 'network', message: copy.network.loadFailed }
  const message = phase === 'refresh' ? copy.network.refreshFailed : copy.network.submitFailed
  return { kind: 'inline', message, requestId: null, retry: true }
}

export function viewOf(failure: Failure, phase: Phase): FailureView {
  if (failure.kind === 'network') return networkView(phase)
  // 首次加载就系统出错：下面没有内容可看，用整页状态 + 重试（2026-10-05 确认）
  if (failure.code === 'INTERNAL' && phase === 'load') {
    const { message, requestId } = failure
    return { kind: 'page', state: 'internal', message, requestId }
  }
  return serverViews[failure.code](failure)
}
