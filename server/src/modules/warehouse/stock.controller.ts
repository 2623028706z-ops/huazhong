import { contract } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { OutCategories } from './out-categories.ts'
import { StockMoves } from './stock-moves.ts'
import { Stocktakes } from './stocktakes.ts'
import { WhDocReads } from './wh-doc-reads.ts'
import { WhDocWrites } from './wh-doc-writes.ts'

type In<Key extends keyof typeof contract> = ParsedInput<(typeof contract)[Key]>
@Controller()
export class StockController {
  constructor(
    private readonly reads: WhDocReads,
    private readonly writes: WhDocWrites,
  ) {}
  @Route(contract.listWhDocs)
  list(@CurrentViewer() viewer: Viewer, @Input() input: In<'listWhDocs'>) {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.getWhDoc)
  detail(@CurrentViewer() viewer: Viewer, @Input() input: In<'getWhDoc'>) {
    return this.reads.detailRead(viewer, Number(input.params.id))
  }
  @Route(contract.createWhDoc)
  create(@CurrentViewer() viewer: Viewer, @Input() input: In<'createWhDoc'>) {
    return this.writes.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.repriceWhDoc)
  reprice(@CurrentViewer() viewer: Viewer, @Input() input: In<'repriceWhDoc'>) {
    return this.writes.reprice(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.voidWhDoc)
  void(@CurrentViewer() viewer: Viewer, @Input() input: In<'voidWhDoc'>) {
    return this.writes.void(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.getSupplierStockIn)
  supplier(@CurrentViewer() viewer: Viewer, @Input() input: In<'getSupplierStockIn'>) {
    return this.reads.supplier(viewer, Number(input.params.id))
  }
}

@Controller()
export class StockInventoryController {
  constructor(
    private readonly categories: OutCategories,
    private readonly stocktakes: Stocktakes,
    private readonly moves: StockMoves,
  ) {}
  @Route(contract.listOutCategories)
  categoriesList() {
    return this.categories.list()
  }
  @Route(contract.createOutCategory)
  categoryCreate(@CurrentViewer() viewer: Viewer, @Input() input: In<'createOutCategory'>) {
    return this.categories.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.updateOutCategory)
  categoryUpdate(@CurrentViewer() viewer: Viewer, @Input() input: In<'updateOutCategory'>) {
    return this.categories.update(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.listStocktakes)
  stocktakeList(@Input() input: In<'listStocktakes'>) {
    return this.stocktakes.list(input.query)
  }
  @Route(contract.getStocktakeDraft)
  draft(@Input() input: In<'getStocktakeDraft'>) {
    return this.stocktakes.draft(input.query.categoryIds)
  }
  @Route(contract.getStocktake)
  stocktakeDetail(@Input() input: In<'getStocktake'>) {
    return this.stocktakes.detail(Number(input.params.id))
  }
  @Route(contract.createStocktake)
  stocktakeCreate(@CurrentViewer() viewer: Viewer, @Input() input: In<'createStocktake'>) {
    return this.stocktakes.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.listStockMoves)
  movesList(@Input() input: In<'listStockMoves'>) {
    return this.moves.list(input.query)
  }
}
