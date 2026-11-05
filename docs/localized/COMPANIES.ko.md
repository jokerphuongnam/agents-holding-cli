# 회사

[English](../COMPANIES.md)

하나의 홀딩에 여러 회사. 각 회사는 자체 스태프, Jira 보드, Jira Listener, 설정을 가지며, 덮어쓰지 않은 항목은 홀딩 기본값을 따릅니다.

채팅: `/ceo companies`(목록) · `/ceo company <verb> ...`(아래와 같은 동사). 터미널: `holding company <verb>`.

| 명령 | 기능 |
|---|---|
| `holding company list` / `count` / `overview` | 홀딩에 연결된 회사(자식은 부모 아래), 상태, 스태프, Jira, Jira Listener. `overview`는 건강 상태 추가: 열린/차단된 작업, 대기 중인 항목, 크레딧(30일). |
| `holding company show [name]` | 제품, 상태, 부모/자식, 스태프, Jira, Jira Listener, 보드 열, 작업 수, 크레딧, 설정. |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | 기본 스태프와 기본 보드(Reopened, Blocked 포함)로 새 회사. |
| `holding company rename <c> <new name>` | 표시 이름만 변경. id는 그대로라 저장소와 Jira는 계속 동작. |
| `holding company pause / resume / archive <c>` | 일시 중지/보관된 회사는 새 작업을 시작하지 않고 소비하지 않음. |
| `holding company delete <c> --confirm <c>` | `archive` 이후이며 자식 회사가 없을 때만. 저장소, 로컬 파일, Jira 보드는 건드리지 않음. |
| `holding company move <c> --parent <P|none>` | 부모 변경. |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | 회사 간 스태프 역할 이동 또는 추가(플랜 한도 적용). |
| `holding company link <c> <KEY>` / `unlink <c>` | Jira 보드 연결 또는 해제. |
| `holding company config [c] [set|unset <key> <value>]` | 회사별 덮어쓰기: `communication`, `auto-pr`, `flow`, `share-skills`. `unset` = 홀딩 기본값으로. `config defaults [set ...]`는 홀딩 기본값 편집. |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | 이전 로컬 회사(`.agents/*-company`)를 홀딩으로 가져오기. 아래 참고. |

홀딩에 연결된 회사만 목록에 표시됩니다. 로컬만 있는 이전 회사는 마이그레이션할 때까지 숨겨지며 삭제되지 않습니다.

## 이전 로컬 회사 마이그레이션

`holding company migrate <repo or .agents/x-company folder>`
1. 폴더를 `~/.config/agents-holding/backups/<name>-<time>.tgz`에 백업(원본은 디스크에 유지).
2. 이름과 개수만 전송: 스태프 역할 id, 플랜 수, 부모, 생성 시각. 파일 내용은 보내지 않음.
3. 홀딩 카탈로그에 있는 역할의 스태프는 실제 스태프가 됨(플랜 한도까지, 아래). 카탈로그에 없는 커스텀 역할은 회사 이력에 이름만 기록되고 페르소나 파일은 읽지 않음. 재사용하려면 `.agents/custom-skills/<id>/SKILL.md`의 비공개 저장소 스킬로 만드세요.
4. 저장소에 `.agents/company.json`을 쓰고 등록. 재실행은 안전(같은 회사 갱신).
부모를 먼저 마이그레이션한 뒤 자식은 `--parent <parent>`로.

마이그레이션 후에는 `.agents/company.json`만 읽습니다. 전체 백업 후 이전 `.agents/<x>-company` 폴더를 지울 수 있습니다(migrate 백업은 `cache/` 제외): `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`.
유지 권장 구성: `.agents/cache/`와 `.agents/plans/`(개인, untracked 유지), `.agents/custom-skills/<id>/`(비공개 저장소 스킬). cache/plans 위치는 강제되지 않습니다.
부모의 이전 폴더를 지우기 전에 자식 회사(`children/<child>`가 다른 저장소)를 따로 마이그레이션하세요.

## 플랜별 스태프 한도

각 회사 명단은 다음 수까지(CEO 포함). `/staff add`, `holding company staff move|assign`, `holding company migrate`, 새 회사에 적용. 전체 요금(크레딧, 기기, 작업 비용): [PRICING.md](../PRICING.md).

| 플랜 | 회사당 최대 스태프 |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | 무제한 |
| Enterprise | 무제한 |
| 크레딧 플랜 없는 이전 키: trial / monthly / yearly | 20 / 30 / 50 |

한도 도달 시: "Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan." Migrate는 앞의 N명을 유지하고 건너뛴 수를 보고합니다.

## 보드 열

새 회사: To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done.
- **Reopened**: 테스트 실패 시 카드를 여기로. 에이전트가 Coding을 재개.
- **Blocked**: 사용자 대기. 에이전트는 이 열로 넣거나 빼지 않음.

기존 회사 보드는 그대로. 기존 보드에 Reopened/Blocked를 추가하려면:
1. 채팅에서 `/flow edit`으로 Reopened(Coding 앞), Blocked(Done 앞) 추가 후 그린 플로우 확인.
2. 저장소에서 저장된 플로우로 `AH_FLOW_JSON`을 설정한 뒤 `holding jira setup-workflow <site> <email> <KEY>`(에이전트가 대행), 출력된 순서로 열을 드래그(Jira에는 열 재정렬 API 없음).

### 회사별 커스텀 열
어떤 회사든 추가 열을 가질 수 있습니다(`/flow edit`). 예(테스트 승격), In Review 뒤:
Ready Testing on Develop → Verified on Develop(`develop`으로 PR) → Ready Testing on Integration → Verified on Integration(feature 브랜치에서 `main`으로 PR) → Blocked → Done.
PR은 해당 회사에서 auto-PR이 켜져 있을 때만(`holding company config <c> set auto-pr on`).
참고: `main` PR 머지 시 Done으로 자동 이동은 아직 없음. 머지 후 직접 Done으로 옮기세요.
