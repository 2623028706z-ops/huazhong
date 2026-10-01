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
- `FORBIDDEN` 另用于供应商填报链接被别家或非供应商账号打开（第 8 节）；其他归属不符一律 `NOT_FOUND`（1.2）。
- `VALIDATION_FAILED` 的 `fields` 键是字段路径，明细行写 `lines.0.qty`。
- `STALE` 的 `latest` 是最新详情，含新的 `actions`、`lockedReason`。
- 每个接口可能返回的错误码定义在 `shared/contract`；下文各接口的「校验和错误」列是它的文字版。

### 1.5 `actions` 和 `lockedReason`

- 每张单据的详情接口和列表项都返回：
  - `actions`：当前账号在这张单上能看到的操作按钮，`[{ code, enabled, disabledReason, reasonRequired }]`，例如 `[{ "code": "confirm", "enabled": false, "disabledReason": "门店已停用，启用后才能确认", "reasonRequired": false }, { "code": "cancel", "enabled": true, "disabledReason": null, "reasonRequired": false }]`。
    - `enabled`：`true` 可点；`false` 显示成禁用，原因写在 `disabledReason`（文案在 `shared/copy`），`enabled` 为 `true` 时 `disabledReason` 为 `null`。
    - `reasonRequired`：提交时是否必须写原因，前端据此决定弹层里要不要原因框；只是打开页面或表单、这一步不提交的操作为 `null`。
  - `lockedReason`：需要写状态提示时的一句话（例如「已付款，不能再退货或改单价」），可以和 `actions` 同时出现，没有为 `null`。
- 不在 `actions` 里 = 这个账号现在看不到这个按钮；在里面但 `enabled: false` = 显示禁用。能不能换供应商也用操作码表达（`changeSupplier` 在不在列表里），不另加布尔字段。
- 两者都是查询时由后端按「账号角色 + 数据归属 + 单据当前状态」算出来的，不存库（04 第 8.1 节）。同一个判断函数同时用于算 `actions` 和写接口的前置校验，不写两份。
- 前端按 00 章第 1 节显示，不根据状态自己推算；只和本页输入有关的条件（例如还没勾选花材）由前端自己禁用。
- `actions` 只判断打开页面时就能判断的前提（状态、是否付过款、门店是否启用、单据来源等）。和提交内容有关的规则（数量上限、单价只能改低、少发要写发货备注、收货改了单价要写原因）在提交时校验，返回 `VALIDATION_FAILED` 或 `BUSINESS_RULE`。
- 写接口不信任前端：提交时按同一前提再判断一次。没有这个操作 → `STALE`（`latest` 带最新的 `actions`）或 `BUSINESS_RULE`；`reasonRequired: true` 却没写原因 → `VALIDATION_FAILED`（`fields.reason`）。
- 操作码是 `shared` 里的枚举，中文按钮名在 `shared/copy`。
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
| `createAfter` | 新建售后 | `GET /afters`（客户售后） | 销售 |
| `applyAfter` | 申请售后 | `GET /afters`（门店售后） | 门店 |

单据级操作码总表（出现条件对应 03 章第 5 节；「—」表示不适用）：

| 操作码 | 按钮 | 单据 | 谁 | 出现条件 | `enabled: false` 的条件和 `disabledReason` | `reasonRequired` | 不出现时的 `lockedReason` |
|---|---|---|---|---|---|---|---|
| `storeEdit` | 修改订单 | 订单 | 门店 | 待确认 | 客户停用：「这个客户已停用，不能再修改订单，请联系花众」 | `false` | 待发货：「销售已确认，如需修改请联系花众销售」 |
| `storeCancel` | 取消订单 | 订单 | 门店 | 待确认 | — | `false` | 同上 |
| `applyAfter` | 申请售后 | 订单 | 门店 | 已发货，至少一行可申请数量 > 0 | 过了售后申请期限（04 第 8 节）：「已超过售后申请时间，请联系花众销售」 | `null` | 「这张订单的产品都已申请过售后」 |
| `confirm` | 确认订单（弹层里选出货日期） | 订单 | 销售 | 待确认 | 按顺序取第一条：门店停用「门店已停用，启用后才能确认」；客户停用「客户已停用，启用后才能确认」；单里有已停订或停用的产品「白绿清新花束已停订，请修改并确认或取消订单」（按实际产品名，多个用「、」连） | `false` | — |
| `editAndConfirm` | 修改并确认 | 订单 | 销售 | 待确认 | 门店停用、客户停用，文案同 `confirm`（有停订产品时照常可点，进表单删掉） | `true` | — |
| `edit` | 修改订单 | 订单 | 销售 | 待发货 | — | `true` | — |
| `cancel` | 取消订单 | 订单 | 销售 | 待确认或待发货 | — | 待确认 `false`，待发货 `true` | — |
| `createAfter` | 新建售后 | 订单 | 销售 | 已发货，至少一行可申请数量 > 0 | — | `null` | 同 `applyAfter` |
| `ship` | 确认发货 | 订单 | 发货 | 待发货 | 出货日期晚于今天：「出货日期还没到，不能发货」 | `false` | — |
| `processAfter` | 处理售后 | 售后 | 销售 | 待处理 | — | `false` | — |
| `closeAfter` | 关闭售后 | 售后 | 销售 | 待处理 | — | `true` | — |
| `voidAfter` | 作废售后 | 售后 | 销售、财务 | 已处理 | — | `true` | — |
| `allocate` | 核销预收 | 客户对账 | 财务 | 客户预收 > 0 且有未收的发货单 | — | `false` | — |
| `voidReceipt` | 作废收款 | 收款 | 财务 | 有效 | — | `true` | — |
| `editPo` | 修改采购单 | 采购单 | 采购 | 待收货 | — | `true` | 已收货：「已收货，采购不能再修改」 |
| `changeSupplier` | 换供应商（修改表单里的供应商可选） | 采购单 | 采购 | 待收货、手工下的单；填报生成的没有 | — | `null`（随修改采购单一起提交） | — |
| `cancelPo` | 取消采购单 | 采购单 | 采购 | 待收货 | — | `true` | 同 `editPo` |
| `receive` | 确认收货 | 采购单 | 仓库 | 待收货 | — | `false` | — |
| `return` | 退货 | 采购单 | 仓库 | 已收货、没付过款、没全部退货 | — | `false` | 付过款：「已付款，不能再退货或改单价」；全部退货：「已全部退货」 |
| `reprice` | 改单价 | 采购单、手工入库单 | 仓库 | 采购单已收货、手工入库单已入库；没付过款 | — | `true` | 付过款：采购单同上；手工入库单「已付款，不能再改单价或作废」 |
| `void` | 作废 | 手工入库单 | 仓库 | 已入库、没付过款 | — | `true` | 付过款：同上；已作废：「已作废，不能再改单价」 |
| `pay` | 登记付款 | 采购单、手工入库单 | 财务 | 应付 > 0、没有有效付款 | — | `false` | 应付 0：「无需付款」 |
| `voidPayment` | 作废付款 | 付款 | 财务 | 有效 | — | `true` | — |
| `editInvite` | 修改邀请 | 填报邀请 | 采购 | 待填报 | — | `false` | — |
| `cancelInvite` | 取消邀请 | 填报邀请 | 采购 | 待填报 | — | `false` | — |
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

