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
      // 财务首页「客户可开对账」点进来停在这里，按未对账金额从大到小（03 章第 8.4 节）
      { key: 'unstatemented', text: f.hasUnstatemented },
    ],
  },
})
