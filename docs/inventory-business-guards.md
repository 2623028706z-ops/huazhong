# 库存业务保护交接

日期：2026-10-03。用户同意修复 ERP 审查中两项库存风险；付款核销规则不在本轮修改范围。

## 改动

- 花材已有库存批次、流水、盘点、出入库单、采购单、邀请、填报记录或配方引用时，拒绝修改单位；零库存、历史作废也不能绕过。新建未使用花材可以改单位，不改单位仍可修改其他资料。
- 花材修改通过现有独占业务写锁与首次引用串行，再锁花材并检查版本、引用。所有正常业务写入已走同一业务写锁；没有另建第二套锁协议。
- 盘点在花材锁内保存调整前的逐花材最大流水 ID；无差异盘点也保存。原收货、入库、出库、报损流水被任何后续同花材盘点覆盖后，禁止整单作废。
- 列表、详情禁用作废动作并显示原因；实际库存冲回在取得花材锁后再次复查，避免读取动作后并发盘点穿过校验。正常实际退货、改价、其他花材盘点、新盘点后的新库存单据不受影响。
- 盘点提交后刷新员工端旧单详情和列表。继续使用现有前端动作和错误展示，不修改付款业务逻辑。

## 文件

- `server/src/modules/warehouse/material-unit.ts`、`material-writes.ts`：单位引用检查和互斥。
- `server/src/common/stock-count.ts`：读写共用盘点边界判断。
- `server/src/modules/warehouse/stock-writes.ts`、`stocktakes.ts`、`count-notifications.ts`：库存锁内检查、盘点边界保存、通知。
- `server/src/modules/warehouse/wh-doc-reads.ts`、`server/src/modules/purchase/po-reads.ts`：单据动作投影。
- `server/db/schema/warehouse.ts`、`server/db/migrations/0010_stocktake_void_boundary.sql` 及对应元数据：新字段、索引、非负约束。
- `shared/src/copy-stock.ts`、生成的 `miniapp/miniprogram/core/font-data.ts`：错误文案和字形。
- `docs/03-business-rules.md` 至 `07-acceptance.md`：同步确认规则、模型、接口和验收。
- `server/test/inventory-rules.test.ts`、`inventory-concurrency.test.ts`：19 项新回归；`migration-boundaries.test.ts`：1 项迁移回归；`purchase-masters.test.ts`：原单位修改测试改为新规则。

## 迁移说明

迁移由当前项目 Drizzle Kit 生成，对当前项目已有盘点保守补该花材升级时的最大流水边界。旧时间戳不能准确还原并发加锁顺序，因此已有盘点的花材，其升级前单据可能一并禁止作废；升级后新流水正常判断。未读取、迁移旧花众项目数据，未操作用户业务数据库，未部署。

## 验证

- 库存规则、并发、迁移专项：3 文件 / 24 用例通过；现有花材主数据专项：4 用例通过。
- 全量覆盖率回归：68 文件 / 531 用例全部通过（本轮新增 20 项）；已更新旧测试中“已有库存仍允许改单位”的断言。
- 后端构建、生成物一致性、无用代码、重复代码检查通过。
- 排除且仅排除原有 `server/test/ui/tmp-audit.spec.ts` 的类型、lint、格式检查全部通过。标准全局检查仍只被该原有文件阻挡：类型错误位于 64、66 行（`Element.callMethod`），lint 错误位于 13、64、66 行，格式亦未通过；未修改、删除或在项目配置永久忽略它。
- 未做小程序真机、开发者工具截图、云端或发布验收；保留全部原有未提交改动，无提交、无新分支。

## 未处理

付款核销恢复后占用后单资金、历史日期筛选随改价变化、已作废来源批次恢复库存等审查问题没有在本轮改规则。后续先单独确认业务决定，不把库存修复视为完整 ERP 审计问题全部解决。
