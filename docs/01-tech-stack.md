# 01 技术栈与工程

整理日期：2026-09-30。选型已和用户确认。版本号在搭项目时锁定为当时的稳定版，写进 `package.json`（精确版本，不用 `^` `~`）和本文件末尾的版本表。

## 1. 总览

| 层 | 选型 |
|---|---|
| 前端 | 原生微信小程序 + TypeScript，WebView 渲染 |
| 组件 | TDesign 小程序版做交互底座，外面包一层花众业务组件 |
| 样式 | 纯 WXSS + CSS 变量，尺寸用 px；不用预编译 |
| 图标 | Lucide 线性图标，按需生成 iconfont |
| 字体 | 全部免费可商用：标题、金额用思源宋体（Noto Serif SC）裁剪子集，iOS、安卓统一加载；logo 用花众正式字标图片 |
| 实时同步 | 云托管 WebSocket（`wx.cloud.connectContainer`）+ PostgreSQL LISTEN/NOTIFY；提交时仍按版本号复查兜底 |
| 前端状态 | 页面自己取数；全局只放登录身份、购物车（mobx-miniprogram） |
| 后端 | Node.js LTS + TypeScript + NestJS，部署在微信云托管（容器） |
| 调用方式 | `wx.cloud.callContainer`，不需要备案域名 |
| 数据库 | 腾讯云 PostgreSQL，与云托管同地域，通过私有网络内网连接 |
| ORM | Drizzle ORM，迁移用 Drizzle Kit |
| 校验 | Zod。枚举和字段规则（手机号、金额是非负整数分、数量是正整数等）只在 `shared` 定义一次，接口契约用它们拼出请求、响应结构，前后端共用；Drizzle 的 `pgEnum` 和 `CHECK` 引用同一份 `shared` 定义。不用 drizzle-zod（它要把表定义打包进小程序） |
| 后台任务 | pg-boss（用 PostgreSQL 当任务队列，不另开 Redis） |
| 文件 | 腾讯云 COS，后端签名、前端直传 |
| 测试 | 后端 Vitest + Testcontainers（每次测试起一个干净的 PostgreSQL）做接口测试；前端 miniprogram-automator 测关键流程 |
| 工程 | pnpm monorepo、ESLint、Prettier、Stylelint、GitHub Actions、miniprogram-ci |

不用的方案和原因：

- 云开发（云函数 + 文档型云数据库）：核销、库存批次、付款互斥都需要多表事务和约束，文档数据库做起来别扭。
- Taro、uni-app：只上微信，跨端用不到，多一层编译和运行时。
- Tailwind 类原子样式：样式会散在页面 class 里，和「样式只在组件里定」冲突。
- SCSS、Less：用户选择零编译的纯 WXSS。设计值靠 CSS 变量，复用靠公共类。
- Prisma：库存批次行锁、`CHECK` 约束、部分唯一索引、原生 enum 在 Prisma 里经常要退回手写 SQL，换成写法贴近 SQL 的 Drizzle。
- Skyline 渲染：部分 CSS 不支持，和 TDesign 的配合要另外验证。先用 WebView，以后可以一页一页切。

## 2. 仓库结构

```text
huazhong/
├─ docs/                       规格书（本目录）
├─ miniapp/                    小程序
│  ├─ miniprogram/
│  │  ├─ app.ts / app.json / app.wxss
│  │  ├─ styles/               tokens.wxss（设计变量）、reset.wxss、utils.wxss（细线、省略、点击区域等公共类）
│  │  ├─ components/hz-*/      花众业务组件（见 02-frontend-visual.md）
│  │  ├─ core/                 request、auth、state、format、guard（放弃修改）、upload
│  │  ├─ pages/                主包：login、home、my、inventory、logs、staff、dev-gallery（只在开发环境出现）
│  │  └─ packages/             分包：store、supplier、sales、shipping、purchase、warehouse、finance
│  ├─ project.config.json
│  └─ tsconfig.json
├─ server/                     后端
│  ├─ src/
│  │  ├─ common/               身份守卫、权限、错误码、事务、日志拦截、分页、幂等
│  │  └─ modules/              auth、accounts、sales、store、shipping、purchase、supplier、warehouse、finance、files、logs
│  ├─ db/                      schema（Drizzle 表定义）、migrations（Drizzle Kit 生成）、seed（示例数据）
│  ├─ test/                    接口测试（按 07-acceptance.md）
│  └─ Dockerfile
├─ shared/                     状态枚举和中文名、金额和日期工具、Zod 校验、错误码
├─ scripts/                    图标生成、字体子集（思源宋体）、种子数据
└─ package.json                pnpm workspace
```

规矩：

