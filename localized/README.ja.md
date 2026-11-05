MCP alone is enough without the local CLI (AI tokens). CLI = optional zero-token. First ask per key+device; No = no-cli, never ask again on that device.

# agents-holding

[English](../README.md)

コーディングエージェントの中で小さな AI 企業を運営：CEO、スタッフ、プロセス、Jira をすべてチャットから。

## はじめに

agents-holding は、お使いの AI コーディングエージェント（Claude Code、Codex、Cursor、`grok` CLI）を小さな会社の集まり（ホールディング）に変えます。各社には話しかけられる CEO、役割のはっきりしたスタッフ（エンジニア、QC、プロダクト…）、そして実際の Jira タスクをアイデアからマージ済みのプルリクエストまで進めるワークフローがあります。MCP サーバーを 1 つ追加してサインインすれば、すぐに使えます。

## できること

- **会社とスタッフ**：会社の作成、スタッフの採用・解雇、スタッフごとのルール・モデル・スキルの設定。
- **チャットの CEO**：`/ceo` が作業を計画し、タスクを分割して適切なスタッフに割り当てます。
- **プロセス**：会社のプロセスとワークフローが、各ステップを誰（人・AI・スクリプト）が担当するかを決めます。
- **Jira Listener**：Jira ボードを見守るローカルプロセス。カードが動くと適切なスタッフを起動し、結果をカードに報告します。
- **使用量とクレジット**：プラン、クレジットバー、スタッフ別の使用量をいつでも確認できます。

## メリット

1. **ワークフロー中心。** ただのチャットアシスタントではありません。会社 → スタッフ → プロセス → Jira Listener の流れで、カードから計画、実装、レビューまで仕事が自動で進みます。
2. **トークンゼロのコマンド。** データを返すだけのコマンド（`/holding key show`、`/holding staff list`、`/holding usage` …）はフックがマシン上で即答し、プロンプトはモデルに届きません。
3. **すべてのエージェントで同じ設定。** Claude Code、Codex、`grok` CLI で同じコマンドが使えます。
4. **データは手元に。** 接続したツール（Jira、Git、ファイル）はマシン上で動き、キーは設定ファイルではなく Keychain に保存されます。
5. **公平な料金。** クレジットを消費するのは作業を生む操作だけで、モデルのトークンは課金されません。

```
会社  →  スタッフ  →  プロセス  →  Jira Listener  →  計画 → 実装 → レビュー → 完了
```

## インストール

MCP サーバーを追加してサインインするだけ。お使いのエージェントを選んでください：

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

次にエージェントを開き、ブラウザで `agents-holding` を認証（Free キーを作成するか手持ちのキーをインポート）して、agents-holding に何かメッセージを送ります。最初のメッセージでエージェントがローカルのコマンドを自動で設定します。確認されたら一度承認するだけです。詳しいガイド：[SETUP](../full/localized/SETUP.ja.md)。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `/holding help` | お使いのキーで使えるすべてのコマンド |
| `/holding key show` | key id、プラン、クレジット、デバイス |
| `/holding company create` | 会社を作成 |
| `/holding staff list` | スタッフ一覧 |
| `/ceo …` | CEO と話す：作業の計画・分割・割り当て |
| `/holding usage` | 今期のクレジットバー |
| `/holding billing` | 現在のプランとアップグレード方法 |
| `/holding feedback "<text>"` | オーナーにフィードバックを送る |
| `/holding update` | ローカルクライアントを更新 |

Claude Code、Codex、`grok` CLI で同じように使えます（Codex ではフックの信頼確認が一度だけ出ます）。全一覧は `holding help` で確認できます。

→ [COMMANDS.md](../docs/localized/COMMANDS.ja.md) · [SKILLS.md](../docs/localized/SKILLS.ja.md)

## ドキュメント

- [COMMANDS.md](../docs/localized/COMMANDS.ja.md)
- [SKILLS.md](../docs/localized/SKILLS.ja.md)
- [セットアップガイド](../full/localized/SETUP.ja.md)
- [料金表](../docs/localized/PRICING.ja.md)
- コマンドリファレンス：`holding help`（または `holding help <グループ|コマンド>`）を実行
- [会社](../docs/localized/COMPANIES.ja.md) · [プロバイダ](../docs/localized/PROVIDERS.ja.md) · [スタッフルール](../docs/localized/STAFF-POLICY.ja.md) · [誰が何を決めるか](../docs/localized/WHO-DECIDES.ja.md) · [耐障害性](../docs/localized/RESILIENCE.ja.md)

**プライバシー。** お客様の情報を取得することはありません。記録するのは利用傾向（よく作業する時間帯、チャットかコメントか、ツールの設定方法）だけです。接続したツールとマシン上のデータはすべてマシンの中にとどまります。

**依存パッケージ（dependency）** も追加できます。スキル／スクリプト一式の git リポジトリを AI が読めるようにします。プロジェクト外（`~/.agents-holding/packs/<name>`）に clone し、company は参照行だけを保存します。コマンド: `holding dependency add|list|update|remove <link>`。パック内スクリプトは consent 後にだけ実行できます。[COMMANDS.md](../docs/COMMANDS.md#dependency)
