import { copy, redesignCopy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
const CONTACT_KEY = 'contact'
interface Menu {
  key: string
  icon: string
  text: string
}
Component({
  properties: {
    name: { type: String, value: '' },
    sub: { type: String, value: '' },
    phone: { type: String, value: '' },
    contactPhone: { type: String, value: '' },
    external: { type: Boolean, value: false },
    menus: { type: Array, value: [] as Menu[] },
    devMenus: { type: Array, value: [] as Menu[] },
  },
  data: {
    separator: ' · ',
    entries: [] as Menu[],
    texts: {
      logout: copy.action.logout,
      contact: redesignCopy.contactHuazhong,
      missing: redesignCopy.contactMissing,
    },
  },
  observers: {
    // 门店、供应商的「联系花众」是入口格，点了直接拨电话
    'menus, external, contactPhone'(menus: Menu[], external: boolean) {
      this.setData({
        entries: external
          ? [...menus, { key: CONTACT_KEY, icon: 'phone', text: redesignCopy.contactHuazhong }]
          : menus,
      })
    },
  },
  methods: {
    onSelect(event: DetailEvent<string>) {
      if (event.detail === CONTACT_KEY) this.onContact()
      else this.triggerEvent('select', event.detail)
    },
    onContact() {
      if (this.data.contactPhone) void wx.makePhoneCall({ phoneNumber: this.data.contactPhone })
      else void wx.showToast({ title: redesignCopy.contactMissing, icon: 'none' })
    },
    onLogout() {
      this.triggerEvent('logout')
    },
  },
})
