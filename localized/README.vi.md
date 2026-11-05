# agents-holding

[English](../README.md)

Vận hành một công ty AI nhỏ ngay trong coding agent của bạn: CEO, nhân sự, quy trình và Jira, tất cả từ chat.

## Giới thiệu

agents-holding biến coding agent của bạn (Claude Code, Codex, Cursor hoặc CLI `grok`) thành một tập đoàn gồm các công ty nhỏ. Mỗi công ty có một CEO để bạn trao đổi, các nhân sự với vai trò rõ ràng (engineer, QC, product…) và một quy trình đưa task Jira thật từ ý tưởng tới pull request được merge. Chỉ cần thêm một MCP server, đăng nhập là dùng được.

## Làm được gì

- **Công ty và nhân sự**: tạo công ty, tuyển hoặc cho nghỉ nhân sự, đặt quy tắc, model và skill cho từng người.
- **CEO trong chat**: `/ceo` lên kế hoạch, chia task và giao đúng người.
- **Quy trình**: quy trình công ty quyết định ai làm gì ở từng bước (người, AI hay script).
- **Jira Listener**: tiến trình chạy trên máy, theo dõi board Jira, tự gọi đúng nhân sự khi thẻ được chuyển cột rồi báo kết quả lên thẻ.
- **Sử dụng và credit**: xem gói, thanh credit và mức dùng theo nhân sự bất cứ lúc nào.

## Ưu điểm

1. **Lấy quy trình làm trọng tâm.** Không chỉ là một trợ lý chat: luồng đầy đủ công ty → nhân sự → quy trình → Jira Listener, công việc tự chạy từ thẻ sang kế hoạch, code rồi review.
2. **Lệnh không tốn token.** Các lệnh dữ liệu (`/holding key show`, `/holding staff list`, `/holding usage` …) được hook trả lời ngay trên máy; prompt không bao giờ tới model.
3. **Một lần cài cho mọi agent.** Cùng bộ lệnh chạy trong Claude Code, Codex và CLI `grok`.
4. **Dữ liệu ở lại trên máy.** Công cụ bạn kết nối (Jira, Git, file) chạy trên máy bạn; key nằm trong Keychain, không bao giờ trong file cấu hình.
5. **Giá hợp lý.** Chỉ tính credit cho thao tác sinh việc; token model không bao giờ bị tính.

```
công ty  →  nhân sự  →  quy trình  →  Jira Listener  →  kế hoạch → code → review → xong
```

## Cài đặt

Thêm MCP server, đăng nhập, xong. Chọn agent của bạn:

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

Sau đó mở agent, xác thực `agents-holding` trên trình duyệt (tạo key Free hoặc nhập key của bạn) và gửi một tin nhắn agents-holding bất kỳ. Ở tin nhắn đầu, agent tự cài các lệnh trên máy cho bạn; nếu được hỏi, chỉ cần đồng ý một lần. Hướng dẫn đầy đủ: [SETUP](../full/localized/SETUP.vi.md).

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `/holding help` | Mọi lệnh dành cho key của bạn |
| `/holding key show` | Key id, gói, credit, thiết bị |
| `/holding company create` | Tạo công ty |
| `/holding staff list` | Danh sách nhân sự |
| `/ceo …` | Trao đổi với CEO: lên kế hoạch, chia và giao việc |
| `/holding usage` | Thanh credit kỳ này |
| `/holding billing` | Gói hiện tại và cách nâng gói |
| `/holding feedback "<text>"` | Gửi góp ý cho owner |
| `/holding update` | Cập nhật client trên máy |

Trong Codex dùng `!holding …` để có câu trả lời tức thì, hoặc `/prompts:holding` và `/prompts:ceo`. Danh sách đầy đủ: chạy `holding help`.

## Gói và bảng giá

| Gói | Credit / tháng | Giá |
|---|---:|---:|
| free | 1,500 | $0 |
| starter | 4,000 | $2 |
| lite | 6,000 | $2.5 |
| pro | 20,000 | $7.5 |
| power | 80,000 | $25 |
| max | 180,000 | $50 |
| ultra | 300,000 | $75 |
| enterprise | tùy chỉnh | liên hệ |

Chỉ thao tác sinh việc mới tốn credit (ví dụ một lần agent chạy là 2 credit); xem trạng thái, billing và các tra cứu khác đều miễn phí. Muốn nâng gói, gửi key id (không gửi key) tới **phuongnamp99@gmail.com**. Chi tiết: [bảng giá](../docs/localized/PRICING.vi.md).

## Tài liệu

- [Hướng dẫn cài đặt](../full/localized/SETUP.vi.md)
- [Bảng giá](../docs/localized/PRICING.vi.md)
- Tra cứu lệnh: chạy `holding help` (hoặc `holding help <nhóm|lệnh>`)
- [Công ty](../docs/COMPANIES.md) · [Ai quyết định](../docs/WHO-DECIDES.md) · [Độ bền vững](../docs/RESILIENCE.md)

**Quyền riêng tư.** Chúng tôi không lấy thông tin của bạn, chỉ ghi nhận thói quen sử dụng (giờ bạn hay làm việc, dùng chat hay comment, cách bạn cấu hình công cụ). Mọi công cụ bạn kết nối và dữ liệu trên máy chỉ ở lại trên máy bạn.
