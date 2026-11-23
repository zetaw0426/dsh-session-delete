# dsh-session-delete

DeepSeek Harness (DSH) 插件：在会话标题右侧的"…"更多选项菜单中提供**删除会话**操作。

DSH 原生只支持归档会话（会话日志是只追加存储，官方没有删除 API）。本插件补上这一能力：确认后永久删除所选会话的持久化日志与投影缓存，并将其从工作区注册表中移除，侧边栏实时更新。

A DeepSeek Harness plugin that adds a **Delete session** action to the session "..." more-options menu, permanently removing a cold session's log, projection cache, and workspace membership after explicit confirmation.

## 功能 / Features

- 会话"…"菜单底部新增红色"删除会话"项（中/英双语，跟随 UI 语言）。
- 删除前弹出确认对话框，明确提示不可撤销。
- **Live 守卫**：已打开或正在运行的会话一律拒绝删除，提示先切换会话并停止工作。
- 通过工作区注册表自身的写入路径解除置顶/归档/成员关系，侧边栏实时刷新。
- 同一操作暴露为 agent 工具 `session_delete`（受会话审批策略约束）。
- Host 路由 `POST /session-delete/delete` 位于 connection 信任围栏之后（Host/Origin 校验 + 登录令牌）。

## 安装 / Install

仓库根目录即插件包（`@local/session-delete`），无需构建。

方式一：直接通过 Git 地址安装（CLI）：

```bash
dsh plugin --profile <profile> add https://github.com/wang5421488/dsh-session-delete.git
```

方式二：克隆后从本地目录安装：

```bash
git clone https://github.com/wang5421488/dsh-session-delete.git
dsh plugin --profile <profile> add ./dsh-session-delete
```

方式三：在 DSH 会话中让 agent 执行 `plugin_manager` 的 `install_bundle`，target 为本仓库的绝对路径。

安装后**刷新一次 GUI 页面**加载 Client 模块。插件行 id 为 `session-delete`，可在插件管理页禁用/卸载。

## 使用 / Usage

1. 侧边栏中找到目标会话，点击标题右侧"…"。
2. 选择"删除会话"，在确认对话框中点击"删除"。
3. 删除当前打开的会话会被拒绝——先切换到其他会话再删除。

## 配置 / Configuration

插件行 `config` 可选字段（默认取 `$DSH_HOME`，缺省 `~/.dsh`）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `sessionRoot` | `$DSH_HOME/sessions` | JSONL 会话持久化根目录 |
| `storageRoot` | `$DSH_HOME/storages` | 存储域根目录（投影缓存位于其下 `session_projcache/sessions/`） |

## 已知限制 / Limitations

- 仅适用于标准 DSH 组合（`dsh-workspace` 注册表 + `dsh-session-persistence-jsonl` 后端）。
- 无工作区归属的会话删除后，侧边栏可能需下次刷新才消失。
- 共享附件存储与 spill 临时文件不随会话删除（内容寻址存储可能被其他会话引用）。
- 搜索索引为派生库，在下次对账时自动清除已删会话。
- 删除不可恢复，请谨慎操作。

## 文件 / Files

| 文件 | 职责 |
|---|---|
| `index.js` | Host 半：删除操作、信任围栏路由、`session_delete` 工具 |
| `client.js` | Client 半：菜单项 + 确认对话框（仅依赖 React 与主题 token） |
| `cordis.patch.yml` | Loader 补丁（插件行 `session-delete`） |
| `locale/en.json` / `locale/zh.json` | 插件管理页显示元数据 |
| `icon.svg` | 原创图标 |