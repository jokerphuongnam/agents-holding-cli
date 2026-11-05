# agents-holding のインストール（MCP だけ）

[English](../SETUP.md)

`curl | bash` もスクリプトのダウンロードも不要です。エージェントに MCP サーバーを追加し、ブラウザで OAuth サインインして、ローカルクライアントのインストールを提案されたら **一度だけ「はい」** と答えるだけです。

MCP の URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. MCP サーバーを追加（コマンド 1 つ）

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**既定の CLI エージェント（`grok` コマンド）**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

または `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. OAuth でサインイン（ブラウザ）

エージェントを開き、`agents-holding` を接続 / Authenticate します。開いたページで **Create key**（このマシン用の Free）か、手持ちのキーの **Import key** を選びます。キーがエージェントの設定ファイルに保存されることはなく、OAuth セッションは自動で更新されます。

## 3. ローカルクライアントのインストール（最初のメッセージで一度だけ承認）

agents-holding への **最初の** メッセージ（例：`/holding key show`）では、回答の冒頭がインストールの依頼になります。エージェントは手を止めて一度だけ尋ねます：

> このマシンに agents-holding のローカルクライアントをインストールしますか？ `holding` コマンド、ネイティブの /holding スラッシュコマンド、即答（AI 不使用）のフックが追加されます。再実行しても安全です。Jira Listener は今はインストールしません。

**はい** と答えてください。エージェントが `install` ツールを呼び、シェルコマンドを **1 つ** 実行します。進行状況は `[bootstrap 1/5]` … `[bootstrap 5/5]` と表示されます：

1. クライアントのスクリプトを `~/.agents-holding` へ
2. `holding` を PATH に追加（`~/.local/bin`）
3. デバイス ID を Keychain に保存（シークレットは表示しません）
4. ワンタイムコード（10 分、1 回限り。キーは表示されません）でこのマシンをエージェントのセッションとペアリングし、スラッシュコマンドと即答フックをインストール
5. 完了。サーバーがこのマシンにクライアントがあることを把握するので、インストール依頼は出なくなります

エージェントが尋ねてこない場合は `install agents-holding`（または `/holding install`）と入力してください。再実行しても安全です。

このステップでは Jira Listener はインストール **されません**。

インストール後は **エージェントのセッションを新しく開き直して**、新しいコマンドを読み込ませてください。

## 4. チャットで使う：即答、AI トークンゼロ

インストール後、データを返すだけのコマンドはフックやシェルがローカルで答えます。プロンプトがモデルに届くことはありません：

| Agent | `/holding key show` の動き方 |
|---|---|
| CLI `grok` | `/holding key show`: UserPromptSubmit フック（`~/.grok/hooks/agents-holding.json`）が即答 |
| Claude Code | `/holding key show`: `~/.claude/settings.json` の UserPromptSubmit フックが即答 |
| Codex CLI | `/holding key show`：`~/.codex/hooks.json` の UserPromptSubmit フックが即答（新しいフックの信頼確認が一度だけ出ます）。`!holding key show` も使えます |
| 任意のターミナル | `holding key show` |

即答の最後には `(agents-holding: instant, no model)` が付きます。

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

エージェントが必要なコマンド（`/ceo`、`/task add`、`/flow edit`、`/jira setup`、`/skill add`）は、意図的にモデルへ送られます。

### フィードバックを送る

```
/holding feedback "<text>"
```

チャットから直接フィードバックを送れます（AI トークンゼロ）。読むのはオーナーだけです。

## 5. Jira（必要になったときだけ）

コマンドやエージェントが本当に Jira を必要とするとき（タスクの読み取り、ファイル添付、列の移動、Listener の起動）：

1. エージェントが確認したうえで `holding jira connect` を実行します（ブラウザで OAuth、トークンは Keychain、チャットにはアカウント名だけを表示）
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener（ローカルのプロセス）、必要なときだけ: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

MCP のインストール、会社の作成、Jira 以外のコマンドで Jira へのサインインを求めることは **ありません**。

## 6. アップデート

チャットで `/holding update`（またはエージェントに `holding update` の実行を依頼）。再実行しても安全です。

---

## 7. プランと料金（クレジット）

料金表：**[PRICING.md](../../docs/PRICING.md)**：月間クレジット、価格、スタッフとデバイスの上限、操作コスト、アップグレード方法。

アップグレードするには、**key id**（`holding key show` で確認。キー本体は送らないでください）をオーナー **phuongnamp99@gmail.com** に送ってください。`holding billing` と `holding key show` には常に最新の連絡先が表示されます。

マシン上で: `holding billing` · `holding usage`.

---

## 付録：スクリプトでのインストール（非推奨）

エージェントがインストールを実行できない特殊な環境でのみ使ってください。通常の手順ではありません。

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

旧来の `connect.sh` / `install.sh` は互換性のためにリポジトリに残していますが、新しいドキュメントでは使用 **しません**。
