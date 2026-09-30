// 接口契约：按开发阶段增长（08 章），每个接口在这里登记一次。
// 后端每个路由都必须对应这里的一项，这里的每一项后端都必须实现（server/test/contract.test.ts）。
import { bindPhone, unbind } from './auth.ts'
import { listInventory, listMaterialCategories } from './inventory.ts'
import { getLog, listLogs } from './logs.ts'
import { me } from './me.ts'
import { createStaff, listStaff, unbindStaffWechat, updateStaff } from './staff.ts'
import { storeHome } from './store.ts'

export const contract = {
  me,
  bindPhone,
  unbind,
  listStaff,
  createStaff,
  updateStaff,
  unbindStaffWechat,
  listLogs,
  getLog,
  listInventory,
  listMaterialCategories,
  storeHome,
} as const
export type Contract = typeof contract
export type EndpointName = keyof Contract
