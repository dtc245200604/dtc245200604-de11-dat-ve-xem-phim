import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'cinema_' });
export const httpRequests = new client.Counter({ name: 'cinema_http_requests_total', help: 'Số HTTP request', labelNames: ['method', 'route', 'status'], registers: [register] });
export const httpDuration = new client.Histogram({ name: 'cinema_http_request_duration_seconds', help: 'Thời gian HTTP request', labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10], registers: [register] });
export const bookingCount = new client.Counter({ name: 'cinema_bookings_total', help: 'Kết quả giữ ghế', labelNames: ['outcome'], registers: [register] });
export const paymentCount = new client.Counter({ name: 'cinema_payments_total', help: 'Kết quả thanh toán giả lập', labelNames: ['outcome'], registers: [register] });
