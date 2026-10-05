import { Module } from '@nestjs/common'
import { DemandController, PurchaseController } from './purchase.controller.ts'
import { PurchaseService } from './purchase.service.ts'
import { PoReads } from './po-reads.ts'
import { PoWrites } from './po-writes.ts'
import { PoDiffAck } from './po-diff-ack.ts'
import { PurchaseDemand } from './demand.ts'
import { InviteReads } from './invite-reads.ts'
import { InviteWrites } from './invite-writes.ts'
import { InviteLinks } from './invite-links.ts'
import { InviteSigning } from './invite-signing.ts'
import { InviteSubmission } from './invite-submit.ts'
import { InvitesController } from './invites.controller.ts'
import { SupplierCreate } from './supplier-create.ts'
import { SupplierReads } from './supplier-reads.ts'
import { SupplierUpdate } from './supplier-update.ts'
import { SuppliersController } from './suppliers.controller.ts'

@Module({
  controllers: [PurchaseController, DemandController, InvitesController, SuppliersController],
  providers: [
    PurchaseService,
    PoReads,
    PoWrites,
    PoDiffAck,
    PurchaseDemand,
    InviteReads,
    InviteWrites,
    InviteLinks,
    InviteSigning,
    InviteSubmission,
    SupplierCreate,
    SupplierReads,
    SupplierUpdate,
  ],
  exports: [PurchaseService],
})
export class PurchaseModule {}
