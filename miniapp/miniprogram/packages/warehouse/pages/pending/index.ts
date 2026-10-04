import { copy } from '@huazhong/shared'
import { poListPage } from '../../../../views/po-list'
Page({
  ...poListPage,
  data: {
    ...poListPage.data,
    kind: 'warehouse',
    title: copy.screen.title.receive,
    filter: { ...poListPage.data.filter, status: 'to_receive' },
  },
})
