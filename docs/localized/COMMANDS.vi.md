# Danh sách lệnh

[English](../COMMANDS.md)

Mọi lệnh bạn dùng được với key của mình. Trong chat gõ `/holding <lệnh>` (ví dụ `/holding key show`); trong terminal gõ `holding <lệnh>`. Các lệnh này trả lời ngay, không tốn AI. `/ceo` và `/approve` là lệnh dành cho agent.

## Cài đặt và trợ giúp

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding help [group\|command]` | Mọi lệnh key của bạn dùng được | `holding help staff` |
| `holding setup sync [--claude]` | Cài lệnh / vào agent | `holding setup sync` |
| `holding doctor [--server]` | Kiểm tra từng bước cài đặt | `holding doctor` |
| `holding status` | Trạng thái cài đặt và thông báo | `holding status` |

## Key bản quyền

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding key show` | Mã key, gói, credit, thiết bị | `holding key show` |
| `holding key generate` | Tạo key Free cho máy này | `holding key generate` |
| `holding key import` | Dùng key có sẵn (nhập ẩn) | `holding key import` |

## Công ty

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | Liệt kê, xem hoặc chọn công ty | `holding company use acme` |
| `holding company create [name] [--parent P]` | Tạo công ty (bỏ tên = thư mục hiện tại) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | Quản lý công ty | `holding company pause acme` |
| `holding company migrate <folder>` | Nhập công ty cũ trên máy | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | Cài đặt công ty | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | Chặn file cho mọi nhân sự | `holding company deny add .env` |

## Nhân sự

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding staff list` | Danh sách nhân sự | `holding staff list` |
| `holding staff add <role> \| remove <role>` | Thêm hoặc bỏ vai trò | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | Quy tắc và quyền nhân sự (một cấu hình cho mọi agent) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | Chặn file cho một nhân sự | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | Chọn AI và model cho nhân sự | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | Chạy hoặc thử nhân sự | `holding staff test qa` |

## Quy trình

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Quy trình công ty do Jira Listener chạy | `holding company process list` |
| `holding flow show \| list` | Quy trình làm việc | `holding flow show` |
| `holding project add\|remove\|list` | Repo gắn với dự án Jira | `holding project list` |
| `holding habit list\|edit\|clear` | Thói quen đã học | `holding habit list` |

## Công việc

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding task list [all] \| history [n]` | Công việc và lịch sử | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | Lập kế hoạch hoặc giao việc | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | Duyệt kế hoạch (trong agent) | `/approve KAN-12` |

## Provider AI theo vai trò

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding provider list \| set \| unset` | AI mà từng vai trò dùng | `holding provider list` |

## Kỹ năng

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding skill add <staff> <skill>` | Gắn kỹ năng cho nhân sự | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | Kỹ năng riêng, hoặc kỹ năng cho một nhân sự | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | Thư mục kỹ năng, kiểm tra và đồng bộ | `holding skill check` |
| `holding skill private\|public <name>` | Đặt kỹ năng riêng tư hoặc công khai | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | Cho phép script của kỹ năng chạy | `holding skill consent my-tool` |

## Jira và Jira Listener

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding jira connect <site> <email>` | Lưu token Jira vào Keychain | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Xem Jira | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Sửa thẻ Jira | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | Đính kèm file vào issue | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | Jira Listener | `holding listener status` |

## Figma

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Đăng nhập Figma (Keychain) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | Xuất frame thành PNG | `holding figma export <url> --attach KAN-12` |

## Atlassian và Confluence

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | Đăng nhập Atlassian khi cần | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Tạo hoặc sửa trang Confluence | `holding confluence page create ENG "Release" --file notes.md` |

## Hộp thư CEO

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding inbox list [--all] [KEY]` | Câu hỏi, quyết định đang chờ từ nhân sự | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | Trả lời; nhân sự làm tiếp từ chỗ dừng | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | Đóng mục không cần trả lời | `holding inbox dismiss KAN-12` |

## Làm việc với CEO

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `/ceo <request>` | Lập kế hoạch, chia và giao việc cho nhân sự | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | Mở phiên CEO cho một mục | `holding ceo KAN-12` |

## Sử dụng và báo cáo

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding usage [--by day\|staff]` | Thanh credit kỳ này | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | Báo cáo sử dụng của bạn (chỉ số đếm) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | Thông báo cho key của bạn | `holding notify list` |

## Gói và credit

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding credit show` | Credit của bạn | `holding credit show` |
| `holding billing \| billing usage [days]` | Các gói, gói hiện tại, cách nâng gói | `holding billing` |

## Góp ý

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding feedback "<text>"` | Gửi góp ý | `holding feedback "the inbox is great"` |

## Cập nhật

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `holding update` | Cập nhật client, lệnh và Jira Listener | `holding update` |

Xem thêm: [Kỹ năng](../SKILLS.md). Chạy `holding help` để thấy đúng các lệnh key của bạn dùng được.
