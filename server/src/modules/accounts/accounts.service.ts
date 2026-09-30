import type { Me } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { landingOf, menusOf } from './domain/me.ts'

const idOrNull = (id: number | null) => (id === null ? null : String(id))

@Injectable()
export class AccountsService {
  me(viewer: Viewer): Me {
    return {
      id: String(viewer.accountId),
      type: viewer.type,
      name: viewer.name,
      orgLabel: viewer.orgLabel,
      storeId: idOrNull(viewer.storeId),
      supplierId: idOrNull(viewer.supplierId),
      modules: [...viewer.modules],
      landing: landingOf(viewer),
      menus: menusOf(viewer),
    }
  }
}
