import { contract, copy, formatQty } from '@huazhong/shared'
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
    lines: [] as {
      key: string
      name: string
      subText: string
      tags: never[]
      qty: number
      unit: string
    }[],
    texts: copy.stock.screen,
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
      lines: doc.lines.map((line) => ({
        key: line.materialId,
        name: line.name,
        tags: [],
        qty: line.actualQty,
        unit: line.unit,
        subText: `${copy.stock.screen.bookQty} ${formatQty(line.bookQty, line.unit)} · ${copy.stock.screen.actualQty} ${formatQty(line.actualQty, line.unit)} · ${copy.stock.screen.difference} ${formatQty(line.diffQty, line.unit)}`,
      })),
      reason: doc.reason ?? '',
    })
  },
  onFailureAction() {
    void this.load()
  },
})
