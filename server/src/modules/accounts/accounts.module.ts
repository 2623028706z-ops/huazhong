import { Module } from '@nestjs/common'
import { AccountsController } from './accounts.controller.ts'
import { AccountsService } from './accounts.service.ts'

@Module({ controllers: [AccountsController], providers: [AccountsService] })
export class AccountsModule {}
