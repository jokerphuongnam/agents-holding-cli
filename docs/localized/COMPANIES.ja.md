# 会社

[English](../COMPANIES.md)

1つのホールディングに複数の会社。各会社は独自のスタッフ、Jiraボード、Jira Listener、設定を持ち、上書きしない項目はホールディングの既定に従います。

チャット: `/ceo companies`（一覧）· `/ceo company <verb> ...`（下記と同じ動詞）。ターミナル: `holding company <verb>`。

| コマンド | 内容 |
|---|---|
| `holding company list` / `count` / `overview` | ホールディングに接続された会社（子は親の下）、状態、スタッフ、Jira、Jira Listener。`overview` は健全性を追加: 未完了/ブロックされたタスク、あなた待ちの項目、クレジット（30日）。 |
| `holding company show [name]` | 製品、状態、親/子、スタッフ、Jira、Jira Listener、ボード列、タスク数、クレジット、設定。 |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | 既定のスタッフと既定ボード（Reopened と Blocked 含む）で新規会社。 |
| `holding company rename <c> <new name>` | 表示名のみ。id は変わらないためリポジトリと Jira はそのまま動きます。 |
| `holding company pause / resume / archive <c>` | 一時停止/アーカイブ中の会社は新規作業を始めず、消費もしません。 |
| `holding company delete <c> --confirm <c>` | `archive` の後でのみ、かつ子会社がない場合のみ。リポジトリ、ローカルファイル、Jiraボードは触れません。 |
| `holding company move <c> --parent <P|none>` | 親を変更。 |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | 会社間でスタッフロールを移動または追加（プラン上限あり）。 |
| `holding company link <c> <KEY>` / `unlink <c>` | Jiraボードをリンクまたは解除。 |
| `holding company config [c] [set|unset <key> <value>]` | 会社ごとの上書き: `communication`、`auto-pr`、`flow`、`share-skills`。`unset` はホールディング既定に戻す。`config defaults [set ...]` はホールディング既定を編集。 |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | 古いローカル会社（`.agents/*-company`）をホールディングへ取り込む。下記参照。 |

接続済みの会社だけが一覧に出ます。ローカルのみの古い会社は移行するまで表示されず、削除もされません。

## 古いローカル会社の移行

`holding company migrate <repo or .agents/x-company folder>`
1. フォルダを `~/.config/agents-holding/backups/<name>-<time>.tgz` にバックアップ（原本はディスクに残る）。
2. 名前と件数のみ送信: スタッフロール id、プラン数、親、作成時刻。ファイル内容は送りません。
3. ホールディングカタログにあるロールのスタッフは実スタッフになります（プラン上限まで、下記）。カタログ外のカスタムロールは会社履歴に名前のみ記録され、ペルソナファイルは読みません。再利用するには `.agents/custom-skills/<id>/SKILL.md` のプライベートリポジトリスキルにしてください。
4. リポジトリに `.agents/company.json` を書き、登録します。再実行は安全（同じ会社を更新）。
親を先に移行し、子は `--parent <parent>` で。

移行後は `.agents/company.json` のみ読みます。完全バックアップ後に古い `.agents/<x>-company` を削除できます（migrate バックアップは `cache/` を除外）: `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`。
残す推奨構成: `.agents/cache/` と `.agents/plans/`（個人用、未追跡のまま）、`.agents/custom-skills/<id>/`（非公開リポジトリスキル）。cache/plans の場所は必須ではありません。
親の古いフォルダを消す前に、子会社（`children/<child>` が別リポジトリ）を別途移行してください。

## プラン別スタッフ上限

各会社の名簿は次の人数まで（CEO 含む）。`/staff add`、`holding company staff move|assign`、`holding company migrate`、新規会社に適用。料金の詳細（クレジット、端末、アクション費用）: [PRICING.md](../PRICING.md)。

| プラン | 会社あたり最大スタッフ |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | 無制限 |
| Enterprise | 無制限 |
| クレジットプランのない古いキー: trial / monthly / yearly | 20 / 30 / 50 |

上限時: "Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan." Migrate は先頭 N 人を残し、スキップ数を報告します。

## ボード列

新規会社: To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done。
- **Reopened**: テスト失敗時にカードをここへ。エージェントは Coding を再開。
- **Blocked**: あなた待ち。エージェントは自分ではこの列に入れたり出したりしません。

既存会社のボードはそのまま。既存ボードに Reopened/Blocked を足すには:
1. チャットで `/flow edit` し、Reopened（Coding の前）と Blocked（Done の前）を追加して描画を確認。
2. リポジトリで `AH_FLOW_JSON` に保存済みフローを設定して `holding jira setup-workflow <site> <email> <KEY>`（エージェントが代行）、表示順に列をドラッグ（Jira に列並べ替え API はない）。

### 会社ごとのカスタム列
任意の会社で追加列を持てます（`/flow edit`）。例（テスト昇格）、In Review の後:
Ready Testing on Develop → Verified on Develop（`develop` への PR）→ Ready Testing on Integration → Verified on Integration（feature ブランチから `main` への PR）→ Blocked → Done。
PR は当該会社で auto-PR がオンのときのみ（`holding company config <c> set auto-pr on`）。
注意: `main` の PR マージ時に Done へ自動移動は未対応。マージ後に自分で Done へ動かしてください。
