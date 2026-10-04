import type { contract } from '@huazhong/shared'
import { copy, type CatalogCategory, type OutputOf } from '@huazhong/shared'
import type { groupsOf } from '../directory/form'
export const catalogPanelData = {
  realtime: '',
  categories: [] as CatalogCategory[],
  groups: [] as ReturnType<typeof groupsOf>,
  categorySheet: false,
  categoryError: '',
  canCopy: false,
  copySheet: false,
  copySourceId: '',
  copyOptions: [] as { id: string; name: string }[],
  copyPreview: null as OutputOf<typeof contract.previewCatalogCopy> | null,
  copyError: '',
  copyBusy: false,
  catalogTexts: {
    manage: copy.screen.action.manageCategories,
    categories: copy.screen.title.categories,
    add: copy.screen.action.addProduct,
    needCategory: copy.screen.needCategory,
    empty: copy.state.empty(copy.screen.empty.directory),
    copy: copy.rework.copyCatalog,
  },
}