操作日志页可选的模块就是 `modules`（管理员五个模块，员工是自己的模块），多于一项时前端才显示模块筛选；原来单列的 `filters.modules` 和 `modules` 完全相同，按 00 章第 7 节去掉。

## 3. 公共

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /modules/:key/todos` | 有该模块权限 | → `{ count, items[] (最多 `TODO_PREVIEW_COUNT` 条卡片) }`；销售 = 待确认订单 + 待处理售后；发货 = 出货日期不晚于今天的待发货（按出货日期升序）；采购 = 待填报邀请；仓库 = 待收货；财务 = 待付款单据 + 有预收的客户 | — | 订阅 `todo:<key>` |
| `GET /badges` | 已绑定 | → 底栏角标：门店购物车不算（前端本地）、供应商待填报数、各模块待办数 | — | 订阅 `todo:*` |
| `GET /inventory` | 所有员工 | `?q=&categoryId=&cursor=&limit=` → 列表，项 `{ id, code, name, categoryId, categoryName, unit, enabled, stockQty }`；全部花材（含库存 0、含停用），按编码升序分页；`q` 匹配名称或编码；`stockQty` = 批次 `left_qty` 合计；列表级 `actions` 为 `[]` | — | 订阅 `stock` |
| `GET /logs` | 员工、管理员 | `?module=&from=&to=&cursor=&limit=` → 列表，项 `{ id, createdAt, module, kind, action, targetLabel, actorLabel }`（`module` 为 `null` 是公共）；按时间倒序；`from`、`to` 按上海日期筛 `created_at` | 管理员不传 `module` 看全部（含公共）；员工不传 `module` 看自己全部模块（不含公共），传了别的模块 → `FORBIDDEN` | — |
| `GET /logs/:id` | 同上 | → 列表项字段 + `{ reason, before, after }` | 员工读不属于自己模块的（含公共）→ `NOT_FOUND` | — |
| `GET /staff` | 管理员 | `?cursor=&limit=` → 列表，项 `{ id, version, name, phone, admin, modules, enabled, actions }`（不含门店、供应商账号），按新增先后；项 `actions` 只可能有 `unbindStaffWechat`；列表级 `actions` 含 `create` | — | — |
| `POST /staff` | 管理员 | `{ name, phone, admin, modules[] }` → 列表项 | 名字必填「请填写名字」；手机号「请填写 11 位登录手机号」；不是管理员时至少一个模块「请至少选一个模块」；管理员的 `modules` 不存（默认全部）；手机号在启用账号里重复 → `VALIDATION_FAILED` `fields.phone`「这个手机号已经被其他账号使用」 | 日志「新增员工」（公共） |
| `PATCH /staff/:id` | 管理员 | `{ version, name, phone, admin, modules[], enabled }` → 列表项 | 同新增；不能停用或降级最后一个启用的管理员 → `BUSINESS_RULE`「至少要保留一个启用的管理员」；内容没变 → `BUSINESS_RULE`「没有修改内容」；版本变了 → `STALE`「这个员工刚被修改，已刷新成最新内容」 | 条件更新；改了手机号或停用时同时清空 `openid`、`bound_at`，日志原因写「同时解绑微信」；日志「修改员工」（公共，记前后）；推送 `account:<id>` |
| `POST /staff/:id/unbind-wechat` | 管理员 | `{ version }` → 列表项 | 员工已绑定微信，否则 `STALE`「这个员工还没绑定微信」 | 条件更新；清空 `openid`、`bound_at`；日志「解绑微信」（公共）；推送 `account:<id>`（对方连接断开） |

## 4. 销售

订单、售后接口门店端、发货、财务也会读，读的范围按角色过滤（门店只看本店）。写接口的「谁」严格按下表。

| 接口 | 谁 | 入参 → 出参 | 校验和错误（前提见 03 章第 5 节） | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /orders` | 销售、发货、财务、门店（本店） | `?status=&customerId=&from=&to=&q=&cursor=`（`from`、`to` 按下单日期）→ 卡片列表（金额、总数、`shipDate`（待确认为 `null`）、`changed`、`repriced`，每项带 `actions`、`lockedReason`）；列表级 `actions` ⊆ `create`（销售） | 发货只能查 `to_ship`、`shipped` | 订阅 `orders` |
| `GET /orders/:id` | 同上 | → 详情：明细（每行 `priceCents`、`listPriceCents`（下单时的目录价，和 `priceCents` 不同即「改价」）、`discontinued`（目录里停订或产品本身停用为 `true`，门店改单、销售改单时标「已停订」）；已发货的另带 `shippedQty`、`maxQty`（可申请售后数量））、变更记录、发货信息、取消原因、`version`；已发货的带售后列表；`actions` ⊆ 门店 `storeEdit`、`storeCancel`、`applyAfter`，销售 `confirm`、`editAndConfirm`、`edit`、`cancel`、`createAfter`，发货 `ship`，财务 `[]`；门店或客户停用时 `confirm`、`editAndConfirm` 为 `enabled: false`，有停订产品时 `confirm` 为 `enabled: false`（文案见 1.5）；`cancel` 的 `reasonRequired` 待确认 `false`、待发货 `true` | 不属于你 → `NOT_FOUND` | 订阅 `order:<id>` |
| `POST /orders` | 销售 | `{ customerId, storeId, shipDate, note, lines[{productId, qty, priceCents}] }` + 幂等键 → 新订单（`to_ship`） | 客户启用，否则 `BUSINESS_RULE`「这个客户已停用，不能再下新单」；门店属于客户且启用；产品本身启用、在该客户目录里且启用；出货日期必填、可早于今天；下单日期由服务端写今天，不接受传入；`qty>0`、`priceCents>=0` | 发号 SO；日志「新建订单」；推送 `orders`、`todo:shipping` |
| `POST /orders/:id/confirm` | 销售 | `{ version, shipDate }` | 状态 `pending_confirm`；门店启用，否则 `BUSINESS_RULE`「门店已停用，启用后才能确认」；客户启用，否则「客户已停用，启用后才能确认」；单里没有已停订或停用的产品，否则「白绿清新花束已停订，请修改并确认或取消订单」；`shipDate` 必填、可早于今天，缺 → `VALIDATION_FAILED` `fields.shipDate`「请选择出货日期」 | 条件更新；写 `ship_date`（不写 `order_changes`）；日志「确认订单」（记出货日期）；推送 `order:<id>`、`orders`、`todo:sales`、`todo:shipping` |
| `PUT /orders/:id` | 销售 | `{ version, shipDate, note, reason, lines[] }` → 详情 | 状态 `pending_confirm`（修改并确认，P5，保存后 `to_ship`）或 `to_ship`（修改订单）；原因必填；`shipDate` 必填、可早于今天；内容没变 → `BUSINESS_RULE`「没有修改内容」；`pending_confirm` 时门店、客户须启用；明细里还有已停订或停用的产品 → `BUSINESS_RULE`「白绿清新花束已停订，请先删掉再保存」；新加的行产品须启用、在该客户目录里且启用；原有行保持原单价 | 条件更新；整组替换明细；有差异写 `order_changes`（`pending_confirm` 时出货日期从空到有不算差异）；日志「修改并确认订单」/「修改订单」（前后）；推送同上 |
| `POST /orders/:id/cancel` | 销售 | `{ version, reason? }` | 状态 `pending_confirm`（原因不用）或 `to_ship`（原因必填，缺 → `VALIDATION_FAILED fields.reason`）；弹窗打开后被确认：前端拿到 `STALE`，`latest` 里 `cancel` 的 `reasonRequired` 变成 `true`，改成要原因 | 条件更新；日志「取消订单」；推送 `order:<id>`、`orders`、`todo:*` |
| `GET /afters` | 销售、门店（本店）、财务 | `?status=&customerId=&from=&to=&cursor=` → 卡片（已关闭、已作废不带金额）；列表级 `actions` ⊆ 销售 `createAfter`，门店 `applyAfter` | | 订阅 `afters` |
| `GET /afters/:id` | 同上 | → 详情：明细（每行同时返回门店原始申请数量 `requestedQty` 和售后数量 `qty`；销售新建的 `requestedQty` 为 `null`；每行另带 `maxQty`（排除本张后的可申请数量）、`shipPriceCents`（发货单价，售后单价只能改低））、问题说明、图片签名地址、处理说明、关闭 / 作废原因；`actions` ⊆ 销售 `processAfter`、`closeAfter`、`voidAfter`，财务 `voidAfter`，门店 `[]`；`notice`：提示条文案（已处理时「发货单应收已减去售后金额」），没有为 `null` | | 订阅 `after:<id>` |
| `POST /afters` | 销售 | `{ orderId, note, lines[{orderLineId, qty, priceCents, reason, description}] }` + 幂等键 → `processed` | 订单 `shipped`，不看售后申请期限；`qty>0` 且 ≤ 可申请数量；`priceCents` ≤ 发货单价；每行 `reason` 必选，`description` 选填，不收图片 | 行锁订单（串行化同一订单的售后）；发号 AS；写 `amount_cents`，`requested_qty` 为空；日志「新建售后」；推送 `afters`、`order:<orderId>`、`ar:<customerId>` |
| `POST /afters/:id/process` | 销售 | `{ version, note, lines[{id, qty, priceCents}] }` | 状态 `pending`；门店提交的只能改 `qty`、`priceCents`，`requestedQty` 不覆盖，传了新增或删除行 → `BUSINESS_RULE`「门店提交的售后只能改数量和单价」，传了原因、说明、图片忽略；`qty>=0`，全 0 → `BUSINESS_RULE`「数量都是 0，整张不处理请关闭售后并写原因」；`qty` ≤ 可申请数量（排除本张）；单价只能改低 | 行锁订单 + 条件更新售后；日志「处理售后」（前后）；推送 `after:<id>`、`afters`、`todo:sales`、`ar:<customerId>` |
| `POST /afters/:id/close` | 销售 | `{ version, reason }` | 状态 `pending`；原因必填 | 条件更新；日志「关闭售后」；推送 `after:<id>`、`afters`、`todo:sales` |
| `POST /afters/:id/void` | 销售、财务 | `{ version, reason }` | 状态 `processed`；原因必填；不限时间 | 条件更新；日志「作废售后」（模块按调用人）；推送 `after:<id>`、`afters`、`order:<orderId>`、`ar:<customerId>` |

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
| `GET /catalog/:customerId` | 销售 | → `{ customerId, customerName, categories[{id, name, sort, itemCount}], items[] }`；目录项带 `categoryId`、`categoryName`、`customerCode`、`listPriceCents`、`enabled`（停订为 false）、`productEnabled`、`version`、`productVersion`、配方明细 `bom`（和产品列表同一结构），按订货分类、产品排（2026-10-03 确认）；销售新建订单时产品和默认单价从这里取 | | — |
| `PUT /catalog/:customerId/items/:productId` | 销售 | `{ version?, categoryId, customerCode, priceCents, enabled, product?{version, bom[{materialId, qty}]} }` → 整份目录；新加进目录的不带 `version`；配方改了才带 `product`（2026-10-03 确认） | 分类必选且须是这个客户的 →「请选择订货分类」；`customerCode` 同客户重复 → `fields.customerCode`「这个客户下已有相同的产品编码」；停用的产品不能新加进目录；目录项或产品版本过期 → `STALE`（带最新目录，整体不改）；什么都没变 → `BUSINESS_RULE` | 行锁这个客户的目录项（和门店下单、改单的共享锁互斥）；带 `product` 时同一事务行锁产品、换配方、产品 `version` +1、日志「修改产品」；改了价的同一事务按 `id` 升序行锁这个客户含这种产品的待确认订单，把 `price_cents`、`list_price_cents` 改成新目录价、订单 `version` +1，不写 `order_changes`；日志「修改订货目录」（订货分类、客户产品编码、订货价、状态的前后，另写「同步待确认订单 SO-…」）；推送 `catalog:<customerId>`（产品资料、配方改了再推目录里有这个产品的每个客户），同步了订单时加 `order:<id>`、`orders` |
| `POST /catalog/:customerId/categories`、`PATCH /catalog/:customerId/categories/:id` | 销售 | 新增（+ 幂等键）、改名 `{ name }` → 整份目录 | 同客户重名 → `fields.name`「已有同名分类」；分类不是这个客户的 → `NOT_FOUND` | 行锁客户；新增排最后；日志「新增分类」「修改分类」（订货目录）；推送 `catalog:<customerId>` |
| `PUT /catalog/:customerId/category-order` | 销售 | `{ ids[] }`（这个客户全部订货分类的新顺序）→ 整份目录 | `ids` 必须正好是这个客户现有全部分类，否则 `STALE` | 按顺序重写 `sort`；日志「调整分类顺序」 |
| `DELETE /catalog/:customerId/categories/:id` | 销售 | → 整份目录 | 分类下还有目录项（含停订的）→ `BUSINESS_RULE`「分类中仍有目录产品，请先换分类」 | 日志「删除分类」 |

