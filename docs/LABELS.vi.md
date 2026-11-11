# Jira labels của Agents Holding

Listener dùng label để hiển thị nhanh việc ai đang xử lý, task đang bị chặn ở
đâu và task có yêu cầu workflow đặc biệt hay không. Label không thay thế Jira
status; status Jira và checkpoint server mới là nguồn sự thật.

## Label bền vững

| Label | Ý nghĩa | Khi được thêm | Khi được gỡ/thay |
|---|---|---|---|
| `ah-flow:<name>` | Chọn workflow template của task, ví dụ `ah-flow:full`, `ah-flow:quick` | Khi tạo task, `/flow <KEY> <name>`, hoặc user đổi flow | Khi đổi flow; thay bằng label mới |
| `staff:<role>` | Staff đang sở hữu stage hiện tại | Khi listener bắt đầu stage và xác định staff | Thay khi stage đổi; thường gỡ khi Done |
| `ah-agent-owned` | Task đang do Agents Holding điều phối | Khi listener bắt đầu xử lý tự động | Khi workflow kết thúc hoặc bàn giao |

## Label trạng thái tạm thời

Listener tự dọn các label này khi bắt đầu reconcile mới.

| Label | Ý nghĩa | Khi được thêm |
|---|---|---|
| `agent-working` | Có agent worker đang chạy | Trước khi dispatch worker |
| `ah-awaiting-user` | Đang chờ user thực hiện hành động bắt buộc | Khi thiếu quyền, login, terminal hoặc approval |
| `ah-assignment-required` | Cần user/CEO chọn hoặc thuê staff | Khi staffing chưa đủ |
| `ah-blocked` | Có blocker không thể tự remediation | Khi worker trả về blocker cần user |
| `ah-workflow-failed` | Thao tác workflow Jira thất bại | Khi transition/comment/sync lỗi; reconcile sẽ thử lại |
| `ah-registration-required` | Repo/company/project chưa đăng ký đúng | Khi listener không route được task tới repo |
| `terminal-<slug>` | QC yêu cầu một command terminal cụ thể | Khi QC chọn registered terminal; command đầy đủ nằm trong evidence |

## Quy tắc

- Label tạm không phải lịch sử và không thay thế Jira status/checkpoint.
- Terminal bận là queue condition, không phải `ah-blocked` và không phải QC fail.
- Terminal pass/fail dựa trên evidence `exit_code` và timestamp.
- Khi Reopened, listener đọc lại status Jira, checkpoint và evidence mới nhất;
  không suy luận từ label cũ.
