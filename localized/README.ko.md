# agents-holding

[English](../README.md)

코딩 에이전트 안에서 작은 AI 회사를 운영하세요: CEO, 스태프, 프로세스, Jira를 모두 채팅으로.

## 소개

agents-holding은 AI 코딩 에이전트(Claude Code, Codex, Cursor, `grok` CLI)를 작은 회사들의 지주회사로 바꿉니다. 각 회사에는 대화할 수 있는 CEO, 역할이 분명한 스태프(엔지니어, QC, 프로덕트…), 실제 Jira 작업을 아이디어부터 머지된 풀 리퀘스트까지 옮기는 워크플로가 있습니다. MCP 서버 하나를 추가하고 로그인하면 바로 준비됩니다.

## 주요 기능

- **회사와 스태프**: 회사 생성, 스태프 채용·해고, 스태프별 규칙·모델·스킬 설정.
- **채팅 속 CEO**: `/ceo`가 작업을 계획하고 나누어 알맞은 스태프에게 배정합니다.
- **프로세스**: 회사 프로세스와 워크플로가 각 단계를 누가(사람, AI, 스크립트) 맡을지 정합니다.
- **Jira Listener**: Jira 보드를 지켜보는 로컬 프로세스로, 카드가 이동하면 알맞은 스태프를 실행하고 결과를 카드에 보고합니다.
- **사용량과 크레딧**: 플랜, 크레딧 막대, 스태프별 사용량을 언제든 확인합니다.

## 장점

1. **워크플로 중심.** 단순한 채팅 도우미가 아닙니다. 회사 → 스태프 → 프로세스 → Jira Listener로 이어지는 흐름 덕분에 카드에서 계획, 구현, 리뷰까지 일이 스스로 진행됩니다.
2. **토큰 0 명령.** 데이터만 돌려주는 명령(`/holding key show`, `/holding staff list`, `/holding usage` …)은 훅이 내 컴퓨터에서 즉시 답하며, 프롬프트는 모델에 가지 않습니다.
3. **모든 에이전트에 한 번의 설정.** Claude Code, Codex, `grok` CLI에서 같은 명령이 동작합니다.
4. **데이터는 내 컴퓨터에.** 연결한 도구(Jira, Git, 파일)는 내 컴퓨터에서 실행되고, 키는 설정 파일이 아닌 Keychain에 보관됩니다.
5. **공정한 요금.** 작업을 만드는 동작에만 크레딧이 들고, 모델 토큰은 절대 청구되지 않습니다.

```
회사  →  스태프  →  프로세스  →  Jira Listener  →  계획 → 구현 → 리뷰 → 완료
```

## 설치

MCP 서버를 추가하고 로그인하면 끝. 사용하는 에이전트를 고르세요:

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

그다음 에이전트를 열고 브라우저에서 `agents-holding`을 인증(Free 키 생성 또는 내 키 가져오기)한 뒤 agents-holding에 아무 메시지나 보내세요. 첫 메시지에서 에이전트가 로컬 명령을 자동으로 설정합니다. 물어보면 한 번만 승인하면 됩니다. 전체 가이드: [SETUP](../full/localized/SETUP.ko.md).

## 자주 쓰는 명령

| 명령 | 설명 |
|---|---|
| `/holding help` | 내 키로 쓸 수 있는 모든 명령 |
| `/holding key show` | key id, 플랜, 크레딧, 기기 |
| `/holding company create` | 회사 만들기 |
| `/holding staff list` | 스태프 목록 |
| `/ceo …` | CEO와 대화: 작업 계획, 분할, 배정 |
| `/holding usage` | 이번 기간 크레딧 막대 |
| `/holding billing` | 현재 플랜과 업그레이드 방법 |
| `/holding feedback "<text>"` | 오너에게 피드백 보내기 |
| `/holding update` | 로컬 클라이언트 업데이트 |

Codex에서는 즉시 응답을 위해 `!holding …`을 쓰거나 `/prompts:holding`, `/prompts:ceo`를 사용하세요. 전체 목록: `holding help` 실행.

## 플랜과 요금

| 플랜 | 크레딧 / 월 | 가격 |
|---|---:|---:|
| free | 1,500 | $0 |
| starter | 4,000 | $2 |
| lite | 6,000 | $2.5 |
| pro | 20,000 | $7.5 |
| power | 80,000 | $25 |
| max | 180,000 | $50 |
| ultra | 300,000 | $75 |
| enterprise | 맞춤 | 문의 |

작업을 만드는 동작에만 크레딧이 듭니다(예: 에이전트 실행 1회 = 2크레딧). 상태, billing 등 조회는 무료입니다. 업그레이드하려면 key id(키 자체가 아님)를 **phuongnamp99@gmail.com**으로 보내세요. 자세히: [요금표](../docs/localized/PRICING.ko.md).

## 문서

- [설치 가이드](../full/localized/SETUP.ko.md)
- [요금표](../docs/localized/PRICING.ko.md)
- 명령 참조: `holding help`(또는 `holding help <그룹|명령>`) 실행
- [회사](../docs/COMPANIES.md) · [누가 결정하나](../docs/WHO-DECIDES.md) · [복원력](../docs/RESILIENCE.md)

**개인정보.** 여러분의 정보를 가져가지 않습니다. 사용 습관(주로 일하는 시간, 채팅과 댓글 중 무엇을 쓰는지, 도구 설정 방식)만 기록합니다. 연결한 모든 도구와 컴퓨터의 데이터는 컴퓨터 안에 남습니다.
