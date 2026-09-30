import { contract, type LogDetail, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { LogsService } from './logs.service.ts'

@Controller()
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Route(contract.listLogs)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.listLogs>,
  ): Promise<OutputOf<typeof contract.listLogs>> {
    return this.logs.list(viewer, input.query)
  }

  @Route(contract.getLog)
  get(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.getLog>,
  ): Promise<LogDetail> {
    return this.logs.get(viewer, Number(input.params.id))
  }
}
