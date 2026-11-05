# 명령어 안내

[English](../COMMANDS.md)

키로 사용할 수 있는 모든 명령입니다. 채팅에서는 `/holding <명령>`(예: `/holding key show`), 터미널에서는 `holding <명령>`을 입력하세요. AI 없이 즉시 응답합니다. `/ceo`와 `/approve`는 에이전트 명령입니다.

## 설정 및 도움말

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding help [group\|command]` | 키로 쓸 수 있는 모든 명령 | `holding help staff` |
| `holding setup sync [--claude]` | 에이전트에 슬래시 명령 설치 | `holding setup sync` |
| `holding doctor [--server]` | 설정 단계를 모두 점검 | `holding doctor` |
| `holding status` | 설정과 알림 상태 | `holding status` |

## 라이선스 키

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding key show` | 키 ID, 플랜, 크레딧, 기기 | `holding key show` |
| `holding key generate` | 이 기기용 무료 키 생성 | `holding key generate` |
| `holding key import` | 기존 키 사용(숨김 입력) | `holding key import` |

## 회사

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | 회사 목록·보기·선택 | `holding company use acme` |
| `holding company create [name] [--parent P]` | 회사 생성(이름 생략 = 현재 폴더) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | 회사 관리 | `holding company pause acme` |
| `holding company migrate <folder>` | 이전 로컬 회사 가져오기 | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | 회사 설정 | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | 모든 직원에게 파일 차단 | `holding company deny add .env` |

## 직원

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding staff list` | 직원 목록 | `holding staff list` |
| `holding staff add <role> \| remove <role>` | 역할 추가·삭제 | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | 직원 규칙과 권한(모든 에이전트 공통) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | 한 직원에게 파일 차단 | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | 직원의 AI와 모델 선택 | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | 직원 실행·테스트 | `holding staff test qa` |

## 프로세스와 워크플로

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Jira Listener가 실행하는 회사 프로세스 | `holding company process list` |
| `holding flow show \| list` | 워크플로 | `holding flow show` |
| `holding project add\|remove\|list` | Jira 프로젝트에 연결된 저장소 | `holding project list` |
| `holding habit list\|edit\|clear` | 학습된 습관 | `holding habit list` |

## 작업

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding task list [all] \| history [n]` | 작업과 기록 | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | 작업 계획·배정 | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | 계획 승인(에이전트에서) | `/approve KAN-12` |

## 역할별 AI

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding provider list \| set \| unset` | 역할별 사용 AI | `holding provider list` |

## 스킬

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding skill add <staff> <skill>` | 직원에게 스킬 연결 | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | 사용자 스킬 또는 직원용 스킬 | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | 스킬 폴더·검사·동기화 | `holding skill check` |
| `holding skill private\|public <name>` | 스킬 비공개·공개 설정 | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | 스킬 스크립트 실행 허용 | `holding skill consent my-tool` |

## Jira 및 Jira Listener

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding jira connect <site> <email>` | Jira 토큰을 키체인에 저장 | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Jira 보기 | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Jira 카드 변경 | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | 이슈에 파일 첨부 | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | Jira Listener | `holding listener status` |

## Figma

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Figma 로그인(키체인) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | 프레임을 PNG로 내보내기 | `holding figma export <url> --attach KAN-12` |

## Atlassian 및 Confluence

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | 필요할 때만 Atlassian 로그인 | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Confluence 페이지 생성·수정 | `holding confluence page create ENG "Release" --file notes.md` |

## CEO 받은편지함

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding inbox list [--all] [KEY]` | 직원의 대기 중 질문과 결정 | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | 답하면 직원이 멈춘 곳부터 재개 | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | 답하지 않고 닫기 | `holding inbox dismiss KAN-12` |

## CEO와 대화

| 명령 | 설명 | 예시 |
|---|---|---|
| `/ceo <request>` | 계획·분할·직원 배정 | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | 항목 하나에 대한 CEO 세션 | `holding ceo KAN-12` |

## 사용량과 보고서

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding usage [--by day\|staff]` | 이번 기간 크레딧 바 | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | 내 사용 보고서(집계만) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | 키 알림 | `holding notify list` |

## 플랜과 크레딧

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding credit show` | 크레딧 | `holding credit show` |
| `holding billing \| billing usage [days]` | 플랜·현재 플랜·업그레이드 방법 | `holding billing` |

## 피드백

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding feedback "<text>"` | 피드백 보내기 | `holding feedback "the inbox is great"` |



## codegraph

```bash
holding codegraph list|detect|status|use <name>|clear
```

Auto-detect PATH/MCP/index; 0→prism, 1→silent, several→ask once per company.

## dependency

스킬/스크립트 git 저장소(팩)를 추가해 모든 에이전트가 읽게 합니다. 팩은 프로젝트 밖(`~/.agents-holding/packs/<name>`)에 clone되며 company는 참조만 저장합니다.

```bash
holding dependency add <git-url>
holding dependency list
holding dependency update <name|url>
holding dependency remove <name|url>
holding dependency consent <name>
holding dependency run <name> <script>
```

팩 스킬/명령은 Grok, Claude, Codex, 로컬 AI용으로 변환됩니다. 스크립트는 consent 후에만 실행됩니다.

## 업데이트

| 명령 | 설명 | 예시 |
|---|---|---|
| `holding update` | 클라이언트·명령·Jira Listener 업데이트 | `holding update` |

함께 보기: [스킬](../SKILLS.md). `holding help`로 내 키가 쓸 수 있는 명령을 확인하세요.
