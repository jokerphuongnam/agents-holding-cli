# 스태프 규칙, 권한 및 프로세스

[English](../STAFF-POLICY.md)

각 회사에는 **공유 설정이 하나** 있습니다. 회사 전체 기본값과 스태프별 추가 섹션을 포함합니다. holding은 실행할 때마다 이를 각 에이전트 고유 설정으로 바꿉니다. 소유자 또는 회사 관리자만 변경할 수 있으며, 스태프는 자신의 권한을 완화할 수 없습니다.

## 규칙과 권한
```
holding staff policy show <staff|*>                      설정 보기 (* = 회사 전체)
holding staff policy set <staff|*> <permission> on|off   예: mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         작업 중 AI가 읽는 일반 텍스트 규칙
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Git 규칙(브랜치 이름, 커밋 형식, PR 제목, 필수 PR 체크 항목)은 서버가 검사합니다. 위반은 명확한 사유와 함께 거부됩니다.

스태프를 추가할 때(`holding staff add <role>`) 화살표 키 메뉴가 역할 기본값을 보여 줍니다. 그대로 수락하거나 편집하세요. `AH_NONINTERACTIVE=1`이면 묻지 않고 기본값을 씁니다.

## 파일 차단 목록
```
holding company deny add <path> [--replace <file>]     모든 스태프에 대해 파일 차단
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
AI가 차단된 파일을 읽으면 차단되었다는 메모만 받고 실제 내용은 보지 않습니다. `--replace`(예: `.env` → `.env.example`)가 있으면 대체 파일 내용을 받습니다. 대체 파일은 먼저 스캔되어 실제 비밀이 새지 않게 합니다. 회사와 스태프 차단 목록은 합쳐지며, 스태프는 회사가 이미 차단한 항목을 지울 수 없습니다.

## 회사 프로세스(Jira Listener)
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
예: 프로젝트 X의 작업이 상태 S로 바뀌면 Jira Listener가 연결된 프로젝트 Y, Z의 작업에 설정된 일(상태 변경, 댓글, 담당 지정, CEO 알림)을 합니다. Listener는 실제 Jira 링크만 쓰고, 각 작업을 한 번만 하며, 루프하지 않습니다.

## 업데이트
`holding update`, 또는 채팅에서 `/holding update`. 클라이언트를 업데이트하고, 에이전트 설정을 다시 만들며, 채팅 명령을 다시 동기화하고 Jira Listener를 재시작합니다. 여러 번 실행해도 안전합니다. 클라이언트가 오래되면 AI가 안내하고 이 명령을 실행할 수 있습니다.

## 첨부, Figma, Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         로컬 파일을 이슈에 첨부
holding figma connect                                        Figma 토큰을 Keychain에 저장(숨김 입력, /v1/me로 확인)
holding figma export "<Figma link with node-id>" --attach NAIL-12   프레임을 PNG로보내 첨부
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
이 명령들은 Keychain의 Atlassian 토큰을 쓰며 토큰을 출력하지 않습니다. 스태프에게는 `jira_attach`(기본 켜짐), `figma_export`(기본 켜짐), `confluence_write`(기본은 CEO, lead, manager만)가 필요합니다. 아무것도 보내지 않고 미리 보려면 `--dry`를 추가하세요.
