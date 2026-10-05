import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { WarehouseService } from './warehouse.service.ts'

@Controller()
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Route(contract.listInventory)
  listInventory(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.listInventory>,
  ): Promise<OutputOf<typeof contract.listInventory>> {
    return this.warehouse.listInventory(input.query, viewer)
  }

  @Route(contract.listMaterialCategories)
  listCategories(): Promise<OutputOf<typeof contract.listMaterialCategories>> {
    return this.warehouse.listCategories()
  }
}
