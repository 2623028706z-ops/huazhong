import { poDetailPage } from '../../../../views/po-detail'
Page({
  ...poDetailPage,
  data: { ...poDetailPage.data, kind: 'warehouse' },
})
