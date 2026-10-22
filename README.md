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

## Cloudflare Tunnel và Access

Tạo named tunnel trong Cloudflare; lưu token vào `.local/secrets/cloudflare_tunnel_token` trên máy. Không đưa file này vào Git. Tạo Access application cho `/admin` và `/admin/*`, cùng toàn bộ ba hostname công cụ, với chính sách Allow theo email được cấp quyền, trước khi bật route công khai.

| Hostname | Service URL trong Tunnel |
| --- | --- |
| rapmay.nvdo.io.vn | http://nginx:8083 |
| grafana-rapmay.nvdo.io.vn | http://grafana:3000 |
| db-rapmay.nvdo.io.vn | http://phpmyadmin:80 |
| prometheus-rapmay.nvdo.io.vn | http://prometheus:9090 |

Chạy `sh scripts/tunnel.sh`. Connector dùng tên service Docker, không dùng localhost. Website công khai; admin/công cụ cần Access, sau đó vẫn dùng đăng nhập riêng của ứng dụng tương ứng. Kiểm tra cửa sổ ẩn danh: website vào được, `/admin` và công cụ yêu cầu xác thực Access. Cloudflare phục vụ HTTPS bên ngoài; Nginx dùng listener nội bộ 8083 và security headers. Không publish cổng listener này trên host. HTTP localhost dùng listener 8080 riêng. Khi bật profile Tunnel, Grafana dùng URL công khai và cookie Secure; dùng HTTPS công khai để đăng nhập Grafana.

## Cấu trúc và bảo mật

`app/`: source, giao diện và tests. `infra/`: Nginx/MySQL/logrotate. `observability/`: metrics, dashboard và log. `scripts/`: chuẩn bị, vận hành, kiểm tra. Các file `compose*.yaml` mô tả dịch vụ.

App và Nginx chạy non-root, filesystem chỉ đọc, bỏ capabilities và bật no-new-privileges. MySQL không publish 3306, dùng mạng database nội bộ; quyền ứng dụng tách migration/quản trị. Biểu mẫu có CSRF, SQL dùng tham số, session lưu MySQL, cookie có HttpOnly/SameSite và Secure qua listener Tunnel. Metrics không công khai qua Nginx. cAdvisor là ngoại lệ privileged để đọc host metrics; init/logrotate có quyền tối thiểu cho thao tác quản lý file.

Mỗi trình duyệt có lịch sử vé riêng; không có tài khoản khách hoặc thanh toán thật. Log không chứa thông tin xác thực. Tất cả cấu hình nhạy cảm và dữ liệu runtime nằm ngoài Git.
