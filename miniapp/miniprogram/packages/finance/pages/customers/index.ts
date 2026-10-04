import { copy, financeCopy as f } from '@huazhong/shared'
import { financePartiesPage } from '../../../../views/finance-parties'
Page({
  ...financePartiesPage,
  data: {
    ...financePartiesPage.data,
    supplier: false,
    title: copy.screen.title.arCustomers,
    searchPlaceholder: copy.filter.search(f.customer),
    emptyObject: copy.screen.empty.customers,
    filterTabs: [
      { key: 'all', text: f.all },
      { key: 'outstanding', text: f.hasOutstanding },
      { key: 'overdue', text: f.hasOverdue },
    ],
  },
})
