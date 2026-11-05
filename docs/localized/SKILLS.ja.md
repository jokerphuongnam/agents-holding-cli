# スキル

[English](../SKILLS.md)

スキルは、スタッフの役割が従う再利用可能な手順です(参考資料・テンプレート・スクリプトも任意で含められます)。例: *code-review*、*release-notes*。役割に付けると、その役割のすべてのタスクで使われます。

## カスタムスキルを追加

小文字・数字・ハイフンの名前でフォルダを作り、`name`・`description`・`version` をヘッダーに持つ `SKILL.md` を置きます。`holding skill where` でフォルダを表示します。

```
~/.agents-holding/skills/
  public/<skill>/SKILL.md      # shared (default)
  private/<skill>/SKILL.md     # stays on this machine
  library/<skill>/SKILL.md     # shared library skills (signed)
    references/  scripts/  templates/   # optional
    history/  assets/                   # optional, never uploaded
```

```markdown
---
name: code-review
description: Review a diff for bugs and style
version: 1
---
Steps the staff should follow...
```

## スタッフにスキルを付ける

`holding skill add <staff> <skill>`(例: `holding skill add dev code-review`)。スキル待ちのタスクは再確認して続行します。`holding skill browse <staff>` で付けられるスキルを表示します。

**依存パック**のスキルは `<pack>/<skill>` または一意な名前で付与。`holding skill remove` で外します。update では維持、dependency remove では警告してデタッチします。

## 一覧・確認・同期

- `holding skill list`: パックスキル（pack 付き）とサーバー/カスタム一覧
- `holding skill list --custom`: カスタムスキル
- `holding skill check`: 読み込めるスキルと、無視された理由・正しいパス
- `holding skill sync [--dry-run]`: 公開スキルを今すぐ送信(自動でも実行)

## 公開と非公開

新しいカスタムスキルは既定で**公開**です。`holding skill private <name>` / `holding skill public <name>` またはフォルダの移動で変更します。公開スキルでは `SKILL.md` と `references/`・`scripts/`・`templates/` が共有され、`history/` と `assets/` は共有されません。秘密情報らしきファイルがあるとスキル全体を保留します。非公開スキルはマシンから出ず、件数のみ記録されます。

## ライブラリスキル

ライブラリスキルは共有の既製スキルで、有効な署名が必要です。署名のないコピーは無視されます。`holding skill add` で同様に付けます。

## スクリプトの許可

スキルのスクリプトは自動では実行されません。`holding skill consent <name>` で一度許可し、`holding skill consent <name> --revoke` で取り消します。許可したスクリプトはサンドボックスで実行されます。

## トラブルシューティング

- スキルが見つからない: `holding skill check` を実行し、表示されたパスへ移動。
- "frontmatter missing": `SKILL.md` のヘッダーに `name`・`description`・`version` を追加。
- 標準外のフォルダは無視されます。
- "no consent": `holding skill consent <name>` を実行。
- 公開スキルが共有されない: ファイルに秘密情報がないか確認し、`holding skill sync --dry-run`。

関連: [コマンド一覧](../COMMANDS.md)

## Dependency (skill-pack)

スキル/スクリプトの git リポジトリを dependency として追加し、パックスキルをスタッフに付与します:

```bash
holding dependency add <git-url>
holding skill add <staff> <pack>/<skill>
holding skill list
holding skill remove <staff> <pack>/<skill>
```

パックはプロジェクト外。スクリプトは consent が必要。COMMANDS.md → dependency を参照。
