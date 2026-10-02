# 05 接口清单

整理日期：2026-09-30。后端 NestJS，部署在微信云托管；小程序用 `wx.cloud.callContainer` 调用，实时推送用 `wx.cloud.connectContainer` 连 WebSocket。字段、枚举码、算法见 `04-data-model.md`。

## 1. 公共约定

本节落实 00 章第 2–5 节，和 00 章冲突时按 00 章。

### 1.1 接口契约

- 所有接口定义在 `shared/contract`，每个接口只定义一次：方法、路径、允许的角色、请求结构（Zod）、响应结构（Zod）、可能返回的错误码。本章是契约的文字版，写代码时以 `shared/contract` 为准，两者要一起改。
- 后端 controller 绑定契约：入参按请求结构校验，不通过返回 `VALIDATION_FAILED`；测试环境按响应结构校验出参，不符合就让测试失败。契约里有、后端没实现的接口，测试直接失败。
- 前端的请求方法从契约生成（`core/request` 按契约调用），参数和返回值都有类型。页面不手写路径，也不手写接口类型。
- 请求结构用 `shared` 里的枚举和字段规则拼出来（和表结构的 `pgEnum`、`CHECK` 引用同一份），前端表单即时提示用同一份。
- 契约按开发阶段增长：每个阶段先把本阶段要做的接口写进契约，再写实现；还没开始做的接口不进契约（08 章）。

### 1.2 调用方式

| 项 | 规则 |
|---|---|
| 路径 | `/api/v1/...`，REST；资源用复数，动作用子路径（例如 `POST /orders/:id/confirm`） |
| 身份 | 云托管注入 `X-WX-OPENID`，守卫按 `openid` 查 `accounts` 得到类型、模块、门店 ID、供应商 ID；查不到 → `UNAUTHENTICATED`，账号停用 → `ACCOUNT_DISABLED`。不用 JWT。门店账号每次请求还要查 `stores.enabled`，供应商账号查 `suppliers.enabled`，停用就返回 `ACCOUNT_DISABLED`（登录、绑定同样）；客户停用不影响登录（03 章第 5 节）。服务只接受云托管转发的请求，公网访问要关掉，否则请求头可以伪造 |
| 权限 | 两层：守卫按契约里的「允许角色」放行（下表「谁」列）；service 按数据归属过滤（门店只看本店，供应商只看本家），查不到一律 `NOT_FOUND`。例外：供应商填报分享链接被别家供应商或非供应商账号打开时返回 `FORBIDDEN`（第 8 节） |
| 幂等 | 新建类（下单、登记收款、付款、手工出入库等）带 `X-Idempotency-Key`（前端每次打开表单生成一个 UUID），重复提交返回上次结果；保留 `IDEMPOTENCY_TTL_HOURS` |
| 请求 ID | 每个响应头带 `X-Request-Id`，`INTERNAL` 错误页显示，方便查云托管日志 |

### 1.3 统一字段

字段名、ID、单号、金额、数量、业务日期、时间戳、状态、空值、列表、版本号的格式见 00 章第 3 节，本章不重复。05 只补下面几项：

| 内容 | 格式 | 说明 |
|---|---|---|
| 分页参数 | `?cursor=&limit=`，默认 `PAGE_SIZE`，最大 `PAGE_SIZE_MAX` | 游标是最后一条的排序键加 id，编码后下发；没有下一页时 `nextCursor` 为 `null` |
| 列表级操作 | 列表响应顶层多一个 `actions`，即 `{ items, nextCursor, actions, counts }` | 见 1.5 |
| 状态计数 | 带状态筛选的列表顶层多 `counts: { [status]: number }`，只含等待类状态（`shared` 状态表里颜色为等待的，例如 `pending_confirm`、`to_ship`、`to_receive`、`pending`）；按除 `status`、`cursor`、`limit` 外的同样条件计数；列表里没有等待类状态的返回 `{}` | 筛选栏状态分段的数量（02 章第 4 节 `hz-filter-bar`，2026-10-01 确认）；实时推送后随列表一起重新拉 |
| 日期筛选 | 列表的日期筛选统一 `?from=&to=`（业务日期，两头都含），都不传 = 全部；`to` 早于 `from` → `VALIDATION_FAILED` | 今天、近 7 天、本月由前端按 `Asia/Shanghai` 换成起止日期再传 |
| 单据级操作 | 详情和列表项带 `actions: { code, enabled, disabledReason, reasonRequired }[]`、`lockedReason: string \| null` | 见 1.5 |

### 1.4 响应和错误码

响应格式、错误码和 HTTP 状态的对应、`shared/errors` 见 00 章第 4 节，本章不重复。05 只补充：

- `ACCOUNT_DISABLED` 的 `message` 分账号停用、门店停用、供应商停用三种，文案在 `shared/copy`。
- `FORBIDDEN` 另用于供应商填报链接被别家或非供应商账号打开（第 8 节）；员工已可读的单据若取消 / 作废 / 撤回不属本人，也返回 `FORBIDDEN` 并显示「请找管理员」。门店 / 供应商越权读取或提交别家对象、员工读取别人的私有日志等仍是 `NOT_FOUND`（1.2），区分可读但不可操作与根本不可见。
- `VALIDATION_FAILED` 的 `fields` 键是字段路径，明细行写 `lines.0.qty`。
- `STALE` 的 `latest` 是最新详情，含新的 `actions`、`lockedReason`。
- 每个接口可能返回的错误码定义在 `shared/contract`；下文各接口的「校验和错误」列是它的文字版。

### 1.5 `actions` 和 `lockedReason`

- 每张单据的详情接口和列表项都返回：
  - `actions`：当前账号在这张单上能看到的操作按钮，`[{ code, enabled, disabledReason, reasonRequired }]`，例如 `[{ "code": "confirm", "enabled": false, "disabledReason": "门店已停用，启用后才能确认", "reasonRequired": false }, { "code": "cancel", "enabled": true, "disabledReason": null, "reasonRequired": false }]`。
    - `enabled`：`true` 可点；`false` 显示成禁用，原因写在 `disabledReason`（文案在 `shared/copy`），`enabled` 为 `true` 时 `disabledReason` 为 `null`。
    - `reasonRequired`：提交时是否必须写原因，前端据此决定弹层里要不要原因框；只是打开页面或表单、这一步不提交的操作为 `null`。
  - `lockedReason`：需要写状态提示时的一句话（例如「已全部退货」），可以和 `actions` 同时出现，没有为 `null`。
- 不在 `actions` 里 = 这个账号现在看不到这个按钮；在里面但 `enabled: false` = 显示禁用。能不能换供应商也用操作码表达（`changeSupplier` 在不在列表里），不另加布尔字段。
- 两者都是查询时由后端按「账号角色 + 数据归属 + 单据当前状态」算出来的，不存库（04 第 8.1 节）。同一个判断函数同时用于算 `actions` 和写接口的前置校验，不写两份。
- 前端按 00 章第 1 节显示，不根据状态自己推算；只和本页输入有关的条件（例如还没勾选花材）由前端自己禁用。
- `actions` 只判断打开页面时就能判断的前提（状态、有没有有效核销、门店是否启用、单据来源、归属人等）。和提交内容有关的规则（数量上限、单价只能改低、实发和订单数量不一致要写发货备注、售后损坏和品质问题要带图片、收货改了单价要写原因）在提交时校验，返回 `VALIDATION_FAILED` 或 `BUSINESS_RULE`。
- 写接口不信任前端：提交时按同一前提再判断一次。没有这个操作 → `STALE`（`latest` 带最新的 `actions`）或 `BUSINESS_RULE`；`reasonRequired: true` 却没写原因 → `VALIDATION_FAILED`（`fields.reason`）。
- 操作码是 `shared` 里的枚举，中文按钮名在 `shared/copy`。
- 视图边界（2026-10-02 交叉审查确认）：发货列表、待办、专用详情和发货提交返回值使用无金额投影，管理员和多模块员工也一样；嵌套变更记录、错误 `latest` 不得泄漏单价、金额。财务售后专用只读详情恒为 `actions: []`，不因兼有销售权限返回作废按钮；普通销售视图仍按权限并集。
- 单据级和列表级：单据级 `actions` 在详情接口和列表项里，说的是「对这张单能做什么」，列表项的和详情一致，列表页一般只用它决定卡片上的标记，不放按钮。列表级 `actions` 在列表接口的顶层（和 `items` 同级），说的是「在这个列表上能做什么」（新建、邀请），决定底栏按钮。两者用同一个对象结构，都由后端按账号算，前端不按角色判断。
- 只读的单据（手工出库、报损、盘点、已结束的单据）`actions` 为 `[]`。

列表级操作码（`reasonRequired` 都为 `null`）：

| 操作码 | 按钮 | 接口 | 谁 |
|---|---|---|---|
| `create` | 新建订单 | `GET /orders` | 销售 |
| `create` | 新建门店 | `GET /customers` | 销售 |
| `createCustomer` | 新建客户 | `GET /customers` | 销售 |
| `create` | 新建产品 | `GET /products` | 销售 |
| `manageCategories` | 管理分类 | `GET /products` | 销售 |
| `create` | 新建采购单 | `GET /purchase-orders` | 采购 |
| `create` | 新建供应商 | `GET /suppliers` | 采购 |
| `create` | 新建入库、新建出库、新建报损 | `GET /warehouse/docs?kind=` | 仓库 |
| `create` | 新建盘点 | `GET /stocktakes` | 仓库 |
| `create` | 新建花材 | `GET /materials` | 仓库 |
| `create` | 新增员工 | `GET /staff` | 管理员 |
| `inviteSupplier`、`createPo` | 邀请供应商、生成采购单 | `GET /purchase/demand` | 采购 |
| `stockIn`、`stockOut` | 手工入库、手工出库 | `GET /materials/:id`（花材详情） | 仓库 |
| `registerReceipt` | 登记收款 | `GET /finance/customers/:id`（客户对账），只在这一处 | 财务 |
| `registerPayment`、`allocatePrepaid` | 登记付款、核销预付（预付 > 0 且有待付时才有） | `GET /finance/suppliers/:id`（供应商对账），只在这一处 | 财务 |
| `copyCatalog` | 从其他客户复制 | `GET /catalog/:customerId`，只在这个客户目录为空时有 | 销售 |
| `createAfter` | 新建售后 | `GET /afters`（客户售后） | 销售 |
| `applyAfter` | 申请售后 | `GET /afters`（门店售后） | 门店 |

单据级操作码总表（出现条件对应 03 章第 5 节；「—」表示不适用）：

