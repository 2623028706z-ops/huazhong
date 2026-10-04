// 邀请订货弹层（06 章 X2）：所有启用客户的启用门店按客户分组，门店多时可搜索；已绑定微信的灰显不可选。
// 选中后没有登录手机号的就地填写（联系人为空时一并填），点「保存并邀请」才走「门店修改接口」保存（防误填），
// 再 POST /stores/:id/invites 生成邀请；「发给门店」是 open-type="share"，转发用页面的 onShareAppMessage。
// 有登录手机号的选中即生成邀请
import {
  contract,
  copy,
  formatTime,
  PHONE_PATTERN,
  redesignCopy,
  type CustomerItem,
  type StoreItem,
} from '@huazhong/shared'
import { findAction, hasAction } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { checkStoreUpdate, storeFormOf } from '../../pages/customers/form'

const SEARCH_FROM = 7
const phonePattern = new RegExp(PHONE_PATTERN)

// 组件自己的非界面状态：客户门店副本、搜索词、保存是否进行中
interface Inner {
  list: CustomerItem[]
  keyword: string
  working: boolean
}
const inners = new WeakMap<object, Inner>()
const innerOf = (self: object): Inner => {
  let inner = inners.get(self)
  if (!inner) {
    inner = { list: [], keyword: '', working: false }
    inners.set(self, inner)
  }
  return inner
}

