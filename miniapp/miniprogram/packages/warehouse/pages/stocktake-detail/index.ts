import { contract, copy, redesignCopy } from '@huazhong/shared'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'

Page({
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
        title: doc.no,
        status: doc.status,
        statusKind: 'stocktakeStatus',
        rows: [
          { label: copy.stock.screen.categories, value: doc.categories.join(copy.separator) },
          { label: copy.screen.label.date, value: doc.checkDate },
          { label: copy.stock.screen.actor, value: doc.actorName },
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
  onEdit() {},
  onFailureAction() {
    void this.load()
  },
})