| 操作码 | 按钮 | 单据 | 谁 | 出现条件 | `enabled: false` 的条件和 `disabledReason` | `reasonRequired` | 不出现时的 `lockedReason` |
|---|---|---|---|---|---|---|---|
| `storeEdit` | 修改订单 | 订单 | 门店 | 待确认 | 客户停用：「这个客户已停用，不能再修改订单，请联系花众」 | `false` | 待发货：「销售已确认，如需修改请联系花众销售」 |
| `storeCancel` | 取消订单 | 订单 | 门店 | 待确认 | — | `false` | 同上 |
| `applyAfter` | 申请售后 | 订单 | 门店 | 已发货，至少一行可申请数量 > 0 | 过了售后申请期限（04 第 8 节）：「已超过售后申请时间，请联系花众销售」 | `null` | 「这张订单的产品都已申请过售后」 |
| `confirm` | 确认订单（弹层里选出货日期） | 订单 | 销售 | 待确认 | 按顺序取第一条：门店停用「门店已停用，启用后才能确认」；客户停用「客户已停用，启用后才能确认」；单里有已停用的产品「白绿清新花束已停用，请修改并确认或取消订单」（按实际产品名，多个用「、」连） | `false` | — |
| `editAndConfirm` | 修改并确认 | 订单 | 销售 | 待确认 | 门店停用、客户停用，文案同 `confirm`（有已停用产品时照常可点，进表单删掉） | `true` | — |
| `edit` | 修改订单 | 订单 | 销售 | 待发货 | 有待处理的取消申请：「门店申请取消，请先同意或拒绝」 | `true` | — |
| `cancel` | 取消订单 | 订单 | 销售 | 待确认或待发货，没有待处理的取消申请 | 不是归属人（03 章第 2 节）：「这张单由 … 经办，请找管理员」 | 待确认 `false`，待发货 `true` | — |
| `requestCancel` | 申请取消 | 订单 | 门店 | 待发货、没有待处理的申请 | — | `false`（原因选填） | 被拒绝过：「取消申请已被拒绝，请联系花众销售」 |
| `withdrawCancel` | 撤回取消申请 | 订单 | 门店 | 有待处理的申请 | — | `false` | — |
| `approveCancel` | 同意取消 | 订单 | 销售 | 待发货、有待处理的申请 | 不是归属人：同 `cancel` | `false` | — |
| `rejectCancel` | 拒绝取消 | 订单 | 销售 | 同上 | 同上 | `true` | — |
| `voidOrder` | 作废订单 | 订单 | 销售 | 已发货 | 不是归属人：同 `cancel`；有有效核销：「已有收款核销，请先由财务撤回」；有待处理、已处理的售后：「请先关闭或作废这张单的售后」 | `true` | — |
| `createAfter` | 新建售后 | 订单 | 销售 | 已发货，至少一行可申请数量 > 0 | — | `null` | 同 `applyAfter` |
| `ship` | 确认发货 | 订单 | 发货 | 待发货 | 出货日期晚于今天：「出货日期还没到，不能发货」 | `false` | — |
| `processAfter` | 处理售后 | 售后 | 销售 | 待处理 | — | `false` | — |
| `closeAfter` | 关闭售后 | 售后 | 销售 | 待处理 | — | `true` | — |
| `voidAfter` | 作废售后 | 售后 | 销售 | 已处理 | 不是处理它的销售：同 `cancel` | `true` | — |
| `allocate` | 核销预收 | 客户对账 | 财务 | 客户预收 > 0 且有未收的发货单 | — | `false` | — |
| `voidReceipt` | 作废收款 | 收款 | 财务 | 有效 | 不是登记人：同 `cancel`；有有效退款：「请先作废这笔的退款」 | `true` | — |
| `revokeAllocation` | 撤回核销 | 收款、付款里的一条核销 | 财务 | 所属收付款有效、核销未撤回（生效 0 也有） | 不是这条核销的登记人：同 `cancel` | `true` | — |
| `refundReceipt` | 登记预收退款 | 收款 | 财务 | 有效、预收 > 0 | — | `false` | — |
| `refundPayment` | 登记预付退款 | 付款 | 财务 | 有效、预付 > 0 | — | `false` | — |
| `voidRefund` | 作废退款 | 退款 | 财务 | 有效 | 不是登记人：同 `cancel` | `true` | — |
| `editPo` | 修改采购单 | 采购单 | 采购 | 待收货 | — | `true` | 已收货：「已收货，采购不能再修改」 |
| `changeSupplier` | 换供应商（修改表单里的供应商可选） | 采购单 | 采购 | 待收货、手工下的单；填报生成的没有 | — | `null`（随修改采购单一起提交） | — |
| `cancelPo` | 取消采购单 | 采购单 | 采购 | 待收货 | 不是归属人：同 `cancel` | `true` | 同 `editPo` |
| `supplierEditPo` | 修改采购单 | 采购单 | 供应商 | 待收货、本家填报生成 | — | `false`（原因选填） | 已收货：「仓库已收货，不能再修改」 |
| `supplierCancelPo` | 取消采购单 | 采购单 | 供应商 | 同上 | — | `true` | 同上 |
| `receive` | 确认收货 | 采购单 | 仓库 | 待收货 | — | `false` | — |
| `return` | 退货 | 采购单 | 仓库 | 已收货、没全部退货 | — | `false` | 全部退货：「已全部退货」 |
| `reprice` | 改单价 | 采购单、手工入库单 | 仓库 | 采购单已收货且未全部退货、手工入库单已入库 | — | `true` | 全部退货：「已全部退货」；已作废：「已作废，不能再改单价」 |
| `voidPo` | 作废采购单 | 采购单 | 仓库 | 已收货 | 不是收货人：同 `cancel`；有有效核销：「已有付款核销，请先由财务撤回」 | `true` | — |
| `void` | 作废 | 手工入库单、手工出库、报损 | 仓库 | 已入库、已出库、已报损 | 不是录的人：同 `cancel`；手工入库有有效核销：同 `voidPo` | `true` | 已作废：「已作废」 |
| `voidPayment` | 作废付款 | 付款 | 财务 | 有效 | 同 `voidReceipt` | `true` | — |
| `editInvite` | 修改邀请 | 填报邀请 | 采购 | 待填报 | — | `false` | — |
| `cancelInvite` | 取消邀请 | 填报邀请 | 采购 | 待填报 | 不是发邀请的人：同 `cancel`（管理员除外） | `false` | — |
| `shareInvite` | 发送填报链接 | 填报邀请 | 采购 | 待填报 | — | `null` | — |
| `submitSupply` | 提交填报 | 填报邀请 | 供应商 | 待填报、发给本家 | — | `false` | 已提交、已取消：「这次邀请已提交或已取消」 |
| `inviteStore` | 邀请门店下单 | 门店 | 销售 | 门店启用 | 没录登录手机号：「请先在门店资料里填写登录手机号」；门店账号已绑定微信：「这家门店账号已绑定微信，请联系销售解绑」 | `null` | — |
| `unbindStoreWechat` | 解绑微信 | 门店 | 销售、管理员 | 门店账号已绑定微信 | — | `false` | — |
| `unbindStaffWechat` | 解绑微信 | 员工 | 管理员 | 员工已绑定微信 | — | `false` | — |

`reasonRequired` 的规则只有一个来源：03 章第 5 节「原因」列。必填的为 `true`；不用原因或只在特定输入下才要（收货改了单价、少发写备注）的为 `false`，后者在提交时校验。

### 1.6 业务参数（`shared/config`）

业务参数只在 `shared/config` 定义，前后端引用同一份。规格书各章正文只写配置名，不写数字（07 章断言里的数字按这里的初始值）；下表是初始值，要改只改配置。

| 配置名 | 初始值 | 用在哪 |
|---|---|---|
| `PAGE_SIZE` | 20 | 列表默认每页条数 |
| `PAGE_SIZE_MAX` | 50 | 列表 `limit` 上限 |
| `TODO_PREVIEW_COUNT` | 3 | 模块首页待办预览条数 |
| `DEMAND_DEFAULT_DAYS` | 7 | 采购需求默认区间（含今天） |
| `STORE_INVITE_TTL_DAYS` | 7 | 门店邀请有效期 |
| `STORE_INVITE_TOKEN_BYTES` | 32 | 门店邀请随机 token 长度 |
| `AFTER_IMAGE_MAX_COUNT` | 3 | 每行售后图片张数上限 |
| `AFTER_APPLY_DAYS` | 7 | 门店售后申请期限：实际发货那天再加几天（阶段 3 确认） |
| `SHIP_DATE_DEFAULT_OFFSET_DAYS` | 1 | 销售确认订单、新建订单时出货日期默认今天往后几天（默认明天） |
| `IMAGE_MAX_BYTES` | 3MB | 售后图片、产品图单张上限 |
| `IMAGE_MIME_TYPES` | jpg、png、webp | 允许上传的图片格式 |
| `UPLOAD_TICKET_TTL_MINUTES` | 10 | COS 上传签名有效期 |
| `FILE_URL_TTL_MINUTES` | 60 | 图片临时读取地址有效期 |
| `IDEMPOTENCY_TTL_HOURS` | 24 | 幂等键保留时间 |
| `WS_PING_INTERVAL_SECONDS` | 25 | WebSocket 心跳间隔 |
| `WS_IDLE_TIMEOUT_SECONDS` | 60 | 没收到心跳就断开 |
| `DOC_NO_FORMAT` | `前缀-YYMMDD-三位序号` | 单号格式 |
| `MATERIAL_CODE_PREFIX` | `HC-` | 花材编码默认前缀 |
| `REQUEST_TIMEOUT_MS` | 10000 | 小程序请求超时 |
| `READ_RETRY_COUNT` | 1 | 读请求网络失败时自动重试次数；写请求不重试 |
| `RECONNECT_DELAYS_SECONDS` | 1、2、5、10、30 | WebSocket 和服务端 `LISTEN` 断线后依次等待的秒数，之后一直按最后一个 |
| `SKELETON_DELAY_MS` | 300 | 首次加载多久没回来才出骨架屏 |
| `SUBMIT_SPINNER_DELAY_MS` | 800 | 提交多久没回来按钮里加转圈 |
| `SEARCH_DEBOUNCE_MS` | 300 | 搜索框输入停多久再查 |
| `TOAST_DURATION_MS` | 1500 | 成功提示停留时间 |

### 1.7 事务约定

下文「锁」列用简写：

- **条件更新**：`UPDATE … SET …, version=version+1 WHERE id=? AND version=? AND status IN (…)`，影响 0 行 → `STALE`。
- **行锁**：`SELECT … FOR UPDATE`。一次锁多行时按 `id` 升序加锁，避免死锁。
- **批次扣减**：锁 `stock_batches WHERE material_id=? AND left_qty>0 ORDER BY in_date, id FOR UPDATE`，按先进先出扣；指定来源单据的先扣本单批次。
- 每个写事务里同时写 `operation_logs`；事务提交后发 `NOTIFY hz_changes`（第 12 节）。
- 事务、日志、幂等、版本号复查、实时通知由公共层统一处理，业务代码不重复写（00 章第 6 节）。

下文每个接口只写要点。「日志」列写 `operation_logs.action`；「推送」列写第 12 节的主题；详情接口写 `actions` 的取值范围。

## 2. 登录绑定

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `POST /auth/bind-phone` | 任何 openid（可未绑定） | `{ code }`（`getPhoneNumber` 返回的动态令牌）→ 当前账号（同 `/me`） | 这个 openid 已经绑了账号 → 直接返回当前账号（停用照常返回 `ACCOUNT_DISABLED`）；后端经云托管开放接口服务换手机号，令牌无效或过期 → `BUSINESS_RULE`「手机号验证失败，请重试」；找不到启用的预录账号 → `BUSINESS_RULE`「这个手机号还没开通，请联系花众管理员」；账号、门店、供应商停用 → `ACCOUNT_DISABLED`（门店停用 message「这家门店已停用，请联系花众」，供应商同理）；这个手机号的账号已绑别的微信 → `BUSINESS_RULE`「这个账号已绑定其他微信，请联系管理员解绑」 | 行锁账号；写 `bound_at`；日志「绑定微信」 |
| `GET /store-invites/:token` | 任何 openid（可未绑定） | → `{ storeLabel, status, expiresAt, binding, boundLabel }`（打开邀请页时显示是哪家门店）；`binding`：这台微信没绑账号 `none`、已是这家门店的账号 `self`、绑了别的账号 `other`；`boundLabel` 在 `other` 时是那个账号的名字（员工是姓名，外部账号是「姓名（组织）」），其余为 `null` | token 不存在 → `NOT_FOUND`；已使用、已过期、已作废 → 返回状态，前端写「邀请已失效，请联系花众销售重新发送」 | — |
| `POST /store-invites/:token/use` | 任何 openid（可未绑定） | `{ code }`（手机号快速验证令牌）→ 当前账号（同 `/me`） | 这台微信已是这家门店的账号 → 直接返回当前账号，邀请不变；绑了别的账号 → `BUSINESS_RULE`「这台微信已登录李敏，请先在「我的」退出登录再接受邀请」（按实际账号名字），不解绑、邀请不变；邀请 `pending` 且没过期，否则 `BUSINESS_RULE`「邀请已失效，请联系花众销售重新发送」；门店停用 → `ACCOUNT_DISABLED`「这家门店已停用，请联系花众」；换出的手机号和门店账号登录手机号不一致 → `BUSINESS_RULE`「手机号和门店登记的不一致，请用登记的手机号验证」；门店账号已绑定微信 → `BUSINESS_RULE`「这家门店账号已绑定微信，请联系销售解绑」 | 行锁邀请 + 账号；写 `openid`、`bound_at`；邀请改 `used`、写 `bound_account_id`、`bound_at`；日志「门店接受邀请」；推送 `store_invites:<storeId>` |
| `GET /me` | 已绑定 | → `{ id, type, name, phone, orgLabel, storeId, supplierId, modules, landing, menus }`，取值见下表 | — | — |
| `POST /auth/unbind` | 任何 openid（含停用的账号） | `{}` → `{}`：解绑自己这台微信 | 这个 openid 没绑账号 → 直接返回 `{}` | 清空 `openid`、`bound_at`；日志「解绑微信」（公共）；推送 `account:<id>`（本人连接断开） |

