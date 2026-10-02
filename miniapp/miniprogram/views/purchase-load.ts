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
