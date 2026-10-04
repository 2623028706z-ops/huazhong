import { copy } from '@huazhong/shared'
import { partyLedgerPage } from '../../../../views/party-ledger'
Page({
  ...partyLedgerPage,
  data: { ...partyLedgerPage.data, supplier: true, title: copy.screen.title.apSuppliers },
})
