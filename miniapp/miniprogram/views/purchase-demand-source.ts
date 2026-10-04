import type { contract } from '@huazhong/shared'
import { copy, redesignCopy, formatQty, labels, type OutputOf } from '@huazhong/shared'

type Demand = OutputOf<typeof contract.listPurchaseDemand>
type Sources = OutputOf<typeof contract.listDemandSources>
type Mat = Demand['mats'][number]
// 字段行（hz-info-rows 两列写法）；danger 是缺口红字
export interface SourceField {
  label: string
  value: string
  wide?: boolean
  danger?: boolean
}
interface SourceBlock {
  key: string
  kind: 'invite' | 'po' | 'order'
  title: string
  link: boolean
  fields: SourceField[]
}
export interface SourceSection {
  key: string
  title: string
  blocks: SourceBlock[]
}
const screen = copy.screen
function inviteSectionOf(source: Sources, unit: string): SourceSection[] {
  if (!source.invites.length) return []
  return [
    {
      key: 'invites',
      title: screen.invitedPending,
      blocks: source.invites.map((item) => ({
        key: item.inviteId,
        kind: 'invite',
        title: item.supplierName,
        link: true,
        fields: [
          { label: screen.inviteNo, value: item.no },
          { label: redesignCopy.need, value: formatQty(item.needQty, unit) },
        ],
      })),
    },
  ]
}
function poSectionOf(source: Sources, unit: string): SourceSection[] {
  if (!source.inTransitSources.length) return []
  return [
    {
      key: 'pos',
      title: screen.inTransitPos,
      blocks: source.inTransitSources.map((item) => ({
        key: item.poId,
        kind: 'po',
        title: item.supplierName,
        link: true,
        fields: [
          { label: redesignCopy.no, value: item.no },
          { label: redesignCopy.qty, value: formatQty(item.qty, unit) },
          { label: copy.field.status, value: labels.poStatus[item.status] },
        ],
      })),
    },
  ]
}
function orderSectionsOf(source: Sources, unit: string): SourceSection[] {
  return source.groups.map((group) => ({
    key: group.shipDate,
    title: screen.sourceShipDate(group.shipDate),
    blocks: group.items.map((item) => ({
      key: item.orderId,
      kind: 'order' as const,
      title: [item.customerName, item.storeName].join(copy.separator),
      link: false,
      fields: [
        { label: redesignCopy.no, value: item.orderNo },
        { label: redesignCopy.need, value: formatQty(item.materialQty, unit) },
        { label: screen.productName, value: item.productName, wide: true },
        { label: redesignCopy.qty, value: formatQty(item.qty, item.productUnit) },
        { label: screen.bomUsage, value: screen.usageOf(item.bomQty, unit, item.productUnit) },
      ],
    })),
  }))
}
export function sourceSectionsOf(source: Sources, unit: string): SourceSection[] {
  return [
    ...inviteSectionOf(source, unit),
    ...poSectionOf(source, unit),
    ...orderSectionsOf(source, unit),
  ]
}
export function sourceTopOf(mat: Mat | undefined): SourceField[] {
  if (!mat) return []
  const gap = Math.max(0, -mat.leftQty)
  return [
    { label: redesignCopy.need, value: formatQty(mat.needQty, mat.unit) },
    { label: redesignCopy.inStock, value: formatQty(mat.stockQty, mat.unit) },
    { label: redesignCopy.inTransit, value: formatQty(mat.inTransitQty, mat.unit) },
    { label: copy.screen.gap, value: formatQty(gap, mat.unit), danger: gap > 0 },
  ]
}