- 页面只引用 `hz-*` 组件，不直接用 TDesign 组件，也不写零散样式。
- 模块之间不互相调内部函数。后端模块之间通过服务接口调用，小程序页面只调后端接口。
- 函数、文件、组件的大小和复杂度上限见 00 章第 11.3 节。

## 3. 前端

### 3.1 小程序

- TypeScript 严格模式，开发者工具内置编译 TS（`project.config.json` 开 `useCompilerPlugins: ["typescript"]`）。样式直接写 WXSS，不经过预编译。
- `shared` 包由 esbuild 连同它依赖的 Zod 打成一个 CommonJS 文件，放进 `miniprogram_npm/@huazhong/shared`（pnpm 的软链接目录开发者工具「构建 npm」认不全，自己打包还能去掉用不到的代码）；TDesign 仍走开发者工具的「构建 npm」。
- 分包：主包放登录、花众首页、我的、公共组件和 `core`；每个业务端一个分包，按角色预下载（`preloadRule`）。主包体积目标见 00 章第 9 节。
- 顶栏、底栏全部自定义。顶栏用 `navigationStyle: custom`，右侧按 `wx.getMenuButtonBoundingClientRect()` 给胶囊留位。底栏不用微信的 tabBar 配置（它要求标签页都在主包，而门店端、供应商端的标签页在分包里），改成每个标签页放 `hz-tabbar` 组件，切换标签用 `wx.reLaunch`，一级页面没有返回历史。
- 页面放弃修改：页面内返回、弹层关闭走花众确认框；右滑返回和安卓返回键用 `wx.enableAlertBeforeUnload`。
- 样式用纯 WXSS：
  - 设计值只在 `styles/tokens.wxss` 里用 CSS 变量定义，挂在 `page` 上；组件和 TDesign 主题都读这些变量。
  - 公共片段（1px 细线、文字省略、44px 点击区域、底部安全区）写成 `utils.wxss` 里的公共类，用 `@import` 引入，不复制粘贴。
  - 没有嵌套，类名按「组件__部分--状态」命名，例如 `hz-card__title`、`hz-btn--disabled`，避免冲突。
  - 页面的 WXSS 只做布局（间距、排列），组件外观一律在 `hz-*` 组件里定。
- WXML 只放结构和简单判断。金额、日期、状态中文名的格式化统一放在一个 WXS 工具文件里，全站调同一份。

### 3.2 请求层（`core/request`）

- 统一封装 `callContainer`：带环境 ID、服务名、`X-Idempotency-Key`（新建类操作）。
- 统一处理后端错误码，转成 02 章第 5 节的界面状态。页面不自己判断错误码。
- 超时 `REQUEST_TIMEOUT_MS`；只对读请求在网络失败时自动重试 `READ_RETRY_COUNT` 次，写请求不自动重试（避免重复提交），由用户点「重试」。
- 同一个按钮提交中禁止再次点击（按钮显示「提交中」）。

### 3.3 前端状态

- 业务数据以后端为准，页面 `onShow` 时刷新，不在前端存副本。
- 实时同步（`core/realtime`）：小程序在前台时保持一条 WebSocket 连接，页面进入时订阅自己关心的单据或列表（例如订单详情订阅这张订单，模块首页订阅待办），离开时退订。收到变更后页面重新拉取数据，并在页面里提示「销售修改了这张订单，已刷新成最新内容」这类状态。表单页正在编辑时不直接覆盖输入，先提示并提供「查看最新内容」，由用户决定刷新。连接断开自动重连，重连后整页刷新一次；切到后台断开，回到前台重连。
- 全局 store 只放：当前账号和角色、门店购物车（改单用单独一份）。
- 返回上一页时恢复筛选条件和滚动位置：由列表页自己在 `onHide` 存、`onShow` 恢复。

## 4. 后端

- NestJS 按业务模块拆分，每个模块有 controller、service、repository（Drizzle）。
- 身份：云托管在请求头注入 `X-WX-OPENID`，守卫用它查账号表，得到角色和数据归属（门店 ID、供应商 ID、员工模块）。不用 JWT。
- 权限两层：守卫按角色放行，service 再按数据归属过滤（门店只读写本店，供应商只读写本家）。
- 所有写操作在事务里完成（Drizzle `db.transaction`）：业务数据、变更记录、操作日志一起提交。
- Drizzle 的用法：表结构、原生 enum、`CHECK` 约束、部分唯一索引都写在 `db/schema` 里，由 Drizzle Kit 生成迁移；行锁用 `.for('update')`；复杂的统计查询（对账、采购需求）可以直接写 SQL，结果类型手动声明。
- 后台任务（pg-boss）：产品图生成缩略图；停用供应商或关闭供应商端账号后取消待填报邀请也在同一个事务里直接做，不走队列。
- 并发：写操作带 `version`，用「版本号没变才更新」的条件更新；冲突返回 `STALE` 和最新数据。库存扣减先 `SELECT … FOR UPDATE` 锁住批次。
- PostgreSQL 的用法：时间用 `TIMESTAMPTZ`，「今天」和发号日期按 `Asia/Shanghai` 算；状态用原生 enum；金额、数量加 `CHECK` 约束；唯一规则能用部分唯一索引的就在数据库里约束（例如启用账号的手机号唯一）；明细类 JSON 用 `JSONB`。事务隔离级别用默认的 READ COMMITTED，靠行锁和条件更新保证一致。
- 应收、应付、预收、收款状态在查询时计算，不另存。核销记录落库。
- 单号由后台按天发号，格式「前缀-YYMMDD-三位序号」，例如 `SO-260930-001`。
- 金额全部是整数「分」，只在前端显示时格式化成元。
- 手机号快速验证：前端 `getPhoneNumber` 拿到 `code`，后端通过云托管开放接口服务换手机号，对上预录账号后绑定 openid。
- 日志：接入云托管日志；错误带请求 ID，前端错误页显示请求 ID，方便排查。

