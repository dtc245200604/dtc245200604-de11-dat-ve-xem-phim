import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
export const token = () => crypto.randomBytes(24).toString('hex');
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function equalToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
export async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function passwordMatches(password, saved) {
  const [salt, expected] = (saved || '').split(':');
  if (!salt || !expected || typeof password !== 'string' || password.length > 200) return false;
  const actual = (await scrypt(password, salt, 64)).toString('hex');
  return equalToken(actual, expected);
}
export function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Mã dữ liệu không hợp lệ.');
  return id;
}
export function selectedSeats(value) {
  const seats = Array.isArray(value) ? value : value ? [value] : [];
  if (seats.length < 1 || seats.length > 8 || new Set(seats).size !== seats.length || seats.some(s => !/^[A-F][1-8]$/.test(s))) {
    throw new HttpError(400, 'Vui lòng chọn từ 1 đến 8 ghế hợp lệ, không trùng nhau.');
  }
  return [...seats].sort();
}
export function customerFields(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Họ tên cần có từ 2 đến 100 ký tự.');
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ.');
  return { name, email };
}
export function vietnamDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function parseShowtime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) throw new HttpError(400, 'Ngày giờ suất chiếu không hợp lệ.');
  const date = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, 'Ngày giờ suất chiếu không hợp lệ.');
  const roundtrip = new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16);
  if (roundtrip !== value || date <= new Date()) throw new HttpError(400, 'Suất chiếu phải bắt đầu trong tương lai và có ngày giờ hợp lệ.');
  return date;
}

// Bộ đếm chỉ áp dụng cho thao tác ghi, giới hạn bộ nhớ và không chặn việc xem phim.
export function rateLimit({ windowMs, maximum }) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
  }, 60000).unref();
  return function limit(req, res, next) {
    const now = Date.now();
    const key = req.ip;
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) { bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket); }
    if (buckets.size > 10000) buckets.delete(buckets.keys().next().value);
    bucket.count += 1;
    if (bucket.count > maximum) {
      res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      return next(new HttpError(429, 'Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.'));
    }
    next();
  };
}
