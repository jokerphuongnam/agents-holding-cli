# Công ty

[English](../COMPANIES.md)

Một holding có nhiều công ty. Mỗi công ty có nhân sự, bảng Jira, Jira Listener và cấu hình riêng; cái gì không đặt riêng thì theo mặc định của holding.

Chat: `/ceo companies` (danh sách) · `/ceo company <verb> ...` (cùng động từ như dưới). Terminal: `holding company <verb>`.

| Lệnh | Chức năng |
|---|---|
| `holding company list` / `count` / `overview` | Các công ty đã kết nối holding (công ty con hiện dưới công ty cha), trạng thái, nhân sự, Jira, Jira Listener. `overview` thêm sức khỏe: task mở/blocked, mục đang chờ bạn, credit (30 ngày). |
| `holding company show [name]` | Sản phẩm, trạng thái, cha/con, nhân sự, Jira, Jira Listener, cột bảng, số task, credit, cấu hình. |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | Công ty mới với nhân sự mặc định và bảng mặc định (gồm Reopened và Blocked). |
| `holding company rename <c> <new name>` | Chỉ đổi tên hiển thị; id giữ nguyên nên repo và Jira vẫn chạy. |
| `holding company pause / resume / archive <c>` | Công ty tạm dừng/lưu trữ không nhận việc mới và không tiêu credit. |
| `holding company delete <c> --confirm <c>` | Chỉ sau `archive`, và chỉ khi không còn công ty con. Repo, file local và bảng Jira không bị đụng. |
| `holding company move <c> --parent <P|none>` | Đổi công ty cha. |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | Chuyển hoặc thêm vai trò nhân sự giữa các công ty (áp dụng giới hạn gói). |
| `holding company link <c> <KEY>` / `unlink <c>` | Gắn hoặc gỡ bảng Jira. |
| `holding company config [c] [set|unset <key> <value>]` | Ghi đè theo công ty: `communication`, `auto-pr`, `flow`, `share-skills`. `unset` = về mặc định holding. `config defaults [set ...]` sửa mặc định holding. |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | Đưa công ty cũ trên máy (`.agents/*-company`) vào holding. Xem bên dưới. |

Chỉ công ty đã kết nối holding mới hiện trong danh sách. Công ty cũ chỉ có ở máy sẽ ẩn (không bị xoá) cho tới khi bạn chuyển nó vào.

## Chuyển công ty cũ vào holding

`holding company migrate <repo or .agents/x-company folder>`
1. Sao lưu thư mục vào `~/.config/agents-holding/backups/<name>-<time>.tgz` (bản gốc vẫn trên đĩa).
2. Chỉ gửi tên và số lượng: id vai trò nhân sự, số plan, công ty cha, thời điểm tạo. Không gửi nội dung file.
3. Nhân sự có vai trò trong catalog holding trở thành nhân sự thật (tới giới hạn gói, xem dưới). Vai trò tuỳ chỉnh (không có trong catalog) chỉ được ghi tên trong lịch sử công ty; holding không đọc file persona của chúng. Để dùng lại, biến thành skill private trong repo tại `.agents/custom-skills/<id>/SKILL.md`.
4. Ghi `.agents/company.json` trong repo và đăng ký repo. Chạy lại an toàn (cập nhật cùng công ty).
Migrate công ty cha trước, rồi công ty con với `--parent <parent>`.

Sau khi migrate, chỉ đọc `.agents/company.json`. Thư mục cũ `.agents/<x>-company` có thể xoá khi đã có bản sao lưu đầy đủ (bản migrate bỏ qua `cache/`): `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`.
Bố cục gợi ý cho phần giữ lại: `.agents/cache/` và `.agents/plans/` (cá nhân, giữ untracked) và `.agents/custom-skills/<id>/` (skill private trong repo, không publish). Holding không bắt buộc vị trí cụ thể cho cache hay plans.
Migrate công ty con (`children/<child>` trỏ repo khác) riêng trước khi xoá thư mục cũ của công ty cha.

