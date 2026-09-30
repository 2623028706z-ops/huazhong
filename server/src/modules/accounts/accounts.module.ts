import { Module } from '@nestjs/common'
import { AccountsController, StaffController } from './accounts.controller.ts'
import { AccountsService } from './accounts.service.ts'
import { PhoneExchange, WechatPhoneExchange } from './phone.ts'
import { StaffService } from './staff.service.ts'

@Module({
  controllers: [AccountsController, StaffController],
  providers: [
    AccountsService,
    StaffService,
    // 接口测试换成假的实现（test/support/app.ts）
    { provide: PhoneExchange, useClass: WechatPhoneExchange },
  ],
})
export class AccountsModule {}
