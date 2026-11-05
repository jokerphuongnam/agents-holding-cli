# 公司

[English](../COMPANIES.md)

一个控股下有多家公司。每家公司有自己的员工、Jira 看板、Jira Listener 和设置；未单独设置的项沿用控股默认值。

聊天：`/ceo companies`（列表）· `/ceo company <verb> ...`（与下表动词相同）。终端：`holding company <verb>`。

| 命令 | 作用 |
|---|---|
| `holding company list` / `count` / `overview` | 已连接到控股的公司（子公司显示在父公司下）、状态、员工、Jira、Jira Listener。`overview` 额外显示健康度：未完成/阻塞任务、等待你的事项、积分（30 天）。 |
| `holding company show [name]` | 产品、状态、父/子、员工、Jira、Jira Listener、看板列、任务数、积分、配置。 |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | 使用默认员工和默认看板（含 Reopened 与 Blocked）新建公司。 |
| `holding company rename <c> <new name>` | 仅改显示名称；id 不变，因此仓库与 Jira 仍可用。 |
| `holding company pause / resume / archive <c>` | 已暂停/归档的公司不启动新工作、不消耗积分。 |
| `holding company delete <c> --confirm <c>` | 仅在 `archive` 之后，且没有子公司时。不触碰仓库、本地文件和 Jira 看板。 |
| `holding company move <c> --parent <P|none>` | 更改父公司。 |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | 在公司之间移动或添加员工角色（受套餐上限约束）。 |
| `holding company link <c> <KEY>` / `unlink <c>` | 关联或解除 Jira 看板。 |
| `holding company config [c] [set|unset <key> <value>]` | 按公司覆盖：`communication`、`auto-pr`、`flow`、`share-skills`。`unset` = 恢复控股默认。`config defaults [set ...]` 编辑控股默认值。 |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | 将旧的本地公司（`.agents/*-company`）迁入控股。见下文。 |

仅列出已连接控股的公司。仅存在于本机的旧公司在迁移前不会显示（也不会被删除）。

## 迁移旧的本地公司

`holding company migrate <repo or .agents/x-company folder>`
1. 将文件夹备份到 `~/.config/agents-holding/backups/<name>-<time>.tgz`（原文件仍在磁盘上）。
2. 仅发送名称与数量：员工角色 id、计划数、父公司、创建时间。不发送文件内容。
3. 角色在控股目录中的员工成为正式员工（不超过套餐上限，见下）。目录外的自定义角色仅在公司历史中按名称记录；holding 不读取其人设文件。若要继续使用，请做成仓库私有技能 `.agents/custom-skills/<id>/SKILL.md`。
4. 在仓库写入 `.agents/company.json` 并注册仓库。可安全重复运行（更新同一公司）。
先迁移父公司，再用 `--parent <parent>` 迁移子公司。

迁移后只读取 `.agents/company.json`。有完整备份后可删除旧的 `.agents/<x>-company`（migrate 备份会跳过 `cache/`）：`tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`。
建议保留：`.agents/cache/` 与 `.agents/plans/`（个人、保持未跟踪）以及 `.agents/custom-skills/<id>/`（仓库私有技能，永不发布）。holding 不强制 cache 或 plans 的位置。
删除父公司旧文件夹前，请单独迁移子公司（`children/<child>` 指向其他仓库）。

## 各套餐员工上限

每家公司名册最多如下人数（含 CEO）。适用于 `/staff add`、`holding company staff move|assign`、`holding company migrate` 与新建公司。完整定价（积分、设备、操作费用）：[PRICING.md](../PRICING.md)。

| 套餐 | 每公司最多员工 |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | 不限 |
| Enterprise | 不限 |
| 无积分套餐的旧密钥：trial / monthly / yearly | 20 / 30 / 50 |

达到上限时："Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan." Migrate 保留前 N 名员工并报告跳过数量。

## 看板列

新公司：To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done。
- **Reopened**：测试失败时把卡片移到这里；代理继续 Coding。
- **Blocked**：等待你处理；代理不会自行移入或移出此列。

现有公司保留原看板。要为现有看板添加 Reopened/Blocked：
1. 在聊天中：`/flow edit`，要求添加 Reopened（Coding 之前）和 Blocked（Done 之前）；确认绘制的流程。
2. 在仓库中：将 `AH_FLOW_JSON` 设为已保存流程后运行 `holding jira setup-workflow <site> <email> <KEY>`（代理会代做），再按打印顺序拖动列（Jira 无重排列 API）。

### 按公司自定义列
任何公司都可有额外列（`/flow edit`）。示例（测试晋级），插在 In Review 之后：
Ready Testing on Develop → Verified on Develop（向 `develop` 开 PR）→ Ready Testing on Integration → Verified on Integration（从功能分支向 `main` 开 PR）→ Blocked → Done。
仅当该公司开启 auto-PR 时才开 PR（`holding company config <c> set auto-pr on`）。
注意：`main` PR 合并后自动移到 Done 尚未实现；合并后请自行移到 Done。
