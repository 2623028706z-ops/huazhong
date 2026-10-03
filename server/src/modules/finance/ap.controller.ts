import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { ApReads } from './ap-reads.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Controller()
export class ApController {
  constructor(private readonly ap: ApReads) {}
  @Route(contract.listPayables)
  payables(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listPayables'>,
  ): Promise<OutputOf<typeof contract.listPayables>> {
    return this.ap.payables(viewer, input.query)
  }
  @Route(contract.listFinanceSuppliers)
  suppliers(
    @Input() input: In<'listFinanceSuppliers'>,
  ): Promise<OutputOf<typeof contract.listFinanceSuppliers>> {
    return this.ap.supplierList(input.query)
  }
  @Route(contract.getFinanceSupplier)
  supplier(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getFinanceSupplier'>,
  ): Promise<OutputOf<typeof contract.getFinanceSupplier>> {
    return this.ap.supplier(viewer, Number(input.params.id), input.query)
  }
  @Route(contract.supplierStatement)
  statement(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'supplierStatement'>,
  ): Promise<OutputOf<typeof contract.supplierStatement>> {
    return this.ap.statement(viewer, input.query)
  }
  @Route(contract.getApDocument)
  payable(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getApDocument'>,
  ): Promise<OutputOf<typeof contract.getApDocument>> {
    return this.ap.payable(viewer, input.params.docType, Number(input.params.id))
  }
  @Route(contract.listUnpaidDocuments)
  unpaid(@CurrentViewer() viewer: Viewer, @Input() input: In<'listUnpaidDocuments'>) {
    return this.ap.unpaid(viewer, Number(input.params.id))
  }
}
