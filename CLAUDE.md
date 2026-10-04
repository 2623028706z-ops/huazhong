# 花众当前开发规则

- 唯一开发目录：`/Users/zhouhongrui/Developer/huazhong`。先阅读 `docs/README.md`，按 `docs/08-dev-plan.md` 推进。
- 当前任务是从零重写。采用原生微信小程序、TypeScript、NestJS 云托管、PostgreSQL 和 Drizzle；生产模块不做，不迁移旧数据。
- 本目录规格书是实现依据。业务规则以 `docs/03-business-rules.md` 为准；数据模型、接口、页面和验收用例应与其一致。发现规格书内部冲突先核对并说明，不为满足旧用例加入兼容分支。
- 唯一参考原型：`/Users/zhouhongrui/Documents/Codex/2026-09-29/n-b-w/outputs/huazhong-unified`，冻结提交 `5dd7d7c`。原型用于核对页面和交互，视觉以 `docs/02-frontend-visual.md` 和 `docs/design/` 样稿为准（2026-10-01 起），正式数据读写按本项目契约实现，不复制原型的 localStorage 数据层。
- 不读取或复用旧源码 `huazhong-sales-code`、旧原型 `huazhong-prototype`、旧压缩包、`WeChatProjects/miniprogram-1`、`miniprogram-2`、废纸篓或 Codex 历史源码副本。不要从用户主目录递归搜集花众实现。
- 小程序开发者工具只打开本项目 `miniapp/`；AppID 保持 `wx62f84e4c764cae60`。环境配置以本项目当前配置为准，不沿用历史云开发环境 ID。
- 先前会话中“改造旧版”、文档数据库、旧生产模块及旧目录指令已被当前重写方案取代。继续工作时读取当前任务相关的规格书章节，不依靠旧会话摘要推断规则；未变化的已加载内容不重复读取。
- 保留其他人未提交的改动。开发期间可能有并行编辑，修改前读取当前文件，避免覆盖正在进行的工作。
- 规格书很大（docs/ 下 6 份合计约 54 万字）：先 `grep -n "^#"` 看目录，再按章节读，不整篇读入；通读或比对多份规格交给子 agent，只收结论。
