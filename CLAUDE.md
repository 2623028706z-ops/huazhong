# 花众当前开发规则

- 唯一开发目录：`/Users/zhouhongrui/Developer/huazhong`。先阅读 `docs/README.md`，按 `docs/08-dev-plan.md` 推进。
- 当前任务是从零重写。采用原生微信小程序、TypeScript、NestJS 云托管、PostgreSQL 和 Drizzle；生产模块不做，不迁移旧数据。
- 本目录规格书是实现依据。业务规则以 `docs/03-business-rules.md` 为准；数据模型、接口、页面和验收用例应与其一致。发现规格书内部冲突先核对并说明，不为满足旧用例加入兼容分支。
- 唯一参考原型：`/Users/zhouhongrui/Documents/Codex/2026-09-29/n-b-w/outputs/huazhong-unified`，冻结提交 `5dd7d7c`。原型用于核对页面和交互，视觉以 `docs/02-frontend-visual.md` 和 `docs/design/` 样稿为准（2026-10-01 起），正式数据读写按本项目契约实现，不复制原型的 localStorage 数据层。
- 不读取或复用旧源码 `huazhong-sales-code`、旧原型 `huazhong-prototype`、旧压缩包、`WeChatProjects/miniprogram-1`、`miniprogram-2`、废纸篓或 Codex 历史源码副本。不要从用户主目录递归搜集花众实现。
- 小程序开发者工具只打开本项目 `miniapp/`；AppID 保持 `wx62f84e4c764cae60`。环境配置以本项目当前配置为准，不沿用历史云开发环境 ID。
- 先前会话中“改造旧版”、文档数据库、旧生产模块及旧目录指令已被当前重写方案取代。继续工作前重新读取本文件和规格书，不依靠旧会话摘要推断规则。
- 保留其他人未提交的改动。开发期间可能有并行编辑，修改前读取当前文件，避免覆盖正在进行的工作。

# 控制上下文

- 跑检查和测试用 `tools/q.sh <脚本名>`（如 `tools/q.sh check`、`tools/q.sh test:ui:stage4`），终端只看结论和失败摘要；要细节再按需 `grep` 或 `sed -n` 读 `/tmp/hz-logs/` 下的日志，不整份读。
- 截图只截要核对的区域或元素，不读整页长图；同一页面改完只复核一次，能用 DOM 或数据断言核对的不靠截图。
- 一个会话只做一个阶段或一块功能。做完后把当前任务、改动路径、关键决定、未解决问题和下一步写成短交接存进记忆，再提示用户 `/clear` 开新会话。
