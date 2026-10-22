FROM mysql:8.4.8
# COPY đặt quyền Linux cố định; bind mount từ Windows có thể thành mode 0777
# và bị MySQL bỏ qua vì world-writable.
COPY --chmod=0644 my.cnf /etc/mysql/conf.d/cinema.cnf
COPY --chmod=0755 00-users.sh /docker-entrypoint-initdb.d/00-users.sh
