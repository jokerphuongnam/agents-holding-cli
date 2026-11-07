# agents-holding 설치 (MCP만으로)

[English](../SETUP.md)

`curl | bash`도, 스크립트 다운로드도 필요 없습니다. 에이전트에 MCP 서버를 추가하고, 브라우저에서 OAuth로 로그인한 뒤, 에이전트가 로컬 클라이언트 설치를 제안하면 **한 번만 예**라고 답하면 됩니다.

MCP URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. MCP 서버 추가 (명령 하나)

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**기본 CLI 에이전트 (`grok` 명령)**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

또는 `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. OAuth 로그인 (브라우저)

에이전트를 열고 `agents-holding`을 연결 / Authenticate 합니다. 열린 페이지에서 **Create key**(이 컴퓨터용 Free) 또는 이미 있는 키를 **Import key** 합니다. 키는 에이전트 설정 파일에 저장되지 않으며 OAuth 세션은 자동으로 갱신됩니다.

## 3. 로컬 클라이언트 설치 (첫 메시지에서 한 번 승인)

agents-holding에 보내는 **첫** 메시지(예: `/holding key show`)에서는 답변 맨 앞에 설치 요청이 나옵니다. 에이전트가 멈추고 한 번 묻습니다:

> 이 컴퓨터에 agents-holding 로컬 클라이언트를 설치할까요? `holding` 명령, 기본 /holding 슬래시 명령, 즉시 응답(AI 미사용) 훅이 추가됩니다. 다시 실행해도 안전하며, Jira Listener는 지금 설치하지 않습니다.

**예**라고 답하세요. 에이전트가 `install` 도구를 호출해 셸 명령 **하나**를 실행하고 `[bootstrap 1/5]` … `[bootstrap 5/5]` 진행 상황을 보여 줍니다:

1. 클라이언트 스크립트를 `~/.agents-holding`에 설치
2. `holding`을 PATH에 추가 (`~/.local/bin`)
3. 기기 ID를 Keychain에 저장 (시크릿은 출력하지 않음)
4. 일회용 코드(10분, 1회용; 키는 표시되지 않음)로 이 컴퓨터를 에이전트 세션과 페어링하고 슬래시 명령과 즉시 응답 훅 설치
5. 완료. 서버가 이 컴퓨터에 클라이언트가 있음을 알게 되어 설치 요청이 더 이상 나오지 않음

에이전트가 묻지 않았다면 `install agents-holding`(또는 `/holding install`)을 입력하세요. 다시 실행해도 안전합니다.

이 단계에서는 Jira Listener를 설치하지 **않습니다**.

설치 후 **새 에이전트 세션을 시작**해야 새 명령이 로드됩니다.


## Optional local client (zero-token)

Without the CLI, every command still works via MCP (AI tokens). The CLI only makes replies instant with zero tokens.

First time per key+device the agent asks once to install. Yes → install and re-run the command. No → mark no-cli on the server and never ask again on this device; commands keep working via MCP. You can still run `/holding install` later.

## 4. 채팅에서 사용: 즉시, AI 토큰 0

설치 후에는 데이터만 돌려주는 명령을 훅이나 셸이 로컬에서 바로 답합니다. 프롬프트는 모델에 전달되지 않습니다:

| Agent | `/holding key show` 동작 방식 |
|---|---|
| CLI `grok` | `/holding key show`: UserPromptSubmit 훅(`~/.grok/hooks/agents-holding.json`)이 즉시 응답 |
| Claude Code | `/holding key show`: `~/.claude/settings.json`의 UserPromptSubmit 훅이 즉시 응답 |
| Codex CLI | `/holding key show`: `~/.codex/hooks.json`의 UserPromptSubmit 훅이 즉시 응답(새 훅 신뢰 확인을 한 번 묻습니다); `!holding key show`도 됩니다 |
| 아무 터미널 | `holding key show` |

즉시 응답은 항상 `(agents-holding: instant, no model)`로 끝납니다.

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

에이전트가 필요한 명령(`/ceo`, `/task add`, `/flow edit`, `/jira setup`, `/skill add`)은 의도적으로 모델로 보냅니다.

### 피드백 보내기

```
/holding feedback "<text>"
```

채팅에서 바로 피드백을 보냅니다(AI 토큰 0). 오너만 읽습니다.

## 5. Jira (필요할 때만)

명령이나 에이전트가 실제로 Jira가 필요할 때(작업 읽기, 파일 첨부, 열 이동, Listener 시작):

1. 에이전트가 먼저 묻고 `holding jira connect`를 실행합니다 (브라우저 OAuth, 토큰은 Keychain에, 채팅에는 계정 이름만 표시)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (로컬 프로세스), 필요할 때만: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

MCP 설치, 회사 생성, Jira와 무관한 명령은 Jira 로그인을 **절대** 요구하지 않습니다.

## 6. 업데이트

채팅에서 `/holding update` (또는 에이전트에게 `holding update` 실행 요청). 다시 실행해도 안전합니다.

---

## 7. 플랜과 요금 (크레딧)

요금표: **[PRICING.md](../../docs/PRICING.md)**: 월 크레딧, 가격, 스태프·기기 한도, 작업 비용, 업그레이드 방법.

업그레이드하려면 **key id**(`holding key show`에서 확인; 키 자체는 절대 보내지 마세요)를 오너 **phuongnamp99@gmail.com**에게 보내세요. `holding billing`과 `holding key show`는 항상 현재 연락처를 보여 줍니다.

내 컴퓨터에서: `holding billing` · `holding usage`.

---

## 부록: 스크립트로 설치 (권장하지 않음)

에이전트가 설치를 실행할 수 없는 특수한 환경에서만 사용하세요. 기본 설치 방법이 아닙니다.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-cli.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

이전 `connect.sh` / `install.sh` 스크립트는 호환성을 위해 저장소에 남아 있지만 새 문서에서는 사용하지 **않습니다**.
