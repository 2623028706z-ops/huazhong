// 接口契约：按开发阶段增长（08 章），每个接口在这里登记一次。
// 后端每个路由都必须对应这里的一项，这里的每一项后端都必须实现（server/test/contract.test.ts）。
import { me } from './me.ts'

export const contract = { me } as const
export type Contract = typeof contract
export type EndpointName = keyof Contract
