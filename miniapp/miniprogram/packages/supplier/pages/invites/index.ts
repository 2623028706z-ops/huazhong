import { emptyFilter } from '../../../../core/filter'
import { copy } from '@huazhong/shared'
import { inviteListPage } from '../../../../views/invite-list'
Page({
  ...inviteListPage,
  data: {
    ...inviteListPage.data,
    supplier: true,
    filter: { ...emptyFilter, status: 'pending' },
    title: copy.screen.title.supply,
  },
})
