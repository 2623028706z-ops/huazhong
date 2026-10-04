import { contract, copy } from '@huazhong/shared'
import { request, type Result } from '../core/request'

async function loadPages<T>(
  fetch: (cursor?: string) => Promise<Result<{ items: T[]; nextCursor: string | null }>>,
): Promise<Result<T[]>> {
  const items: T[] = []
  let cursor: string | undefined
  do {
    const result = await fetch(cursor)
    if (!result.ok) return result
    items.push(...result.data.items)
    cursor = result.data.nextCursor ?? undefined
  } while (cursor)
  return { ok: true, data: items }
}

export function loadSuppliers(query: { enabled?: 'true'; hasAccount?: 'true' } = {}) {
  return loadPages((cursor) => request(contract.listSuppliers, { query: { ...query, cursor } }))
}

export async function loadSupplierDimensions(this: {
  setData(patch: Record<string, unknown>): void
}) {
  const result = await loadSuppliers()
  if (result.ok)
    this.setData({
      dimensions: [
        {
          key: 'supplier',
          label: copy.screen.label.supplier,
          options: result.data.map((s) => ({ id: s.id, name: s.name })),
        },
      ],
    })
}

export function loadMaterials() {
  return loadPages((cursor) =>
    request(contract.listMaterials, { query: { enabled: 'true', cursor } }),
  )
}

export function loadInventory() {
  return loadPages((cursor) => request(contract.listInventory, { query: { cursor } }))
}

export function loadSupplyMaterials() {
  return loadPages((cursor) => request(contract.supplierMaterials, { query: { cursor } }))
}

export async function loadPendingInvites(): Promise<Result<Map<string, string[]>>> {
  const result = await loadPages((cursor) =>
    request(contract.listInvites, { query: { status: 'pending', cursor } }),
  )
  return result.ok ? { ok: true, data: suppliersByMaterial(result.data) } : result
}

// 待填报邀请按花材名归集供应商名（去重），新建采购单 / 邀请时给明细行提醒
function suppliersByMaterial(invites: { supplierName: string; materialNames: string[] }[]) {
  const result = new Map<string, string[]>()
  for (const invite of invites)
    for (const name of invite.materialNames) {
      const names = result.get(name) ?? []
      if (!names.includes(invite.supplierName)) names.push(invite.supplierName)
      result.set(name, names)
    }
  return result
}
export function pendingNoticeOf(map: Map<string, string[]>, name: string) {
  const suppliers = map.get(name)
  return suppliers ? copy.screen.invitedLinePending(suppliers) : ''
}
