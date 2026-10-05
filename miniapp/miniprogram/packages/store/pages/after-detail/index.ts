// S10 售后详情（06 章 S10）：进度条 → 提示条 → 信息卡 → 售后明细 → 关闭或作废信息；门店只看不操作。
// 打开时有结果还没看过的，记门店已看过
import { contract, copy, type AfterDetail } from '@huazhong/shared'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { watch, unwatchOnLeave, pullToRefresh } from '../../../../core/live'
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
  ...pullToRefresh,
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
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.setData({ loaded: true, failure: null, view: viewOf(result.data) })
    // 有结果还没看过：点开就记看过（03 章第 8.1 节），回到售后段角标、小红点跟着消
    if (result.data.unseen) void request(contract.markStoreAfterSeen, { params: { id: this.id } })
  },
  onFailureAction() {
    void this.load()
  },
})
