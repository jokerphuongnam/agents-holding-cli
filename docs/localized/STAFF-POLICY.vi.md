# Quy tắc, quyền và quy trình của nhân sự

[English](../STAFF-POLICY.md)

Mỗi company có **một cấu hình chung**. Trong đó có mặc định cho cả company, và mỗi nhân sự có thể có thêm phần riêng. holding tự chuyển cấu hình này thành cấu hình riêng của từng agent mỗi lần chạy. Chỉ chủ sở hữu hoặc admin company mới sửa được, và nhân sự không thể tự nới lỏng quyền của mình.

## Quy tắc và quyền
```
holding staff policy show <staff|*>                      xem cấu hình (* = cả company)
holding staff policy set <staff|*> <permission> on|off   ví dụ: mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         quy tắc dạng chữ, AI sẽ đọc khi làm việc
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Các quy tắc git (tên branch, định dạng commit, tiêu đề PR, các mục bắt buộc trong PR) được server kiểm tra. Vi phạm sẽ bị từ chối kèm lý do rõ ràng.

Khi thêm nhân sự (`holding staff add <role>`), menu dùng phím mũi tên sẽ cho xem mặc định theo vai trò: chấp nhận luôn hoặc chỉnh lại. Đặt `AH_NONINTERACTIVE=1` để dùng mặc định mà không hỏi.

## Chặn file
```
holding company deny add <path> [--replace <file>]     chặn file với mọi nhân sự
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
Khi AI đọc file bị chặn, nó chỉ nhận được một lời nhắc rằng file này bị chặn, không bao giờ thấy nội dung thật. Nếu có `--replace` (ví dụ `.env` → `.env.example`), AI sẽ nhận nội dung file thay thế. File thay thế được quét trước để chắc chắn không lộ khoá thật. Danh sách chặn của company và của nhân sự được cộng lại với nhau, và nhân sự không xoá được mục mà company đã chặn.

## Quy trình của company (Jira Listener)
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
Ví dụ: khi task ở dự án X chuyển sang trạng thái S, Jira Listener tự làm việc đã định (chuyển trạng thái, comment, gán người, báo CEO) trên các task liên kết ở dự án Y, Z. Listener chỉ dùng link Jira thật, mỗi việc chỉ làm một lần, và không chạy vòng lặp.

## Cập nhật
`holding update`, hoặc gõ `/holding update` trong chat. Lệnh này cập nhật client, tạo lại cấu hình agent, đồng bộ lại lệnh chat và khởi động lại Jira Listener. Chạy lại nhiều lần cũng an toàn. Khi client đã cũ, AI sẽ được nhắc và tự chạy lệnh này giúp bạn.

## Đính kèm, Figma, Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         đính kèm file trên máy vào issue
holding figma connect                                        lưu token Figma vào Keychain (gõ ẩn, kiểm tra bằng /v1/me)
holding figma export "<Figma link with node-id>" --attach NAIL-12   xuất frame ra PNG rồi đính kèm
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
Các lệnh này dùng token Atlassian đã lưu trong Keychain và không bao giờ in token ra. Nhân sự cần có quyền `jira_attach` (mặc định có), `figma_export` (mặc định có) và `confluence_write` (mặc định chỉ CEO, lead, manager). Thêm `--dry` để xem trước mà không gửi gì đi.
