# Bảng giá agents-holding (credit)

[English](../PRICING.md)

Tài liệu khách hàng: gói credit, giới hạn, chi phí thao tác, cách nâng gói. Không thanh toán trong app — nâng gói bằng cách liên hệ owner với **key id**.

Xem gói hiện tại trên máy: `holding billing` · `holding usage` · `holding key show` (chỉ hiện key id, không in secret).

---

## Gói credit (theo tháng)

| Gói | Credit / tháng | Giá | Kênh |
|---|---:|---:|---|
| free | 1.500 | $0 | trực tiếp |
| starter | 4.000 | $2 | trực tiếp |
| lite | 6.000 | $2.5 | trực tiếp |
| pro | 20.000 | $7.5 | trực tiếp |
| power | 80.000 | $25 | trực tiếp |
| max | 180.000 | $50 | trực tiếp |
| ultra | 300.000 | $75 | trực tiếp |
| marketplace | 20.000 | $10 | marketplace |
| enterprise | tùy chỉnh | liên hệ | liên hệ owner |

- Chỉ key có **metered** (gắn credit plan) mới trừ credit. Key cũ chưa bật metering giữ hành vi cũ.
- **enterprise**: số credit / ghế / thiết bị theo thỏa thuận — **liên hệ** owner.
- Gói marketplace: mua qua kênh marketplace; chi tiết đơn hàng — **liên hệ** owner.

---

## Giới hạn staff (mỗi công ty)

Số staff tối đa trong roster một công ty (tính cả CEO). Áp dụng khi thêm staff, chuyển/gán staff, migrate, tạo công ty mới. Owner (key chủ) không bị giới hạn này.

| Gói | Max staff / công ty |
|---|---:|
| free | 5 |
| starter | 10 |
| lite | 15 |
| pro | 25 |
| marketplace | 25 |
| power | 40 |
| max | 60 |
| ultra | không giới hạn |
| enterprise | không giới hạn |

Key cũ **chưa** có credit plan (legacy): trial 20 · monthly 30 · yearly 50 · mặc định nếu không khớp: 30.

Khi chạm trần: *"Đã đạt giới hạn N staff của gói X. Hãy cho nghỉ (fire) một staff trước hoặc nâng cấp gói."*

---

## Giới hạn thiết bị (máy)

| Mục | Giá trị |
|---|---|
| Mặc định mỗi key | **1** thiết bị |
| Trần owner có thể gán | **1…50** thiết bị / key |
| Free tự tạo trên máy | **một** key Free / máy (không tạo Free mới trên cùng máy) |
| enterprise | số thiết bị / key theo thỏa thuận — **liên hệ** |

Hết slot máy: liên hệ owner để tăng số thiết bị, rồi thử lại trên máy mới. Xem `holding key show` (dòng devices used/max).

---

## Chi phí credit theo thao tác

Chỉ các lệnh **sinh việc** dưới đây tốn credit. Mọi thứ khác (heartbeat, đồng bộ realtime, status, billing, inbox list, key, admin, hầu hết lệnh CLI) **miễn phí**.

| Thao tác | Credit |
|---|---:|
| Agent run (`next_action`) | **2** |
| `advance` | 1 |
| `jira_ops` | 1 |
| `staff_brief` | 1 |
| `record_artifact` | 1 |
| `assign` (gồm `holding task set …`) | 1 |
| `ceo` | 1 |
| `inbox_post` / `inbox_reply` | 1 |

**Token model không bao giờ bị tính credit.**

### Upload (Jira attach / Figma export / Confluence)

**1 credit / file + 1 credit mỗi 10 MB vượt 5 MB đầu**, **tối đa 5 credit / file**.

Ví dụ: 0,4 MB → 1 · 25 MB → 3 · 300 MB → 5.

File đi thẳng từ máy bạn lên Jira, Confluence hoặc Figma; server chỉ đo dung lượng để tính credit.

---

## Mua thêm credit (không đổi gói)

Nạp thêm credit mà không cần đổi gói. Có ba loại:

| Loại | Cách hoạt động |
|---|---|
| `expire` | hết hạn cùng kỳ của gói hiện tại |
| `next` | dùng được ngay; phần còn dư cuối kỳ bị khóa, rồi được mở khóa và cộng vào khi kỳ mới bắt đầu |
| `keep` | giữ nguyên cho tới khi dùng hết |

Giá: liên hệ owner (phuongnamp99@gmail.com) kèm key id.

---

## Nâng gói / thêm credit

1. Lấy **key id** (không gửi secret key): `holding key show` hoặc dòng “To upgrade” trong `holding billing` / `holding usage`.
2. Gửi key id cho **owner** (**phuongnamp99@gmail.com**) và nêu gói muốn (hoặc cần thêm credit trong kỳ).
3. **Chưa có thanh toán trong app.** Khi có cổng thanh toán sau này, luồng nâng gói sẽ gắn vào điểm mở rộng hiện có — không đổi cách tra cứu bảng giá này.

Hết credit / key hết hạn: Jira Listener dừng với thông báo liên hệ owner để gia hạn hoặc thêm credit.

---

## Tra cứu nhanh trên máy

```bash
holding billing          # gói hiện tại + bảng giá + dòng nâng gói
holding usage            # thanh % credit kỳ này (key đã metered)
holding credit show      # số dư credit
holding key show         # key id, plan, devices
```

Cài đặt / MCP: [full/SETUP.md](../../full/SETUP.md).
