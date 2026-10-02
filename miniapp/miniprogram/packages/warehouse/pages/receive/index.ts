import { copy } from '@huazhong/shared'
import { poDetailPage } from '../../../../views/po-detail'
Page({
  ...poDetailPage,
  data: { ...poDetailPage.data, kind: 'warehouse', title: copy.screen.title.receive },
})
