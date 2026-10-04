import { redesignCopy } from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect } from 'vitest'
import { tapText, type Page } from './mini.ts'

// 点真实表格行打开编辑窗口，再由组件触发页面的数量 / 单价事件。
export async function editWarehouseLine(
  page: Page,
  index: number,
  patch: { qty?: number; price?: string },
) {
  const tables = (await page.$$('components\\/hz-line-item\\/index')) as CustomElement[]
  for (const table of tables) {
    if (['view', 'after'].includes((await table.data('mode')) as string)) continue
    const size = await table.size()
    if (Number(size.height) === 0) continue
    const rows = (await table.$$('.hz-line-item__row')) as CustomElement[]
    const row = rows[index]
    if (!row) continue
    expect(await table.data('showEditor')).toBe(false)
    await row.tap()
    await expect.poll(async () => table.data('showEditor') as Promise<boolean>).toBe(true)
    if (patch.qty !== undefined) await table.callMethod('onDraftQty', { detail: patch.qty })
    if (patch.price !== undefined) await table.callMethod('onDraftPrice', { detail: patch.price })
    await tapText(table, redesignCopy.confirm)
    await expect.poll(async () => table.data('showEditor') as Promise<boolean>).toBe(false)
    return
  }
  throw new Error(`no editable warehouse line ${index}`)
}
