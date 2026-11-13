# Độ bền vững: điều gì xảy ra khi có sự cố

[English](../RESILIENCE.md)

Jira Listener xử lý ba loại lỗi mà không mất việc. Nó không bao giờ bịa sự kiện Jira.

## 1. Agent bị nén ngữ cảnh / mất ngữ cảnh / chết giữa chừng → checkpoint + resume
- Mỗi stage ghi checkpoint vào `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`. Checkpoint ghi stage, các bước đã xong, các bước coding con đã làm, commit cuối và lỗi nếu có.
- Tech plan lớn được code tối đa 3 bước con. Mỗi bước kết thúc bằng commit `WIP(<KEY>) n/3` trên `feature/<KEY>`, và thẻ nhận ghi chú tiến độ 📌 liệt kê phần đã xong (✅) và còn lại (⏳).
- Chạy lại (`holding staff run <KEY>` hoặc kéo thẻ lại) tiếp tục từ checkpoint. Plan, tech plan và bước con đã xong không làm lại.
- Khi listener khởi động/kết nối lại, các thẻ Jira đang hoạt động (gồm In Progress, Reopened, Coding, QC) được reconcile với `next_action` hiện tại từ server. Workflow tiếp tục đúng stage của agent và checkpoint local; không đoán rằng status Jira nào cũng tương ứng với Coding hoặc QC. Task đang chờ người dùng/gate hoặc đã Blocked ở QC sẽ tiếp tục chờ.
- Khi CLI agent báo nén ngữ cảnh, cắt cụt, tràn ngữ cảnh hoặc hết lượt, cuộc gọi được thử lại một lần trong phiên mới kèm ghi chú resume.

## 2. Agent hết hạn / không dùng được → `agent-blocked` + fallback
- Mã thoát và output của mỗi CLI được phân loại: hết đăng nhập, hết credit/quota, rate limit, thiếu CLI, mất ngữ cảnh hoặc hết thời gian.
- **Rate limit:** tự thử lại với backoff (30s → 60s → 120s).
- **Fallback:** thêm danh sách `fallback` cho từng nhân sự trong `state/<company>/agents.jsonc`. Khi lỗi đăng nhập, quota, thiếu CLI hoặc rate-limit, lệnh tiếp theo được dùng tự động, và thẻ ghi chú việc chuyển.
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **Khi không còn cách nào:**
  - Thẻ nhận nhãn `agent-blocked` và comment bằng ngôn ngữ của task với nguyên nhân, lệnh và cách sửa cụ thể (`claude login`, `codex login`, `grok login`, cài CLI, kiểm tra credit).
  - Bạn nhận thông báo macOS, và `holding status` hiện khối.
  - Nhãn được gỡ ở lần chạy thành công tiếp theo.

## 3. Sự cố MCP server (sập, quota, quá tải, timeout) → cảnh báo + reconcile
- Jira Listener phát hiện mất kết nối, phản hồi 5xx/quá tải, timeout và lỗi quota. Nó ghi cảnh báo đỏ, gửi một thông báo, và `holding status` hiện ra. Việc tạm dừng và checkpoint được giữ.
- Khi kết nối trở lại (và mỗi lần listener khởi động), listener đọc Jira các issue cập nhật kể từ sự kiện cuối đã thấy. Nó phát lại mỗi trạng thái thật một lần, khử trùng theo issue + status + thời gian cập nhật cả local lẫn MCP server. Replay chỉ đọc Jira, không ghi sự kiện.
- Lệnh chỉ đọc (`holding status`, `board`, `tasks`, `usage`, …) hiện câu trả lời tốt cuối, đánh dấu **STALE** kèm thời gian. Lệnh ghi thất bại rõ ràng.
- Lỗi quota in thông điệp rõ: "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

Kiểm thử: `node tests/resilience_test.mjs` dùng CLI giả lỗi auth, hết hạn, quota, rate-limit, compaction và thiếu CLI, cùng MCP server giả trả 503/429.

