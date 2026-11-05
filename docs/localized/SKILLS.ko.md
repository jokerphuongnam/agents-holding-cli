# 스킬

[English](../SKILLS.md)

스킬은 직원 역할이 따르는 재사용 가능한 지침입니다(참고 자료, 템플릿, 스크립트를 선택적으로 포함). 예: *code-review*, *release-notes*. 역할에 연결하면 그 역할의 모든 작업에 사용됩니다.

## 사용자 스킬 추가

소문자·숫자·하이픈 이름의 폴더를 만들고, 헤더에 `name`, `description`, `version`이 있는 `SKILL.md`를 둡니다. `holding skill where`로 폴더를 확인하세요.

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

## 직원에게 스킬 연결

`holding skill add <staff> <skill>`(예: `holding skill add dev code-review`). 스킬을 기다리던 작업은 다시 확인 후 계속됩니다. `holding skill browse <staff>`로 연결 가능한 스킬을 봅니다.

**의존성 팩** 스킬은 `<pack>/<skill>` 또는 고유 이름으로 연결. `holding skill remove`로 해제. update 시 유지, dependency 제거 시 경고 후 detach.

## 목록·검사·동기화

- `holding skill list`: 팩 스킬(팩 포함)과 서버/커스텀 목록
- `holding skill list --custom`: 사용자 스킬
- `holding skill check`: 로드되는 스킬과 무시된 이유, 올바른 경로
- `holding skill sync [--dry-run]`: 공개 스킬을 지금 전송(자동으로도 실행)

## 공개와 비공개

새 사용자 스킬은 기본 **공개**입니다. `holding skill private <name>` / `holding skill public <name>` 또는 폴더 이동으로 바꿉니다. 공개 스킬은 `SKILL.md`와 `references/`, `scripts/`, `templates/`가 공유되고 `history/`, `assets/`는 공유되지 않습니다. 비밀로 보이는 파일이 있으면 스킬 전체를 보류합니다. 비공개 스킬은 기기를 떠나지 않고 개수만 기록됩니다.

## 라이브러리 스킬

라이브러리 스킬은 공유되는 기성 스킬로, 유효한 서명이 필요합니다. 서명 없는 사본은 무시됩니다. `holding skill add`로 똑같이 연결합니다.

## 스크립트 허용

스킬 스크립트는 저절로 실행되지 않습니다. `holding skill consent <name>`으로 한 번 허용하고 `holding skill consent <name> --revoke`로 취소합니다. 허용된 스크립트는 샌드박스에서 실행됩니다.

## 문제 해결

- 스킬이 안 보임: `holding skill check` 후 표시된 경로로 이동.
- "frontmatter missing": `SKILL.md` 헤더에 `name`, `description`, `version` 추가.
- 표준이 아닌 폴더는 무시됩니다.
- "no consent": `holding skill consent <name>` 실행.
- 공개 스킬이 공유되지 않음: 파일에 비밀이 있는지 확인 후 `holding skill sync --dry-run`.

함께 보기: [명령어 안내](../COMMANDS.md)

## Dependency (skill-pack)

스킬/스크립트 git 저장소를 dependency 로 추가한 뒤 팩 스킬을 스태프에 연결합니다:

```bash
holding dependency add <git-url>
holding skill add <staff> <pack>/<skill>
holding skill list
holding skill remove <staff> <pack>/<skill>
```

팩은 프로젝트 밖. 스크립트는 consent 필요. COMMANDS.md → dependency 참고.
