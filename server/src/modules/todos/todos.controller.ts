import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { TodosService } from './todos.service.ts'

@Controller()
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Route(contract.moduleTodos)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof contract.moduleTodos>,
  ): Promise<OutputOf<typeof contract.moduleTodos>> {
    return this.todos.todos(viewer, input.params.key)
  }
}