退出登录 = 解绑：「我的 → 退出登录」和停用页的「退出登录」都调 `POST /auth/unbind` 清空 openid，下次进来重新手机号验证；停用的账号也能退出，所以这个接口只看 openid，不经过停用检查。员工的微信由管理员在员工弹层里解绑（`POST /staff/:id/unbind-wechat`，第 3 节）；门店账号由销售或管理员在门店资料里解绑（`POST /stores/:id/unbind-wechat`）。

绑定、解绑、新增员工、修改员工的日志 `module` 为 `NULL`（公共），`kind`「账号」，`target_type` `accounts`，`target_label` 是账号名字；绑定微信的操作人是被绑定的账号本人。

`GET /me` 返回字段：

| 字段 | 取值 |
|---|---|
| `type` | `admin`、`staff`、`store`、`supplier` |
| `phone` | 登录手机号（「我的 → 个人资料」显示） |
| `orgLabel` | 门店账号「客户 · 门店」，供应商账号是供应商名称，员工和管理员为 `null` |
| `storeId`、`supplierId` | 门店、供应商账号的归属 ID，其他为 `null` |
| `modules` | 有权限的模块码数组（`sales`、`shipping`、`purchase`、`warehouse`、`finance`）：管理员全部五个；员工取 `account_modules`；门店、供应商为 `[]` |
| `landing` | `store_home`（门店 → 门店首页 S0）；`supplier_home`（供应商 → 供应商首页 P0）；`module:<key>`（只有一个模块的员工 → 该模块首页）；`home`（管理员和多模块员工 → 花众首页 M3） |
| `menus` | 「我的」里的入口码数组，前端按顺序显示：员工 `inventory`（没有仓库模块权限时才有）、`logs`；管理员 `logs`、`staff`；门店、供应商为 `[]`（售后、对账从各自首页进，入口固定） |

首页导航和业务权限仍取 `GET /me.modules`。操作日志页单独取 `GET /logs.filterModules`（员工本人非公共历史涉及的模块，管理员全部模块），多于一项时显示筛选；调岗后历史模块与当前岗位不再等价，不沿用原先「去掉日志模块筛选字段」的实现。

## 3. 公共

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /modules/:key/todos` | 有该模块权限 | → `{ count, items[] (最多 `TODO_PREVIEW_COUNT` 条卡片) }`；销售 = 待确认订单 + 待处理售后；发货 = 出货日期不晚于今天的待发货（按出货日期升序）；采购 = 待填报邀请；仓库 = 待收货；财务 = 待付款单据 + 有预收的客户 | — | 订阅 `todo:<key>` |
| `GET /badges` | 已绑定 | → 底栏角标：门店购物车不算（前端本地）、供应商待填报数、各模块待办数 | — | 订阅 `todo:*` |
| `GET /inventory` | 所有员工 | `?q=&categoryId=&cursor=&limit=` → 列表，项 `{ id, code, name, categoryId, categoryName, unit, enabled, stockQty }`；全部花材（含库存 0、含停用），按编码升序分页；`q` 匹配名称或编码；`stockQty` = 批次 `left_qty` 合计；列表级 `actions` 为 `[]` | — | 订阅 `stock` |
| `GET /logs` | 员工、管理员 | `?module=&from=&to=&cursor=&limit=` → 列表 + `filterModules[]`（本人全部非公共历史操作涉及的模块，管理员为全部模块），项 `{ id, createdAt, module, kind, action, targetLabel, actorLabel }`（`module` 为 `null` 是公共）；按时间倒序；`from`、`to` 按上海日期筛 `created_at` | 员工始终加 `created_by=本人 AND module IS NOT NULL`，包括调岗前操作；传 `module` 只加筛选，不撤掉本人条件，不按当前岗位拒绝历史模块（2026-10-02 交叉审查确认）；管理员看全部含公共 | — |
| `GET /logs/:id` | 同上 | → 列表项字段 + `{ reason, before, after }` | 员工读不是自己做的操作（含公共）→ `NOT_FOUND` | — |
| `GET /staff` | 管理员 | `?cursor=&limit=` → 列表，项 `{ id, version, name, phone, admin, modules, enabled, actions }`（不含门店、供应商账号），按新增先后；项 `actions` 只可能有 `unbindStaffWechat`；列表级 `actions` 含 `create` | — | — |
| `POST /staff` | 管理员 | `{ name, phone, admin, modules[] }` → 列表项 | 名字必填「请填写名字」；手机号「请填写 11 位登录手机号」；不是管理员时至少一个模块「请至少选一个模块」；管理员的 `modules` 不存（默认全部）；手机号在启用账号里重复 → `VALIDATION_FAILED` `fields.phone`「这个手机号已经被其他账号使用」 | 日志「新增员工」（公共） |
| `PATCH /staff/:id` | 管理员 | `{ version, name, phone, admin, modules[], enabled }` → 列表项 | 同新增；不能停用或降级最后一个启用的管理员 → `BUSINESS_RULE`「至少要保留一个启用的管理员」；内容没变 → `BUSINESS_RULE`「没有修改内容」；版本变了 → `STALE`「这个员工刚被修改，已刷新成最新内容」 | 条件更新；改了手机号或停用时同时清空 `openid`、`bound_at`，日志原因写「同时解绑微信」；日志「修改员工」（公共，记前后）；推送 `account:<id>` |
| `POST /staff/:id/unbind-wechat` | 管理员 | `{ version }` → 列表项 | 员工已绑定微信，否则 `STALE`「这个员工还没绑定微信」 | 条件更新；清空 `openid`、`bound_at`；日志「解绑微信」（公共）；推送 `account:<id>`（对方连接断开） |

## 4. 销售

订单确认、修改并确认、销售建单、待发货改单、取消 / 同意取消、发货都在提交后通知 `demand`；产品配方修改（含目录弹层共用配方）也通知 `demand`。只变金额、不变数量 / 状态 / 出货日期 / 配方的修改不必引发需求变化。回滚不推送，需求页不需要手动同步按钮。

订单、售后接口门店端、发货、财务也会读，读的范围按角色过滤（门店只看本店）。写接口的「谁」严格按下表。

| 接口 | 谁 | 入参 → 出参 | 校验和错误（前提见 03 章第 5 节） | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /orders` | 销售、财务、门店（本店） | `?status=&customerId=&from=&to=&q=&cursor=`（`from`、`to` 按下单日期）→ 卡片列表（金额、总数、`shipDate`（待确认为 `null`）、`changed`、`repriced`、`cancelRequested`、`shortShipped`、`overShipped`，每项带 `actions`、`lockedReason`）；`status` 另可传 `cancel_requested`（待发货且有待处理的取消申请），`counts` 含它；列表级 `actions` ⊆ `create`（销售） | 纯发货账号不能走这个金额视图，使用第 6 节专用接口 | 订阅 `orders` |
| `GET /orders/:id` | 同上 | → 详情：明细（每行 `priceCents`、`listPriceCents`（下单时的目录价，和 `priceCents` 不同即「改价」）、`discontinued`（目录里停用或产品本身停用为 `true`，门店改单、销售改单时标「已停用」）；已发货的另带 `shippedQty`、`maxQty`（可申请售后数量））、变更记录、取消申请记录（状态、门店原因、拒绝原因、时间）、发货信息、取消原因、作废原因、`version`；已发货的带售后列表，门店端另带这张发货单的生效核销（日期、金额）；发货视图使用第 6 节专用详情，普通视图按销售 / 财务 / 门店权限校验；`actions` ⊆ 门店 `storeEdit`、`storeCancel`、`requestCancel`、`withdrawCancel`、`applyAfter`，销售 `confirm`、`editAndConfirm`、`edit`、`cancel`、`approveCancel`、`rejectCancel`、`voidOrder`、`createAfter`，财务 `[]`（多模块普通视图按权限并集；发货操作在专用视图）；门店或客户停用时 `confirm`、`editAndConfirm` 为 `enabled: false`，有已停用产品时 `confirm` 为 `enabled: false`（文案见 1.5）；`cancel` 的 `reasonRequired` 待确认 `false`、待发货 `true` | 不属于你 → `NOT_FOUND` | 订阅 `order:<id>` |
| `POST /orders` | 销售 | `{ customerId, storeId, shipDate, note, lines[{productId, qty, priceCents}] }` + 幂等键 → 新订单（`to_ship`） | 客户启用，否则 `BUSINESS_RULE`「这个客户已停用，不能再下新单」；门店属于客户且启用；产品本身启用、在该客户目录里且启用；出货日期必填、可早于今天；下单日期由服务端写今天，不接受传入；`qty>0`、`priceCents>=0` | 发号 SO；日志「新建订单」；推送 `orders`、`todo:shipping`、`demand` |
| `POST /orders/:id/confirm` | 销售 | `{ version, shipDate }` | 状态 `pending_confirm`；门店启用，否则 `BUSINESS_RULE`「门店已停用，启用后才能确认」；客户启用，否则「客户已停用，启用后才能确认」；单里没有已停用的产品，否则「白绿清新花束已停用，请修改并确认或取消订单」；`shipDate` 必填、可早于今天，缺 → `VALIDATION_FAILED` `fields.shipDate`「请选择出货日期」 | 条件更新；写 `ship_date`（不写 `order_changes`）；日志「确认订单」（记出货日期）；推送 `order:<id>`、`orders`、`todo:sales`、`todo:shipping`、`demand` |
| `PUT /orders/:id` | 销售 | `{ version, shipDate, note, reason, lines[] }` → 详情 | 状态 `pending_confirm`（修改并确认，P5，保存后 `to_ship`）或 `to_ship`（修改订单）；原因必填；`shipDate` 必填、可早于今天；内容没变 → `BUSINESS_RULE`「没有修改内容」；`pending_confirm` 时门店、客户须启用；明细里还有已停用的产品 → `BUSINESS_RULE`「白绿清新花束已停用，请先删掉再保存」；新加的行产品须启用、在该客户目录里且启用；原有行保持原单价 | 条件更新；整组替换明细；有差异写 `order_changes`（`pending_confirm` 时出货日期从空到有不算差异）；日志「修改并确认订单」/「修改订单」（前后）；推送同上 |
| `POST /orders/:id/cancel` | 销售（归属人） | `{ version, reason? }` | 状态 `pending_confirm`（原因不用）或 `to_ship`（原因必填，缺 → `VALIDATION_FAILED fields.reason`）；有待处理的取消申请 → `STALE`「门店申请取消，请先同意或拒绝」；不是归属人 → `FORBIDDEN`「这张单由 … 经办，请找管理员」；弹窗打开后被确认：前端拿到 `STALE`，`latest` 里 `cancel` 的 `reasonRequired` 变成 `true`，改成要原因 | 条件更新；日志「取消订单」；推送 `order:<id>`、`orders`、`todo:*`、`demand` |
| `POST /orders/:id/cancel-request/approve` | 销售（归属人） | `{ version }` | 订单 `to_ship`、申请 `pending`；已发货 → `STALE`「已发货，取消申请已失效」；门店已撤回 → `STALE` | 行锁订单 + 条件更新；申请 `approved`，订单 `cancelled`、`version` +1，`cancel_reason`「门店申请取消」+ 门店原因；日志「同意取消申请」；推送 `order:<id>`、`orders`、`todo:shipping`、`demand` |
| `POST /orders/:id/cancel-request/reject` | 销售（归属人） | `{ version, reason }` | 申请 `pending`；原因必填 | 行锁订单；申请 `rejected`、写 `reject_reason`；订单 `version` +1；日志「拒绝取消申请」；推送 `order:<id>`、`orders` |
| `POST /orders/:id/void` | 销售（归属人） | `{ version, reason }` | 状态 `shipped`；有有效核销 → `BUSINESS_RULE`「已有收款核销，请先由财务撤回」；有 `pending`、`processed` 售后 → `BUSINESS_RULE`「请先关闭或作废这张单的售后」；原因必填 | 行锁客户 + 订单（和登记收款、核销预收、申请售后互斥）；写 `void_*`；日志「作废订单」；推送 `order:<id>`、`orders`、`ar:<customerId>` |
| `GET /afters` | 销售、门店（本店）、财务 | `?status=&customerId=&from=&to=&cursor=` → 卡片（已关闭、已作废不带金额）；列表级 `actions` ⊆ 销售 `createAfter`，门店 `applyAfter` | | 订阅 `afters` |
| `GET /afters/:id` | 同上 | → 详情：明细（每行同时返回门店原始申请数量 `requestedQty` 和售后数量 `qty`；销售新建的 `requestedQty` 为 `null`；每行另带 `maxQty`（排除本张后的可申请数量）、`shipPriceCents`（发货单价，售后单价只能改低））、问题说明、图片签名地址、处理说明、关闭 / 作废原因；`actions` ⊆ 销售 `processAfter`、`closeAfter`、`voidAfter`，财务、门店 `[]`；`notice`：提示条文案（已处理时「发货单应收已减去售后金额」），没有为 `null` | | 订阅 `after:<id>` |
| `POST /afters` | 销售 | `{ orderId, note, lines[{orderLineId, qty, priceCents, reason, description}] }` + 幂等键 → `processed` | 订单 `shipped`，不看售后申请期限；`qty>0` 且 ≤ 可申请数量；`priceCents` ≤ 发货单价；每行 `reason` 必选，`description` 选填，不收图片 | 行锁客户 → 订单（统一账本锁序）；发号 AS；写 `amount_cents`，`requested_qty` 为空；日志「新建售后」；推送 `afters`、`order:<orderId>`、`ar:<customerId>` |
| `POST /afters/:id/process` | 销售 | `{ version, note, lines[{id, qty, priceCents}] }` | 状态 `pending`；门店提交的只能改 `qty`、`priceCents`，`requestedQty` 不覆盖，传了新增或删除行 → `BUSINESS_RULE`「门店提交的售后只能改数量和单价」，传了原因、说明、图片忽略；`qty>=0`，全 0 → `BUSINESS_RULE`「数量都是 0，整张不处理请关闭售后并写原因」；`qty` ≤ 可申请数量（排除本张）；单价只能改低 | 行锁客户 → 订单 → 售后 + 条件更新；日志「处理售后」（前后）；推送 `after:<id>`、`afters`、`todo:sales`、`ar:<customerId>` |
| `POST /afters/:id/close` | 销售 | `{ version, reason }` | 状态 `pending`；原因必填 | 行锁客户 → 订单 → 售后 + 条件更新；日志「关闭售后」；推送 `after:<id>`、`afters`、`todo:sales` |
| `POST /afters/:id/void` | 销售（处理它的销售） | `{ version, reason }` | 状态 `processed`；原因必填；不限时间；不是处理人 → `FORBIDDEN` | 行锁客户 → 订单 → 售后 + 条件更新；日志「作废售后」；推送 `after:<id>`、`afters`、`order:<orderId>`、`ar:<customerId>` |

