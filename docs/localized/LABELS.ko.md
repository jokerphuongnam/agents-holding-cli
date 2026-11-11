# Agents Holding Jira 라벨

라벨은 표시와 라우팅 신호입니다. Jira 상태, checkpoint 및 인증된 evidence가
권위 있는 정보입니다.

| 라벨 | 의미 | 추가되는 경우 |
|---|---|---|
| `ah-flow:<name>` | 작업 workflow 템플릿 | 작업 생성 또는 flow 변경 |
| `staff:<role>` | 현재 stage 담당 staff | stage 시작 |
| `ah-agent-owned` | Holding이 작업을 조정 중 | 자동 처리 시작 |
| `agent-working` | worker 실행 중 | worker dispatch 전 |
| `ah-awaiting-user` | 사용자 작업 대기 | 로그인, 권한, terminal 또는 승인 필요 |
| `ah-blocked` | 자동 remediation 불가 | 실제 사용자 blocker 발생 |
| `ah-registration-required` | 라우팅 설정 오류 | repo/project를 라우팅할 수 없음 |
| `terminal-<slug>` | QC terminal 명령 | 등록된 terminal 선택 |

임시 라벨은 다음 reconcile에서 정리됩니다. 사용 중인 terminal은 blocker나
QC 실패가 아니라 queue 대기 상태입니다.
