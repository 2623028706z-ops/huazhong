import { copy } from '@huazhong/shared'
import { inviteListPage } from '../../../../views/invite-list'
Page({
  ...inviteListPage,
  data: { ...inviteListPage.data, supplier: true, title: copy.screen.title.supply },
})