主数据：

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /customers`、`GET /customers/:id` | 销售、财务 | → 客户和门店；门店项 `actions` ⊆ `inviteStore`、`unbindStoreWechat` | | — |
| `POST /customers`、`PATCH /customers/:id` | 销售 | `{ version?, name, enabled }` | 名称必填「请填写客户名称」；不重复，否则 `VALIDATION_FAILED` `fields.name`「已有同名客户」；内容没变 → `BUSINESS_RULE`「没有修改内容」；停用规则见 03 章第 5 节 | 日志「新增 / 修改客户」；启用状态变了推送 `catalog:<customerId>`（门店首页刷新） |
| `POST /stores`、`PATCH /stores/:id` | 销售 | `{ version?, customerId, name, contact, phone, address, enabled, loginPhone? }` | 名称必填「请填写门店名称」，同一客户下不重复「这个客户下已有同名门店」；`contact`、`phone`、`address` 选填（没填存 `""`）；`loginPhone` 11 位，启用账号里不重复；填了 `loginPhone` 时 `contact` 必填「开通门店账号请填写联系人」；填了就开通或更新门店账号（账号名字 = `contact`），清空就停用门店账号（见第 14 节第 1 条） | 同一事务写 `accounts`（改联系人时同步账号名字）；日志「新增 / 修改门店」；停用时推送 `account:<storeAccountId>` |
| `POST /stores/:id/invites` | 销售 | `{}` + 幂等键 → `{ id, path, title, imageUrl, expiresAt }` 小程序卡片参数，`path` 带随机 token | 门店启用，且已有启用的门店账号（登录手机号已录入），否则 `BUSINESS_RULE`「请先在门店资料里填写登录手机号」 | 同一门店旧的待使用邀请改成 `voided`，再写 `store_invites`（有效期 `STORE_INVITE_TTL_DAYS`，库里只存 token 的哈希）；日志「生成门店邀请」；推送 `store_invites:<storeId>` |
| `GET /stores/:id/invites` | 销售 | → 这家门店的邀请列表（状态含已作废、过期时间、绑定时间；已过期的按 `expires_at` 现算） | | 订阅 `store_invites:<storeId>` |
| `POST /stores/:id/unbind-wechat` | 销售、管理员 | `{ version }`（门店账号的版本号） | 门店账号已绑定微信，否则 `BUSINESS_RULE`「这家门店账号还没绑定微信」 | 行锁账号 + 条件更新；清空 `openid`、`bound_at`；日志「解绑门店微信」；推送 `account:<storeAccountId>`（对方连接断开） |
| `GET /products`、`POST /products`、`PATCH /products/:id` | 销售 | `{ version?, name, categoryId, unit, imageFileId?, enabled, bom[{materialId, qty}] }` | 名称必填「请填写产品名称」、不重复「已有同名产品」；配方至少一种花材「请至少添加一种花材」；配方花材必须存在且启用；不存在的 `materialId` 拒绝保存，不部分写入；`qty>0`；停用规则见 03 章第 5 节 | 整组替换配方；日志「新增 / 修改产品」 |
| `GET /product-categories`、`POST /product-categories`、`PATCH /product-categories/:id` | 销售 | 新增、改名 `{ name }`；列表按 `sort, id` 升序，每项带 `productCount`（含停用产品） | 名称必填「请填写分类名称」、不重复「已有同名分类」 | 新增排在最后；日志「新增分类」「修改分类」 |
| `PUT /product-categories/order` | 销售 | `{ ids[] }`（全部分类的新顺序）→ 列表 | `ids` 必须正好是现有全部分类，否则 `STALE`「分类刚被修改，已刷新」 | 按顺序重写 `sort`；日志「调整分类顺序」（前后） |
| `DELETE /product-categories/:id` | 销售 | → `{}` | 分类下还有产品（含停用的）→ `BUSINESS_RULE`「分类中仍有产品，请先移动产品」 | 行锁分类；日志「删除分类」 |
| `GET /catalog/:customerId` | 销售 | → `{ customerId, customerName, categories[{id, name, sort, itemCount}], items[] }`；目录项带 `categoryId`、`categoryName`、`customerCode`、`listPriceCents`、`enabled`（停用为 false）、`productEnabled`、`version`、`productVersion`、配方明细 `bom`（和产品列表同一结构），按订货分类、产品排（2026-10-03 确认）；销售新建订单时产品和默认单价从这里取 | | — |
| `PUT /catalog/:customerId/items/:productId` | 销售 | `{ version?, categoryId, customerCode, priceCents, enabled, product?{version, bom[{materialId, qty}]} }` → 整份目录；新加进目录的不带 `version`；配方改了才带 `product`（2026-10-03 确认） | 分类必选且须是这个客户的 →「请选择订货分类」；`customerCode` 同客户重复 → `fields.customerCode`「这个客户下已有相同的产品编码」；停用的产品不能新加进目录；目录项或产品版本过期 → `STALE`（带最新目录，整体不改）；什么都没变 → `BUSINESS_RULE` | 行锁这个客户的目录项（和门店下单、改单的共享锁互斥）；带 `product` 时同一事务行锁产品、换配方、产品 `version` +1、日志「修改产品」；改了价的同一事务按 `id` 升序行锁这个客户含这种产品的待确认订单，把 `price_cents`、`list_price_cents` 改成新目录价、订单 `version` +1，不写 `order_changes`；日志「修改订货目录」（订货分类、客户产品编码、订货价、状态的前后，另写「同步待确认订单 SO-…」）；推送 `catalog:<customerId>`（产品资料、配方改了再推目录里有这个产品的每个客户），同步了订单时加 `order:<id>`、`orders` |
| `POST /catalog/:customerId/categories`、`PATCH /catalog/:customerId/categories/:id` | 销售 | 新增（+ 幂等键）、改名 `{ name }` → 整份目录 | 同客户重名 → `fields.name`「已有同名分类」；分类不是这个客户的 → `NOT_FOUND` | 行锁客户；新增排最后；日志「新增分类」「修改分类」（订货目录）；推送 `catalog:<customerId>` |
| `PUT /catalog/:customerId/category-order` | 销售 | `{ ids[] }`（这个客户全部订货分类的新顺序）→ 整份目录 | `ids` 必须正好是这个客户现有全部分类，否则 `STALE` | 按顺序重写 `sort`；日志「调整分类顺序」 |
| `DELETE /catalog/:customerId/categories/:id` | 销售 | → 整份目录 | 分类下还有目录项（含停用的）→ `BUSINESS_RULE`「分类中仍有目录产品，请先换分类」 | 日志「删除分类」 |
| `GET /catalog/:customerId/copy-preview` | 销售 | `?fromCustomerId=` → `{ copyCount, skipCount, previewToken }` | 目标含任何目录项（含停用）→ `BUSINESS_RULE`「这个客户已有目录，不能复制」；来源和目标相同 → `VALIDATION_FAILED`；没有可复制产品 → `BUSINESS_RULE`「没有可复制的产品」 | 一致性快照读取来源产品、目录项、分类和目标空分类；凭据绑定来源、目标及预览状态 |
| `POST /catalog/:customerId/copy` | 销售 | `{ fromCustomerId, previewToken }` + 幂等键 → 整份目录 | 同上；预览状态变了 → `STALE`「目录有变化，请重新预览后复制」且整体不写；仅复制目录项启用且产品启用的可订项，带价格、可订、有效分类，编码置空 | 来源、目标客户按 id 升序锁，普通目录项和分类写操作也遵守客户锁；同名目标空分类复用，只新增有复制项的来源分类，新增按来源顺序排在已有分类后；日志「复制订货目录」；推送 `catalog:<customerId>` |

## 5. 门店端

门店账号只能读写本店（`accounts.store_id`）。购物车只存在前端，不走接口。

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /store/home` | 门店 | → `{ customerId, orderableCount, lockedReason }`：`customerId` 是本店所属客户，前端订阅 `catalog:<customerId>`、`ar:<customerId>` 用；`orderableCount` 是本客户启用的目录项数（产品本身也须启用），和订货目录的可订款数同一口径；`lockedReason` 客户停用时为「这个客户已停用，不能再下新单，请联系花众」，否则 `null` | — | 订阅 `catalog:<customerId>` |
| `GET /store/catalog` | 门店 | 不带参数 → `{ categories, items }`：本客户启用的目录项全部一次给全（产品本身也须启用）（产品、订货分类、单位、客户产品编码 `customerCode`、目录价 `listPriceCents`、图片缩略图；`categories` 是这个客户的订货分类，只含有可订产品的）；分类切换和跨分类搜索在页面里筛，购物车用同一份数据核对停用 | 门店停用 → `ACCOUNT_DISABLED`（守卫统一拦）；客户停用 → `BUSINESS_RULE`「这个客户已停用，不能再下新单，请联系花众」，门店账号照常登录（03 章第 5 节） | 订阅 `catalog:<customerId>` |
| `POST /store/orders` | 门店 | `{ note, lines[{productId, qty}] }` + 幂等键 → 订单（`pending_confirm`，`shipDate` 为 `null`） | 客户停用 → `BUSINESS_RULE`「这个客户已停用，不能再下新单，请联系花众」；门店不传出货日期（由销售确认时定）；产品本身启用、在目录里且启用；单价取目录价（门店不能传单价） | 发号 SO；日志「门店下单」；推送 `orders`、`todo:sales` |
| `PUT /store/orders/:id` | 门店 | `{ version, note, lines[] }` → 订单 | 状态 `pending_confirm`，已取消 → `STALE`「订单已被取消，不能再修改」，已确认 → `STALE`「销售已确认，门店不能再修改，请联系销售」；客户停用 → `BUSINESS_RULE`「这个客户已停用，不能再修改订单，请联系花众」；原单里已停用的产品还在 → `BUSINESS_RULE`「白绿清新花束已停用，请先删掉再提交」；所有行按当前目录价重算（单价、目录价快照）；内容没变 → 不写变更记录，直接返回 | 条件更新；整组替换明细；有差异写 `order_changes`（原因空）；日志「门店改单」；推送 `order:<id>`、`orders`、`todo:sales` |
| `POST /store/orders/:id/cancel` | 门店 | `{ version }` | 状态 `pending_confirm`（不用原因）；已确认 → `STALE`「销售已确认，请联系销售取消」 | 条件更新；日志「门店取消订单」；推送同上 |
| `POST /store/orders/:id/cancel-request` | 门店 | `{ version, reason }`（原因选填） | 订单本店且 `to_ship`；已有待处理申请或被拒绝过 → `BUSINESS_RULE`「取消申请已被拒绝，请联系花众销售」；已发货 → `STALE` | 行锁订单；写 `order_cancel_requests`；订单 `version` +1；日志「申请取消」（销售模块）；推送 `order:<id>`、`orders` |
| `POST /store/orders/:id/cancel-request/withdraw` | 门店 | `{ version }` | 订单本店，申请 `pending`；版本变了或销售已处理 → `STALE` | 行锁订单并复核版本；申请 `withdrawn`，订单 `version` +1；日志「撤回取消申请」；推送同上 |
| `POST /store/afters` | 门店 | `{ orderId, lines[{orderLineId, qty, reason, description, imageFileIds[]}] }` + 幂等键 → 售后（`pending`） | 订单本店且 `shipped`；在售后申请期限内（04 第 8 节），否则 `BUSINESS_RULE`「已超过售后申请时间，请联系花众销售」；至少一行；`qty>0` 且 ≤ 可申请数量（可申请数量见 03 章第 4 节）→ `VALIDATION_FAILED`「售后数量须大于 0，且不超过实发数量减去已申请的售后」；每行问题说明必填；原因 `damaged`、`quality` 的行没图片 → `VALIDATION_FAILED`「花材损坏、品质问题请至少上传 1 张图片」；图片每行 ≤ `AFTER_IMAGE_MAX_COUNT` 张、`status=ok` | 行锁客户 → 订单；发号 AS；单价取发货单价，`requested_qty` = `qty`；日志「申请售后」；推送 `afters`、`todo:sales` |
| `GET /store/statement` | 门店 | `?from=&to=&cursor=`（`from`、`to` 按出货日期，都不传 = 全部；对账格按区间算）→ `{ shippedCents, afterCents, paidCents, unpaidCents, items[发货单卡片：`payStatus`（`unpaid` / `partial` / `paid`，门店端显示未付 / 部分付 / 已付）、`unpaidCents`、`offsetByAfter`（售后刚好抵完）、`allocations[{date, amountCents}]`（生效核销，不带收款号以外的财务信息）] }`；不返回预收 | 范围见 03 章第 4 节（门店对账）；作废的订单不列 | 订阅 `ar:<customerId>`（服务端只推本店相关） |

