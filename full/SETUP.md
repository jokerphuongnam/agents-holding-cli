# Cài agents-holding (chỉ MCP)

Không cần `curl | bash`, không tải script. Chỉ thêm máy chủ MCP vào agent, đăng nhập OAuth trên trình duyệt, rồi để agent tự cài phần còn lại (sau khi bạn đồng ý một lần).

URL MCP:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

Tài liệu này: https://github.com/jokerphuongnam/agents-holding-free/blob/main/full/SETUP.md

---

## 1. Thêm MCP vào agent (một lệnh)

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

**Cursor** — Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

hoặc trong `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. Đăng nhập OAuth trên trình duyệt

Mở agent → kết nối / Authenticate với `agents-holding`. Trang web mở ra: **Tạo key** (Free trên máy này) hoặc **Nhập key** có sẵn. Key không lưu trong file cấu hình agent; phiên OAuth được làm mới tự động.

## 3. Bootstrap tự động (một lần đồng ý)

Lần gọi tool MCP đầu tiên, server trả hướng dẫn bootstrap. Agent sẽ hỏi bạn:

> Cài holding CLI + slash commands lên máy bạn? (an toàn, chạy lại được)

Khi bạn đồng ý, agent gọi tool `bootstrap` và:

1. Ghi slash commands (`setup_commands`)
2. Cài `holding` vào `~/.agents-holding`, đưa lên PATH (`~/.local/bin`)
3. Tạo device id trong Keychain (không in bí mật)
4. Báo tiến độ từng bước trong chat

**Không** cài Jira Listener ở bước này.

Idempotent: chạy lại an toàn.


## Client local (tuỳ chọn — zero-token)

Không có CLI thì **mọi lệnh vẫn chạy qua MCP** (tốn AI token). CLI chỉ để trả lời tức thì, không tốn token.

Lần đầu (mỗi key+thiết bị): agent hỏi **một lần** có cài local client không.
- Có → cài, chạy lại lệnh gốc.
- Không → đánh dấu no-cli trên server, **không hỏi lại** trên máy này; lệnh tiếp tục qua MCP.

Từ chối rồi vẫn có thể `/holding install` sau.

## 4. Dùng trong chat

```
/holding help
/holding company create
/ceo …
/staff list
```

Tạo công ty, staff, skill, báo cáo… đều qua `/holding …` hoặc `/ceo`. Không cần cài thêm bằng tay.

## 5. Jira (lười — chỉ khi cần)

Khi lệnh/agent thật sự cần Jira (đọc task, gắn file, chuyển cột, bật Listener…):

1. Agent hỏi bạn → chạy `holding jira connect` (OAuth trình duyệt; token trong Keychain; chat chỉ hiện tên tài khoản)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (tiến trình local): chỉ khi cần — `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <đường-dẫn-repo-sản-phẩm>`

Cài MCP, tạo công ty, lệnh không liên quan Jira **không** yêu cầu đăng nhập Jira.

## 6. Cập nhật

Trong chat: `/holding update` (hoặc bảo agent chạy `holding update`). An toàn, chạy lại được.

---

## 7. Gói và giá (credit)

Bảng giá khách hàng (tiếng Việt): **[docs/PRICING.md](https://github.com/jokerphuongnam/agents-holding-free/blob/main/docs/PRICING.md)** — credit/tháng, giá, giới hạn staff & thiết bị, chi phí thao tác, cách nâng gói (liên hệ owner với key id).

Trên máy: `holding billing` · `holding usage`.

---

## Phụ lục — cài bằng script (không khuyến nghị)

Chỉ dùng khi agent không thể chạy bootstrap (môi trường đặc biệt). Không phải luồng khách hàng mặc định.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
```

Script cũ `connect.sh` / `install.sh` vẫn trong repo cho tương thích; **không** dùng trong tài liệu khách hàng mới.
