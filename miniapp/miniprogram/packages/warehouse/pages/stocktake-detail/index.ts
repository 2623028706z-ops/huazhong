import { contract, copy, redesignCopy } from '@huazhong/shared'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { pullToRefresh } from '../../../../core/live'

Page({
  ...pullToRefresh,
  data: {
    title: copy.stock.screen.stocktakeDetail,
    loaded: false,
    failure: null as FailureView | null,
    info: {
      title: '',
      status: 'done',
      statusKind: 'stocktakeStatus',
      rows: [] as { label: string; value: string }[],
    },
    rows: [] as {
      materialId: string
      name: string
      bookQty: number
      actualText: string
      diffQty: number
      unit: string
    }[],
    texts: { ...copy.stock.screen, materials: redesignCopy.materialLines, unit: copy.field.unit },
    reason: '',
  },
  id: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    void this.load()
  },
  async load() {
    const result = await request(contract.getStocktake, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const doc = result.data
    this.setData({
      loaded: true,
      failure: null,
      info: {
        title: doc.categories.join(copy.separator),
        status: doc.status,
        statusKind: 'stocktakeStatus',
        rows: [
          { label: redesignCopy.no, value: doc.no },
          { label: copy.stock.screen.actor, value: doc.actorName },
          { label: copy.stock.screen.checkDate, value: doc.checkDate },
          { label: copy.stock.screen.lineCountLabel, value: copy.stock.lineCount(doc.lineCount) },
          {
            label: copy.stock.screen.difference,
            value: doc.diffCount
              ? copy.stock.diffCount(doc.diffCount)
              : copy.stock.screen.noDifference,
          },
        ],
      },
      rows: doc.lines.map((line) => ({
        materialId: line.materialId,
        name: line.name,
        bookQty: line.bookQty,
        actualText: String(line.actualQty),
        diffQty: line.diffQty,
        unit: line.unit,
      })),
      reason: doc.reason ?? '',
    })
  },
  onFailureAction() {
    void this.load()
  },
})
