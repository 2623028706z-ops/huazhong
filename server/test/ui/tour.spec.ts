// 页面巡览：按角色用种子数据逐页截图，和定稿画稿对照（只截图，不断言业务）。
// 单独跑：HZ_UI_SCREENSHOTS=<目录> pnpm vitest run --config server/vitest.ui.config.ts test/ui/tour.spec.ts
// 只截一部分：HZ_TOUR=<正则>，按「账号-页名」匹配
import { describe, it } from 'vitest'
import type { SeedAccountKey } from '../../db/seed/data.ts'
import { idBy } from '../support/sales.ts'
import { asMini, enter, setupMiniSuite, snap } from './mini.ts'

type Lookup = Parameters<typeof idBy>[1]
type Stop = [name: string, path: string, ids?: Record<string, [Lookup, string]>]

const sales = '/packages/sales/pages'
const ship = '/packages/shipping/pages'
const buy = '/packages/purchase/pages'
const wh = '/packages/warehouse/pages'
const fin = '/packages/finance/pages'
const store = '/packages/store/pages'
const sup = '/packages/supplier/pages'

const tours: [SeedAccountKey, Stop[]][] = [
  [
    'u1',
    [
      ['m3-home', '/pages/home/index'],
      ['m4-my-admin', '/pages/my/index'],
      ['m5-inventory', '/pages/inventory/index'],
      ['m6-logs', '/pages/logs/index'],
      ['m7-staff', '/pages/staff/index'],
      ['x1-sales-home', `${sales}/home/index`],
      ['x2-orders', `${sales}/orders/index`],
      [
        'x3-order-pending',
        `${sales}/order-detail/index?id={o}`,
        { o: ['orders.no', 'SO-260929-018'] },
      ],
      [
        'x3-order-toship',
        `${sales}/order-detail/index?id={o}`,
        { o: ['orders.no', 'SO-260928-012'] },
      ],
      [
        'x3-order-shipped',
        `${sales}/order-detail/index?id={o}`,
        { o: ['orders.no', 'SO-260927-021'] },
      ],
      [
        'x3-confirm',
        `${sales}/order-form/index?mode=confirm&id={o}`,
        { o: ['orders.no', 'SO-260929-018'] },
      ],
      ['x4-order-new', `${sales}/order-form/index`],
      ['x5-afters', `${sales}/afters/index`],
      ['x6-after', `${sales}/after-detail/index?id={a}`, { a: ['afters.no', 'AS-260929-003'] }],
      ['x8-customers', `${sales}/customers/index`],
      ['x9-products', `${sales}/products/index`],
      ['x15-order-pick', `${sales}/order-pick/index`],
      ['h1-ship-home', `${ship}/home/index`],
      ['h2-ship-list', `${ship}/list/index`],
      ['h3-ship-toship', `${ship}/ship/index?id={o}`, { o: ['orders.no', 'SO-260928-012'] }],
      ['h3-ship-shipped', `${ship}/ship/index?id={o}`, { o: ['orders.no', 'SO-260928-030'] }],
      ['h4-delivery', `${ship}/delivery/index?id={o}`, { o: ['orders.no', 'SO-260928-030'] }],
      ['c1-buy-home', `${buy}/home/index`],
      ['c2-demand', `${buy}/demand/index`],
      ['c2-demand-invites', `${buy}/demand/index?tab=invites`],
      ['c3-pos', `${buy}/orders/index`],
      [
        'c4-po-007',
        `${buy}/order-detail/index?id={p}`,
        { p: ['purchase_orders.no', 'PO-260929-007'] },
      ],
      [
        'c4-po-006',
        `${buy}/order-detail/index?id={p}`,
        { p: ['purchase_orders.no', 'PO-260929-006'] },
      ],
      [
        'c4-po-004',
        `${buy}/order-detail/index?id={p}`,
        { p: ['purchase_orders.no', 'PO-260928-004'] },
      ],
      ['c5-po-new', `${buy}/order-form/index`],
      ['c9-invite', `${buy}/invite-detail/index?id={i}`, { i: ['invites.no', 'YQ-260929-001'] }],
      [
        'c9-invite-sub',
        `${buy}/invite-detail/index?id={i}`,
        { i: ['invites.no', 'YQ-260928-001'] },
      ],
      ['c8-suppliers', `${buy}/suppliers/index`],
      ['c10-supplier', `${buy}/supplier/index?id={s}`, { s: ['suppliers.name', '云岭花卉'] }],
      ['w1-wh-home', `${wh}/home/index`],
      ['w2-pending', `${wh}/pending/index`],
      ['w3-receive', `${wh}/receive/index?id={p}`, { p: ['purchase_orders.no', 'PO-260929-007'] }],
      ['w3-received', `${wh}/receive/index?id={p}`, { p: ['purchase_orders.no', 'PO-260928-004'] }],
      ['w11-stock', `${wh}/stock/index`],
      ['w12-material', `${wh}/material/index?id={m}`, { m: ['materials.name', '尤加利'] }],
      ['w13-moves', `${wh}/moves/index?materialId={m}`, { m: ['materials.name', '尤加利'] }],
      ['w5-out-new', `${wh}/doc-form/index?kind=out`],
      ['w8-stocktakes', `${wh}/stocktakes/index`],
      ['f1-fin-home', `${fin}/home/index`],
      ['f2-customers', `${fin}/customers/index`],
      ['f3-customer', `${fin}/customer/index?id={c}`, { c: ['customers.name', '晨曦花艺'] }],
      [
        'f-statement-new',
        `${fin}/statement-form/index?kind=customer&partyId={c}`,
        { c: ['customers.name', '晨曦花艺'] },
      ],
      [
        'f-statement-001',
        `${fin}/statement-detail/index?id={d}`,
        { d: ['statements.no', 'DZ-260929-001'] },
      ],
      [
        'f-statement-002',
        `${fin}/statement-detail/index?id={d}`,
        { d: ['statements.no', 'DZ-260929-002'] },
      ],
      [
        'f-statement-image',
        `${fin}/statement-image/index?id={d}`,
        { d: ['statements.no', 'DZ-260929-001'] },
      ],
      [
        'f-receive',
        `${fin}/receive/index?kind=customer&customerId={c}&statementId={d}`,
        { c: ['customers.name', '晨曦花艺'], d: ['statements.no', 'DZ-260929-001'] },
      ],
      ['f8-records', `${fin}/records/index`],
      [
        'f12-receipt',
        `${fin}/money/index?kind=receipt&id={r}`,
        { r: ['receipts.no', 'SK-260929-001'] },
      ],
      ['f5-suppliers', `${fin}/suppliers/index`],
      ['f6-supplier', `${fin}/supplier/index?id={s}`, { s: ['suppliers.name', '云岭花卉'] }],
      ['f9-methods', `${fin}/methods/index`],
    ],
  ],
  ['u4', [['c1-landing-purchase', `${buy}/home/index`]]],
  ['u5', [['w1-landing-warehouse', `${wh}/home/index`]]],
  [
    's1',
    [
      ['s1-shop', `${store}/shop/index`],
      ['s3-orders', `${store}/orders/index`],
      ['s6-order', `${store}/order-detail/index?id={o}`, { o: ['orders.no', 'SO-260929-018'] }],
      [
        's6-order-shipped',
        `${store}/order-detail/index?id={o}`,
        { o: ['orders.no', 'SO-260927-021'] },
      ],
      ['s7-afters', `${store}/afters/index`],
      ['s9-statement', `${store}/statement/index`],
      [
        's9-statement-detail',
        `${store}/statement-detail/index?id={d}`,
        { d: ['statements.no', 'DZ-260929-001'] },
      ],
      ['m4-my-store', '/pages/my/index'],
    ],
  ],
  [
    'p1',
    [
      ['p1-invites', `${sup}/invites/index`],
      ['p2-orders', `${sup}/orders/index`],
      ['p5-statement', `${sup}/statement/index`],
      ['m4-my-supplier', '/pages/my/index'],
    ],
  ],
]

const only = new RegExp(process.env.HZ_TOUR ?? '')

describe('页面巡览', () => {
  const ctx = setupMiniSuite()
  for (const [account, all] of tours) {
    const stops = all.filter(([name]) => only.test(`${account}-${name}`))
    if (!stops.length) continue
    it(`${account} 逐页截图`, { timeout: 600_000 }, async () => {
      const { mini, server } = ctx()
      await asMini(mini, server, account)
      for (const [name, template, ids = {}] of stops) {
        let path = template
        try {
          for (const [key, [lookup, value]] of Object.entries(ids))
            path = path.replace(`{${key}}`, await idBy(server.t, lookup, value))
          await enter(mini, path)
          const page = await mini.currentPage()
          await page?.waitFor(1500)
          await snap(mini, `${account}-${name}`)
        } catch (error) {
          process.stderr.write(`tour ${account} ${name} failed: ${String(error)}\n`)
        }
      }
    })
  }
})
