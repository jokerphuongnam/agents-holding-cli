# Agents Holding Jira ラベル

ラベルは表示とルーティング用の信号です。正しい情報源は Jira の状態、
checkpoint、認証済み evidence です。

| ラベル | 意味 | 追加される時 |
|---|---|---|
| `ah-flow:<name>` | タスクの workflow テンプレート | 作成時または flow 変更時 |
| `staff:<role>` | 現在の stage の staff | stage 開始時 |
| `ah-agent-owned` | Holding がタスクを調整中 | 自動処理開始時 |
| `agent-working` | worker が実行中 | worker dispatch 前 |
| `ah-awaiting-user` | ユーザー操作待ち | login、権限、terminal、承認が必要な時 |
| `ah-blocked` | 自動 remediation 不可 | 実際の user blocker がある時 |
| `ah-registration-required` | routing 設定不正 | repo/project を route できない時 |
| `terminal-<slug>` | QC terminal command | 登録済み terminal 選択時 |

一時ラベルは次の reconcile で削除されます。terminal が使用中でも blocker
や QC failure ではなく、queue として待機します。
