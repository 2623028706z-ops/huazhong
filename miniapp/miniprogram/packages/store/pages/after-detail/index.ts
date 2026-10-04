import { contract, copy, type AfterDetail } from '@huazhong/shared'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { watch, unwatchOnLeave } from '../../../../core/live'
import { afterInfoOf, afterLinesOf, afterReasonsOf } from '../../../../views/after'
import { afterProgress, externalProgressOf } from '../../../../views/progress'
function viewOf(after: AfterDetail) {
  return {
    info: {
      title: copy.org.store(after.customerName, after.storeName),
      status: after.status === 'voided' ? 'cancelled' : after.status,
      statusKind: 'afterStatus',
      rows: afterInfoOf(after, true),
    },
    progress: externalProgressOf(afterProgress(after)),
    lines: afterLinesOf(after),
    linesHeading: copy.screen.section.afterLines,
    reason: afterReasonsOf(after, true),
  }
}
Page({
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.afterDetail,
    loaded: false,
    failure: null as FailureView | null,
    view: null as ReturnType<typeof viewOf> | null,
  },
  id: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    void this.load()
  },
  onShow() {
    watch(this, [`after:${this.id}`], () => void this.load())
  },
  async load() {
    const result = await request(contract.getAfter, { params: { id: this.id } })
    if (result.ok) this.setData({ loaded: true, failure: null, view: viewOf(result.data) })
    else this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
  },
  onFailureAction() {
    void this.load()
  },
})
