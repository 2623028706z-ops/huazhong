// 到货有差异（2026-10-06 第 3 批）：仓库收货少收 / 多收 / 拒收 / 改价、收货后改价、退货、作废已收货的单
// → 记差异时间；下单采购员（或管理员）点「知道了」记看过时间。差异时间晚于看过时间 = 没看过（进采购待办）
import { noticeCopy, type PoDiff } from '@huazhong/shared'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { accounts, type purchaseOrderLines, purchaseOrders } from '../../../db/schema/index.ts'
import { unseenOf, unseenWhere } from '../../common/domain/seen.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { WriteContext } from '../../common/write.service.ts'

type Po = typeof purchaseOrders.$inferSelect
type Line = typeof purchaseOrderLines.$inferSelect

export function diffUnseenOf(po: Pick<Po, 'diffAt' | 'buyerSeenAt'>): boolean {
  return unseenOf(po.diffAt, po.buyerSeenAt)
}

const diffUnseenWhere = unseenWhere(purchaseOrders.diffAt, purchaseOrders.buyerSeenAt)

// 差异待办、筛选只算自己下的单；管理员看全部（2026-10-06 用户定）
export function ownDiffWhere(viewer: Viewer): SQL {
  return viewer.type === 'admin'
    ? diffUnseenWhere
    : sql`${diffUnseenWhere} AND ${purchaseOrders.buyerId} = ${viewer.accountId}`
}

// 有差异的明细行：实收和下单不同（少收、多收、拒收）、单价和下单时不同、有退货
function diffLines(lines: readonly Line[]): PoDiff['lines'] {
  return lines.flatMap((line) => {
    if (line.receivedQty === null) return []
    const short = line.receivedQty < line.qty
    const over = line.receivedQty > line.qty
    const repriced = line.priceCents !== line.orderPriceCents
    if (!short && !over && !repriced && line.returnedQty === 0) return []
    return [
      {
        poLineId: String(line.id),
        name: line.name,
        unit: line.unit,
        qty: line.qty,
        receivedQty: line.receivedQty,
        short,
        over,
        orderPriceCents: line.orderPriceCents,
        priceCents: line.priceCents,
        repriced,
        returnedQty: line.returnedQty,
      },
    ]
  })
}

export async function poDiffOf(
  executor: Db | Tx,
  po: Po,
  lines: readonly Line[],
  received: { receivedBy: string | null; receivedAt: string | null },
): Promise<PoDiff | null> {
  if (po.diffAt === null) return null
  const [by] =
    po.diffBy === null
      ? []
      : await executor
          .select({ name: accounts.name })
          .from(accounts)
          .where(eq(accounts.id, po.diffBy))
  return {
    notice: noticeCopy.poDiffNotice,
    // 整单拒收不再逐行列「实收 0（下单 y）」
    lines: po.status === 'rejected' ? [] : diffLines(lines),
    rejectedAll: po.status === 'rejected',
    rejectReason: po.status === 'rejected' && po.recvNote !== '' ? po.recvNote : null,
    voided: po.status === 'voided',
    receivedBy: received.receivedBy,
    receivedAt: received.receivedAt,
    at: po.diffAt.toISOString(),
    byName: by?.name ?? '',
    unseen: diffUnseenOf(po),
    seenAt: po.buyerSeenAt?.toISOString() ?? null,
  }
}

// 仓库写接口在同一事务里调用：收货只在实收和下单不同或改了价时调用，改价、退货、作废每次都调用
export async function markPoDiff(ctx: WriteContext, id: number, now: Date): Promise<void> {
  await ctx.tx
    .update(purchaseOrders)
    .set({ diffAt: now, diffBy: ctx.viewer?.accountId ?? null })
    .where(eq(purchaseOrders.id, id))
}
