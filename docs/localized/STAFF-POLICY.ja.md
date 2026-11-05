# スタッフのルール・権限・プロセス

[English](../STAFF-POLICY.md)

各会社には **共有の設定がひとつ** あります。会社全体の既定と、スタッフごとの追加セクションを含めます。holding は実行のたびにこれを各エージェント固有の設定に変換します。変更できるのは所有者または会社管理者だけで、スタッフは自分の権限を緩めることはできません。

## ルールと権限
```
holding staff policy show <staff|*>                      設定を表示（* = 会社全体）
holding staff policy set <staff|*> <permission> on|off   例: mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         作業中に AI が読むプレーンテキスト規則
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Git 規則（ブランチ名、コミット形式、PR タイトル、必須 PR チェック項目）はサーバーが検査します。違反は明確な理由付きで拒否されます。

スタッフ追加（`holding staff add <role>`）時、矢印キーメニューが役割の既定を示します。そのまま受け入れるか編集してください。`AH_NONINTERACTIVE=1` で確認なしに既定を使います。

## ファイル拒否リスト
```
holding company deny add <path> [--replace <file>]     全スタッフ向けにファイルをブロック
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
ブロックされたファイルを AI が読むと、ブロックされた旨のメモだけが返り、実内容は見えません。`--replace`（例: `.env` → `.env.example`）がある場合は置換ファイルの内容を受け取ります。置換ファイルは先にスキャンされ、本物の秘密が漏れないようにします。会社とスタッフの拒否リストは合算され、スタッフは会社が既にブロックした項目を削除できません。

## 会社プロセス（Jira Listener）
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
例: プロジェクト X のタスクが状態 S に移ると、Jira Listener はリンクされたプロジェクト Y・Z のタスクに対して設定済みの作業（状態変更、コメント、担当割り当て、CEO 通知）を行います。Listener は本物の Jira リンクだけを使い、各操作を一度だけ行い、ループしません。

## 更新
`holding update`、またはチャットで `/holding update`。クライアントを更新し、エージェント設定を再生成し、チャットコマンドを再同期し、Jira Listener を再起動します。何度実行しても安全です。クライアントが古いと AI が促され、このコマンドを実行できます。

## 添付、Figma、Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         ローカルファイルを issue に添付
holding figma connect                                        Figma トークンを Keychain に保存（非表示入力、/v1/me で確認）
holding figma export "<Figma link with node-id>" --attach NAIL-12   フレームを PNG で書き出して添付
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
これらのコマンドは Keychain 内の Atlassian トークンを使い、トークンを印刷しません。スタッフには `jira_attach`（既定オン）、`figma_export`（既定オン）、`confluence_write`（既定は CEO・lead・manager のみ）が必要です。何も送らず確認するには `--dry` を付けます。
