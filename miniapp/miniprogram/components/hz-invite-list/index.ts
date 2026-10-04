// 采购需求待填报段使用同一邀请列表，详情统一跳 C9。
import { inviteListData, inviteListMethods, type InviteListHost } from '../../views/invite-list'
const { list: initialList, ...methods } = inviteListMethods
const data = inviteListData
Component({
  properties: {
    supplierId: { type: String, value: '' },
    sections: { type: Array, value: [] },
    section: { type: String, value: '' },
    searchPlaceholder: { type: String, value: '' },
  },
  data: { ...data, embedded: true },
  methods: {
    ...methods,
    onSection(event: { detail: string }) {
      this.triggerEvent('section', event.detail)
    },
  },
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
