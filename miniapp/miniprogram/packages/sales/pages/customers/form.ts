// 客户门店弹层的表单（06 章 X8）：客户资料（名称、启用）、门店资料（客户、名称、联系人、电话、地址、
// 门店账号登录手机号、启用）。即时校验用和后端同一份 Zod 规则
import {
  contract,
  copy,
  maskPhone,
  storeCreateSchema,
  storeUpdateSchema,
  type CustomerItem,
  type StoreItem,
} from '@huazhong/shared'
import { checkedOf } from '../../../../core/form'

export interface CustomerForm {
  name: string
  enabled: boolean
}

export interface StoreForm {
  customerId: string
  name: string
  contact: string
  phone: string
  address: string
  loginPhone: string
  enabled: boolean
}

export function customerFormOf(customer: CustomerItem | null): CustomerForm {
  return { name: customer?.name ?? '', enabled: customer?.enabled ?? true }
}

export function storeFormOf(store: StoreItem | null, customerId: string): StoreForm {
  if (!store) {
    return {
      customerId,
      name: '',
      contact: '',
      phone: '',
      address: '',
      loginPhone: '',
      enabled: true,
    }
  }
  const { name, contact, phone, address, enabled } = store
  return {
    customerId: store.customerId,
    name,
    contact,
    phone,
    address,
    enabled,
    loginPhone: store.loginPhone ?? '',
  }
}

export function checkCustomerCreate(form: CustomerForm) {
  return checkedOf(contract.createCustomer.body.safeParse(form))
}

export function checkCustomerUpdate(form: CustomerForm, version: number) {
  return checkedOf(contract.updateCustomer.body.safeParse({ ...form, version }))
}

export function checkStoreCreate(form: StoreForm) {
  return checkedOf(storeCreateSchema.safeParse(form))
}

export function checkStoreUpdate(form: StoreForm, version: number) {
  const { name, contact, phone, address, loginPhone, enabled } = form
  const body = { name, contact, phone, address, loginPhone, enabled, version }
  return checkedOf(storeUpdateSchema.safeParse(body))
}

// 左侧客户：停用的标「已停用」
export function customerSideOf(customers: readonly CustomerItem[]) {
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    sub: customer.enabled ? '' : copy.tag.disabled,
  }))
}

// 右侧门店：名称、联系人、启用状态
export function storeRowsOf(customer: CustomerItem | undefined) {
  return (customer?.stores ?? []).map((store) => ({
    id: store.id,
    fields: [
      { label: copy.field.contact, value: store.contact },
      { label: copy.screen.label.contactPhone, value: maskPhone(store.phone), wide: true },
    ],
    title: store.name,
    total: store.contact,
    // 列表里手机号中间四位打码，弹层里完整（02 章第 7 节）
    meta: maskPhone(store.phone),
    tags: store.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }))
}
