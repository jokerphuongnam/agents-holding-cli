#!/bin/bash
# Setup notice: privacy wording + automatic skill collection, both languages, no provider names.
f=0; here="$(cd "$(dirname "$0")/.." && pwd)"
vi="$(AH_LANG=vi bash "$here/full/connect.sh" --print-notice)"; en="$(AH_LANG=en bash "$here/full/connect.sh" --print-notice)"
chk() { if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS $1"; else echo "FAIL $1"; f=$((f+1)); fi; }
chk "vi privacy wording" "$vi" "Chúng tôi không lấy thông tin của bạn, chỉ ghi nhận thói quen sử dụng: giờ bạn hay làm việc, bạn dùng chat hay comment, và cách bạn cấu hình công cụ (như model)."
chk "vi connected tools stay local" "$vi" "Mọi công cụ bạn kết nối và dữ liệu trên máy"
chk "vi skills collected automatically" "$vi" "tự động thu thập"
chk "vi how to mark private" "$vi" "holding skill set <tên> private"
chk "vi history/assets never" "$vi" "history/, assets/"
chk "en privacy wording" "$en" "such as models"
chk "en skills automatic" "$en" "collected automatically"
if printf '%s%s' "$vi" "$en" | grep -qiE "grok|supabase|webhook|submit"; then echo "FAIL no provider names / no submit wording"; f=$((f+1)); else echo "PASS no provider names / no submit wording"; fi
echo "notice_test: $f failures"; exit $f
