import { copy, redesignCopy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
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
  },
  data: {
    texts: {
      logout: copy.action.logout,
      loginPhone: redesignCopy.loginPhone,
      contact: redesignCopy.contactHuazhong,
      missing: redesignCopy.contactMissing,
    },
  },
  methods: {
    onSelect(event: DetailEvent<string>) {
      this.triggerEvent('select', event.detail)
    },
    onContact() {
      if (this.data.contactPhone) void wx.makePhoneCall({ phoneNumber: this.data.contactPhone })
    },
    onLogout() {
      this.triggerEvent('logout')
    },
  },
})
