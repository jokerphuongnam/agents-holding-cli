# 技能

[English](../SKILLS.md)

技能是员工角色遵循的一套可复用说明(可附带参考资料、模板或脚本),例如 *code-review* 或 *release-notes*。把技能挂到角色上,该角色的所有任务都会使用它。

## 添加自定义技能

用小写字母、数字和短横线命名文件夹,放入 `SKILL.md`,其头部包含 `name`、`description`、`version`。运行 `holding skill where` 查看目录。

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

## 为员工添加技能

`holding skill add <staff> <skill>`(例如 `holding skill add dev code-review`)。等待该技能的任务会重新检查并继续。`holding skill browse <staff>` 列出可添加的技能。

## 列出、检查与同步

- `holding skill list --custom`:你的自定义技能
- `holding skill check`:哪些技能可加载,哪些被忽略及正确路径
- `holding skill sync [--dry-run]`:立即发送公开技能(也会自动运行)

## 公开与私有

新的自定义技能默认**公开**。用 `holding skill private <name>` 或 `holding skill public <name>`,或移动文件夹来更改。公开技能会共享 `SKILL.md` 以及 `references/`、`scripts/`、`templates/`;`history/` 和 `assets/` 从不共享。若有文件疑似包含密钥,整个技能会被保留。私有技能不会离开你的电脑,只记录数量。

## 库技能

库技能是共享的现成技能,必须带有效签名;未签名的副本会被忽略。同样用 `holding skill add` 添加。

## 脚本授权

技能脚本从不自动运行。用 `holding skill consent <name>` 授权一次,用 `holding skill consent <name> --revoke` 撤销。获准的脚本在沙箱中运行。

## 故障排查

- 找不到技能:运行 `holding skill check`,移到其输出的路径。
- "frontmatter missing":在 `SKILL.md` 头部补上 `name`、`description`、`version`。
- 非标准文件夹会被忽略。
- "no consent":运行 `holding skill consent <name>`。
- 公开技能未共享:检查文件中是否有密钥,然后 `holding skill sync --dry-run`。

另见:[命令参考](../COMMANDS.md)
