// 整页状态（02 章第 4 节、第 5 节）：上方一扇淡色小窗格 + 衬线一句，需要时下面一个次按钮。
// kind 和 core/failure-view 的 page 状态同名；message 有值时替换默认的那句（后端给的句子），
// detail 写在下面一行（例如邀请失效的原因）；requestId 有值时下面一行写请求编号（INTERNAL）。点「返回」自己返回，「重试」「退出登录」发 action
import { copy } from '@huazhong/shared'

type Kind =
  | 'loading'
  | 'empty'
  | 'network'
  | 'internal'
  | 'forbidden'
  | 'notFound'
  | 'accountDisabled'
  | 'linkInvalid'
type Action = 'retry' | 'back' | 'logout' | ''

const views: Record<Exclude<Kind, 'empty'>, { text: string; action: Action }> = {
  loading: { text: copy.state.loading, action: '' },
  network: { text: copy.network.loadFailed, action: 'retry' },
  internal: { text: copy.error.internal, action: 'retry' },
  forbidden: { text: copy.error.forbidden, action: 'back' },
  notFound: { text: copy.error.notFound, action: 'back' },
  accountDisabled: { text: copy.error.accountDisabled, action: 'logout' },
  linkInvalid: { text: copy.state.linkInvalid, action: 'back' },
}

const actionTexts: Record<Exclude<Action, ''>, string> = copy.action

Component({
  properties: {
    kind: { type: String, value: 'empty' },
    // 空状态的对象：「订单」→「暂无订单」
    object: { type: String, value: '' },
    message: { type: String, value: '' },
    detail: { type: String, value: '' },
    requestId: { type: String, value: '' },
  },
  data: { text: '', hint: '', action: '', actionText: '', requestText: '' },
  observers: {
    requestId(requestId: string) {
      this.setData({ requestText: requestId ? copy.requestId(requestId) : '' })
    },
    'kind, object, message'(kind: Kind, object: string, message: string) {
      const view = kind === 'empty' ? { text: copy.state.empty(object), action: '' } : views[kind]
      const action = view.action as Action
      this.setData({
        text: message || view.text,
        // 空状态没传说明时，补一句「有新的订单会显示在这里」，免得只剩一行字（2026-10-05）
        hint: kind === 'empty' && object && !message ? copy.state.emptyHint(object) : '',
        action,
        actionText: action ? actionTexts[action] : '',
      })
    },
  },
  methods: {
    onAction() {
      if (this.data.action === 'back') void wx.navigateBack()
      else this.triggerEvent('action', this.data.action)
    },
  },
})
