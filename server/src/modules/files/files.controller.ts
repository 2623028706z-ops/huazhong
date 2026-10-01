import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { FilesService } from './files.service.ts'

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Route(contract.requestUploadTicket)
  requestTicket(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.requestUploadTicket>,
  ): Promise<OutputOf<typeof contract.requestUploadTicket>> {
    return this.files.requestTicket(viewer, input.body)
  }

  @Route(contract.completeUpload)
  complete(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.completeUpload>,
  ): Promise<OutputOf<typeof contract.completeUpload>> {
    return this.files.complete(viewer, Number(input.params.id))
  }
}
