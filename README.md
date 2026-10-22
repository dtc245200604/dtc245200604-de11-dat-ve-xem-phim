# Rạp Mây — Hệ thống đặt vé xem phim

Đề 11, môn Triển khai và Quản trị Hệ thống Phần mềm.

Nguyễn Việt Đô · MSSV dtc245200604 · CNTT K23D.

Express/EJS, MySQL và Nginx chạy bằng Docker Compose trong Ubuntu WSL2. Một phòng 48 ghế, mỗi đơn tối đa 8 ghế, giữ chỗ tối đa 5 phút, thanh toán giả lập. Admin quản lý phim, suất chiếu và theo dõi đơn.

## Khởi động trên WSL

```sh
git clone https://github.com/dtc245200604/dtc245200604-de11-dat-ve-wsl.git
cd dtc245200604-de11-dat-ve-wsl
# Nếu chưa có Docker:
sudo sh scripts/install-docker-wsl.sh
# Mở lại WSL sau khi cấp quyền nhóm docker, rồi:
sh scripts/start.sh
```

Lần đầu script hỏi mật khẩu khởi tạo; cấu hình local được lưu ngoài Git và được giữ khi chạy lại. Cần khoảng 8 GB RAM và ít nhất 12 GB đĩa trống cho môi trường thực hành.

| Thành phần | Local | Tài khoản |
| --- | --- | --- |
| Website | http://localhost:8080 | Khách không cần tài khoản |
| Admin | http://localhost:8080/admin | admin |
| phpMyAdmin | http://localhost:8081 | cinema_admin |

Các mật khẩu do người vận hành nhập khi khởi tạo.

## Kiểm thử và vận hành

```sh
docker compose ps -a
sh scripts/test.sh
sh scripts/backup.sh
sh scripts/stop.sh
```

Khôi phục dữ liệu: `sh scripts/restore.sh .local/backups/ten-file.sql`, cần xác nhận RESTORE. Dừng bình thường giữ volume. `docker compose down --volumes` xóa dữ liệu; không dùng khi chỉ muốn khởi động lại.


## Cấu trúc

`app/`: ứng dụng và tests. `infra/`: Nginx, MySQL, logrotate. `scripts/`: script Linux. Dữ liệu runtime và thông tin xác thực nằm ngoài Git.
