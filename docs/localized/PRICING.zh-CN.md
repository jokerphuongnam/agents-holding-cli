# agents-holding 价格表（积分）

[English](../PRICING.md)

这里汇总了积分套餐、各项上限、每种操作的费用以及升级方式。应用内不支持付款：如需升级，请带上你的 **key id** 联系所有者。

在本机查看当前套餐: `holding billing` · `holding usage` · `holding key show` (只显示 key id，绝不显示密钥)

---

## 积分套餐（按月）

| 套餐 | 积分 / 月 | 价格 | 购买渠道 |
|---|---:|---:|---|
| free | 1,500 | $0 | 直购 |
| starter | 4,000 | $2 | 直购 |
| lite | 6,000 | $2.5 | 直购 |
| pro | 20,000 | $7.5 | 直购 |
| power | 80,000 | $25 | 直购 |
| max | 180,000 | $50 | 直购 |
| ultra | 300,000 | $75 | 直购 |
| marketplace | 20,000 | $10 | marketplace |
| enterprise | 定制 | 联系我们 | 联系所有者 |

- 只有**计量**（绑定积分套餐）的 key 才会扣积分。未开启计量的旧 key 照常使用。
- **enterprise**：积分、席位和设备数量按协议约定，请**联系**所有者。
- marketplace 套餐：通过应用市场购买；订单详情请**联系**所有者。

---

## 员工上限（每家公司）

一家公司名册中最多可有的员工数（含 CEO）。在添加、调动或分配员工、迁移以及新建公司时生效。所有者 key 不受此限制。

| 套餐 | 最多员工 / 公司 |
|---|---:|
| free | 5 |
| starter | 10 |
| lite | 15 |
| pro | 25 |
| marketplace | 25 |
| power | 40 |
| max | 60 |
| ultra | 不限 |
| enterprise | 不限 |

**没有**积分套餐的旧 key：trial 20 · monthly 30 · yearly 50 · 其他情况 30。

达到上限时会看到：*“已达到套餐 X 的 N 名员工上限。请先辞退一名员工，或升级套餐。”*

---

## 设备上限（机器）

| 项目 | 数值 |
|---|---|
| 每个 key 默认 | **1** 台设备 |
| 所有者可设置的范围 | 每个 key **1–50** 台 |
| 在本机创建的 Free key | 每台机器只能有**一个** Free key |
| enterprise | 每个 key 的设备数按协议约定：请**联系**我们 |

设备名额用完了？请所有者提高上限，然后在新机器上重试。`holding key show` 会显示已用/最大设备数。

---

## 各操作的积分费用

只有下面这些会产生工作的操作才消耗积分。其他所有操作（heartbeat、实时同步、status、billing、inbox 列表、key、admin、大多数 CLI 命令）都**免费**。

| 操作 | 积分 |
|---|---:|
| Agent 运行 (`next_action`) | **2** |
| `advance` | 1 |
| `jira_ops` | 1 |
| `staff_brief` | 1 |
| `record_artifact` | 1 |
| `assign` (包括 `holding task set …`) | 1 |
| `ceo` | 1 |
| `inbox_post` / `inbox_reply` | 1 |

**模型 token 永远不会按积分计费。**

### 上传（Jira 附件 / Figma 导出 / Confluence）

**每个文件 1 积分，超过前 5 MB 后每 10 MB 再加 1 积分**，**每个文件最多 5 积分**。

示例: 0.4 MB → 1 · 25 MB → 3 · 300 MB → 5.

文件从你的机器直接传到 Jira、Confluence 或 Figma；服务器只统计文件大小用于计算积分。

---

## 升级或增加积分

1. 获取你的 **key id**（切勿发送密钥本身）：`holding key show`，或 `holding billing` / `holding usage` 中的“To upgrade”一行。
2. 把 key id 和想要的套餐（或本期需要追加的积分）发给**所有者**（**phuongnamp99@gmail.com**）。
3. **目前还没有应用内付款。** 以后支持付款时，升级流程保持不变，价格仍以本表为准。

积分用完或 key 过期时：Jira Listener 会停止，并提示你联系所有者续期或增加积分。

---

## 在本机快速查询

```bash
holding billing          # 当前套餐 + 价格表 + 升级说明
holding usage            # 本期积分用量条（计量 key）
holding credit show      # 积分余额
holding key show         # key id、套餐、设备
```

安装 / MCP: [full/SETUP.md](../../full/SETUP.md).
