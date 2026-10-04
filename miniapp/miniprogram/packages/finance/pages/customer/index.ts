import { copy } from '@huazhong/shared'
import { partyLedgerPage } from '../../../../views/party-ledger'
Page({
  ...partyLedgerPage,
  data: { ...partyLedgerPage.data, supplier: false, title: copy.screen.title.arCustomers },
})
