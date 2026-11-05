# Ảnh Ma Sói

```
assets/
  roles/            ← ảnh THẺ VAI dùng trong game (đã nén webp, ~10–80 KB/ảnh)
    wolf/             Sói
    villager/         Dân làng
    seer/             Tiên tri
    witch/            Phù thủy
    guard/            Bảo vệ
    wolf_cub/         Sói con
    cupid/            Cupid
    (vai khác: thư mục đặt đúng mã vai trong core/types.ts — hunter, elder, idiot, knight, cursed_wolf, tanner)
  temp/             ← chỗ bỏ ảnh THÔ chờ xếp (git bỏ qua). Xếp xong: nén vào roles/<vai>/ rồi xoá ở đây.
```

- Thêm ảnh: bỏ file `.webp`/`.jpg`/`.png` vào đúng thư mục vai là xong, **không cần sửa code**
  (`client/cards.ts` tự quét bằng `import.meta.glob`). Tên file tuỳ ý.
- Thêm VAI mới: chỉ cần tạo thư mục đúng mã vai (`client/cards.ts` quét mọi thư mục con của `roles/`).
- 1 vai có nhiều ảnh: mỗi người chơi được gán 1 ảnh cố định cả ván (chọn theo mã người chơi),
  mọi máy thấy cùng 1 ảnh cho cùng 1 người.
- Thẻ hiện TRỌN ảnh (không cắt), chỗ trống lót bằng chính ảnh đó làm mờ → ảnh ngang có chữ vẫn đọc được.
- Vai chưa có ảnh: thẻ tự hiện icon lớn làm ảnh tạm.
- Nên nén trước khi bỏ vào: cạnh dài ≤ 800px, webp chất lượng ~80.