## 5. 门店端

门店账号只能读写本店（`accounts.store_id`）。购物车只存在前端，不走接口。

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /store/home` | 门店 | → `{ customerId, orderableCount, lockedReason }`：`customerId` 是本店所属客户，前端订阅 `catalog:<customerId>`、`ar:<customerId>` 用；`orderableCount` 是本客户启用的目录项数（产品本身也须启用），和订货目录的可订款数同一口径；`lockedReason` 客户停用时为「这个客户已停用，不能再下新单，请联系花众」，否则 `null` | — | 订阅 `catalog:<customerId>` |
| `GET /store/catalog` | 门店 | 不带参数 → `{ categories, items }`：本客户启用的目录项全部一次给全（产品本身也须启用）（产品、订货分类、单位、客户产品编码 `customerCode`、目录价 `listPriceCents`、图片缩略图；`categories` 是这个客户的订货分类，只含有可订产品的）；分类切换和跨分类搜索在页面里筛，购物车用同一份数据核对停订 | 门店停用 → `ACCOUNT_DISABLED`（守卫统一拦）；客户停用 → `BUSINESS_RULE`「这个客户已停用，不能再下新单，请联系花众」，门店账号照常登录（03 章第 5 节） | 订阅 `catalog:<customerId>` |
| `POST /store/orders` | 门店 | `{ note, lines[{productId, qty}] }` + 幂等键 → 订单（`pending_confirm`，`shipDate` 为 `null`） | 客户停用 → `BUSINESS_RULE`「这个客户已停用，不能再下新单，请联系花众」；门店不传出货日期（由销售确认时定）；产品本身启用、在目录里且启用；单价取目录价（门店不能传单价） | 发号 SO；日志「门店下单」；推送 `orders`、`todo:sales` |
| `PUT /store/orders/:id` | 门店 | `{ version, note, lines[] }` → 订单 | 状态 `pending_confirm`，已取消 → `STALE`「订单已被取消，不能再修改」，已确认 → `STALE`「销售已确认，门店不能再修改，请联系销售」；客户停用 → `BUSINESS_RULE`「这个客户已停用，不能再修改订单，请联系花众」；原单里已停订或停用的产品还在 → `BUSINESS_RULE`「白绿清新花束已停订，请先删掉再提交」；所有行按当前目录价重算（单价、目录价快照）；内容没变 → 不写变更记录，直接返回 | 条件更新；整组替换明细；有差异写 `order_changes`（原因空）；日志「门店改单」；推送 `order:<id>`、`orders`、`todo:sales` |
| `POST /store/orders/:id/cancel` | 门店 | `{ version }` | 状态 `pending_confirm`（不用原因）；已确认 → `STALE`「销售已确认，请联系销售取消」 | 条件更新；日志「门店取消订单」；推送同上 |
| `POST /store/afters` | 门店 | `{ orderId, lines[{orderLineId, qty, reason, description, imageFileIds[]}] }` + 幂等键 → 售后（`pending`） | 订单本店且 `shipped`；在售后申请期限内（04 第 8 节），否则 `BUSINESS_RULE`「已超过售后申请时间，请联系花众销售」；至少一行；`qty>0` 且 ≤ 可申请数量（可申请数量见 03 章第 4 节）→ `VALIDATION_FAILED`「售后数量须大于 0，且不超过实发数量减去已申请的售后」；每行问题说明必填；图片每行 ≤ `AFTER_IMAGE_MAX_COUNT` 张、`status=ok` | 行锁订单；发号 AS；单价取发货单价，`requested_qty` = `qty`；日志「申请售后」；推送 `afters`、`todo:sales` |
| `GET /store/statement` | 门店 | `?from=&to=&cursor=`（`from`、`to` 按出货日期，都不传 = 全部；对账格按区间算）→ `{ shippedCents, afterCents, paidCents, unpaidCents, items[发货单卡片：`payStatus`（`unpaid` / `partial` / `paid`，门店端显示未付 / 部分付 / 已付）、`unpaidCents`、`offsetByAfter`（售后刚好抵完）] }` | 范围见 03 章第 4 节（门店对账） | 订阅 `ar:<customerId>`（服务端只推本店相关） |

门店的订单列表、详情、售后列表、详情复用第 4 节的 `GET /orders*`、`GET /afters*`，按本店过滤；售后金额只在门店的售后里返回，已关闭、已作废的不带金额。

## 6. 发货

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /shipping/orders` | 发货 | `?status=to_ship|shipped&q=&cursor=` → 卡片 + `counts`（只有 `to_ship`）；`status` 不传 = 全部：待发货在前，按出货日期升序（含出货日期以后的）；已发货在后，按发货时间降序；同一出货日期或发货时间按 id。游标记着所在的段，翻页跨过两段之间也不重不漏；拿别的状态的游标来翻 → `VALIDATION_FAILED` `fields.cursor` | | 订阅 `orders` |
| `POST /orders/:id/ship` | 发货 | `{ version, shipNote, lines[{orderLineId, shippedQty}] }` | 出货日期晚于今天 → `BUSINESS_RULE`「出货日期还没到，不能发货」；状态 `to_ship`：已取消 → `STALE`「销售已取消这张订单，不能发货」；打开后销售改过单（版本变了）→ `STALE`「销售修改了这张订单，已刷新成最新内容，请核对后再确认发货」；`0 ≤ shippedQty ≤ qty`；有少发时 `shipNote` 必填 | 条件更新（和确认、修改、取消互斥）；写 `shipped_qty`、`shipped_by/at`；日志「确认发货」；推送 `order:<id>`、`orders`、`todo:shipping`、`ar:<customerId>`、`demand` |

