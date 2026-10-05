import { copy, redesignCopy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
const CONTACT_KEY = 'contact'
// 身份行：每行几个带字段名的值，例如「岗位 管理员  登录手机号 …」（06 章 M4）
interface Field {
  label: string
  value: string
}
interface Line {
  key: string
  fields: Field[]
}
interface Menu {
  key: string
  icon: string
  text: string
}
Component({
  properties: {
    name: { type: String, value: '' },
    lines: { type: Array, value: [] as Line[] },
    contactPhone: { type: String, value: '' },
    external: { type: Boolean, value: false },
    menus: { type: Array, value: [] as Menu[] },
    devMenus: { type: Array, value: [] as Menu[] },
  },
  data: {
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
