# 복원력: 문제가 생기면 어떻게 되나

[English](../RESILIENCE.md)

Jira Listener는 작업을 잃지 않고 세 종류의 장애를 처리합니다. Jira 이벤트를 지어내지 않습니다.

## 1. 에이전트 압축 / 문맥 손실 / 중간 종료 → 체크포인트 + 재개
- 각 스테이지는 `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`에 체크포인트를 씁니다. 스테이지, 끝난 단계, 완료된 코딩 하위 단계, 마지막 커밋, 오류를 기록합니다.
- 큰 tech plan은 최대 3개 하위 단계로 코딩됩니다. 각각 `feature/<KEY>`의 `WIP(<KEY>) n/3` 커밋으로 끝나고, 카드에 완료(✅)·남음(⏳)을 적은 📌 진행 메모가 붙습니다.
- 다시 실행(`holding staff run <KEY>` 또는 카드를 다시 옮김)하면 체크포인트부터 이어집니다. 끝난 plan·tech plan·하위 단계는 다시 하지 않습니다.
- CLI가 압축, 잘림, 문맥 초과, 최대 턴을 보고하면 재개 메모와 함께 새 세션에서 한 번 재시도합니다.

## 2. 에이전트 만료 / 사용 불가 → `agent-blocked` + 폴백
- 각 CLI의 종료 코드와 출력을 로그인 만료, 크레딧/할당량 소진, 속도 제한, CLI 없음, 문맥 손실, 시간 초과로 분류합니다.
- **속도 제한:** 백오프로 자동 재시도(30s → 60s → 120s).
- **폴백:** `state/<company>/agents.jsonc`에 스태프별 `fallback` 목록을 추가. 로그인·할당량·CLI 없음·속도 제한 오류 시 다음 명령이 자동 사용되고 카드에 전환이 기록됩니다.
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **아무것도 안 될 때:**
  - 카드에 `agent-blocked` 레이블과 원인·명령·구체적 수정(`claude login`, `codex login`, `grok login`, CLI 설치, 크레딧 확인)을 작업 언어로 댓글.
  - macOS 알림이 오고 `holding status`에 차단이 표시됩니다.
  - 다음 성공 실행에서 레이블이 제거됩니다.

## 3. MCP 서버 문제(다운, 할당량, 과부하, 타임아웃) → 경고 + 조정
- Jira Listener는 연결 끊김, 5xx/과부하, 타임아웃, 할당량 오류를 감지합니다. 빨간 경고를 기록하고 알림을 하나 보내며 `holding status`에 표시합니다. 작업은 멈추고 체크포인트는 유지됩니다.
- 연결이 돌아오면(그리고 Listener가 시작할 때마다) 마지막으로 본 이벤트 이후 갱신된 이슈를 Jira에서 읽습니다. 실제 상태를 한 번씩 재생하고 issue+status+갱신 시각으로 로컬과 MCP 서버 양쪽에서 중복을 제거합니다. 재생은 Jira만 읽고 이벤트는 쓰지 않습니다.
- 읽기 전용 명령(`holding status`, `board`, `tasks`, `usage`, …)은 마지막 좋은 답을 **STALE**과 시각으로 표시합니다. 쓰기 명령은 분명히 실패합니다.
- 할당량 오류 메시지: "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

테스트: `node tests/resilience_test.mjs`는 인증·만료·할당량·속도 제한·압축·누락을 내는 모의 CLI와 503/429를 반환하는 모의 MCP 서버를 씁니다.

## 4. Jira Listener 중지 → 즉시 경고, 손실 없음

**Jira Listener가 모든 Jira 자동화를 유지합니다**(카드 이동, 댓글, 스태프 실행). 꺼져 있으면 다시 켤 때까지 Jira에서 아무 일도 없으므로 바로 알립니다:

- **깨끗한 중지 / 종료 / 로그아웃**(SIGTERM, SIGINT, SIGHUP, `launchctl bootout`): 종료 전 MCP 서버에 "stopped"를 알립니다(~1초).
- **크래시, 절전, 멈춤**: 60초마다 하트비트. 150초 없으면 MCP 서버가 오프라인으로 표시.
- **로컬 워치독**(launchd 작업 `com.agentsholding.listener-watchdog`, `holding listener start` / `autostart on`으로 설치): 5초마다 확인하고 macOS 알림 *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"* (15분마다 재알림), 크래시 후 launchd 재시작 시 *"Jira Listener restarted"*, 복구 시 *"running again"*. 로그: `~/Library/Logs/agents-holding/watchdog.log`.
- `holding status`, `holding listener status`, `/ceo`는 꺼져 있는 동안 같은 빨간 경고로 시작합니다. CEO 받은편지함에 "Jira Listener is off" 항목이 생깁니다.
- **꺼진 동안의 Jira 변경**: 카드마다 첫 변경에 한 번(작업 언어로) Listener가 꺼져 있었고 켜는 방법을 댓글. 돌아오면 플래그 해제, 오프라인 항목 닫기, 놓친 변경 재생(조정). 미완료 실행은 체크포인트부터 재개.
- "에이전트가 막 나가려는 열에 카드가 그대로 있음"만인 재생은 무시(잘못된 "되돌림" 없음).

## 5. 카드 담당자(assignee)