门店的订单列表、详情、售后列表、详情复用第 4 节的 `GET /orders*`、`GET /afters*`，按本店过滤；售后金额只在门店的售后里返回，已关闭、已作废的不带金额。

## 6. 发货

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /shipping/orders` | 发货 | `?status=to_ship|shipped&q=&cursor=` → 卡片（不带单价、金额；带 `cancelRequested`）+ `counts`（只有 `to_ship`）；`status` 不传 = 全部：待发货在前，按出货日期升序（含出货日期以后的）；已发货在后，按发货时间降序；同一出货日期或发货时间按 id。游标记着所在的段，翻页跨过两段之间也不重不漏；拿别的状态的游标来翻 → `VALIDATION_FAILED` `fields.cursor` | | 订阅 `orders` |
| `GET /shipping/orders/:id` | 发货（含管理员、多模块员工） | → 发货专用详情：明细数量、实发、少发 / 多发标记、发货与取消 / 作废信息、无金额的变更记录、取消申请记录、`version`；`actions` 只含 `ship` | 仅可读 `to_ship`、`shipped`、`voided`（作废历史只读，不加入现有发货列表筛选）；不返回价格、金额、财务核销或售后金额，纯发货读普通金额接口 → `FORBIDDEN` | 订阅 `order:<id>` |
| `POST /orders/:id/ship` | 发货 | `{ version, shipNote, lines[{orderLineId, shippedQty}] }` | 出货日期晚于今天 → `BUSINESS_RULE`「出货日期还没到，不能发货」；状态 `to_ship`：已取消 → `STALE`「销售已取消这张订单，不能发货」；打开后销售改过单（版本变了）→ `STALE`「销售修改了这张订单，已刷新成最新内容，请核对后再确认发货」；`shippedQty ≥ 0`，不设上限；有一行和订单数量不一致时 `shipNote` 必填「实发和订单数量不一致，请写发货备注」 | 条件更新（和确认、修改、取消、同意取消申请互斥）；写 `shipped_qty`、`shipped_by/at`；待处理的取消申请改 `lapsed`（和发货合并一次订单版本更新）；成功响应及 `STALE.latest` 均为无金额发货视图；日志「确认发货」；推送 `order:<id>`、`orders`、`todo:shipping`、`ar:<customerId>`、`demand` |

## 7. 采购

采购单、邀请的新建提交均先调用 `POST /purchase/review`。该接口只读复核，不发号、不写业务日志，不属于新增业务单据。

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /purchase-orders` | 采购、仓库、财务 | `?status=&supplierId=&from=&to=&cursor=` → 卡片（采购员、金额或应付、`changed`、`repriced`、`allReturned`）；列表级 `actions` ⊆ `create`（采购） | 仓库默认不列 `cancelled`，传 `status=cancelled` 才列 | 订阅 `pos` |
| `GET /purchase-orders/:id` | 同上 | → 详情：明细、改单记录、改价记录、退货记录、取消原因、作废原因、`amountCents`、`payableCents`、`paidCents`、`unpaidCents`、`apStatus`（`unpaid` / `partial` / `paid` / `no_pay`）、付款核销记录（付款号、日期、金额）、`allReturned`；每行 `maxReturnQty`（按净实收和库存算好的可退数量，没收货为 `null`）；`notice`：收货页提示条（例如采购改过单），没有为 `null`；`actions` ⊆ 采购 `editPo`、`changeSupplier`（手工下的单才有）、`cancelPo`，仓库 `receive`、`return`、`reprice`、`voidPo`，财务 `[]`（付款从供应商对账登记） | | 订阅 `po:<id>` |
| `POST /purchase-orders` | 采购 | `{ supplierId, note, lines[{materialId,qty,priceCents}], reviewToken, demandContext?{from,to} }` + 幂等键 → `to_receive` | 启用供应商、花材；qty>0、priceCents>=0；创建前按下文采购复核协议验证 reviewToken，已有邀请 / 超缺口仅提醒，不禁止 | 复核通过后发号 PO、写单据与日志；推送 `pos`、`todo:warehouse`、`demand` |
| `PUT /purchase-orders/:id` | 采购 | `{ version, supplierId, note, reason, lines[] }` | 状态 `to_receive`；原因必填；换了供应商但这张单没有 `changeSupplier`（填报生成的单）→ `BUSINESS_RULE`「填报生成的采购单不能换供应商，要换请取消后重下」；新加的花材须启用 | 条件更新（和收货互斥）；整组替换明细；写 `po_changes`（含换供应商）；日志「修改采购单」（前后）；推送 `po:<id>`、`pos`、`demand`、`supplier:<旧、新 supplierId>` |
| `POST /purchase-orders/:id/cancel` | 采购（归属人） | `{ version, reason }` | 状态 `to_receive`；原因必填；供应商刚改过或取消 → `STALE` | 条件更新（和供应商改单、取消互斥）；日志「取消采购单」；推送 `po:<id>`、`pos`、`todo:warehouse`、`demand`、`supplier:<supplierId>` |
| `GET /purchase/demand` | 采购 | `?from=&to=&shortageOnly=` → `{ from, to, orderCount, overdue:{count,shipFrom,shipTo}, mats[{materialId, code, name, unit, enabled, needQty, stockQty, inTransitQty, leftQty, shipFrom, shipTo, invited, invites[{inviteId,no,supplierId,supplierName,needQty}]}], actions }`；按缺货优先、实际 `shipFrom`、编码、id 排；`shipFrom/shipTo` 为每花材实际出货范围；`shortageOnly` 默认 false | 日期合法，默认今天起 `DEMAND_DEFAULT_DAYS` 天；停用花材照算但不可勾；`overdue` 只统计今天前仍待发货订单，无逾期则日期为 null，不并入区间；列表级动作只为 `inviteSupplier`、`createPo` | 一致性快照计算；订阅 `demand` |
| `GET /purchase/demand/:materialId/sources` | 采购 | `?from=&to=` → `{ materialId, inTransitQty, invites[], inTransitSources[{poId,no,supplierId,supplierName,qty,status}], groups[] }`；groups 按出货日期分组列来源订单（单号、客户 · 门店、产品、数量 × 配方、花材数） | 在途来源只列本花材的 `to_receive` 采购单，qty 为采购量，不分到货日期；未提交邀请独立列出 | 订阅 `demand` |
| `GET /invites` | 采购 | `?status=&supplierId=&cursor=` → 卡片（含生成的采购单号和当前状态） | | 订阅 `invites` |
| `GET /invites/:id` | 采购 | → 详情；`actions` ⊆ `editInvite`、`cancelInvite`、`shareInvite` | | 订阅 `invite:<id>` |
| `POST /invites` | 采购 | `{ supplierId, lines[{materialId,needQty}], reviewToken, demandContext?{from,to} }` + 幂等键 → 邀请 | 启用供应商且有启用供应商账号；启用花材、needQty>0；按采购复核协议验证；已有待填报邀请只提醒、不禁止 | 复核通过后发号 YQ；日志「发出邀请」；推送 `invites`、`demand`、`supplier:<supplierId>` |
| `PUT /invites/:id` | 采购 | `{ version, lines[] }` | 状态 `pending`；没有修改内容 → `BUSINESS_RULE`「没有修改内容」 | 条件更新（和提交填报互斥）；日志「修改邀请」（不用原因）；推送 `invite:<id>`、`supplier:<supplierId>`、`demand` |
| `POST /invites/:id/cancel` | 采购（发邀请的人、管理员） | `{ version }` | 状态 pending；非归属人 → FORBIDDEN；版本变化 → STALE | 条件更新；日志「取消邀请」；推送同上 |
| `POST /invites/:id/share` | 采购 | → `{ path, title, imageUrl }` 小程序卡片参数；`path` 带邀请号和 HMAC 签名（只签邀请 ID），不设有效期 | 状态 `pending` | 日志「复制填报链接」 |
| `GET /suppliers`、`GET /suppliers/:id` | 采购、财务、仓库（手工入库选供应商） | → 列表（名称、联系人、启用、是否已开通供应商端、`openPoCount` 待收货采购单数）、资料；列表级 `actions` ⊆ `create`（采购） | | — |
| `POST /suppliers`、`PATCH /suppliers/:id` | 采购 | `{ version?, name, contact, phone, address, enabled, account: { enabled, loginPhone } }` | 名称不重复；开通时 `loginPhone` 11 位且启用账号里不重复 | 行锁供应商；同一事务写 `accounts`；改登录手机号同时解绑微信、提升账号版本，推送 `account:<id>` 关闭连接，日志原因「同时解绑微信」（阶段 4 确认）；停用供应商或关闭账号时保留 `openid`、`bound_at`，提升版本，实时连接以 4403 关闭，原微信请求返回 `ACCOUNT_DISABLED`，重新启用后恢复使用（阶段 4 确认）；把这家 `pending` 邀请全部改 `cancelled`（`cancel_note` 写原因，日志操作人「系统」）；推送 `account:<id>`、`invites`、`supplier:<id>` |

### 7.1 采购复核与提醒（2026-10-02 采购优化确认）

