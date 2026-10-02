import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { MaterialCategories } from './material-categories.ts'
import { MaterialReads } from './material-reads.ts'
import { MaterialWrites } from './material-writes.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Controller()
export class MaterialsController {
  constructor(
    private readonly reads: MaterialReads,
    private readonly writes: MaterialWrites,
    private readonly categories: MaterialCategories,
  ) {}
  @Route(contract.listMaterials)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listMaterials'>,
  ): Promise<OutputOf<typeof contract.listMaterials>> {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.getMaterial)
  detail(@Input() input: In<'getMaterial'>): Promise<OutputOf<typeof contract.getMaterial>> {
    return this.reads.detail(Number(input.params.id))
  }
  @Route(contract.createMaterial)
  create(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createMaterial'>,
  ): Promise<OutputOf<typeof contract.createMaterial>> {
    return this.writes.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.updateMaterial)
  update(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateMaterial'>,
  ): Promise<OutputOf<typeof contract.updateMaterial>> {
    return this.writes.update(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.createMaterialCategory)
  createCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createMaterialCategory'>,
  ): Promise<OutputOf<typeof contract.createMaterialCategory>> {
    return this.categories.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.updateMaterialCategory)
  updateCategory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateMaterialCategory'>,
  ): Promise<OutputOf<typeof contract.updateMaterialCategory>> {
    return this.categories.update(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.supplierMaterials)
  supplier(
    @Input() input: In<'supplierMaterials'>,
  ): Promise<OutputOf<typeof contract.supplierMaterials>> {
    return this.reads.supplier(input.query)
  }
  @Route(contract.warehouseStock)
  stock(@Input() input: In<'warehouseStock'>): Promise<OutputOf<typeof contract.warehouseStock>> {
    return this.reads.stock(input.query)
  }
}
