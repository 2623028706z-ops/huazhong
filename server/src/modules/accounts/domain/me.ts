// 登录落点、「我的」入口（05 章第 2 节 GET /me 取值表）
import type { Me } from '@huazhong/shared'
import type { Viewer } from '../../../common/domain/viewer.ts'

export function landingOf(viewer: Viewer): Me['landing'] {
  if (viewer.type === 'store') return 'store_shop'
  if (viewer.type === 'supplier') return 'supplier_invites'
  const [only] = viewer.modules
  if (viewer.type === 'staff' && viewer.modules.length === 1 && only) return `module:${only}`
  return 'home'
}

export function menusOf(viewer: Viewer): Me['menus'] {
  switch (viewer.type) {
    case 'admin':
      return ['logs', 'staff', 'brand']
    case 'staff':
      return viewer.modules.includes('warehouse') ? ['logs'] : ['inventory', 'logs']
    case 'store':
      return ['storeAfters', 'storeStatement']
    case 'supplier':
      return ['supplierStatement']
  }
}