- `POST /purchase/review`，采购权限；入参 `{ kind:'po'|'invite', supplierId, lines[{materialId,qty}], demandContext?{from,to,expected[{materialId,needQty,stockQty,inTransitQty}]} }`。邀请的 `needQty` 映射为 qty；同花材不重复。需求入口保留打开时的区间和已选花材快照；直接新建不传需求上下文，不凭空选日期计算缺口。
- 返回 `{ reviewToken, currentDemand[{materialId,needQty,stockQty,inTransitQty,leftQty}], warnings[{code,materialId,message,invites[{inviteId,no,supplierName,needQty}]}] }`；code 为 `pending_invite`、`gap_changed`。无需求上下文时 currentDemand 为空，但照样检查同花材待填报邀请，不能换供应商后绕开重复提醒。
- `pending_invite` 只提醒已有未提交邀请，可打开原邀请；不算在途，不禁止新邀请或采购。`gap_changed` 对照打开时快照显示「当前缺口已从 N 枝变成 M 枝，请核对采购数量」；数量、供应商、单价、备注原样保留。
- 无提醒时正常提交；有提醒时展示一次核对弹层，点「核对后继续」后带凭据提交，也可返回修改。允许超缺口，不能因超缺口返回数量错误，不能自动减少采购量。
- `reviewToken` 绑定账号、操作种类、供应商、花材 / 数量、需求区间及所选花材的最新需求 / 库存 / 在途 / 未提交邀请状态。写事务复查，凭据失配 → `STALE`「采购情况有变化，请核对后继续」，`latest` 带新的复核结果，整张单据 / 邀请不写、不发号；前端保留输入，重新确认后可以继续。同一幂等键的已成功请求仍先返回原结果，不能复核后再登记第二张。
- 新建单据与复核查询复用同一需求、库存、在途计算函数，在一致性快照内取数；邀请转采购单、取消邀请等变化也纳入复核。令牌复查与新建写入之间不能留竞态窗口：所有相关源写入遵循共用串行化策略，或采用可检测源变化的事务隔离并在冲突时重新复核；仅签名令牌、分散查表不够。并发操作可按实际先后顺序成功，基于过期快照的后者须 `STALE`，不能静默用过期核对结果完成创建。采购提示不是资金核销，不能套用「不得超过未收 / 待付」的金额上限。
- 逾期提示使用需求接口 `overdue` 的最早、最晚出货日期切换当前筛选；不额外扩展当前日期区间。来源弹层的在途单据可点开采购单，提示「在途不代表已到库」。

## 8. 供应商端

