# Company-defined Jira Listener rules

Mỗi company có thể tùy chỉnh Jira Listener mà không cần chờ bản phát hành mới. Rule được lưu local trong company process; điều kiện và action Jira/notify chạy deterministic, không dùng model token. `/ceo` phải draft, dry-run và chỉ enable sau khi bạn xác nhận.

Triggers: `issue_transitioned`, `all_subtasks_done`, `assignee_changed`, `label_added`, `comment_created`.
Conditions: `project`, `statuses`, `issue_types`, `labels`, `include_epics`, `require_subtasks`.
Actions: `transition`, `assign`, `label`, `comment`, `run_staff`, `notify`（target: `issue` 或 `parent`）。

```bash
holding process rule add --template parent-auto-done --project NAIL --company nailly
holding process rule test parent-auto-done --company nailly
holding process rule list --company nailly
# Dry-run 检查并确认后：
holding process rule add --template parent-auto-done --project NAIL --company nailly --enable --replace
holding listener start
```

`test` 只读取真实 Jira issue 并显示 action：`jira_writes: 0`；不写入 Jira、不 enable draft、不发送模拟 event。可用 `--issue NAIL-123` 指定 subtask。无 action 表示当前条件未满足。

`parent-auto-done` là rule mặc định được bật cho company dùng default workflow, bao gồm Epic. Jira Listener áp dụng rule này một cách deterministic, không cần sửa file. Company có thể tắt bằng `holding process rule add --template parent-auto-done --project NAIL --company nailly` (lưu override ở trạng thái draft), hoặc xóa bằng `holding process rule remove parent-auto-done --company nailly`. Company có custom workflow không thừa hưởng rule mặc định nhưng có thể tự thêm rule này hoặc bất kỳ rule nào khác. Epic được bao gồm mặc định; dùng `--exclude-epics` khi tạo override nếu muốn loại Epic.

Company có thể tạo workflow và rule riêng theo ý muốn: dùng `/ceo` hoặc `holding process rule add --json` cho rule; dùng `/flow edit` hoặc `/ceo` cho custom workflow stages. CEO tạo draft, chạy dry-run (`set_company_flow` với `dry_run=true` cho workflow; `holding process rule test` cho rule) và chỉ lưu sau khi user xác nhận.

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
