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
| Grafana | http://localhost:3001 | admin |
| Prometheus | http://localhost:9090 | Local |

Các mật khẩu do người vận hành nhập khi khởi tạo. Website công khai tại https://rapmay.nvdo.io.vn khi Tunnel đã kết nối.

## Kiểm thử và vận hành

```sh
docker compose ps -a
sh scripts/test.sh
sh scripts/verify.sh
sh scripts/backup.sh
sh scripts/stop.sh
```

Khôi phục dữ liệu: `sh scripts/restore.sh .local/backups/ten-file.sql`, cần xác nhận RESTORE. Dừng bình thường giữ volume. `docker compose down --volumes` xóa dữ liệu; không dùng khi chỉ muốn khởi động lại.

## Giám sát và log

Prometheus có 5 job: prometheus, app, nginx, mysql, cadvisor. Grafana tự nạp datasource và dashboard **Đề 11 | Tổng quan vận hành**. Đợi ít nhất hai chu kỳ scrape để biểu đồ CPU có mẫu. Script verify kiểm tra target, exporter và dữ liệu container thật.

Trong Grafana Explore chọn Loki, tạo một đơn đặt vé, một thanh toán thất bại và truy cập đường dẫn không tồn tại trước khi chạy:

```logql
{project="de11datvewsl",service="app"} | json | event="booking_created"

{project="de11datvewsl",service="nginx",stream="access"} | json | status >= 400

sum(count_over_time({project="de11datvewsl",service="app"} | json | event="payment_failed" [5m]))
```

`sh scripts/verify.sh --logs` xác minh cả ba truy vấn. Promtail đọc volume log chỉ đọc và lưu positions; Loki giữ log 7 ngày. Promtail được sử dụng theo công cụ yêu cầu của đề thực hành.


## Cấu trúc

`app/`: ứng dụng và tests. `infra/`: Nginx, MySQL, logrotate. `scripts/`: script Linux. Dữ liệu runtime và thông tin xác thực nằm ngoài Git.
