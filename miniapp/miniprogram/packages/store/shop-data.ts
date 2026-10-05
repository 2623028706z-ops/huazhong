import { contract, type Me, type StoreCatalog } from '@huazhong/shared'
import { request, type Failure, type Result } from '../../core/request'
import { loadMe, storeUnseenOf } from '../../core/session'
export interface ShopData {
  me: Me
  // 底栏「订单」角标：没看过的结果数（取不到按 0）
  unseen: number
  home: Pick<
    StoreCatalog,
    'customerId' | 'customerName' | 'storeId' | 'storeName' | 'lockedReason'
  > & { orderableCount: number }
  catalog: StoreCatalog | null
  catalogFailure: Failure | null
}
function homeOf(me: Me, catalog: Result<StoreCatalog>): ShopData['home'] {
  if (catalog.ok) return { ...catalog.data, orderableCount: catalog.data.items.length }
  return {
    customerId: '',
    customerName: '',
    storeId: me.storeId ?? '',
    storeName: me.orgLabel ?? '',
    lockedReason: catalog.failure.kind === 'server' ? catalog.failure.message : '',
    orderableCount: 0,
  }
}
function canKeepDraft(catalog: Result<StoreCatalog>) {
  return (
    catalog.ok || (catalog.failure.kind === 'server' && catalog.failure.code === 'BUSINESS_RULE')
  )
}
export async function loadShop(): Promise<Result<ShopData>> {
  const [me, catalog, unseen] = await Promise.all([
    loadMe(),
    request(contract.storeCatalog),
    storeUnseenOf(),
  ])
  if (!me.ok) return me
  if (!canKeepDraft(catalog) && !catalog.ok) return catalog
  return {
    ok: true,
    data: {
      me: me.data,
      unseen: unseen?.total ?? 0,
      home: homeOf(me.data, catalog),
      catalog: catalog.ok ? catalog.data : null,
      catalogFailure: catalog.ok ? null : catalog.failure,
    },
  }
}
