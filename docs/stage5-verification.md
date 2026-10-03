# 阶段 5 交接

## 范围

- 接续已有未提交实现，保留采购收货、退货及财务账本改动，不处理上游 AI 服务故障。
- 仓库已接通手工入库、手工出库、报损、出库分类、盘点、出入库流水及花材详情快捷入口。
- 手工入库接入财务待付款、供应商对账、付款／预付核销，以及供应商端入库详情。
- 保留规格书中的历史确认日期；业务规则仍以 03 章为准。

## 关键实现

- 付款候选、账本快照、核销、详情跳转与对账卡片统一按 `po:<id>`／`wh:<id>` 区分，同号不同类型不是重复单据。
- 手工入库存在任何有效核销即锁定改价／作废，包括有效金额为零的核销；财务撤回后重新开放。
- 出库／报损以 FIFO 扣批次，作废严格恢复原批次，防止重复恢复和并发超卖；流水保留原操作与作废原因。
- 分类维护串行校验“至少一个启用”；停用花材不能手工入库，仍可出库、报损和盘点。
- 盘点保持一致读快照，提交锁定材料后复查账面；`STALE.latest` 刷新账面，保留实盘和原因；无盘点作废接口。
- 报损图校验用途、所有权、上传完成状态及重复引用，失败时不写单据／库存。
- 编辑中的入库详情收到推送不替换提交版本；动作失效关闭弹层。分类子页返回保留出库草稿；系统卸载提醒随表单可见状态切换。
- 页面数据只包含可序列化静态文案，动态文案格式函数不放入 `Page.data`。
- 供应商入库弹层使用后端的「花众仓库手工入库」标题；流水首行显示时间／类型，数量带正负号并复用完成绿／报错红，末行保留来源单号、批次和经办人。

## 验证入口

- `tools/q.sh check`：格式、类型、ESLint／Stylelint、knip、重复率、生成物、覆盖率和全量单元／接口测试。
- `tools/q.sh build`：服务端编译及迁移打包。
- `tools/q.sh test:ui:stage5`：微信开发者工具正式页面，经云托管传输适配连接真实本地 NestJS／PostgreSQL；不是假响应视图测试。
- `tools/q.sh test:ui:stage4`：采购、仓库、供应商和财务旧链路回归。
- 完整运行日志在 `/tmp/hz-logs/`；小程序截图在 `.artifacts/stage5-screens/`，不提交生成物。

## 本地验证结果

2026-10-03（上海时间），最终页面和契约改动后的验证：

| 检查 | 结果 |
|---|---|
| `tools/q.sh check` | 全部通过；62 个测试文件、485 项测试通过；格式、类型、lint、knip、重复率与生成物检查通过 |
| 核心纯函数覆盖率 | 行 99.01%、语句 97.96%、分支 94%、函数 99.39%；重复行比例 2.36% |
| `tools/q.sh build` | 服务端编译、数据库迁移打包通过 |
| `tools/q.sh test:ui:stage5` | 微信开发者工具原生页面 6／6 通过，包含供应商详情标题和流水数量正负号／颜色断言 |
| 旧链路回归 | 全量运行先通过 26／28；另外两项随后定向复测 2／2 通过，未重跑一轮完整 28 项 |
| `git diff --check` | 通过 |

旧链路初次失败分别是 H07 页面不在栈顶、供应商详情测试仍使用裸采购 ID。H07 定向重跑通过；供应商测试按当前复合引用契约改为 `po:<id>` 后通过，没有加入旧 ID 兼容逻辑。

阶段 5 的实现与本地自动化验证已完成；用户截图确认仍待进行，不等同于真机、云端或发布验收。

## 改动入口

- 契约与文案：`shared/src/contract/stock.ts`、`shared/src/contract/payments.ts`、`shared/src/contract/ap.ts`、`shared/src/copy-stock.ts`。
- 服务端：`server/src/modules/warehouse/`、`server/src/modules/finance/`；保留已有 `0008_stage5_warehouse.sql` 和 `0009_merge_payment_methods.sql` 迁移。
- 小程序：`miniapp/miniprogram/packages/warehouse/pages/`、`views/stock.*`、`views/ap-statement.*`、`views/payment-panel.ts`、`core/guard.ts` 及共享列表卡片。

## 用例覆盖

| 范围 | 测试位置 |
|---|---|
| C05-S5、C06–C13、C15–C18、C20、C22–C26；D28／供应商手工入库、图片归属与幂等 | `server/test/warehouse-stage5.test.ts`、`server/test/warehouse-stage5-boundaries.test.ts` |
| 分类并发保底、出库并发防超卖、双重作废、盘点并发、同 ID 混合付款、部分核销／有效零核销、预付／撤回、分页／筛选 | `server/test/warehouse-stage5-boundaries.test.ts` |
| C11、C12-F、C13-F、C20-F、C21、C22-F、报损及财务／供应商入库详情、仓库入口／流水来源跳转 | `server/test/ui/warehouse-stage5.spec.ts` |
| 支付复合引用、同类型重复拒绝、静态文案序列化、编辑版本保留、子页草稿与卸载提醒 | `shared/test/rework-contract.test.ts`、`miniapp/test/rework-pages.test.ts` |

## 下一步和边界

- 给用户看阶段 5 截图／体验效果并确认；不能把本地自动化通过写成用户已经验收。
- 阶段 6 才做三个宽度完整视觉验收、iOS／Android 真机、云托管／COS 上传实测、生产迁移和提审。
- 未提交、未新建分支、未部署，也未访问生产环境。下一会话从当前工作区和本文继续，重新读取 `CLAUDE.md` 与规格书。