## 7. 采购

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /purchase-orders` | 采购、仓库、财务 | `?status=&supplierId=&from=&to=&cursor=` → 卡片（采购员、金额或应付、`changed`、`repriced`、`allReturned`）；列表级 `actions` ⊆ `create`（采购） | 仓库默认不列 `cancelled`，传 `status=cancelled` 才列 | 订阅 `pos` |
| `GET /purchase-orders/:id` | 同上 | → 详情：明细、改单记录、改价记录、退货记录、取消原因、`amountCents`、`payableCents`、`apStatus`（`to_pay` / `paid` / `no_pay`）、`allReturned`、是否付过款；每行 `maxReturnQty`（按净实收和库存算好的可退数量，没收货为 `null`）；`notice`：收货页提示条（例如采购改过单），没有为 `null`；`actions` ⊆ 采购 `editPo`、`changeSupplier`（手工下的单才有）、`cancelPo`，仓库 `receive`、`return`、`reprice`，财务 `pay` | | 订阅 `po:<id>` |
| `POST /purchase-orders` | 采购 | `{ supplierId, note, lines[{materialId, qty, priceCents}] }` + 幂等键 → `to_receive` | 供应商启用；花材启用；`qty>0`、`priceCents>=0`（0 = 赠送） | 发号 PO；日志「新建采购单」；推送 `pos`、`todo:warehouse`、`demand` |
| `PUT /purchase-orders/:id` | 采购 | `{ version, supplierId, note, reason, lines[] }` | 状态 `to_receive`；原因必填；换了供应商但这张单没有 `changeSupplier`（填报生成的单）→ `BUSINESS_RULE`「填报生成的采购单不能换供应商，要换请取消后重下」；新加的花材须启用 | 条件更新（和收货互斥）；整组替换明细；写 `po_changes`（含换供应商）；日志「修改采购单」（前后）；推送 `po:<id>`、`pos`、`demand`、`supplier:<旧、新 supplierId>` |
| `POST /purchase-orders/:id/cancel` | 采购 | `{ version, reason }` | 状态 `to_receive`；原因必填 | 条件更新；日志「取消采购单」；推送 `po:<id>`、`pos`、`todo:warehouse`、`demand`、`supplier:<supplierId>` |
| `GET /purchase/demand` | 采购 | `?from=&to=` → `{ orderCount, mats[{materialId, name, unit, enabled, needQty, stockQty, inTransitQty, leftQty, invited, invites[{inviteId, no, supplierName, needQty}]}], actions }`；`invited` 布尔（有待填报邀请含这种花材），`invites` 是邀请明细，`inTransitQty` 是在途；缺口和缺货 / 够用由 `leftQty` 的正负得出，不另返回；列表级 `actions` ⊆ `inviteSupplier`、`createPo` | `to` 早于 `from` → `VALIDATION_FAILED`；默认今天起 `DEMAND_DEFAULT_DAYS` 天；停用花材照常算、`enabled=false` | 订阅 `demand` |
| `GET /purchase/demand/:materialId/sources` | 采购 | `?from=&to=` → 按出货日期分组的来源订单（单号、客户 · 门店、产品、数量 × 配方、花材数） | | — |
| `GET /invites` | 采购 | `?status=&supplierId=&cursor=` → 卡片（含生成的采购单号和当前状态） | | 订阅 `invites` |
| `GET /invites/:id` | 采购 | → 详情；`actions` ⊆ `editInvite`、`cancelInvite`、`shareInvite` | | 订阅 `invite:<id>` |
| `POST /invites` | 采购 | `{ supplierId, lines[{materialId, needQty}] }` + 幂等键 | 供应商启用且有启用的供应商端账号；花材启用；`needQty>0` | 发号 YQ；日志「发出邀请」；推送 `invites`、`demand`、`supplier:<supplierId>` |
| `PUT /invites/:id` | 采购 | `{ version, lines[] }` | 状态 `pending`；没有修改内容 → `BUSINESS_RULE`「没有修改内容」 | 条件更新（和提交填报互斥）；日志「修改邀请」（不用原因）；推送 `invite:<id>`、`supplier:<supplierId>`、`demand` |
| `POST /invites/:id/cancel` | 采购 | `{ version }` | 状态 `pending` | 条件更新；日志「取消邀请」；推送同上 |
| `POST /invites/:id/share` | 采购 | → `{ path, title, imageUrl }` 小程序卡片参数；`path` 带邀请号和 HMAC 签名（只签邀请 ID），不设有效期 | 状态 `pending` | 日志「复制填报链接」 |
| `GET /suppliers`、`GET /suppliers/:id` | 采购、财务、仓库（手工入库选供应商） | → 列表（名称、联系人、启用、是否已开通供应商端、`openPoCount` 待收货采购单数）、资料；列表级 `actions` ⊆ `create`（采购） | | — |
| `POST /suppliers`、`PATCH /suppliers/:id` | 采购 | `{ version?, name, contact, phone, address, enabled, account: { enabled, loginPhone } }` | 名称不重复；开通时 `loginPhone` 11 位且启用账号里不重复 | 行锁供应商；同一事务写 `accounts`；停用供应商或关闭账号时把这家 `pending` 邀请全部改 `cancelled`（`cancel_note` 写原因，日志操作人「系统」）；推送 `account:<id>`、`invites`、`supplier:<id>` |

## 8. 供应商端

供应商账号只能读写本家（`accounts.supplier_id`）。

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /supplier/invites` | 供应商 | `?status=&cursor=` → 本家邀请卡片（含生成的采购单号和状态） | | 订阅 `supplier:<supplierId>` |
| `GET /supplier/invites/:id` | 供应商 | → 需求花材、需求量、`version`；已提交的带供货快照；`actions` ⊆ `submitSupply` | 不是本家 → `NOT_FOUND` | 订阅 `invite:<id>` |
| `POST /supplier/invites/resolve` | 已绑定账号 | `{ id, sig }`（分享卡片路径里的参数）→ `{ inviteId }` | 签名不对 → `BUSINESS_RULE`「邀请链接无效」；不是这家供应商的账号（含员工、门店、别家供应商）→ `FORBIDDEN`；邀请已提交或已取消 → `BUSINESS_RULE`「这次邀请已提交或已取消，链接已失效」 | — |
| `POST /supplier/invites/:id/submit` | 供应商 | `{ version, lines[{materialId, qty, priceCents}] }` + 幂等键 → `{ invite, purchaseOrder }` | 状态 `pending`：已取消 → `STALE`「采购已取消这次邀请」；采购改过邀请（版本变了）→ `STALE`「采购修改了邀请，已刷新成最新内容」；至少一行 → `BUSINESS_RULE`「请至少保留一种花材；全部不供请联系采购取消邀请」；`qty>0`、`priceCents>=0`；另报花材须启用 | 条件更新邀请；同一事务发号 PO、生成 `to_receive` 采购单（采购员 = 发邀请的人）、写 `invite_supply_lines`；日志「提交填报」；推送 `invite:<id>`、`invites`、`pos`、`todo:purchase`、`todo:warehouse`、`demand` |
| `GET /supplier/materials` | 供应商 | `?q=` → 启用的花材（另报用） | | — |
| `GET /supplier/purchase-orders`、`/:id` | 供应商 | → 本家全部采购单（含已取消、已拒收），实收、退货、改价、改单记录、取消原因；`actions` 恒为 `[]` | 范围见 03 章第 8.2 节 | 订阅 `supplier:<supplierId>`、`po:<id>` |
| `GET /supplier/statement` | 供应商 | → `{ payableCents, paidCents, unpaidCents, items[采购单和手工入库单：`payableCents`、`paidCents`、`apStatus`] }` | 范围见 03 章第 4 节 | 订阅 `ap:<supplierId>` |
| `GET /supplier/stock-ins/:id` | 供应商 | → 本家手工入库单明细和改价记录；`actions` 恒为 `[]` | | — |