供应商账号只能读写本家（`accounts.supplier_id`）。

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /supplier/invites` | 供应商 | `?status=&cursor=` → 本家邀请卡片（含生成的采购单号和状态） | | 订阅 `supplier:<supplierId>` |
| `GET /supplier/invites/:id` | 供应商 | → 需求花材、需求量、`enabled`、`version`、`cancelNote`、`cancelledAt`；已提交的带供货快照（阶段 4 确认）；`actions` ⊆ `submitSupply` | 不是本家 → `NOT_FOUND` | 订阅 `invite:<id>` |
| `POST /supplier/invites/resolve` | 已绑定账号 | `{ id, sig }`（分享卡片路径里的参数）→ `{ inviteId }` | 签名不对 → `BUSINESS_RULE`「邀请链接无效」；不是这家供应商的账号（含员工、门店、别家供应商）→ `FORBIDDEN`；邀请已提交或已取消 → `BUSINESS_RULE`「这次邀请已提交或已取消，链接已失效」 | — |
| `POST /supplier/invites/:id/submit` | 供应商 | `{ version, lines[{materialId, qty, priceCents}] }` + 幂等键 → `{ invite, purchaseOrder }` | 状态 `pending`：已取消 → `STALE`「采购已取消这次邀请」；采购改过邀请（版本变了）→ `STALE`「采购修改了邀请，已刷新成最新内容」；提交的行含停用花材（邀请行或另报行）→ `BUSINESS_RULE`「花材已停用，请删掉这一行再提交」；供应商自行删掉即可提交，被删邀请行照常算未供，不要求采购修改邀请（阶段 4 确认）；至少一行 → `BUSINESS_RULE`「请至少保留一种花材；全部不供请联系采购取消邀请」；`qty>0`、`priceCents>=0`；另报花材须启用 | 条件更新邀请；同一事务发号 PO、生成 `to_receive` 采购单（采购员 = 发邀请的人）、写 `invite_supply_lines`；日志「提交填报」；推送 `invite:<id>`、`invites`、`pos`、`todo:purchase`、`todo:warehouse`、`demand` |
| `GET /supplier/materials` | 供应商 | `?q=` → 启用的花材（另报用） | | — |
| `GET /supplier/purchase-orders`、`/:id` | 供应商 | → 本家全部采购单（含已取消、已拒收、已作废），实收、退货、改价、改单记录、取消 / 作废原因、付款核销记录（日期、金额）；`actions` ⊆ `supplierEditPo`、`supplierCancelPo`（只限本家填报生成、待收货的单）；`lockedReason` 恒为 `null`，不向供应商显示仓库锁定说明（阶段 4 确认） | 范围见 03 章第 8.2 节 | 订阅 `supplier:<supplierId>`、`po:<id>` |
| `PUT /supplier/purchase-orders/:id` | 供应商 | `{ version, reason, lines[{materialId, qty, priceCents}] }`（原因选填） | 本家、`invite_id` 非空、`to_receive`；仓库已收货 → `STALE`「仓库已收货，不能再修改」；采购改过 → `STALE`；至少一行、`qty>0`、`priceCents>=0`；新加的花材须启用；没有变化 → `BUSINESS_RULE`「没有修改内容」 | 条件更新（和收货、采购改单、取消互斥）；整组替换明细；写 `po_changes`；日志「供应商改单」（采购模块）；推送 `po:<id>`、`pos`、`demand`、`todo:warehouse`、`supplier:<supplierId>` |
| `POST /supplier/purchase-orders/:id/cancel` | 供应商 | `{ version, reason }` | 同上；原因必填 | 条件更新；`cancelled_by` = 供应商账号；日志「供应商取消采购单」（采购模块）；推送同上 + `invite:<inviteId>` |
| `GET /supplier/statement` | 供应商 | `?status=unpaid|partial|paid&from=&to=&cursor=` → `{ payableCents,paidCents,unpaidCents,prepaidCents,refunds[{no,date,amountCents,status}],items[单据卡片：docType、payableCents、paidCents、unpaidCents、apStatus、allocations[{date,amountCents}]] }`；from/to 按收货日期，默认全部；手工入库单阶段 5 接入 | 同财务供应商对账的有效正应付单范围，已付单保留；预付按全账本算，外部退款含作废状态且不返回内部备注、actions | 订阅 `ap:<supplierId>` |
| `GET /supplier/stock-ins/:id` | 供应商 | 阶段 5 接入：→ 本家手工入库单明细和改价记录；`actions` 恒为 `[]` | | — |

## 9. 仓库

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `POST /purchase-orders/:id/receive` | 仓库 | `{ version, recvNote, reason?, lines[{poLineId, receivedQty, priceCents}] }` | 状态 `to_receive`：已取消 → `STALE`「采购已取消这张单」；采购改过单 → `STALE`「采购修改了这张单，已刷新成最新内容，请核对后再确认」；`receivedQty>=0`；改了单价原因必填；停用花材照常收；全 0 → `rejected` | 条件更新（和采购改单、取消互斥）；非 0 行生成批次 + `po_in` 流水；改价写 `price_changes`；日志「确认收货」/「拒收」；推送 `po:<id>`、`pos`、`todo:warehouse`、`todo:finance`、`ap:<supplierId>`、`stock`、`demand` |
| `POST /purchase-orders/:id/returns` | 仓库 | `{ version, lines[{poLineId, qty}] }` | 状态 `received`、未全部退货；每行累计 ≤ 实收；库存够 | 行锁供应商 + 采购单（和登记付款、核销预付互斥）+ 批次扣减（先扣本单批次）；更新 `returned_qty`；写 `purchase_returns`、`po_return` 流水；已付超出新应付的部分按 04 第 8 节重算回到预付；日志「退货」；推送同收货 |
| `POST /purchase-orders/:id/reprice` | 仓库 | `{ version, reason, lines[{poLineId, priceCents}] }` | 状态 `received`、未全部退货；原因必填；没有变化 → `BUSINESS_RULE`「没有修改内容」 | 行锁供应商 + 采购单（和付款互斥）；写 `price_changes`；日志「改单价」；推送 `po:<id>`、`ap:<supplierId>` |
| `POST /purchase-orders/:id/void` | 仓库（收货的人） | `{ version, reason }` | 状态 `received`；有有效核销 → `BUSINESS_RULE`「已有付款核销，请先由财务撤回」；库存够按净实收扣回 → 否则 `BUSINESS_RULE`「库存不够，不能作废」；原因必填 | 行锁供应商 + 采购单 + 批次扣减（先扣本单批次）；`po_void` 流水；写 `void_*`；日志「作废采购单」；推送 `po:<id>`、`pos`、`stock`、`demand`、`ap:<supplierId>`、`supplier:<supplierId>` |
| `GET /warehouse/docs` | 仓库 | 阶段 5 接入：`?kind=in|out|loss&status=&supplierId=&from=&to=&cursor=` → 卡片 | | 订阅 `wh_docs` |
| `GET /warehouse/docs?kind=out` | 仓库 | `?kind=out&outCategoryId=&from=&to=&cursor=` → 手工出库列表（按出库分类、出库日期筛选，出库日期降序分页） | `to` 早于 `from` → `VALIDATION_FAILED` | 订阅 `wh_docs` |
| `GET /warehouse/docs/:id` | 仓库、财务（手工入库） | 阶段 5 接入：→ 明细、改价记录、报损图片、作废原因、`amountCents`、`apStatus`（手工入库：`unpaid` / `partial` / `paid` / `no_pay`；出库、报损为 `null`）、付款核销记录；`actions` ⊆ 仓库 `reprice`（只对手工入库）、`void`，财务 `[]` | | 订阅 `wh_doc:<id>` |
| `POST /warehouse/docs` | 仓库 | `{ kind, supplierId?, outCategoryId?, reason, imageFileIds?[], lines[{materialId, qty, priceCents?}] }` + 幂等键 | 入库：供应商启用、花材启用、每行有单价；出库：分类启用、库存够；报损：原因必填、库存够，图片选填（≤ `AFTER_IMAGE_MAX_COUNT` 张、`status=ok`） | 发号 RK/CK/BS；入库生成批次 + `manual_in`；出库、报损批次扣减 + 流水；日志「手工入库 / 手工出库 / 报损」；推送 `wh_docs`、`stock`、`demand`；入库金额 > 0 另推 `todo:finance`、`ap:<supplierId>` |
| `POST /warehouse/docs/:id/reprice` | 仓库 | `{ version, reason, lines[{lineId, priceCents}] }` | 手工入库、`stocked_in`；原因必填 | 行锁供应商 + 单据；写 `price_changes`；已付超出的部分重算回到预付；日志「改单价」；推送 `wh_doc:<id>`、`ap:<supplierId>` |
| `POST /warehouse/docs/:id/void` | 仓库（录的人） | `{ version, reason }` | 原因必填。手工入库：`stocked_in`、没有有效核销（否则 `BUSINESS_RULE`「已有付款核销，请先由财务撤回」）、库存够扣回（否则「库存不够，不能作废」）；手工出库、报损：`stocked_out`、`lost` | 入库先锁供应商，再锁单据；出库、报损先锁单据；随后锁花材和批次；入库：批次扣减（先扣本单批次）、`in_void` 流水；出库、报损：按原流水的批次加回、`out_void` / `loss_void` 流水；日志「作废入库单 / 出库单 / 报损单」；推送 `wh_doc:<id>`、`wh_docs`、`stock`、`demand`，入库另推 `ap:<supplierId>`、`todo:finance` |
| `GET /warehouse/moves` | 仓库 | `?type=&materialId=&from=&to=&cursor=` → 流水（批次显示「MM-DD 入库」） | | — |
| `GET /warehouse/stock` | 仓库 | `?q=&categoryId=` → 库存（含批次明细） | | 订阅 `stock` |
| `GET/POST/PATCH /materials` | 仓库（采购、销售只读） | `{ version?, code, name, categoryId, unit, enabled }` | 编码不重复；新建默认 `MATERIAL_CODE_PREFIX` + 下一个序号 | 日志「新增 / 修改花材」（改单位记前后） |
| `GET /materials/:id` | 仓库、采购、销售 | 花材资料、当前库存、批次；阶段 4 花材详情读取接口 | 不存在 → `NOT_FOUND` | 订阅 `stock` |
| `GET/POST/PATCH /material-categories` | 仓库（`GET` 所有员工，库存查询的分类筛选用） | `GET` → 列表，项 `{ id, name, sort }`，按 `sort`、`id` 升序，不分页（`nextCursor` 恒为 `null`）；写入 `{ name, sort }` | 名称不重复 | 日志 |
| `GET/POST/PATCH /out-categories` | 仓库 | `{ name, enabled }` | 至少一个启用 | 日志 |
| `GET /stocktakes`、`/:id` | 仓库 | → 盘点单；`actions` 恒为 `[]` | | — |
| `GET /stocktakes/draft` | 仓库 | `?categoryIds=` → 所选分类全部花材（含停用），每行 `{ materialId, name, unit, bookQty }`，`bookQty` 是当前账面数 | | — |
| `POST /stocktakes` | 仓库 | `{ categoryIds[], reason, lines[{materialId, bookQty, actualQty}] }` + 幂等键 | `actualQty>=0`；有差异原因必填；`bookQty` 是打开盘点时的账面快照，确认时锁住相关批次按当前库存复查，任一行变了 → `STALE`「库存已变化，已刷新账面数，请核对后再确认」，`latest` 带最新账面数 | 发号 PD；盘盈生成批次 + `check_gain`，盘亏批次扣减 + `check_loss`；日志「确认调整」；推送 `stock`、`demand` |

## 10. 财务

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /finance/customers` | 财务 | `?q=` → 每个客户 `{ shippedCents, afterCents, receivedCents, unpaidCents, prepaidCents }` | 按 04 第 8 节算 | 订阅 `ar:*` |
| `GET /finance/customers/:id` | 财务 | `?status=unpaid|partial|paid&from=&to=&cursor=`（出货日期，默认全部）→ 汇总 + 发货单卡片 + `refunds[财务退款详情]`；预收按完整客户账本计算，单据与其金额汇总按日期区间；列表级 actions 含 registerReceipt、符合条件时 allocate | 退款详情见 10.1，完整历史由收款详情提供；退款展示时间范围见 10.1 | 订阅 `ar:<id>` |
| `GET /finance/customers/:id/unpaid-orders` | 财务 | → `{ ledgerToken,prepaidCents,items[全部未收发货单：含version、unpaidCents] }`；按出货日期、id 升序，不分页；用于登记收款、核销预收 | 客户不存在 → NOT_FOUND；凭据与 expected 按 10.1 复核 | 订阅 `ar:<id>` |
| `GET /finance/ar-orders/:id` | 财务 | → 发货单弹层：`payStatus`、`offsetByAfter`、发货金额、已处理售后列表（可点开）、应收、生效核销（收款单号、类型、时间、金额）、未收；售后列表项 `actions` 恒为 `[]`（只读，作废售后在销售模块） | | 订阅 `order:<id>`、`ar:<customerId>` |
| `POST /finance/receipts` | 财务 | `{ customerId,receiptDate,amountCents,methodName,note,ledgerToken,expected[{orderId,version,unpaidCents}],allocs[{orderId,amountCents}] }` + 幂等键 | 金额>0；日期不晚于今天，否则 fields.receiptDate「收款日期不能晚于今天」；方式启用；快照变化 → STALE「发货单金额有变化，已刷新，请核对后再确认」，整笔不写；每条 ≤ 未收、合计 ≤ 收款 | 锁客户并按 10.1 复核；发号 SK、写 direct 核销，剩余预收；日志「登记收款」；按 10.2 通知 |
| `POST /finance/prepaid-allocations` | 财务 | `{ customerId,ledgerToken,expected[],allocs[{orderId,amountCents}] }` + 幂等键 | 同登记收款快照复核；合计 ≤ 当前预收，否则「可用预收只有 ¥…」；无未收隐藏入口 | 锁客户；按收款 `(created_at,id)` 从各笔余额扣，写 prepaid 核销；日志「核销预收」；按 10.2 通知 |
| `GET /finance/receipts/:id` | 财务 | → 收款详情、`allocations[全部核销历史]`、prepaidCents、`refunds[财务退款详情]`；每条核销带登记金额、生效金额、撤回信息和 actions；收款 actions ⊆ voidReceipt、refundReceipt | 0 生效有效核销也有撤回入口，已撤回无操作；按核销本人 / 管理员判归属，见 10.1 | 订阅 `receipt:<id>` |
| `POST /finance/receipts/:id/void` | 财务（登记人、管理员） | `{ version,reason }` | 有效、版本一致、原因必填；有有效退款 →「请先作废这笔的退款」 | 锁客户 → 收款；条件更新、版本+1；尚有效核销全部撤回，保留旧撤回历史；日志「作废收款」；按 10.2 通知 |
| `POST /finance/allocations/:id/revoke` | 财务（核销登记人、管理员） | `{ reason }` | 所属收款有效且核销未撤回，生效 0 也可撤；原因必填；重复撤回不再写反向金额 | 锁客户 → 收款 → 核销，重查归属；写 revoked_*、日志「撤回核销」；按 10.2 通知 |
| `GET /finance/payables` | 财务 | `?cursor=` → 待付大于 0 的单据（阶段 4 只有采购单，手工入库单阶段 5 接入） | | 订阅 `todo:finance` |
| `GET /finance/suppliers` | 财务 | `?q=` → 每家 `{ payableCents, paidCents, unpaidCents, prepaidCents }` | 规则同供应商端对账 | 订阅 `ap:*` |
| `GET /finance/suppliers/:id` | 财务 | `?status=unpaid|partial|paid&from=&to=&cursor=`（收货日期，默认全部）→ 汇总 + 有效正应付单据卡片 + `refunds[财务退款详情]`；已付单保留；预付按完整账本算；actions ⊆ registerPayment、allocatePrepaid | 收货日期为 received_at 的上海日期，阶段 5 入库取 doc_date；退款范围见 10.1 | 订阅 `ap:<id>` |
| `GET /finance/suppliers/:id/unpaid-docs` | 财务 | → `{ ledgerToken,prepaidCents,items[全部待付单据：version、unpaidCents、退货 / 改价记录、notice] }`；按收货日期、docType、id 升序，不分页；改价 notice「单价改过，请核对」 | 登记付款、核销预付的快照来源 | 订阅 `ap:<id>` |
| `POST /finance/payments` | 财务 | `{ supplierId,payDate,amountCents,methodName,note,ledgerToken,expected[{docType,docId,version,unpaidCents}],allocs[{docType,docId,amountCents}] }` + 幂等键；阶段 4 docType=po | 金额>0；日期不晚于今天，否则 fields.payDate「付款日期不能晚于今天」；方式启用；快照变化 → STALE「应付有变化，已刷新，请核对后再付」，整笔不写；每条 ≤ 待付、合计 ≤ 付款 | 锁供应商并按 10.1 复核；发号 FK、写 direct 核销，剩余预付；日志「登记付款」；按 10.2 通知 |
| `POST /finance/prepaid-payment-allocations` | 财务 | `{ supplierId,ledgerToken,expected[],allocs[] }` + 幂等键 | 同付款复核；合计 ≤ 当前预付，否则「可用预付只有 ¥…」 | 锁供应商；按付款 `(created_at,id)` 扣余额，写 prepaid 核销；日志「核销预付」；按 10.2 通知 |
| `GET /finance/payments/:id` | 财务 | → 付款详情、`allocations[全部核销历史]`、prepaidCents、`refunds[财务退款详情]`；每条带登记 / 生效金额、撤回信息和 actions；付款 actions ⊆ voidPayment、refundPayment | 同收款详情；不再绑定一张 docId | 订阅 `payment:<id>` |
| `POST /finance/payments/:id/void` | 财务（登记人、管理员） | `{ version,reason }` | 同作废收款 | 锁供应商 → 付款；条件更新、版本+1、尚有效核销撤回；日志「作废付款」；按 10.2 通知 |
| `POST /finance/payment-allocations/:id/revoke` | 财务（核销登记人、管理员） | `{ reason }` | 同收款核销撤回 | 锁供应商 → 付款 → 核销，写 revoked_*；日志「撤回核销」；按 10.2 通知 |
| `POST /finance/refunds` | 财务 | `{ kind:receipt|payment,receiptId?,paymentId?,refundDate,amountCents,methodName,note }` + 幂等键 → 财务退款详情 | kind 与唯一来源匹配、来源有效、金额>0 且不超本笔余额，否则「这笔最多可退 ¥…」；日期不晚于今天；方式启用（预收退款用付款方式，预付退款用收款方式） | 锁客户 / 供应商 → 资金来源；当前余额复查；发号 TK、日志「登记退款」；按 10.2 通知 |
| `POST /finance/refunds/:id/void` | 财务（退款登记人、管理员） | `{ version,reason }` → 财务退款详情 | 有效、版本一致、原因必填；非归属人 FORBIDDEN | 锁客户 / 供应商 → 来源 → 退款；条件更新、version+1；日志「作废退款」；按 10.2 通知 |
| `GET /finance/records` | 财务 | `?kind=receipt|payment&status=&from=&to=&cursor=` → 收付款记录；`counts` 恒为 `{}`（没有等待类状态，见第 1.3 节） | `kind` 由顶部收款 / 付款标签决定，不是筛选维度，默认 `receipt`（阶段 4 确认） | — |
| `GET/POST/PATCH /finance/methods` | 财务（登记时各端只读启用的） | `{ kind, name, enabled }` | `(kind, name)` 不重复；每类至少一种启用 | 日志「新增 / 停用收付款方式」 |

收款侧和付款侧用同一套核销计算函数（04 第 8 节），只换表；`expected` 复核、撤回、退款的校验也共用。财务不能作废售后（2026-10-02 梳理确认）。

### 10.1 财务快照、详情和视图

- 收款 / 付款表单来源返回 `ledgerToken`，覆盖该客户 / 供应商账本的业务单据版本、状态、金额、资金来源版本、核销登记 / 撤回、退款状态。核销或退款先发生后撤回，即使未收 / 待付数值恢复，也不能复用旧凭据。凭据只作过期检测，不替代权限和金额校验。
- `expected` 必须完整覆盖打开表单时返回的候选单据，每单只一条；`allocs` 的目标必须出现在 expected 中，每单只一条，金额为正整数分、不得超过当前未收 / 待付；合计不得超过收付金额或可用预收 / 预付。没有候选单也允许登记纯预收 / 预付（expected、allocs 均为空，仍带凭据）。缺凭据、重复项、缺 expected → `VALIDATION_FAILED`；跨客户 / 供应商目标 → `NOT_FOUND`，不能用凭据伪造归属。
- 锁住客户 / 供应商后复核凭据、版本、金额、对象、状态、资金余额；变化 → `STALE`，latest 为最新表单数据（含新凭据），全部核销、资金、日志一起不写。写与多表读均要一致性快照，不能将不同时间的单据、核销、退款拼成一份账本。
- 财务核销历史字段统一 `{ id,kind,createdAt,registeredCents,effectiveCents,status:'valid'|'revoked',revokedAt,revokedBy,revokeReason,actions,...目标单据标识 }`；`revokedBy` 为 `{id,name}` 或 null。财务详情列所有历史，金额 0 也列，按钮归这条核销登记人和管理员。外部单据只投影有效且生效>0 的 `{date,amountCents}`，amountCents 取 effectiveCents，不取登记金额。
- 财务退款详情统一 `{ id,no,version,kind,receiptId,paymentId,refundDate,amountCents,methodName,note,status,voidReason,voidedAt,voidedBy,actions }`，`voidedBy` 为 `{id,name}` 或 null，唯一来源以外的 id 为 null，actions 只可能 voidRefund。收付款详情与财务对账内嵌此对象，作废接口返回同一对象，不另增退款详情页接口。对账退款包括作废状态，出货 / 收货日期筛选只筛业务单据和汇总，不裁掉资金历史；外部供应商只返回 no、date、amountCents、status。
- `GET /finance/afters/:id`，财务权限，返回售后只读详情，`actions` 恒为 `[]`，订阅 `after:<id>`；F3 即使是管理员或销售+财务账号也使用这个视图。普通 `GET /afters/:id` 仍按销售权限处理，纯财务可读但无写操作；财务角色不能绕过后端调用售后作废。
- 锁序统一为客户 / 供应商 → 业务单据（固定类型、id 顺序）→ 售后 / 收付款 → 核销 / 退款 → 花材 → 批次；需要归属指针时先只读查 id，再按顺序锁并复查。涉及多种表时采用统一固定表序、多条同类记录按 id 升序，不能由各接口临时决定；不先锁售后再反向锁订单，不先锁付款再反向锁采购单。售后新建 / 处理 / 关闭 / 作废、采购收货 / 退货 / 改价 / 作废、手工入库及其改价 / 作废都遵守对应账本锁；纯出库 / 报损无需财务对象锁。
- 整笔作废来源时只撤回尚有效核销，按来源作废记录记反向操作，保留其他人此前的单条撤回历史；不能要求来源登记人逐条冒充核销登记人。

