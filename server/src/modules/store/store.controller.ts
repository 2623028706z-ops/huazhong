import { contract, type StoreHome } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Route } from '../../common/endpoint.ts'
import { StoreService } from './store.service.ts'

@Controller()
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Route(contract.storeHome)
  home(@CurrentViewer() viewer: Viewer): Promise<StoreHome> {
    return this.store.home(viewer)
  }
}
