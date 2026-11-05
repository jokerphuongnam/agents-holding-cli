# 耐障害性: 障害が起きたときに何が起きるか

[English](../RESILIENCE.md)

Jira Listener は作業を失わずに三種類の障害を扱います。Jira イベントを捏造しません。

## 1. エージェントの圧縮 / 文脈喪失 / 途中終了 → チェックポイント + 再開
- 各ステージは `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json` にチェックポイントを書きます。ステージ、完了ステップ、済んだコーディング下位ステップ、最後のコミット、エラーを記録します。
- 大きな tech plan は最大 3 下位ステップで実装されます。それぞれ `feature/<KEY>` 上の `WIP(<KEY>) n/3` コミットで終わり、カードに完了（✅）と残り（⏳）を列挙する 📌 進捗メモが付きます。
- 再実行（`holding staff run <KEY>` またはカードを再度動かす）はチェックポイントから再開します。完了済みの plan、tech plan、下位ステップはやり直しません。
- CLI が圧縮、切り詰め、文脈オーバーフロー、最大ターンを報告すると、再開メモ付きの新しいセッションで一度だけ再試行します。

## 2. エージェント期限切れ / 利用不可 → `agent-blocked` + フォールバック
- 各 CLI の終了コードと出力は、ログイン期限切れ、クレジット/クォータ切れ、レート制限、CLI 欠如、文脈喪失、タイムアウトのいずれかに分類されます。
- **レート制限:** バックオフ付きで自動再試行（30s → 60s → 120s）。
- **フォールバック:** `state/<company>/agents.jsonc` のスタッフごとに `fallback` リストを追加。ログイン、クォータ、CLI 欠如、レート制限エラーでは次のコマンドが自動使用され、カードに切り替えが記録されます。
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **どれも効かないとき:**
  - カードに `agent-blocked` ラベルと、原因・コマンド・具体的な修正（`claude login`、`codex login`、`grok login`、CLI インストール、クレジット確認）をタスク言語でコメント。
  - macOS 通知があり、`holding status` にブロックが表示されます。
  - 次の成功実行でラベルが外れます。

## 3. MCP サーバー障害（停止、クォータ、過負荷、タイムアウト）→ 警告 + 照合
- Jira Listener は接続喪失、5xx/過負荷、タイムアウト、クォータエラーを検知します。赤い警告を記録し、通知を一つ送り、`holding status` に出します。作業は一時停止しチェックポイントは保持されます。
- 接続復帰時（および Listener 起動時ごと）に、最後に見たイベント以降に更新された issue を Jira から読みます。本物のステータスを一度ずつ再生し、issue + status + 更新時刻でローカルと MCP サーバーの双方で重複排除します。再生は Jira を読むだけでイベントは書きません。
- 読み取り専用コマンド（`holding status`、`board`、`tasks`、`usage`、…）は最後の良い回答を **STALE** と時刻付きで示します。書き込みコマンドは明確に失敗します。
- クォータエラーは次を表示します: "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

テスト: `node tests/resilience_test.mjs` は認証・期限切れ・クォータ・レート制限・圧縮・欠如を起こすモック CLI と、503/429 を返すモック MCP サーバーを使います。

## 4. Jira Listener 停止 → 直ちに警告、何も失われない

**Jira Listener がすべての Jira 自動化を動かします**（カード移動、コメント、スタッフラン）。オフの間は再起動するまで Jira 上で何も起きないため、すぐ通知されます:

- **きれいな停止 / 終了 / ログアウト**（SIGTERM、SIGINT、SIGHUP、`launchctl bootout`）: 終了前に MCP サーバーへ "stopped" を伝えます（約 1 秒）。
- **クラッシュ、スリープ、フリーズ**: 60 秒ごとにハートビート。150 秒なければ MCP サーバーがオフラインとマーク。
- **ローカル watchdog**（launchd ジョブ `com.agentsholding.listener-watchdog`、`holding listener start` / `autostart on` で導入）: 5 秒ごとに確認し、macOS 通知 *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"*（15 分ごと再通知）、クラッシュ後に launchd が再起動した *"Jira Listener restarted"*、復旧時 *"running again"*。ログ: `~/Library/Logs/agents-holding/watchdog.log`。
- `holding status`、`holding listener status`、`/ceo` はオフ中同じ赤い警告で始まります。CEO 受信箱に "Jira Listener is off" 項目が入ります。
- **オフ中の Jira 変更**: 各カードの最初の変更に一度だけ（タスク言語で）Listener がオフだった旨と起動方法のコメント。復帰時にフラグ解除、オフライン項目クローズ、取りこぼしを再生（照合）。未完了の実行はチェックポイントから再開。
- 「エージェントが動かそうとしている列にカードがまだある」だけの再生は無視（誤った「戻した」通知なし）。

## 5. カードの担当者（assignee）