### 10.2 重算和通知

- 金额或资金变化后，复用收付重算函数，比较该客户 / 供应商的全部账本结果；不仅看当前操作的单据，历史核销恢复后其他单据也可能变成未收 / 待付。
- 通知所有生效核销、余额、actions 或状态受影响的 `order:<id>` / `po:<id>` / `wh_doc:<id>`、`receipt:<id>` / `payment:<id>`，以及相关 `ar:` / `ap:`、`todo:finance` 和列表主题。退货 / 作废库存类另通知 `stock`、`demand`；供应商可见采购状态变化另通知 `supplier:<id>`。
- 原单据业务内容未变而派生值变了，通知 `version:null` 表示强制重拉；前端不能因原 version 相同而跳过刷新。scope 只覆盖实际受影响门店、供应商，不向同客户其他门店泄漏核销信息，外部只收到授权主题、不收到内部财务内容。
- 所有通知在业务事务提交后投递，回滚不发。退款作废、核销撤回、来源作废也必须刷新待办与资金详情，不能只推一张业务单据。

## 11. 文件上传

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `POST /files/upload-ticket` | 门店 / 销售（售后图）、销售（产品图）、仓库（报损图） | `{ purpose,mime,sizeBytes }` → `{ fileId,uploadUrl,formData,expiresAt }`，wx.uploadFile 直传 | after_image、product_image、loss_image ≤ IMAGE_MAX_BYTES，格式限 IMAGE_MIME_TYPES；门店只能 after_image，仓库报损用 loss_image；账号模块权限按用途校验，错用途 FORBIDDEN；签名限一个对象键 | 写 files(status=pending) |
| `POST /files/:id/complete` | 上传人（别人的 → `NOT_FOUND`） | `{}` → `{ status, url, thumbUrl }` | COS 里没有这个对象 → `BUSINESS_RULE`「图片没有上传成功，请重试」 | 调微信内容安全检测（预留，接口未启用时直接 `ok`）；`rejected` → `BUSINESS_RULE`「图片未通过审核，请换一张」；pg-boss 生成缩略图 |
业务接口只接受用途匹配、无重复且 `status=ok` 的 `fileId`，售后、报损图片还必须是本人上传的，否则 `BUSINESS_RULE`「图片没有上传成功，请重试」。单据详情里的图片直接带临时读取签名地址（`url`、`thumbUrl`，有效 `FILE_URL_TTL_MINUTES`），不另开取地址的接口。前端上传顺序：申请签名 → `wx.uploadFile` 直传 COS → `complete` → 表单里带 `fileId`。

## 12. 实时推送

### 12.1 连接

- 小程序在前台时用 `wx.cloud.connectContainer` 连 `/ws`，一个小程序只保持一条连接；切到后台断开，回到前台重连，重连后当前页整页刷新一次。
- 握手时云托管同样注入 `X-WX-OPENID`，服务端查账号，得到角色和数据归属，存在连接上。没绑定、停用 → 关闭连接（关闭码 4401 / 4403），前端按 `UNAUTHENTICATED` / `ACCOUNT_DISABLED` 处理。
- 心跳：客户端每 `WS_PING_INTERVAL_SECONDS` 发 `{ op: "ping" }`，服务端回 `{ op: "pong" }`；超过 `WS_IDLE_TIMEOUT_SECONDS` 没收到心跳就关闭连接。

### 12.2 订阅消息

```json
{ "op": "subscribe", "topics": ["order:123", "todo:shipping"] }
{ "op": "unsubscribe", "topics": ["order:123"] }
```

页面 `onShow` 订阅、`onHide` / `onUnload` 退订。服务端收到订阅时按连接的角色和数据归属检查主题，没权限的主题直接忽略（不报错、不推送）。

| 主题 | 含义 | 谁能订阅 |
|---|---|---|
| `order:<id>`、`after:<id>` | 某张订单、售后 | 销售、发货（订单）、财务、这家门店 |
| `orders`、`afters` | 订单、售后列表有变化 | 销售、发货（订单）、财务、门店（只收本店的） |
| `po:<id>`、`pos` | 某张采购单、采购单列表 | 采购、仓库、财务、这家供应商 |
| `invite:<id>`、`invites` | 某张邀请、邀请列表 | 采购、这家供应商 |
| `wh_doc:<id>`、`wh_docs` | 手工出入库单 | 仓库、财务（手工入库） |
| `receipt:<id>` | 收款 | 财务 |
| `payment:<id>` | 付款 | 财务 |
| `ar:<customerId>` | 客户对账、发货单收款状态 | 财务；门店（本客户，只收本店相关） |
| `ap:<supplierId>` | 供应商对账 | 财务；这家供应商 |
| `supplier:<supplierId>` | 供应商端的邀请、采购单列表 | 这家供应商 |
| `catalog:<customerId>` | 订货目录 | 销售；这个客户的门店 |
| `stock`、`demand` | 库存、采购需求 | 员工（库存查询）、仓库；采购（需求） |
| `todo:<module>` | 模块首页待办、底栏角标 | 有该模块权限的员工 |
| `account:<id>` | 账号被停用、解绑、改了模块 | 本人 |
| `store_invites:<storeId>` | 门店邀请生成、使用 | 销售 |

### 12.3 推送消息

```json
{ "op": "changed", "topic": "order:123", "version": 5 }
```

- 只带「哪张单变了」：每个变更的主题一条消息，`topic` 就是订阅用的主题（单据 ID 在主题里，是字符串），`version` 是单据的新版本号（列表、待办这类主题为 `null`）。不带单据内容，也不带归属（归属只在服务端过滤时用，第 12.4 节）。通配订阅（`todo:*`、`ar:*`、`ap:*`）收到的是具体主题，例如 `todo:sales`。
- 前端收到后：详情页比较 `version`，比当前新就重新拉接口，并在页面写「销售修改了这张订单，已刷新成最新内容」这类提示；表单页正在编辑时不直接覆盖，先提示并给「查看最新内容」；列表页、待办静默刷新。
- `version:null` 的详情变化通知（财务派生值、配方影响的需求等）必须重拉，不能与当前版本比较后忽略；表单仍保留输入并提示，资金提交按凭据复核。需求列表刷新保留当前筛选和仍可选的勾选项。
- `account:<id>` 收到后前端重新取 `/me`，停用了就进停用页。

### 12.4 服务端实现

1. 写接口在业务事务里调用 `pg_notify('hz_changes', payload)`。PostgreSQL 在事务提交后才投递，回滚就不发，保证「推送的一定是已提交的数据」。
2. 每个云托管实例启动时用一条专用连接 `LISTEN hz_changes`（不走连接池），断线自动重连，重连后给本实例所有 WebSocket 发一次 `{ op: "resync" }`，前端整页刷新。
3. 收到通知后，按主题找本实例订阅了的连接（含通配订阅），再按连接的角色和 `scope` 过滤（门店只收 `scope.storeIds` 含本店的，供应商只收 `scope.supplierIds` 含本家的；财务的 `wh_doc` 只收带供应商的手工入库单），然后推送。一次写操作可能涉及多家门店（例如一笔收款核销了几家门店的发货单）或新旧两家供应商（换供应商），所以 `scope` 是数组。
4. payload 小于 8000 字节（PostgreSQL 限制），格式 `{ changes: [{ topic, version }], scope: { storeIds, supplierIds } }`。
5. `account:<id>` 有变更时，服务端重新查这个账号在本实例的连接：解绑 → 关闭（4401），停用 → 关闭（4403），改了模块 → 按新权限去掉没权限的订阅，再推 `account:<id>`。
6. 推送是尽力而为。丢了不影响正确性：提交时的版本号条件更新仍会返回 `STALE`。

每种写操作推哪些主题只写在该接口条目的「锁 / 日志 / 推送」列，不另列汇总表。

## 13. 覆盖核对

03 章第 5 节每一项操作对应的接口：

| 操作 | 接口 |
|---|---|
| 门店改单 / 门店取消订单 | `PUT /store/orders/:id`、`POST /store/orders/:id/cancel` |
| 申请取消 / 撤回取消申请 | `POST /store/orders/:id/cancel-request`、`/cancel-request/withdraw` |
| 同意 / 拒绝取消申请 | `POST /orders/:id/cancel-request/approve`、`/reject` |
| 确认订单 / 修改并确认 / 修改订单 / 取消订单 | `POST /orders/:id/confirm`、`PUT /orders/:id`、`POST /orders/:id/cancel` |
| 确认发货 / 作废已发货订单 | `POST /orders/:id/ship`、`POST /orders/:id/void` |
| 申请售后 / 处理售后 / 关闭售后 / 作废售后 | `POST /store/afters`、`POST /afters/:id/process`、`POST /afters/:id/close`、`POST /afters/:id/void` |
| 登记收款、核销预收 / 作废收款 / 撤回核销 | `POST /finance/receipts`、`POST /finance/prepaid-allocations`、`POST /finance/receipts/:id/void`、`POST /finance/allocations/:id/revoke` |
| 修改、取消邀请 / 提交填报 | `PUT /invites/:id`、`POST /invites/:id/cancel`、`POST /supplier/invites/:id/submit` |
| 修改采购单 / 取消采购单 | `PUT /purchase-orders/:id`、`POST /purchase-orders/:id/cancel` |
| 供应商改单 / 供应商取消采购单 | `PUT /supplier/purchase-orders/:id`、`POST /supplier/purchase-orders/:id/cancel` |
| 确认收货 / 拒收 / 退货 / 改单价 / 作废（采购单） | `POST /purchase-orders/:id/receive`、`/returns`、`/reprice`、`/void` |
| 改单价（手工入库单）/ 作废手工入库单、手工出库、报损 | `POST /warehouse/docs/:id/reprice`、`/void` |
| 登记付款、核销预付 / 作废付款 / 撤回核销 | `POST /finance/payments`、`POST /finance/prepaid-payment-allocations`、`POST /finance/payments/:id/void`、`POST /finance/payment-allocations/:id/revoke` |
| 登记退款 / 作废退款 | `POST /finance/refunds`、`POST /finance/refunds/:id/void` |
| 从其他客户复制目录 | `POST /catalog/:customerId/copy` |

03 章第 3 节每个状态都有枚举码，见 04 第 2 节（发货单收款状态、付款状态是算出来的，也有码）。

## 14. 现行接口规则与可调整参数

第 1、3 条描述正文现行规则，按规格书实现；第 2、4 条中的数值默认值是技术参数，可按项目需要调整。新业务决定仍需确认。

1. 门店账号的登录手机号录入位置：原型没有，本文放在销售「门店资料」里填（和供应商端账号对称）；绑定微信走邀请下单链接（已确认）。
2. `IMAGE_MAX_BYTES` 的初始值是本文默认值（见 1.6）。门店邀请有效期 `STORE_INVITE_TTL_DAYS`、填报链接不设有效期，已确认。
3. 发货按 03 章现行规则可以多发，`shippedQty ≥ 0`，不设订货数量上限；实发不一致必须写备注，全 0 不可发货，不沿用原型的禁止多发规则。
4. 第 1.6 节 `RECONNECT_DELAYS_SECONDS` 的初始值是阶段 0 时由我默认的，可以改。
