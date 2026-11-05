# コマンド一覧

[English](../COMMANDS.md)

キーで使えるすべてのコマンドです。チャットでは `/holding <コマンド>`(例: `/holding key show`)、ターミナルでは `holding <コマンド>` と入力します。AI を使わず即座に応答します。`/ceo` と `/approve` はエージェント用コマンドです。

## セットアップとヘルプ

| コマンド | 内容 | 例 |
|---|---|---|
| `holding help [group\|command]` | キーで使える全コマンド | `holding help staff` |
| `holding setup sync [--claude]` | エージェントにスラッシュコマンドを導入 | `holding setup sync` |
| `holding doctor [--server]` | 各セットアップ手順を確認 | `holding doctor` |
| `holding status` | 設定と通知の状態 | `holding status` |

## ライセンスキー

| コマンド | 内容 | 例 |
|---|---|---|
| `holding key show` | キーID・プラン・クレジット・端末 | `holding key show` |
| `holding key generate` | このマシン用の無料キーを作成 | `holding key generate` |
| `holding key import` | 既存キーを使う(非表示入力) | `holding key import` |

## 会社

| コマンド | 内容 | 例 |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | 会社の一覧・表示・選択 | `holding company use acme` |
| `holding company create [name] [--parent P]` | 会社を作成(名前省略=このフォルダ) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | 会社を管理 | `holding company pause acme` |
| `holding company migrate <folder>` | 古いローカル会社を取り込む | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | 会社の設定 | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | 全スタッフにファイルを禁止 | `holding company deny add .env` |

## スタッフ

| コマンド | 内容 | 例 |
|---|---|---|
| `holding staff list` | スタッフ一覧 | `holding staff list` |
| `holding staff add <role> \| remove <role>` | 役割を追加・削除 | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | スタッフのルールと権限(全エージェント共通) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | 特定スタッフにファイルを禁止 | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | スタッフの AI とモデルを選ぶ | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | スタッフを実行・テスト | `holding staff test qa` |

## プロセスとワークフロー

| コマンド | 内容 | 例 |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Jira Listener が実行する会社のプロセス | `holding company process list` |
| `holding flow show \| list` | ワークフロー | `holding flow show` |
| `holding project add\|remove\|list` | Jira プロジェクトに紐づくリポジトリ | `holding project list` |
| `holding habit list\|edit\|clear` | 学習した習慣 | `holding habit list` |

## タスク

| コマンド | 内容 | 例 |
|---|---|---|
| `holding task list [all] \| history [n]` | タスクと履歴 | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | タスクを計画・割り当て | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | 計画を承認(エージェント内) | `/approve KAN-12` |

## 役割ごとの AI

| コマンド | 内容 | 例 |
|---|---|---|
| `holding provider list \| set \| unset` | 各役割が使う AI | `holding provider list` |

## スキル

| コマンド | 内容 | 例 |
|---|---|---|
| `holding skill add <staff> <skill>` | スタッフにスキルを付ける | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | カスタムスキル、またはスタッフ向けスキル | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | スキルフォルダ・検証・同期 | `holding skill check` |
| `holding skill private\|public <name>` | スキルを非公開・公開に | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | スキルのスクリプト実行を許可 | `holding skill consent my-tool` |

## Jira と Jira Listener

| コマンド | 内容 | 例 |
|---|---|---|
| `holding jira connect <site> <email>` | Jira トークンをキーチェーンに保存 | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Jira を見る | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Jira カードを変更 | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | 課題にファイルを添付 | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | Jira Listener | `holding listener status` |

## Figma

| コマンド | 内容 | 例 |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Figma にサインイン(キーチェーン) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | フレームを PNG で書き出し | `holding figma export <url> --attach KAN-12` |

## Atlassian と Confluence

| コマンド | 内容 | 例 |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | 必要なときだけ Atlassian にサインイン | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Confluence ページを作成・更新 | `holding confluence page create ENG "Release" --file notes.md` |

## CEO 受信箱

| コマンド | 内容 | 例 |
|---|---|---|
| `holding inbox list [--all] [KEY]` | スタッフからの保留中の質問と判断 | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | 回答するとスタッフが続きから再開 | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | 回答せずに閉じる | `holding inbox dismiss KAN-12` |

## CEO と話す

| コマンド | 内容 | 例 |
|---|---|---|
| `/ceo <request>` | 計画・分割・スタッフへ割り当て | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | 1件に絞った CEO セッション | `holding ceo KAN-12` |

## 利用状況とレポート

| コマンド | 内容 | 例 |
|---|---|---|
| `holding usage [--by day\|staff]` | 今期のクレジットバー | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | 自分の利用レポート(件数のみ) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | キー宛てのお知らせ | `holding notify list` |

## プランとクレジット

| コマンド | 内容 | 例 |
|---|---|---|
| `holding credit show` | クレジット | `holding credit show` |
| `holding billing \| billing usage [days]` | プラン・現在のプラン・アップグレード方法 | `holding billing` |

## フィードバック

| コマンド | 内容 | 例 |
|---|---|---|
| `holding feedback "<text>"` | フィードバックを送る | `holding feedback "the inbox is great"` |



## codegraph

```bash
holding codegraph list|detect|status|use <name>|clear
```

Auto-detect PATH/MCP/index; 0→prism, 1→silent, several→ask once per company.

## dependency

スキル／スクリプト一式の git リポジトリを追加し、各エージェントが読めるようにします。パックはプロジェクト外（`~/.agents-holding/packs/<name>`）に clone；company は参照行のみ保存します。

```bash
holding dependency add <git-url>
holding dependency list
holding dependency update <name|url>
holding dependency remove <name|url>
holding dependency consent <name>
holding dependency run <name> <script>
```

パックのスキル／コマンドは Grok・Claude・Codex・ローカル AI 向けに変換されます。スクリプトは consent 後のみ実行。

## 更新

| コマンド | 内容 | 例 |
|---|---|---|
| `holding update` | クライアント・コマンド・Jira Listener を更新 | `holding update` |

関連: [スキル](../SKILLS.md)。`holding help` でキーが使えるコマンドを確認できます。