## Giới hạn nhân sự theo gói

Mỗi công ty có tối đa số nhân sự dưới đây (tính cả CEO). Áp dụng cho `/staff add`, `holding company staff move|assign`, `holding company migrate` và tạo công ty mới. Bảng giá đầy đủ (credit, thiết bị, chi phí thao tác): [PRICING.md](../PRICING.md).

| Gói | Tối đa nhân sự mỗi công ty |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | Không giới hạn |
| Enterprise | Không giới hạn |
| Key cũ không có gói credit: trial / monthly / yearly | 20 / 30 / 50 |

Khi đạt giới hạn: "Đã đạt giới hạn N staff của gói X. Hãy cho nghỉ (fire) một staff trước hoặc nâng cấp gói." Migrate giữ N nhân sự đầu và báo số bị bỏ qua.

## Các cột trên bảng

Công ty mới nhận: To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done.
- **Reopened**: kéo thẻ vào đây khi test thất bại; agent tiếp tục Coding.
- **Blocked**: thẻ chờ bạn; agent không tự kéo thẻ vào hoặc ra khỏi cột này.

Công ty sẵn có giữ nguyên bảng. Để thêm Reopened/Blocked vào bảng hiện có:
1. Trong chat: `/flow edit` và yêu cầu thêm Reopened (trước Coding) và Blocked (trước Done); xác nhận flow được vẽ.
2. Trong repo: `holding jira setup-workflow <site> <email> <KEY>` với `AH_FLOW_JSON` trỏ flow đã lưu (agent làm giúp bạn), rồi kéo cột đúng thứ tự in ra (Jira không có API sắp xếp cột).

### Cột tuỳ chỉnh theo công ty
Mọi công ty có thể có cột riêng (`/flow edit`). Ví dụ (test promotion), chèn sau In Review:
Ready Testing on Develop → Verified on Develop (mở PR vào `develop`) → Ready Testing on Integration → Verified on Integration (mở PR từ nhánh feature vào `main`) → Blocked → Done.
PR chỉ mở khi auto-PR bật cho công ty đó (`holding company config <c> set auto-pr on`).
Lưu ý: kéo thẻ sang Done khi PR `main` merge chưa tự động; hãy tự kéo sang Done sau khi merge.

### Tự động dọn artifact
Workflow đọc `artifact_policy` trong repo. Mặc định, nếu task không yêu cầu tài
liệu (hoặc policy không đặt `cleanup_unrequested_files: false`), Coding lưu cây
thư mục trước khi chạy và xoá các file Markdown mới, chưa được track, không
thuộc task. `cleanup_paths` dùng để
khai báo các file đã track nhưng cần xoá; các file này được commit riêng với
message `chore(<issue>): remove workflow artifacts` trước khi task vào In
Review. Các path được bảo vệ sẽ không bị xoá. Nhờ vậy branch vẫn có audit rõ
ràng và khi squash merge vào `develop`/`main` thì file rác không đi theo,
không cần rewrite lịch sử.

### Giới hạn sửa lỗi QC và phạm vi task
Mặc định QC cho phép tối đa 2 lượt Coding sửa lỗi; bộ đếm được lưu qua lần
restart listener và lần Jira scan. Nếu vẫn fail, task chuyển Blocked và chờ
người dùng xem evidence rồi chủ động comment `HOLDING RESUME`; startup scan
không tự khởi động lại vòng lặp. Có thể đổi bằng
`max_auto_remediation_attempts` trong policy; giá trị `0` tắt tự sửa. Khi người
dùng resume, bộ đếm được đặt lại.

Coding chỉ thực hiện scope và acceptance criteria đã duyệt; không thêm refactor,
dọn dẹp ngoài yêu cầu, tài liệu, file placeholder hoặc Markdown để tạo commit.
QC chỉ sửa lỗi do thay đổi của task gây ra; hết lượt thì đưa evidence cho người
dùng quyết định.
