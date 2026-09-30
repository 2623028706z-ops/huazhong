// 权限第二层：数据归属。门店只看本店、供应商只看本家，查不到一律 NOT_FOUND（05 章第 1.2 节）
import { appError } from '@huazhong/shared'
import type { Viewer } from './domain/viewer.ts'

// 门店账号返回本店 ID（查询必须带这个条件）；员工返回 null（不按门店过滤）。
// 门店账号一定有门店（accounts_store_link 约束），缺了就是数据错误，不能退化成「不过滤」
export function ownStoreId(viewer: Viewer): number | null {
  if (viewer.type !== 'store') return null
  if (viewer.storeId === null) throw appError.internal()
  return viewer.storeId
}

// 按归属过滤后查不到的单据：不区分「不存在」和「不是你的」
export function found<T>(row: T | undefined): T {
  if (row === undefined) throw appError.notFound()
  return row
}