## 4. Jira Listener dừng → cảnh báo ngay, không mất gì

**Jira Listener giữ toàn bộ tự động hóa Jira chạy** (kéo thẻ, comment, chạy nhân sự). Khi tắt, không có gì xảy ra trên Jira cho tới khi bạn bật lại, nên bạn được báo ngay:

- **Dừng sạch / thoát / đăng xuất** (SIGTERM, SIGINT, SIGHUP, `launchctl bootout`): listener báo MCP server "stopped" trước khi thoát (~1 s).
- **Crash, ngủ hoặc đóng băng**: listener gửi heartbeat mỗi 60 s; sau 150 s không có, MCP server đánh dấu offline.
- **Watchdog local** (job launchd `com.agentsholding.listener-watchdog`, cài bằng `holding listener start` / `autostart on`): kiểm tra mỗi 5 s và hiện thông báo macOS *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"* (nhắc mỗi 15 phút), *"Jira Listener restarted"* khi crash và launchd khởi động lại, và *"running again"* khi đã chạy. Log: `~/Library/Logs/agents-holding/watchdog.log`.
- `holding status`, `holding listener status` và `/ceo` mở đầu bằng cùng cảnh báo đỏ khi tắt; hộp thư CEO nhận mục "Jira Listener is off".
- **Thay đổi Jira khi tắt**: thay đổi đầu tiên trên mỗi thẻ nhận MỘT comment (ngôn ngữ của task) nói Jira Listener đang tắt và cách bật. Khi bật lại, cờ được xóa, mục offline đóng, và mọi thay đổi bỏ lỡ được phát lại (reconcile); lần chạy chưa xong tiếp tục từ checkpoint.
- Thay đổi phát lại chỉ là "thẻ vẫn ở cột mà agent đang kéo ra" thì bị bỏ qua (không báo sai "bạn kéo ngược lại").

## 5. Ai đang làm thẻ (assignee)

Khi nhân sự nhận task (cùng lúc với nhãn `staff:<id>`) assignee Jira của thẻ được đặt thành `jira_user` của nhân sự (tuỳ chọn, trong `agents.jsonc`: accountId hoặc email Jira) hoặc tài khoản Jira mà Jira Listener đang kết nối. Nhãn staff giữ nguyên. Assignee giữ khi needs-hire / needs-decision / blocked và khi Done.

## 6. Câu hỏi đi đâu: hộp thư CEO, không bao giờ chặn lần chạy

Mọi thứ cần bạn (câu hỏi nhân sự, quyết định 1/2/3, thuê người, agent bị chặn ví dụ vì đăng nhập, cổng duyệt, dừng QC, lần chạy thất bại, "repo nào?", Jira Listener tắt) trở thành MỘT mục chờ trong **hộp thư CEO** và thông báo macOS tiêu đề **Agents Holding** với key task, việc cần và cách trả lời. Lần chạy nhân sự không bao giờ chờ nhập: chúng đăng mục rồi thoát; câu trả lời của bạn tiếp tục task từ checkpoint.

- `holding inbox [--all] [KEY]`: mục chờ, nhóm theo công ty.
- `holding inbox reply KAN-12 2`: trả lời nhanh không mở phiên (cùng hiệu lực như trả lời trên thẻ; không ghi lên Jira).
- `holding inbox dismiss <id|KEY>`: đóng mục bạn không cần trả lời (không gửi gì cho nhân sự hay Jira).
- `holding status` hiện số mục hộp thư CEO đang chờ.
- Nút **Open CEO** trên thông báo, hoặc `holding ceo --item <id>`: mở phiên CEO (cửa sổ Terminal mới) tập trung vào mục đó.
- `/ceo` hiện mục chờ trước. Trong repo công ty: chỉ công ty đó. Ngoài mọi công ty: chế độ holding, mọi mục chờ và tiến độ của mọi công ty, nhóm lại; giải quyết từ đó. Duyệt bằng `/approve`, kéo/đánh dấu xong bằng `holding jira move KAN-12 "Done"`.