스태프가 작업을 집을 때(`staff:<id>` 레이블과 같은 순간) 카드의 Jira assignee는 스태프의 `jira_user`(선택, `agents.jsonc`의 Jira accountId 또는 이메일) 또는 Jira Listener가 연결된 계정으로 설정됩니다. 스태프 레이블은 유지됩니다. needs-hire / needs-decision / blocked와 Done에서도 assignee는 유지됩니다.

## 6. 질문은 어디로: CEO 받은편지함. 실행을 막지 않음

당신이 필요한 모든 것(스태프 질문, 1/2/3 결정, 채용, 로그인 등으로 막힌 에이전트, 승인 게이트, QC 중단, 실패한 실행, "어느 저장소?", Jira Listener 꺼짐)은 **CEO 받은편지함**의 대기 항목 하나와 작업 키·필요 내용·답하는 방법이 담긴 **Agents Holding** 제목 macOS 알림이 됩니다. 스태프 실행은 입력을 기다리지 않습니다: 항목을 올리고 종료하며, 당신의 답으로 체크포인트부터 이어집니다.

- `holding inbox [--all] [KEY]`: 회사별로 묶은 대기 항목.
- `holding inbox reply KAN-12 2`: 세션 없이 빠른 답(카드 답장과 같은 효과. Jira에는 쓰지 않음).
- `holding inbox dismiss <id|KEY>`: 답할 필요 없는 항목 닫기(스태프·Jira에 아무것도 보내지 않음).
- `holding status`는 CEO 받은편지함 대기 수를 표시.
- 알림의 **Open CEO**, 또는 `holding ceo --item <id>`: 해당 항목에 맞춘 CEO 세션(새 Terminal) 열기.
- `/ceo`는 대기 항목을 먼저 표시. 회사 저장소 안: 그 회사만. 어떤 회사 밖: holding 모드로 모든 회사의 대기와 진행을 묶어 표시. `/approve`로 승인, `holding jira move KAN-12 "Done"`으로 이동/완료.

**커뮤니케이션 설정**(회사별, `holding company set communication jira+chat|chat`, 기본 `jira+chat`):
- `jira+chat`: 질문/결정/진행이 카드 댓글 **그리고** CEO 받은편지함. 어느 쪽에서든 답.
- `chat`: 카드에 질문/결정/진행 댓글 없음. `/ceo` 또는 `holding inbox reply`로 답. 레이블·상태·assignee는 Jira에서 갱신.

## 키와 크레딧

1. **키 받기.** Setup은 **Generate key**(이 Mac용 새 Free 키, 월 1,500 크레딧, 기기당 Free 키 평생 하나) 또는 **Import key**(이미 가진 키). 키는 숨김 프롬프트로 받고 macOS Keychain에만 보관.
2. **이 Mac에서 키를 잃었나?** Generate key를 다시 실행: 이 기기의 Free 키가 복구(같은 크레딧·기록, 새 비밀. 옛것은 중단). 유료 키는 Import key.
3. **확인.** `holding key show`(키 id, 플랜, 크레딧, 기기), `holding credit show`, `holding billing`. 업그레이드나 크레딧 추가는 키 id(키 자체는 안 됨)를 소유자에게. 요금표: [PRICING.md](../PRICING.md)(`holding billing`에서도 링크).
4. **플랜(월 크레딧).** Free 1,500 · Starter 4,000 · Lite 6,000 · Pro 20,000 · Power 80,000 · Max 180,000 · Ultra 300,000 · Marketplace 20,000 for $10 · Enterprise 맞춤 — 자세한 내용은 [PRICING.md](../PRICING.md).
5. **비용.** next action 2; advance, Jira 갱신, staff brief, record artifact, assign, CEO, inbox post / reply는 각 1. 나머지는 무료. 모델 토큰은 세지 않음.
6. **추가 크레딧**(소유자): 기간분, 키 갱신까지(최대 90일 보관), 또는 소진까지(만료 후에도 남지만 키가 유효할 때만 사용).
7. **크레딧 소진 또는 만료.** Jira Listener는 "Key is no longer valid or out of credits; contact the owner to renew or add credits"로 중지. 그동안의 Jira 변경은 재생되지 않음. 갱신 후 열린 각 카드의 현재 상태를 조정.

## Enterprise 플랜(예정; 다음 단계)

**키와 크레딧은 가동 중**(위 절 참고). 여기 팀 기능은 다음 단계입니다. 팀 버전 동작:

- **입력한 키만으로 플랜과 역할이 결정**되며 별도 로그인·역할 선택기는 없습니다. 역할:
  - **admin**: 플랫폼 소유자.
  - **personal user**: 개인 플랜.
  - **enterprise owner**: admin이 발급한 키. 자기 enterprise 안에서만 키 생성·취소·갱신·관리. 공유/개인 키 풀이나 다른 enterprise에는 손대지 않음.
  - **enterprise employee**: enterprise owner가 만든 키.
- **회사당 공유 보드 하나**; 공유 CLI 서버가 회사 전체 Jira 자동화를 돌릴 수 있음.
- **실제 Jira 사용자에 매핑된 스태프**(`jira_user`)와 역할/권한, 누가 무엇을 집고/바꿨는지 감사.
- **Assignee 중심**: 각자 자신의 Jira Listener를 실행. 카드 assignee가 자신의 Jira 사용자로 바뀌면 그 Listener가 자신의 스태프로 집음.
- **채팅 우선**: `/ceo`나 스태프 채팅으로 대화. Jira 댓글은 선택(커뮤니케이션 설정). 주 진입점은 `/ceo KAN-12`: CEO가 작업을 읽고 스태프를 조율.

