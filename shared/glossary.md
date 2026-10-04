# 术语表

代码里的业务名词只用这里的英文名（00 章第 11.1 节）。一个中文词对应一个英文名；状态、类型这类枚举码见 `src/enums.ts`，中文名见 `src/labels.ts`，这里不重复。新名词先加到这里再用。

| 中文                       | 英文                    | 说明                                           |
| -------------------------- | ----------------------- | ---------------------------------------------- |
| 账号                       | account                 | 员工、管理员、门店账号、供应商账号都是 account |
| 员工                       | staff                   | 含管理员时说 staff（接口「谁」里的 `staff`）   |
| 管理员                     | admin                   |                                                |
| 模块                       | module                  | 销售、发货、采购、仓库、财务                   |
| 当前账号（请求方）         | viewer                  | 守卫查出来的身份、归属、模块                   |
| 客户                       | customer                | 往来单位，对账按客户                           |
| 门店                       | store                   |                                                |
| 供应商                     | supplier                |                                                |
| 订单                       | order                   | 已发货的订单也叫发货单，代码里仍是 order       |
| 订单明细                   | order line              | 各种单据的明细都叫 line                        |
| 售后                       | after                   | 表名 `afters`                                  |
| 订货目录                   | catalog                 |                                                |
| 采购单                     | purchase order（po）    |                                                |
| 填报邀请                   | invite                  |                                                |
| 门店邀请                   | store invite            |                                                |
| 手工入库、手工出库、报损单 | warehouse doc（wh_doc） |                                                |
| 盘点                       | stocktake               |                                                |
| 库存批次                   | stock batch             |                                                |
| 出入库流水                 | stock move              |                                                |
| 收款                       | receipt                 |                                                |
| 付款                       | payment                 |                                                |
| 核销                       | allocation              |                                                |
| 预收                       | prepaid                 |                                                |
| 应收                       | receivable（ar）        |                                                |
| 应付                       | payable（ap）           |                                                |
| 已收、已付                 | received、paid          |                                                |
| 未收、未付                 | unpaid                  | 门店端「未付」和财务「未收」是同一个值（站在各自一边的叫法）         |
| 发货金额                   | shipped amount          |                                                |
| 单号                       | doc no（`no`）          |                                                |
| 发号                       | doc sequence            |                                                |
| 操作日志                   | operation log           |                                                |
| 变更记录、改单记录         | change                  | 订单 `order_changes`、采购单 `po_changes`      |
| 改价记录                   | price change            |                                                |
| 退货                       | return                  |                                                |
| 操作人                     | actor                   | 日志里的快照叫 `actorLabel`                    |
| 幂等键                     | idempotency key         |                                                |
| 主题（实时推送）           | topic                   |                                                |
| 在途                       | in transit              |                                                |
| 余量                       | left                    | `leftQty`                                      |
