import { contract } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { SupplierCreate } from './supplier-create.ts'
import { SupplierReads } from './supplier-reads.ts'
import { SupplierUpdate } from './supplier-update.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Controller()
export class SuppliersController {
  constructor(
    private readonly reads: SupplierReads,
    private readonly creates: SupplierCreate,
    private readonly updates: SupplierUpdate,
  ) {}
  @Route(contract.listSuppliers)
  list(@CurrentViewer() viewer: Viewer, @Input() input: In<'listSuppliers'>) {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.getSupplier)
  get(@CurrentViewer() viewer: Viewer, @Input() input: In<'getSupplier'>) {
    return this.reads.get(viewer, Number(input.params.id))
  }
  @Route(contract.createSupplier)
  create(@CurrentViewer() viewer: Viewer, @Input() input: In<'createSupplier'>) {
    return this.creates.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.updateSupplier)
  update(@CurrentViewer() viewer: Viewer, @Input() input: In<'updateSupplier'>) {
    return this.updates.update(viewer, Number(input.params.id), input.body)
  }
}
