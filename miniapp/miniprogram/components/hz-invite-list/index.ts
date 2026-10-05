// 采购单页（C3）的「填报邀请」段：全部 / 待填报 / 已提交 + 筛选，详情统一跳 C9。
import { inviteListData, inviteListMethods, type InviteListHost } from '../../views/invite-list'
const { list: initialList, ...methods } = inviteListMethods
const data = inviteListData
Component({
  properties: {
    supplierId: { type: String, value: '' },
    searchPlaceholder: { type: String, value: '' },
  },
  data: { ...data, embedded: true },
  methods: { ...methods },
  lifetimes: {
    attached() {
      Object.assign(this, { list: initialList })
      methods.onLoad.call(this as unknown as InviteListHost, { supplierId: this.data.supplierId })
      void methods.onShow.call(this as unknown as InviteListHost)
    },
    detached() {
      methods.onUnload.call(this as unknown as InviteListHost)
    },
  },
  pageLifetimes: {
    show() {
      void methods.onShow.call(this as unknown as InviteListHost)
    },
    hide() {
      methods.onHide.call(this as unknown as InviteListHost)
    },
  },
})
