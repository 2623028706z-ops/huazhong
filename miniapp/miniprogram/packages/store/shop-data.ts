// 订货、购物车、结算共用的数据（06 章 S1、S2、S5）：当前账号 + 门店首页 + 订货目录。
// 客户停用时目录返回 BUSINESS_RULE：购物车照常显示（按快照），页面写 lockedReason
import { contract, type Me, type StoreCatalog, type StoreHome } from '@huazhong/shared'
import { request, type Failure } from '../../core/request'
import { loadMe } from '../../core/session'

export interface ShopData {
  me: Me
  home: StoreHome
  catalog: StoreCatalog | null
  // 目录没拿到的原因（客户停用的句子等）；拿到了为 null
  catalogFailure: Failure | null
}

export async function loadShop(): Promise<
  { ok: true; data: ShopData } | { ok: false; failure: Failure }
> {
  const [me, home, catalog] = await Promise.all([
    loadMe(),
    request(contract.storeHome),
    request(contract.storeCatalog),
  ])
  if (!me.ok) return me
  if (!home.ok) return home
  // 断网、没绑定这类整页失败照常按整页处理；业务拦截（客户停用）不挡购物车
  if (
    !catalog.ok &&
    (catalog.failure.kind === 'network' || catalog.failure.code !== 'BUSINESS_RULE')
  )
    return catalog
  return {
    ok: true,
    data: {
      me: me.data,
      home: home.data,
      catalog: catalog.ok ? catalog.data : null,
      catalogFailure: catalog.ok ? null : catalog.failure,
    },
  }
}
