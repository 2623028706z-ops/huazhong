# 当前项目付款升级：仅本地验证

基线为 `b04a3ce242033c82e283bdf95f0e9073ec910a9f`。本工具升级该版本的付款结构，不读取被项目排除的古老系统，也不连接生产数据库或云服务。

## 分阶段执行

从项目 `server/` 目录执行，必须显式提供本地测试数据库 URL。脚本不读取 `.env` 或 `DATABASE_URL`，只接受 localhost / 127.0.0.1 / ::1 的 `hz_*`、`test*`、`huazhong_test*` 数据库，无 URL 查询参数，默认只做 dry-run。

```sh
pnpm db:upgrade-finance:local --url 'postgres://test:test@localhost:PORT/hz_upgrade_test' --report /absolute/local/path/report.json
pnpm db:upgrade-finance:local --url 'postgres://test:test@localhost:PORT/hz_upgrade_test' --apply --report /absolute/local/path/report.json
pnpm db:upgrade-finance:local --url 'postgres://test:test@localhost:PORT/hz_upgrade_test' --apply --contract --report /absolute/local/path/report.json
```

- `0005` 扩展新表和元数据，保留旧付款 `po_id`、外键及每单有效付款索引。`alloc_kind` 用 `RENAME VALUE receipt TO direct` 安全转换，`prepaid` 不变；不改 0000–0004 SQL。新增状态枚举不在同一事务中作为新值回填使用。
- 独立脚本检查异常；通过后在真实事务中锁住旧业务源和账表、回填、核对。原付款不更新，每条旧付款对应一条核销；有效付款未撤回，作废付款保留原作废元数据并撤回核销。不会造预付或退款，不会修正旧金额或猜测操作人。
- `upgrade_audit.payment_map` 是受控升级批次审计，存原始行、指纹和稳定核销映射，不参与业务账本计算。回填重跑先核对来源指纹和映射记录；来源变化、缺失或核销被篡改均阻断。导出 JSON 包含逐行来源、映射、逐单及逐供应商的应付 / 已付 / 待付；此审计是本地备份产物，不能当作新的业务第二套账。
- `0006` 收缩前再次核验批次审计、原行和核销；有旧付款而未经过独立回填时，普通 migrator 明确拒绝收缩。核对并导出报告后才删除 `payments.po_id`、外键和旧唯一索引。正式 `payment_allocations.payment_id` 无业务唯一约束，支持多单核销。
- 保留旧幂等键、端点身份和原结果；后端将成功重放投影到当前视图，不重新登记付款。新模型启用后不再开放按单付款语义。
- `--apply --contract` 必须先提供报告路径，缺失时在扩展之前就拒绝。已收缩数据库重跑只返回完成状态和原映射，不重写首次逐行 / 逐单 / 逐供应商核对报告；不能用后来业务账的变化覆盖升级基线。

## 事务与恢复

安装的 Drizzle migrator 将单次调用的所有待执行 SQL 放在一个事务，拆成多个 SQL 文件不等于多次提交。独立工具先调用迁移至 0005，待扩展真正提交后再开启回填事务；回填核对通过提交并导出报告，最后才调用收缩及后续迁移。失败时未提交阶段整体回滚，已提交阶段保留，重跑会准确识别它们。迁移测试也验证直接全量升级在未回填时整体回滚。

0007 对 `move_type` 采用事务内安全类型变换：先把使用列转为文本，再重新创建包含全部原值和新值的枚举、转换回枚举并恢复完整数量方向约束。这不是删除约束绕过。0005 新增的订单 / 采购状态在同批新 CHECK 中使用文本比较，不引用尚未提交的枚举字面量。空库一次全量迁移与旧结构分阶段升级分别验证；不得修改已应用的 0000–0004 SQL 或原 journal 条目。

生产升级、财务停写和旧实例隔离、可恢复备份、切换或部署尚未授权，均未执行。`db:reset` 不是升级工具。新模型写入多单核销、预付或退款后，不能直接回滚旧代码；需要先停写评估前向修复或整库恢复，不得抹掉实际资金。

## 本地验收

`server/test/finance-upgrade.test.ts` 从 Git 基线读取原 schema / seed 源码，以原 0000–0004 结构创建隔离 Testcontainers 数据库，先运行原种子，再创建专门旧付款夹具（原种子没有付款）。覆盖多供应商、停用供应商 / 方式、有效付款、作废及重付、补录日期与登记顺序、异常阻断、映射重跑、失败回滚、旧收款枚举与撤回元数据、幂等身份保留。没有使用新付款表伪造旧升级。

```sh
DOCKER_HOST=unix:///Users/zhouhongrui/.colima/default/docker.sock \
TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run --project server \
  server/test/migration-boundaries.test.ts server/test/finance-upgrade.test.ts \
  server/test/finance-upgrade-idempotency.test.ts
```

以上测试命令在仓库根目录执行；独立 CLI 从 `server/` 执行，其 `source` 条件直接加载当前 shared 契约，不依赖过期构建产物。测试包含真实 Node 子进程 CLI、旧成功 UUID 幂等键的 HTTP 只读重放及未知旧请求拒绝，不以函数调用或新结构夹具替代旧升级。Docker socket 示例仅为本机验证配置，不是生产环境参数。小程序真机、云端或生产恢复演练不属于这些本地测试结论。