## 9. 仓库

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `POST /purchase-orders/:id/receive` | 仓库 | `{ version, recvNote, reason?, lines[{poLineId, receivedQty, priceCents}] }` | 状态 `to_receive`：已取消 → `STALE`「采购已取消这张单」；采购改过单 → `STALE`「采购修改了这张单，已刷新成最新内容，请核对后再确认」；`receivedQty>=0`；改了单价原因必填；停用花材照常收；全 0 → `rejected` | 条件更新（和采购改单、取消互斥）；非 0 行生成批次 + `po_in` 流水；改价写 `price_changes`；日志「确认收货」/「拒收」；推送 `po:<id>`、`pos`、`todo:warehouse`、`todo:finance`、`ap:<supplierId>`、`stock`、`demand` |
| `POST /purchase-orders/:id/returns` | 仓库 | `{ version, lines[{poLineId, qty}] }` | 状态 `received`；没付过款 → 否则 `BUSINESS_RULE`「已付款，不能再退货或改单价」；每行累计 ≤ 实收；库存够 | 行锁采购单 + 批次扣减（先扣本单批次）；更新 `returned_qty`；写 `purchase_returns`、`po_return` 流水；日志「退货」；推送同收货 |
| `POST /purchase-orders/:id/reprice` | 仓库 | `{ version, reason, lines[{poLineId, priceCents}] }` | 状态 `received`、没付过款；原因必填；没有变化 → `BUSINESS_RULE`「没有修改内容」 | 行锁采购单（和付款互斥）；写 `price_changes`；日志「改单价」；推送 `po:<id>`、`ap:<supplierId>`、`payable:po:<id>` |
| `GET /warehouse/docs` | 仓库 | `?kind=in|out|loss&status=&supplierId=&from=&to=&cursor=` → 卡片 | | 订阅 `wh_docs` |
| `GET /warehouse/docs?kind=out` | 仓库 | `?kind=out&outCategoryId=&from=&to=&cursor=` → 手工出库列表（按出库分类、出库日期筛选，出库日期降序分页） | `to` 早于 `from` → `VALIDATION_FAILED` | 订阅 `wh_docs` |
| `GET /warehouse/docs/:id` | 仓库、财务（手工入库） | → 明细、改价记录、`amountCents`、`apStatus`（手工入库：`to_pay` / `paid` / `no_pay`；出库、报损为 `null`）、是否付过款；手工出库、报损只读（出库分类、原因、明细、操作人）；`actions` ⊆ 仓库 `reprice`、`void`，财务 `pay`（都只对手工入库），手工出库、报损恒为 `[]` | | 订阅 `wh_doc:<id>` |
| `POST /warehouse/docs` | 仓库 | `{ kind, supplierId?, outCategoryId?, reason, lines[{materialId, qty, priceCents?}] }` + 幂等键 | 入库：供应商启用、花材启用、每行有单价；出库：分类启用、库存够；报损：原因必填、库存够 | 发号 RK/CK/BS；入库生成批次 + `manual_in`；出库、报损批次扣减 + 流水；日志「手工入库 / 手工出库 / 报损」；推送 `wh_docs`、`stock`、`demand`；入库金额 > 0 另推 `todo:finance`、`ap:<supplierId>` |
| `POST /warehouse/docs/:id/reprice` | 仓库 | `{ version, reason, lines[{lineId, priceCents}] }` | 手工入库、`stocked_in`、没付过款；原因必填 | 行锁单据；写 `price_changes`；日志「改单价」；推送 `wh_doc:<id>`、`ap:<supplierId>`、`payable:wh:<id>` |
| `POST /warehouse/docs/:id/void` | 仓库 | `{ version, reason }` | 手工入库、`stocked_in`、没付过款；原因必填；库存够扣回 → 否则 `BUSINESS_RULE`「库存不够，不能作废」 | 行锁单据 + 批次扣减（先扣本单批次）；`in_void` 流水；日志「作废入库单」；推送同上 + `stock`、`todo:finance` |
| `GET /warehouse/moves` | 仓库 | `?type=&materialId=&from=&to=&cursor=` → 流水（批次显示「MM-DD 入库」） | | — |
| `GET /warehouse/stock` | 仓库 | `?q=&categoryId=` → 库存（含批次明细） | | 订阅 `stock` |
| `GET/POST/PATCH /materials` | 仓库（采购、销售只读） | `{ version?, code, name, categoryId, unit, enabled }` | 编码不重复；新建默认 `MATERIAL_CODE_PREFIX` + 下一个序号 | 日志「新增 / 修改花材」（改单位记前后） |
| `GET/POST/PATCH /material-categories` | 仓库（`GET` 所有员工，库存查询的分类筛选用） | `GET` → 列表，项 `{ id, name, sort }`，按 `sort`、`id` 升序，不分页（`nextCursor` 恒为 `null`）；写入 `{ name, sort }` | 名称不重复 | 日志 |
| `GET/POST/PATCH /out-categories` | 仓库 | `{ name, enabled }` | 至少一个启用 | 日志 |
| `GET /stocktakes`、`/:id` | 仓库 | → 盘点单；`actions` 恒为 `[]` | | — |
| `GET /stocktakes/draft` | 仓库 | `?categoryIds=` → 所选分类全部花材（含停用），每行 `{ materialId, name, unit, bookQty }`，`bookQty` 是当前账面数 | | — |
| `POST /stocktakes` | 仓库 | `{ categoryIds[], reason, lines[{materialId, bookQty, actualQty}] }` + 幂等键 | `actualQty>=0`；有差异原因必填；`bookQty` 是打开盘点时的账面快照，确认时锁住相关批次按当前库存复查，任一行变了 → `STALE`「库存已变化，已刷新账面数，请核对后再确认」，`latest` 带最新账面数 | 发号 PD；盘盈生成批次 + `check_gain`，盘亏批次扣减 + `check_loss`；日志「确认调整」；推送 `stock`、`demand` |