- 实时推送：写操作的事务提交后，用 PostgreSQL `NOTIFY` 发一条变更消息（单据类型、单据 ID、新版本号、涉及的门店或供应商）。每个云托管实例都 `LISTEN`，再通过 WebSocket 推给订阅了这张单据、并且有权看到它的连接。推送只带「哪张单变了」，不带内容，前端收到后走普通接口重新拉取，权限校验只在接口里做一次。推送丢了也不会出错：提交时的版本号复查仍然会拦住旧数据。
- 需要实时的场景：订单（门店、销售、发货三端）、售后、采购单（采购、仓库收货、供应商端）、填报邀请、付款前的应付、各模块首页待办和底栏角标。

接口约定、错误码和数据模型见 `04-data-model.md`、`05-api.md`。

## 5. 环境与发布

| 环境 | 云托管服务 | 数据库 | 小程序 |
|---|---|---|---|
| 开发 | huazhong-dev | huazhong_dev | 开发版、体验版 |
| 生产 | huazhong-prod | huazhong_prod | 正式版 |

- 后端：推到 `main` 后 GitHub Actions 跑检查和接口测试，通过后构建镜像部署到开发环境；生产环境手动确认发布。
- 小程序：miniprogram-ci 上传体验版，提审和发布在微信后台手动做。
- 数据库结构变更只用 Drizzle Kit 生成的迁移文件，迁移文件要进代码评审，不手工改表。
- 密钥（小程序 AppSecret、COS 密钥、数据库密码）只放云托管环境变量和 GitHub Secrets，不进仓库。
- 不迁移老系统数据。上线前由管理员在新系统录入员工、门店、产品、花材、供应商，种子数据只用于开发和测试。

## 6. 质量检查

- ESLint + Prettier（TS）、Stylelint（WXSS 按 CSS 规则检查，禁止写死颜色值，必须用变量）。
- 提交前检查：lint、类型检查、`shared` 单元测试。
- CI：以上全部 + 后端接口测试（连测试库）。
- 验收：`07-acceptance.md` 的用例，接口类由后端测试覆盖，前端类由 miniprogram-automator 覆盖，视觉类按 02 章第 8 节人工对照。

## 7. 已确认的决定（2026-09-30）

- 数据库 PostgreSQL，ORM 用 Drizzle；样式用纯 WXSS，不用预编译。
- 生产模块不做，也不预留专门的字段或状态，以后需要再加。
- 字体全部用免费可商用的：思源宋体子集。
- 实时同步：别人改了单，这边几秒内自动刷新并提示（WebSocket + LISTEN/NOTIFY），提交时的版本号复查兜底。
- 品牌背景内置在小程序里，不支持上传更换（2026-09-30 确认）。
- 手机号快速验证绑定账号；订阅消息暂时不做；不迁移老系统数据。
- 只做手机，不适配电脑版微信和 iPad。
- 代码由 Claude 按本规格书从零写，不参考老小程序代码。

## 8. 本章由我默认、可以改的

- 单号格式加了年份（原型是 `SO-0929-018`，跨年会重号）。
- 请求超时、读请求自动重试次数、断线重连间隔的初始值（05 章第 1.6 节）。
- 生产环境发布要手动确认。

2026-09-30 阶段 0 开工前确认：不用 drizzle-zod，枚举和字段规则在 `shared` 定义、表结构引用它（第 1 节）；接口契约按阶段增长（08 章）。

## 9. 版本表（搭项目时填写）

| 依赖 | 版本 |
|---|---|
| Node.js | |
| pnpm | |
| 微信基础库最低版本 | |
| TDesign 小程序版 | |
| NestJS | |
| Drizzle ORM、Drizzle Kit | |
| pg-boss | |
| Testcontainers | |
| Zod | |
| mobx-miniprogram | |
