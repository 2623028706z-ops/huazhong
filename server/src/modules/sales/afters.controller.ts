import { contract, type AfterDetail, type OutputOf } from '@huazhong/shared'
import { Controller, Inject } from '@nestjs/common'
import type { Db } from '../../../db/client.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { AfterReads } from './after-query.ts'
import { AfterWrites } from './after-writes.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Controller()
export class AftersController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reads: AfterReads,
    private readonly writes: AfterWrites,
  ) {}

  @Route(contract.listAfters)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listAfters'>,
  ): Promise<OutputOf<typeof contract.listAfters>> {
    return this.reads.list(viewer, input.query)
  }

  @Route(contract.getAfter)
  get(@CurrentViewer() viewer: Viewer, @Input() input: In<'getAfter'>): Promise<AfterDetail> {
    return this.reads.detail(this.db, viewer, Number(input.params.id))
  }

  @Route(contract.createAfter)
  create(@CurrentViewer() viewer: Viewer, @Input() input: In<'createAfter'>): Promise<AfterDetail> {
    return this.writes.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.processAfter)
  process(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'processAfter'>,
  ): Promise<AfterDetail> {
    return this.writes.process(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.closeAfter)
  close(@CurrentViewer() viewer: Viewer, @Input() input: In<'closeAfter'>): Promise<AfterDetail> {
    return this.writes.close(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.voidAfter)
  void(@CurrentViewer() viewer: Viewer, @Input() input: In<'voidAfter'>): Promise<AfterDetail> {
    return this.writes.void(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.createStoreAfter)
  storeCreate(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createStoreAfter'>,
  ): Promise<AfterDetail> {
    return this.writes.createStore(viewer, input.body, input.idempotencyKey)
  }
}
