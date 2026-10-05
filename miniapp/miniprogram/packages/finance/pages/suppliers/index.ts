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
      { key: 'overdue', text: f.hasOverdue },
      // 财务首页「供应商可开对账」点进来停在这里
      { key: 'unstatemented', text: f.hasUnstatemented },
    ],
  },
})
