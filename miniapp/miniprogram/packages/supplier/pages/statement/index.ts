import { copy } from '@huazhong/shared'
import { apStatementPage } from '../../../../views/ap-statement'
Page({
  ...apStatementPage,
  data: { ...apStatementPage.data, own: true, title: copy.screen.title.statement },
})
