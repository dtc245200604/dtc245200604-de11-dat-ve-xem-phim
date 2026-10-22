proxy_pass http://cinema_app;
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Request-ID $request_id;
proxy_connect_timeout 5s;
proxy_read_timeout 30s;
