import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { InviteReads } from './invite-reads.ts'
import { InviteWrites } from './invite-writes.ts'
import { InviteLinks } from './invite-links.ts'
import { InviteSubmission } from './invite-submit.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Controller()
export class InvitesController {
  constructor(
    private readonly reads: InviteReads,
    private readonly writes: InviteWrites,
    private readonly links: InviteLinks,
    private readonly submissions: InviteSubmission,
  ) {}
  @Route(contract.listInvites)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listInvites'>,
  ): Promise<OutputOf<typeof contract.listInvites>> {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.getInvite)
  detail(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getInvite'>,
  ): Promise<OutputOf<typeof contract.getInvite>> {
    return this.reads.get(viewer, Number(input.params.id))
  }
  @Route(contract.createInvite)
  create(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createInvite'>,
  ): Promise<OutputOf<typeof contract.createInvite>> {
    return this.writes.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.updateInvite)
  update(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateInvite'>,
  ): Promise<OutputOf<typeof contract.updateInvite>> {
    return this.writes.update(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.cancelInvite)
  cancel(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'cancelInvite'>,
  ): Promise<OutputOf<typeof contract.cancelInvite>> {
    return this.writes.cancel(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.shareInvite)
  share(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'shareInvite'>,
  ): Promise<OutputOf<typeof contract.shareInvite>> {
    return this.links.share(viewer, Number(input.params.id))
  }
  @Route(contract.supplierInvites)
  supplierList(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'supplierInvites'>,
  ): Promise<OutputOf<typeof contract.supplierInvites>> {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.supplierInvite)
  supplierDetail(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'supplierInvite'>,
  ): Promise<OutputOf<typeof contract.supplierInvite>> {
    return this.reads.get(viewer, Number(input.params.id))
  }
  @Route(contract.resolveSupplierInvite)
  resolve(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'resolveSupplierInvite'>,
  ): Promise<OutputOf<typeof contract.resolveSupplierInvite>> {
    return this.links.resolve(viewer, input.body)
  }
  @Route(contract.submitSupplierInvite)
  submit(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'submitSupplierInvite'>,
  ): Promise<OutputOf<typeof contract.submitSupplierInvite>> {
    return this.submissions.submit(
      viewer,
      Number(input.params.id),
      input.body,
      input.idempotencyKey,
    )
  }
}