## 10. 财务

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `GET /finance/customers` | 财务 | `?q=` → 每个客户 `{ shippedCents, afterCents, receivedCents, unpaidCents, prepaidCents }` | 按 04 第 8 节算 | 订阅 `ar:*` |
| `GET /finance/customers/:id` | 财务 | `?status=unpaid|partial|paid&from=&to=&cursor=`（`from`、`to` 按出货日期，都不传 = 全部；汇总的发货金额、售后、已收、未收按区间算，`prepaidCents` 是当前余额，不受筛选影响）→ 汇总 + 发货单卡片（`payStatus`、`afterCents`、`offsetByAfter`）；列表级 `actions` ⊆ `registerReceipt`，`allocate` 见 1.5 | | 订阅 `ar:<id>` |
| `GET /finance/customers/:id/unpaid-orders` | 财务 | → `{ prepaidCents, items[发货单卡片] }`：登记收款、核销预收表单用，这个客户全部有未收的发货单（出货日期升序，不分页）和当前可用预收 | 客户不存在 → `NOT_FOUND` | 订阅 `ar:<id>` |
| `GET /finance/ar-orders/:id` | 财务 | → 发货单弹层：`payStatus`、`offsetByAfter`、发货金额、已处理售后列表（可点开）、应收、生效核销（收款单号、类型、时间、金额）、未收；售后列表项 `actions` ⊆ `voidAfter` | | 订阅 `order:<id>`、`ar:<customerId>` |
| `POST /finance/receipts` | 财务 | `{ customerId, receiptDate, amountCents, methodName, note, allocs[{orderId, amountCents}] }` + 幂等键 | 金额 > 0；收款日期不晚于今天，否则 `VALIDATION_FAILED` `fields.receiptDate`「收款日期不能晚于今天」；收款方式启用；每条核销 ≤ 该发货单未收，否则 `VALIDATION_FAILED`「SO-… 最多核销 ¥…」；合计 ≤ 收款金额 | 行锁客户（串行化同一客户的核销，和作废收款、作废售后互斥）；发号 SK；写 `allocations(kind=receipt)`；日志「登记收款」；推送 `ar:<customerId>`、`todo:finance` |
| `POST /finance/prepaid-allocations` | 财务 | `{ customerId, allocs[{orderId, amountCents}] }` + 幂等键 | 合计 ≤ 客户预收，否则 `BUSINESS_RULE`「可用预收只有 ¥…」；每条 ≤ 未收；没有未收时前端隐藏入口 | 行锁客户；按收款时间先后从各笔有效收款的预收里扣，写多条 `allocations(kind=prepaid)`；日志「核销预收」；推送同上 |
| `GET /finance/receipts/:id` | 财务 | → 收款详情、生效核销、预收；`actions` ⊆ `voidReceipt` | | 订阅 `receipt:<id>` |
| `POST /finance/receipts/:id/void` | 财务 | `{ version, reason }` | 状态 `valid`；原因必填 | 行锁客户 + 条件更新；这笔收款的核销全部写 `revoked_at`；日志「作废收款」（前后）；推送 `receipt:<id>`、`ar:<customerId>` |
| `GET /finance/payables` | 财务 | `?cursor=` → 待付款单据（范围见 03 章第 4 节） | | 订阅 `todo:finance` |
| `GET /finance/suppliers`、`/:id` | 财务 | → 每家 `{ payableCents, paidCents, unpaidCents }` + 单据列表 | 规则同供应商端对账 | 订阅 `ap:*` |
| `GET /finance/payables/:docType/:id` | 财务 | `docType=po|wh` → 付款页：应付、退货记录、改价记录、`apStatus`、`notice`（没付款时改过价：「仓库改过单价，付款前请核对改价记录」，否则 `null`）、`payment`（有效付款摘要 `{ id, no, amountCents, payDate }`，没有为 `null`）；`actions` ⊆ `pay` | 应付 0 → `apStatus: no_pay`，前端写「无需付款」 | 订阅 `payable:<docType>:<id>` |
| `POST /finance/payments` | 财务 | `{ docType, docId, amountCents, payDate, methodName, note }` + 幂等键 | 单据应付 > 0、没有有效付款；付款日期不晚于今天，否则 `VALIDATION_FAILED` `fields.payDate`「付款日期不能晚于今天」；`amountCents` 必须等于当前应付，否则 `STALE`「应付已变成 ¥…，请核对后再付」，`latest` 带新应付；付款方式启用 | 行锁采购单或手工入库单（和退货、改价、作废入库互斥）；发号 FK；日志「登记付款」；推送 `payable:*`、`ap:<supplierId>`、`todo:finance`、`po:<id>` 或 `wh_doc:<id>` |
| `GET /finance/payments/:id` | 财务 | → 付款详情；`actions` ⊆ `voidPayment` | | — |
| `POST /finance/payments/:id/void` | 财务 | `{ version, reason }` | 状态 `valid`；原因必填 | 行锁单据 + 条件更新；单据回到待付款，仍算「付过款」；日志「作废付款」；推送同登记付款 |
| `GET /finance/records` | 财务 | `?kind=receipt|payment&status=&from=&to=&cursor=` → 收付款记录 | | — |
| `GET/POST/PATCH /finance/methods` | 财务（登记时各端只读启用的） | `{ kind, name, enabled }` | `(kind, name)` 不重复；每类至少一种启用 | 日志「新增 / 停用收付款方式」 |

