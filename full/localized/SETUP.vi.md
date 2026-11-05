# Cài agents-holding (chỉ cần MCP)

[English](../SETUP.md)

Không cần `curl | bash`, không phải tải script. Thêm MCP server vào agent, đăng nhập OAuth trên trình duyệt, rồi trả lời **đồng ý một lần** khi agent đề nghị cài client trên máy.

URL MCP:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. Thêm MCP server (một lệnh)

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**CLI agent mặc định (lệnh `grok`)**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

hoặc trong `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. Đăng nhập OAuth (trình duyệt)

Mở agent → kết nối / Authenticate `agents-holding`. Trang web mở ra: **Create key** (Free, cho máy này) hoặc **Import key** bạn đã có. Key không bao giờ nằm trong file cấu hình của agent; phiên OAuth tự làm mới.

## 3. Cài client trên máy (một lần đồng ý, ngay tin nhắn đầu)

Ở tin nhắn agents-holding **đầu tiên** (ví dụ `/holding key show`), những dòng đầu của câu trả lời là yêu cầu cài đặt. Agent dừng lại và hỏi một lần:

> Cài client agents-holding trên máy này? Sẽ thêm lệnh `holding`, các slash command /holding và một hook trả lời tức thì (không dùng AI). Chạy lại an toàn; Jira Listener chưa được cài lúc này.

Trả lời **đồng ý**. Agent gọi tool `install` và chạy **một** lệnh shell, hiển thị tiến độ `[bootstrap 1/5]` … `[bootstrap 5/5]`:

1. Script client vào `~/.agents-holding`
2. `holding` có trong PATH (`~/.local/bin`)
3. Device id lưu trong Keychain (không in bí mật nào)
4. Ghép máy này với phiên agent bằng mã dùng một lần (10 phút, chỉ dùng một lần; key không bao giờ hiện ra), rồi cài slash command và hook tức thì
5. Xong; server biết máy đã có client nên yêu cầu cài đặt không hiện nữa

Nếu agent không hỏi, hãy gõ: `install agents-holding` (hoặc `/holding install`). Chạy lại an toàn.

Bước này **không** cài Jira Listener.

**Mở phiên agent mới** sau khi cài để agent nạp các lệnh mới.


## Client local (tuỳ chọn — zero-token)

Không có CLI thì mọi lệnh vẫn chạy qua MCP (tốn AI token). CLI chỉ để trả lời tức thì, không tốn token.

Lần đầu mỗi key+thiết bị: agent hỏi một lần. Có → cài và chạy lại lệnh. Không → đánh dấu no-cli, không hỏi lại trên máy này; lệnh vẫn qua MCP. Sau vẫn có thể `/holding install`.

## 4. Dùng trong chat: tức thì, không tốn token AI

Sau khi cài, các lệnh thuần dữ liệu được hook hoặc shell trả lời ngay trên máy. Prompt không bao giờ tới model:

| Agent | Cách chạy `/holding key show` |
|---|---|
| CLI `grok` | `/holding key show`: hook UserPromptSubmit (`~/.grok/hooks/agents-holding.json`) trả lời ngay |
| Claude Code | `/holding key show`: hook UserPromptSubmit trong `~/.claude/settings.json` trả lời ngay |
| Codex CLI | `/holding key show`: hook UserPromptSubmit trong `~/.codex/hooks.json` trả lời ngay (Codex hỏi một lần để tin cậy hook mới); `!holding key show` cũng dùng được |
| Terminal bất kỳ | `holding key show` |

Mỗi câu trả lời tức thì kết thúc bằng `(agents-holding: instant, no model)`.

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

Các lệnh cần agent (`/ceo`, `/task add`, `/flow edit`, `/jira setup`, `/skill add`) vẫn đi qua model, có chủ đích.

### Gửi góp ý

```
/holding feedback "<text>"
```

Gửi góp ý ngay từ chat (không tốn token AI). Chỉ owner đọc.

## 5. Jira (chỉ khi cần)

Khi một lệnh hoặc agent thật sự cần Jira (đọc task, đính kèm file, chuyển cột, chạy Listener):

1. Agent hỏi bạn, rồi chạy `holding jira connect` (OAuth trên trình duyệt; token trong Keychain; chat chỉ hiện tên tài khoản)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (tiến trình trên máy), chỉ khi cần: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

Cài MCP, tạo công ty và các lệnh không liên quan Jira **không bao giờ** bắt đăng nhập Jira.

## 6. Cập nhật

Trong chat: `/holding update` (hoặc nhờ agent chạy `holding update`). Chạy lại an toàn.

---

## 7. Gói và bảng giá (credit)

Bảng giá: **[PRICING.md](../../docs/PRICING.md)**: credit mỗi tháng, giá, giới hạn staff và thiết bị, chi phí thao tác, cách nâng gói.

Nâng gói: gửi **key id** (lấy từ `holding key show`; không bao giờ gửi key) cho owner: **phuongnamp99@gmail.com**. `holding billing` và `holding key show` luôn in địa chỉ liên hệ hiện tại.

Trên máy: `holding billing` · `holding usage`.

---

## Phụ lục: cài bằng script (không khuyến nghị)

Chỉ dùng khi agent không chạy được bước cài (môi trường đặc biệt). Đây không phải luồng mặc định.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

Các script cũ `connect.sh` / `install.sh` vẫn giữ trong repo để tương thích; tài liệu mới **không** dùng chúng.
