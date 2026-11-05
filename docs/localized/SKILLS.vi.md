# Kỹ năng

[English](../SKILLS.md)

Kỹ năng là bộ hướng dẫn dùng lại được (kèm tài liệu, mẫu hoặc script nếu cần) mà một vai trò làm theo, ví dụ *code-review* hay *release-notes*. Gắn kỹ năng vào vai trò để mọi việc của vai trò đó đều dùng nó.

## Thêm kỹ năng riêng

Tạo thư mục tên chữ thường, số và dấu gạch, có `SKILL.md` với phần đầu gồm `name`, `description`, `version`. Chạy `holding skill where` để xem đường dẫn.

```
~/.agents-holding/skills/
  public/<skill>/SKILL.md      # shared (default)
  private/<skill>/SKILL.md     # stays on this machine
  library/<skill>/SKILL.md     # shared library skills (signed)
    references/  scripts/  templates/   # optional
    history/  assets/                   # optional, never uploaded
```

```markdown
---
name: code-review
description: Review a diff for bugs and style
version: 1
---
Steps the staff should follow...
```

## Gắn kỹ năng cho nhân sự

`holding skill add <staff> <skill>` (ví dụ: `holding skill add dev code-review`). Các việc đang chờ kỹ năng sẽ kiểm tra lại và làm tiếp. `holding skill browse <staff>` liệt kê kỹ năng có thể gắn.

## Liệt kê, kiểm tra, đồng bộ

- `holding skill list --custom`: kỹ năng riêng của bạn
- `holding skill check`: kỹ năng nào nạp được, cái nào bị bỏ qua và đường dẫn đúng
- `holding skill sync [--dry-run]`: gửi kỹ năng công khai ngay (cũng tự chạy)

## Công khai và riêng tư

Kỹ năng riêng mới mặc định **công khai**. Đổi bằng `holding skill private <name>` hoặc `holding skill public <name>`, hoặc chuyển thư mục. Với kỹ năng công khai, `SKILL.md` và `references/`, `scripts/`, `templates/` được chia sẻ; `history/` và `assets/` thì không bao giờ. File có dấu hiệu chứa bí mật sẽ giữ lại cả kỹ năng. Kỹ năng riêng tư không rời máy bạn; chỉ ghi lại số lượng.

## Kỹ năng thư viện

Kỹ năng thư viện là kỹ năng dựng sẵn dùng chung, phải có chữ ký hợp lệ; bản không ký bị bỏ qua. Gắn bằng `holding skill add` như thường.

## Cho phép chạy script

Script của kỹ năng không bao giờ tự chạy. Cho phép một lần bằng `holding skill consent <name>`; thu hồi bằng `holding skill consent <name> --revoke`. Script được chạy trong sandbox.

## Xử lý sự cố

- Không thấy kỹ năng: chạy `holding skill check` và chuyển nó tới đường dẫn được in ra.
- "frontmatter missing": thêm `name`, `description`, `version` vào đầu `SKILL.md`.
- Thư mục lạ bị bỏ qua; chỉ dùng các thư mục con chuẩn.
- "no consent": chạy `holding skill consent <name>`.
- Kỹ năng công khai không được chia sẻ: kiểm tra file có bí mật không, rồi `holding skill sync --dry-run`.

Xem thêm: [Danh sách lệnh](../COMMANDS.md)

## Dependency (skill-pack)

Thêm cả một repo git skill/script bằng `holding dependency add <git-url>`. Pack nằm ngoài project; cần `holding dependency consent` trước khi chạy script. Xem COMMANDS.md → dependency.
