import { copy, financeCopy as f } from '@huazhong/shared'
import { financePartiesPage } from '../../../../views/finance-parties'
Page({
  ...financePartiesPage,
  data: {
    ...financePartiesPage.data,
    supplier: true,
    title: copy.screen.title.apSuppliers,
    searchPlaceholder: copy.filter.search(f.supplier),
    emptyObject: copy.screen.empty.suppliers,
    filterTabs: [
      { key: 'all', text: f.all },
      { key: 'outstanding', text: f.hasPayable },
      { key: 'unstatemented', text: f.hasUnstatemented },
    ],
  },
})
