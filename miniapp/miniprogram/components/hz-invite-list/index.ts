// 采购需求待填报段使用同一邀请列表，详情统一跳 C9。
import { inviteListPage, type InviteListHost } from '../../views/invite-list'
const { data, list: initialList, ...methods } = inviteListPage
Component({
  properties: { supplierId: { type: String, value: '' } },
  data: { ...data, embedded: true },
  methods,
  lifetimes: {
    attached() {
      Object.assign(this, { list: initialList })
      methods.onLoad.call(this as unknown as InviteListHost, { supplierId: this.data.supplierId })
      void methods.onShow.call(this as unknown as InviteListHost)
    },
    detached() {
      methods.onUnload.call(this)
    },
  },
  pageLifetimes: {
    show() {
      void methods.onShow.call(this as unknown as InviteListHost)
    },
    hide() {
      methods.onHide.call(this)
    },
  },
})
