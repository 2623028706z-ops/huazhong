import { contract, type Me } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Route } from '../../common/endpoint.ts'
import { AccountsService } from './accounts.service.ts'

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Route(contract.me)
  me(@CurrentViewer() viewer: Viewer): Promise<Me> {
    return Promise.resolve(this.accounts.me(viewer))
  }
}