interface Row {
  id: string
  name: string
  sub: string
  bound: boolean
}
interface Group {
  id: string
  name: string
  stores: Row[]
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    customers: { type: Array, value: [] as CustomerItem[] },
  },
  data: {
    groups: [] as Group[],
    total: 0,
    searchable: false,
    storeId: '',
    storeName: '',
    phone: '',
    contact: '',
    needPhone: false,
    needContact: false,
    canEdit: false,
    fields: {},
    error: '',
    busy: false,
    invited: null as { path: string; title: string; expiresText: string } | null,
    texts: {
      title: redesignCopy.inviteSheetTitle,
      empty: redesignCopy.inviteNoStoreAll,
      noMatch: redesignCopy.inviteNoMatch,
      search: redesignCopy.inviteSearch,
      bound: copy.statusValue.bound,
      repick: redesignCopy.inviteRepick,
      noRight: redesignCopy.inviteNoRight,
      contact: copy.field.contact,
      loginPhone: copy.screen.label.loginPhone,
      phoneHint: redesignCopy.inviteLoginPhoneHint,
      contactHint: redesignCopy.inviteContactHint,
      saving: redesignCopy.inviteSavingPhone,
      saveInvite: redesignCopy.inviteSaveAndInvite,
      ready: redesignCopy.inviteReady,
      share: copy.screen.action.shareToStore,
    },
  },
  observers: {
    show(show: boolean) {
      if (show) this.reset()
    },
  },
  methods: {
    reset() {
      const inner = innerOf(this)
      inner.list = this.data.customers
      inner.keyword = ''
      this.setData({
        storeId: '',
        storeName: '',
        phone: '',
        contact: '',
        fields: {},
        error: '',
        busy: false,
        invited: null,
      })
      this.render()
    },
    render() {
      const inner = innerOf(this)
      const keyword = inner.keyword.trim()
      const groups: Group[] = []
      let total = 0
      for (const customer of inner.list) {
        if (!customer.enabled) continue
        const stores = customer.stores.filter((store) => store.enabled)
        total += stores.length
        const all = customer.name.includes(keyword)
        const rows = stores
          .filter((store) => !keyword || all || store.name.includes(keyword))
          .map((store) => ({
            id: store.id,
            name: store.name,
            sub: store.loginPhone === null ? redesignCopy.inviteNoPhone : '',
            bound: hasAction(store.actions, 'unbindStoreWechat'),
          }))
        if (rows.length) groups.push({ id: customer.id, name: customer.name, stores: rows })
      }
      this.setData({ groups, total, searchable: total >= SEARCH_FROM })
    },
    find(id: string): { store: StoreItem; customer: CustomerItem } | null {
      for (const customer of innerOf(this).list) {
        const store = customer.stores.find((s) => s.id === id)
        if (store) return { store, customer }
      }
      return null
    },
    replace(store: StoreItem) {
      const inner = innerOf(this)
      inner.list = inner.list.map((customer) => ({
        ...customer,
        stores: customer.stores.map((s) => (s.id === store.id ? store : s)),
      }))
    },
    onClose() {
      this.triggerEvent('close')
    },
    onSearch(event: DetailEvent<string>) {
      innerOf(this).keyword = event.detail
      this.render()
    },
    onRepick() {
      this.setNone()
      this.setData({ storeId: '', fields: {}, error: '', invited: null })
      this.render()
    },
    setNone() {
      this.triggerEvent('invited', null)
    },
    onPick(event: KeyEvent) {
      const found = this.find(event.currentTarget.dataset.key)
      if (!found || hasAction(found.store.actions, 'unbindStoreWechat')) return
      const { store, customer } = found
      const needPhone = store.loginPhone === null
      this.setData({
        storeId: store.id,
        storeName: copy.org.store(customer.name, store.name),
        phone: store.loginPhone ?? '',
        contact: '',
        needPhone,
        needContact: store.contact === '',
        canEdit: hasAction(store.actions, 'inviteStore'),
        fields: {},
        error: '',
        invited: null,
      })
      if (!needPhone) void this.generate()
    },
    onPhone(event: DetailEvent<string>) {
      this.edit({ phone: event.detail.trim() })
    },
    onContact(event: DetailEvent<string>) {
      this.edit({ contact: event.detail })
    },
    // 只记下填写内容，不保存；填完点「保存并邀请」才保存
    edit(patch: Record<string, string>) {
      this.setNone()
      this.setData({ ...patch, fields: {}, error: '', invited: null })
    },
    // 点「保存并邀请」：手机号、联系人（为空时）合格才保存并生成邀请，不合格把原因写在字段下
    async onSaveInvite(): Promise<void> {
      const { phone, contact, needContact } = this.data
      const fields: Record<string, string> = {}
      if (!phonePattern.test(phone)) fields['loginPhone'] = copy.catalog.loginPhoneInvalid
      if (needContact && contact.trim() === '') fields['contact'] = copy.catalog.contactRequired
      if (Object.keys(fields).length) {
        this.setData({ fields })
        return
      }
      const inner = innerOf(this)
      if (inner.working) return
      inner.working = true
      this.setData({ busy: true })
      await this.saveAndInvite()
      inner.working = false
      this.setData({ busy: false })
    },
    // 保存登录手机号（门店修改接口）；返回保存后的门店，失败时把原因写在弹层里返回 null
    async saveStore(store: StoreItem): Promise<StoreItem | null> {
      const { phone, contact, needContact } = this.data
      const form = {
        ...storeFormOf(store, store.customerId),
        loginPhone: phone,
        contact: needContact ? contact : store.contact,
      }
      const checked = checkStoreUpdate(form, store.version)
      if (!checked.ok) {
        this.setData({ fields: checked.fields })
        return null
      }
      const result = await request(contract.updateStore, {
        params: { id: store.id },
        body: checked.body,
      })
      if (result.ok) {
        this.replace(result.data)
        this.triggerEvent('updated', result.data)
        return result.data
      }
      const view = failureOf(result.failure, 'submit')
      if (view?.kind === 'fields') this.setData({ fields: view.fields })
      else if (view) {
        if (view.kind === 'stale') this.replace(view.latest as StoreItem)
        this.setData({ error: messageOf(view) })
      }
      return null
    },
    async saveAndInvite(): Promise<void> {
      const found = this.find(this.data.storeId)
      if (!found) return
      const saved = await this.saveStore(found.store)
      if (!saved) return
      const invite = findAction(saved.actions, 'inviteStore')
      if (!invite?.enabled) {
        this.setData({ error: invite?.disabledReason ?? redesignCopy.inviteNoRight })
        return
      }
      await this.generate()
    },
    async generate(): Promise<void> {
      const id = this.data.storeId
      this.setData({ busy: true, error: '' })
      const result = await request(
        contract.createStoreInvite,
        { params: { id } },
        { idempotencyKey: newIdempotencyKey() },
      )
      this.setData({ busy: false })
      if (id !== this.data.storeId) return
      if (!result.ok) {
        this.setData({ error: failureOf(result.failure, 'submit')?.message ?? '' })
        return
      }
      const { path, title, expiresAt } = result.data
      this.setData({
        invited: { path, title, expiresText: copy.screen.inviteExpires(formatTime(expiresAt)) },
      })
      this.triggerEvent('invited', { path, title })
    },
  },
})