スタッフがタスクを拾うとき（`staff:<id>` ラベルと同じ瞬間）カードの Jira assignee はスタッフの `jira_user`（任意、`agents.jsonc` の Jira accountId またはメール）または Jira Listener 接続アカウントに設定されます。スタッフラベルは残ります。needs-hire / needs-decision / blocked および Done でも assignee は保持されます。

## 6. 質問の行き先: CEO 受信箱。実行をブロックしない

あなたが必要なものすべて（スタッフの質問、1/2/3 の判断、採用、ログイン等でブロックされたエージェント、承認ゲート、QC 停止、失敗した実行、「どのリポジトリ?」、Jira Listener オフ）は **CEO 受信箱** の待機項目ひとつと、タスクキー・必要事項・答え方を含む **Agents Holding** タイトルの macOS 通知になります。スタッフランは入力待ちしません: 項目を投稿して終了し、あなたの回答でチェックポイントから再開します。

- `holding inbox [--all] [KEY]`: 待機項目を会社ごとにグループ表示。
- `holding inbox reply KAN-12 2`: セッションを開かず即答（カード返信と同じ効果。Jira には書きません）。
- `holding inbox dismiss <id|KEY>`: 答える必要のない項目を閉じる（スタッフや Jira には何も送りません）。
- `holding status` は CEO 受信箱の待機件数を表示。
- 通知の **Open CEO**、または `holding ceo --item <id>`: その項目に焦点を当てた CEO セッション（新しい Terminal）を開く。
- `/ceo` はまず待機項目を表示。会社リポジトリ内: その会社のみ。どの会社外でも: holding モードですべての会社の待機と進捗をグループ表示。`/approve` で承認、`holding jira move KAN-12 "Done"` で移動/完了。

**コミュニケーション設定**（会社ごと、`holding company set communication jira+chat|chat`、既定 `jira+chat`）:
- `jira+chat`: 質問/判断/進捗はカードコメント **かつ** CEO 受信箱。どちらでも回答可。
- `chat`: カードに質問/判断/進捗コメントなし。`/ceo` または `holding inbox reply` で回答。ラベル・状態・assignee は Jira 上で更新されます。

## キーとクレジット

1. **キー取得。** Setup は **Generate key**（この Mac 用の新しい Free キー、月 1,500 クレジット、マシンごとに Free キーは一度きり）または **Import key**（既存キー）。キーは隠しプロンプトで入力され macOS Keychain のみに保存。
2. **この Mac でキーを失った?** Generate key を再実行: このマシンの Free キーが復旧（同じクレジットと履歴、新しい秘密。古いものは無効）。有料キーは Import key。
3. **確認。** `holding key show`（キー id、プラン、クレジット、マシン）、`holding credit show`、`holding billing`。アップグレードやクレジット追加はキー id（キー本体は不可）をオーナーへ。料金表: [PRICING.md](../PRICING.md)（`holding billing` からもリンク）。
4. **プラン（月クレジット）。** Free 1,500 · Starter 4,000 · Lite 6,000 · Pro 20,000 · Power 80,000 · Max 180,000 · Ultra 300,000 · Marketplace 20,000 for $10 · Enterprise カスタム — 詳細は [PRICING.md](../PRICING.md)。
5. **課金対象。** next action 2；advance、Jira 更新、staff brief、record artifact、assign、CEO、inbox post / reply は各 1。他は無料。モデルトークンは数えません。
6. **追加クレジット**（オーナーから）: 期間分、キー更新まで（最大 90 日保持）、または使い切るまで（期限後も残るがキー有効時のみ利用可）。
7. **クレジット切れまたは期限切れ。** Jira Listener は "Key is no longer valid or out of credits; contact the owner to renew or add credits" で停止。その間の Jira 変更は再生されません。更新後、開いている各カードの現状を照合します。

## Enterprise プラン（予定；次フェーズ）

**キーとクレジットは稼働中**（上記参照）。ここでのチーム機能は次フェーズです。チーム版の動き:

- **入力したキーだけでプランと役割が決まる**；別ログインや役割ピッカーはありません。役割:
  - **admin**: プラットフォーム所有者。
  - **personal user**: 個人プラン。
  - **enterprise owner**: admin 発行キー。自社 enterprise 内のみキー発行・失効・更新・管理。共有/個人キープールや他 enterprise には触れない。
  - **enterprise employee**: enterprise owner が作ったキー。
- **会社ごとに共有ボード 1 つ**；共有 CLI サーバーが会社全体の Jira 自動化を実行可能。
- **実 Jira ユーザーへのスタッフ対応**（`jira_user`）と権限、誰が何を拾った/変えたかの監査。
- **Assignee 駆動**: 各自が自分の Jira Listener を実行。カードの assignee が自分の Jira ユーザーになると、その Listener が自分のスタッフで拾います。
- **チャット優先**: `/ceo` やスタッフチャットで会話。Jira コメントは任意（コミュニケーション設定）。主な入口は `/ceo KAN-12`: CEO がタスクを読みスタッフを調整。