作废售后复用 `POST /afters/:id/void`（财务在发货单弹层 → 售后详情里调），加锁时同样先锁客户再锁售后。

## 11. 文件上传

| 接口 | 谁 | 入参 → 出参 | 校验和错误 | 锁 / 日志 / 推送 |
|---|---|---|---|---|
| `POST /files/upload-ticket` | 门店、销售（售后图片）；销售（产品图） | `{ purpose, mime, sizeBytes }` → `{ fileId, uploadUrl, formData, expiresAt }`（`wx.uploadFile` 用 `uploadUrl` + `formData` 直传，文件字段名 `file`） | `after_image`、`product_image` ≤ `IMAGE_MAX_BYTES`；格式限 `IMAGE_MIME_TYPES`；门店只能传 `after_image`，否则 `FORBIDDEN`；签名有效 `UPLOAD_TICKET_TTL_MINUTES`，限定这一个对象键 | 写 `files(status=pending)` |
| `POST /files/:id/complete` | 上传人（别人的 → `NOT_FOUND`） | `{}` → `{ status, url, thumbUrl }` | COS 里没有这个对象 → `BUSINESS_RULE`「图片没有上传成功，请重试」 | 调微信内容安全检测（预留，接口未启用时直接 `ok`）；`rejected` → `BUSINESS_RULE`「图片未通过审核，请换一张」；pg-boss 生成缩略图 |
业务接口只接受 `status=ok` 的 `fileId`，售后图片还必须是本人上传的，否则 `BUSINESS_RULE`「图片没有上传成功，请重试」。单据详情里的图片直接带临时读取签名地址（`url`、`thumbUrl`，有效 `FILE_URL_TTL_MINUTES`），不另开取地址的接口。前端上传顺序：申请签名 → `wx.uploadFile` 直传 COS → `complete` → 表单里带 `fileId`。

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
| `payable:po:<id>`、`payable:wh:<id>` | 付款页的应付 | 财务 |
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
| 确认订单 / 修改并确认 / 修改订单 / 取消订单 | `POST /orders/:id/confirm`、`PUT /orders/:id`、`POST /orders/:id/cancel` |
| 确认发货 | `POST /orders/:id/ship` |
| 申请售后 / 处理售后 / 关闭售后 / 作废售后 | `POST /store/afters`、`POST /afters/:id/process`、`POST /afters/:id/close`、`POST /afters/:id/void` |
| 登记收款、核销预收 / 作废收款 | `POST /finance/receipts`、`POST /finance/prepaid-allocations`、`POST /finance/receipts/:id/void` |
| 修改、取消邀请 / 提交填报 | `PUT /invites/:id`、`POST /invites/:id/cancel`、`POST /supplier/invites/:id/submit` |
| 修改采购单 / 取消采购单 | `PUT /purchase-orders/:id`、`POST /purchase-orders/:id/cancel` |
| 确认收货 / 拒收 / 退货 / 改单价（采购单） | `POST /purchase-orders/:id/receive`、`/returns`、`/reprice` |
| 改单价（手工入库单）/ 作废手工入库单 | `POST /warehouse/docs/:id/reprice`、`/void` |
| 登记付款 / 作废付款 | `POST /finance/payments`、`POST /finance/payments/:id/void` |

03 章第 3 节每个状态都有枚举码，见 04 第 2 节（发货单收款状态、付款状态是算出来的，也有码）。

## 14. 现行接口规则与可调整参数

第 1、3 条描述正文现行规则，按规格书实现；第 2、4 条中的数值默认值是技术参数，可按项目需要调整。新业务决定仍需确认。

1. 门店账号的登录手机号录入位置：原型没有，本文放在销售「门店资料」里填（和供应商端账号对称）；绑定微信走邀请下单链接（已确认）。
2. `IMAGE_MAX_BYTES` 的初始值是本文默认值（见 1.6）。门店邀请有效期 `STORE_INVITE_TTL_DAYS`、填报链接不设有效期，已确认。
3. 发货实发能否大于订货数量：原型不能多发（多发走补建订单），本文 `shippedQty ≤ qty`。
4. 第 1.6 节 `RECONNECT_DELAYS_SECONDS` 的初始值是阶段 0 时由我默认的，可以改。