**Cài đặt giao tiếp** (theo công ty, `holding company set communication jira+chat|chat`, mặc định `jira+chat`):
- `jira+chat`: câu hỏi/quyết định/tiến độ được comment trên thẻ VÀ vào hộp thư CEO; trả lời ở một trong hai nơi.
- `chat`: không comment câu hỏi/quyết định/tiến độ trên thẻ; trả lời bằng `/ceo` hoặc `holding inbox reply`. Nhãn, trạng thái và assignee vẫn cập nhật trên Jira.

## Key và credit

1. **Lấy key.** Setup đưa hai lựa chọn: **Generate key** (key Free mới cho Mac này, 1.500 credit/tháng, một key Free mỗi máy, mãi mãi) hoặc **Import key** (key bạn đã có). Key nhập ở lời nhắc ẩn và chỉ lưu trong macOS Keychain.
2. **Mất key trên Mac này?** Chạy Generate key lại: key Free của máy được khôi phục (cùng credit và lịch sử, secret mới; cái cũ ngừng hoạt động). Key trả phí: Import key.
3. **Kiểm tra.** `holding key show` (key id, gói, credit, máy), `holding credit show`, `holding billing`. Để nâng cấp hoặc thêm credit, gửi key id (không bao giờ gửi key) cho owner. Bảng giá đầy đủ: [PRICING.md](../PRICING.md) (cũng được liên kết từ `holding billing`).
4. **Gói (credit mỗi tháng).** Free 1.500 · Starter 4.000 · Lite 6.000 · Pro 20.000 · Power 80.000 · Max 180.000 · Ultra 300.000 · Marketplace 20.000 với $10 · Enterprise tuỳ chỉnh — chi tiết trong [PRICING.md](../PRICING.md).
5. **Cái gì tốn.** next action 2; advance, cập nhật Jira, staff brief, record artifact, assign, CEO, inbox post / reply mỗi cái 1. Mọi thứ khác miễn phí; token mô hình không bao giờ tính.
6. **Credit thêm** từ owner: theo kỳ, tới khi key gia hạn (giữ tối đa 90 ngày), hoặc tới khi dùng hết (sống qua hết hạn nhưng chỉ hoạt động khi key còn hiệu lực).
7. **Hết credit hoặc hết hạn.** Jira Listener dừng với "Key is no longer valid or out of credits; contact the owner to renew or add credits". Thay đổi Jira trong lúc đó không được phát lại; sau gia hạn Jira Listener reconcile trạng thái hiện tại của mỗi thẻ mở.

## Gói Enterprise (đã lên kế hoạch; giai đoạn tới)

**Key và credit đang chạy** (xem mục trên); các tính năng nhóm dưới đây là giai đoạn tới. Cách bản nhóm hoạt động:

- **Chỉ key bạn nhập quyết định gói và vai trò**; không có đăng nhập hay chọn vai trò riêng. Vai trò:
  - **admin**: chủ nền tảng.
  - **personal user**: gói cá nhân.
  - **enterprise owner**: key do admin cấp; tạo, thu hồi, gia hạn và quản lý key chỉ trong enterprise của mình, không đụng pool key dùng chung/cá nhân hay enterprise khác.
  - **enterprise employee**: key do enterprise owner tạo.
- **Một board dùng chung mỗi công ty**; CLI server dùng chung có thể chạy tự động hóa Jira cho cả công ty.
- **Nhân sự ánh xạ tới người dùng Jira thật** (`jira_user`) với vai trò/quyền, và nhật ký ai nhận / đổi gì.
- **Theo assignee**: mỗi người chạy Jira Listener riêng; khi assignee của thẻ đổi sang người dùng Jira của họ, listener của họ nhận với nhân sự của họ.
- **Chat trước**: mọi người nói qua `/ceo` hoặc chat nhân sự; comment Jira là tuỳ chọn (cài đặt giao tiếp). Cách vào chính là `/ceo KAN-12`: CEO tải task và điều phối nhân sự.
