import { contract, type Me, type OutputOf, type StaffItem } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import {
  CurrentOpenid,
  CurrentViewer,
  Input,
  Route,
  type ParsedInput,
} from '../../common/endpoint.ts'
import { AccountsService } from './accounts.service.ts'
import { StaffService } from './staff.service.ts'

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Route(contract.me)
  me(@CurrentViewer() viewer: Viewer): Promise<Me> {
    return Promise.resolve(this.accounts.me(viewer))
  }

  @Route(contract.bindPhone)
  bindPhone(
    @CurrentOpenid() openid: string,
    @Input() input: ParsedInput<typeof contract.bindPhone>,
  ): Promise<Me> {
    return this.accounts.bindPhone(openid, input.body.code)
  }

  @Route(contract.unbind)
  unbind(@CurrentOpenid() openid: string): Promise<Record<string, never>> {
    return this.accounts.unbind(openid)
  }
}

@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Route(contract.listStaff)
  list(
    @Input() input: ParsedInput<typeof contract.listStaff>,
  ): Promise<OutputOf<typeof contract.listStaff>> {
    return this.staff.list(input.query)
  }

  @Route(contract.createStaff)
  create(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.createStaff>,
  ): Promise<StaffItem> {
    return this.staff.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.updateStaff)
  update(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.updateStaff>,
  ): Promise<StaffItem> {
    return this.staff.update(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.unbindStaffWechat)
  unbindWechat(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.unbindStaffWechat>,
  ): Promise<StaffItem> {
    return this.staff.unbindWechat(viewer, Number(input.params.id), input.body.version)
  }
}
