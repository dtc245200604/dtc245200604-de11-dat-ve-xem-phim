import express from 'express';
import session from 'express-session';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, secret } from './config.js';
import { pool, transaction } from './db.js';
import { MysqlSessionStore } from './session-store.js';
import { customerFields, equalToken, HttpError, passwordMatches, positiveId, rateLimit, selectedSeats, token, vietnamDate } from './security.js';
import { movieColumns, showtimeQuery, bookingQuery, getSeatMap, getBooking, createBooking, payBooking, expireAll } from './booking-service.js';
import { movieFields, saveShowtime } from './admin-service.js';
import { httpDuration, httpRequests, register } from './metrics.js';
import { log } from './logger.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(directory, '../views'));
app.set('query parser', 'simple');

app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  req.requestId = crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.on('finish', () => {
    if (['/metrics', '/healthz', '/readyz'].includes(req.path)) return;
    const duration = Number(process.hrtime.bigint() - started) / 1e9;
    const labels = { method: req.method, route: req.route?.path || 'unmatched', status: String(res.statusCode) };
    httpRequests.inc(labels); httpDuration.observe(labels, duration);
    log(res.statusCode >= 500 ? 'error' : 'info', 'request_completed', { requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(duration * 1000) });
  });
  next();
});

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not_ready' }); }
});
app.get('/metrics', async (req, res) => { res.type(register.contentType).send(await register.metrics()); });
app.use(express.static(path.join(directory, '../public'), { maxAge: '1h', dotfiles: 'deny', index: false }));
app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 50 }));
app.use(session({
  name: 'rapmay.sid', secret: secret('SESSION_SECRET'), store: new MysqlSessionStore(),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: 86400000 }
}));

app.use((req, res, next) => {
  req.session.csrf ||= token(); req.session.ownerId ||= token();
  res.locals.csrfToken = req.session.csrf;
  res.locals.admin = req.session.admin || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.siteName = 'Rạp Mây';
  res.locals.formatMoney = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  res.locals.formatDateTime = value => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  res.locals.formatDate = value => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium' }).format(new Date(value));
  if (req.method === 'POST' && !equalToken(req.body?._csrf, req.session.csrf)) return next(new HttpError(403, 'Phiên biểu mẫu hết hạn. Vui lòng tải lại trang rồi thử lại.'));
  res.set('Cache-Control', 'no-store');
  next();
});

const bookingLimit = rateLimit({ windowMs: 60000, maximum: 20 });
const loginLimit = rateLimit({ windowMs: 900000, maximum: 10 });
const adminOnly = (req, res, next) => req.session.admin ? next() : res.redirect('/admin/login');
const flash = (req, message, type = 'success') => { req.session.flash = { type, message }; };
const redirectSaved = (req, res, destination) => new Promise((resolve, reject) => req.session.save(error => { if (error) return reject(error); res.redirect(303, destination); resolve(); }));

app.get('/', async (req, res) => {
  const dates = Array.from({ length: 7 }, (_, index) => vietnamDate(new Date(Date.now() + index * 86400000)));
  const selectedDate = dates.includes(req.query.date) ? req.query.date : dates[0];
  const start = new Date(`${selectedDate}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86400000);
  const [movies] = await pool.query(`SELECT ${movieColumns} FROM movies WHERE is_active=1 ORDER BY id`);
  const [showtimes] = await pool.execute(`${showtimeQuery} WHERE s.status='open' AND m.is_active=1 AND s.starts_at>=? AND s.starts_at<? AND s.starts_at>UTC_TIMESTAMP(3) ORDER BY s.starts_at`, [start, end]);
  res.render('home', { movies, showtimes, selectedDate, dates });
});
app.get('/movies/:id', async (req, res) => {
  const [movies] = await pool.execute(`SELECT ${movieColumns} FROM movies WHERE id=? AND is_active=1`, [positiveId(req.params.id)]);
  if (!movies.length) throw new HttpError(404, 'Không tìm thấy phim.');
  const [showtimes] = await pool.execute(`${showtimeQuery} WHERE s.movie_id=? AND s.status='open' AND s.starts_at>UTC_TIMESTAMP(3) ORDER BY s.starts_at LIMIT 60`, [movies[0].id]);
  res.render('movie', { movie: movies[0], showtimes });
});
app.get('/showtimes/:id/seats', async (req, res) => {
  const state = await getSeatMap(positiveId(req.params.id));
  if (state.showtime.status !== 'open' || state.showtime.startsAt <= state.serverNow) throw new HttpError(409, 'Suất chiếu đã đóng hoặc đã bắt đầu.');
  const idempotencyKey = token();
  req.session.bookingTokens ||= [];
  req.session.bookingTokens = [...req.session.bookingTokens.slice(-19), idempotencyKey];
  res.render('seats', { ...state, holdMinutes: 5, idempotencyKey });
});
app.get('/api/showtimes/:id/seats', async (req, res) => {
  const state = await getSeatMap(positiveId(req.params.id));
  res.json({ seats: state.seats, startsAt: state.showtime.startsAt, serverNow: state.serverNow, status: state.showtime.status });
});
app.post('/bookings', bookingLimit, async (req, res) => {
  const key = req.body.idempotencyKey;
  if (typeof key !== 'string' || !/^[a-f0-9]{48}$/.test(key) || !req.session.bookingTokens?.includes(key)) throw new HttpError(400, 'Vui lòng mở lại trang chọn ghế trước khi đặt vé.');
  const id = await createBooking({ showtimeId: positiveId(req.body.showtimeId), seats: selectedSeats(req.body.seats), ownerId: req.session.ownerId, idempotencyKey: key, ...customerFields(req.body) });
  await redirectSaved(req, res, `/bookings/${id}`);
});
app.get('/bookings/:id', async (req, res) => {
  const data = await getBooking(positiveId(req.params.id), req.session.ownerId);
  res.render('booking', data);
});
app.post('/bookings/:id/pay', bookingLimit, async (req, res) => {
  if (!['success', 'fail'].includes(req.body.outcome)) throw new HttpError(400, 'Kết quả thanh toán giả lập không hợp lệ.');
  const id = positiveId(req.params.id);
  const status = await payBooking(id, req.session.ownerId, req.body.outcome);
  if (status === 'expired') flash(req, 'Đã hết thời gian giữ ghế. Vui lòng chọn lại suất chiếu.', 'error');
  else if (status === 'failed') flash(req, 'Thanh toán giả lập không thành công. Ghế đã được giải phóng.', 'error');
  await redirectSaved(req, res, status === 'paid' ? `/bookings/${id}/ticket` : `/bookings/${id}`);
});
app.get('/bookings/:id/ticket', async (req, res) => {
  const data = await getBooking(positiveId(req.params.id), req.session.ownerId);
  if (data.booking.status !== 'paid') throw new HttpError(409, 'Vé chỉ được phát hành sau khi thanh toán thành công.');
  res.render('ticket', data);
});
app.get('/history', async (req, res) => {
  await expireAll();
  const [bookings] = await pool.execute(`${bookingQuery} WHERE b.owner_id=? ORDER BY b.id DESC LIMIT 100`, [req.session.ownerId]);
  res.render('history', { bookings });
});

app.get('/admin/login', (req, res) => req.session.admin ? res.redirect('/admin') : res.render('admin/login'));
app.post('/admin/login', loginLimit, async (req, res) => {
  const [rows] = await pool.execute('SELECT id,username,password_hash AS passwordHash FROM admins WHERE username=?', [String(req.body.username || '').slice(0, 60)]);
  if (!rows.length || !await passwordMatches(req.body.password, rows[0].passwordHash)) throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
  const ownerId = req.session.ownerId;
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.ownerId = ownerId;
  req.session.admin = { id: rows[0].id, username: rows[0].username };
  log('info', 'admin_login');
  await redirectSaved(req, res, '/admin');
});
app.post('/admin/logout', adminOnly, async (req, res) => {
  const ownerId = req.session.ownerId;
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.ownerId = ownerId;
  await redirectSaved(req, res, '/');
});
app.get('/admin', adminOnly, async (req, res) => {
  await expireAll();
  const [movies] = await pool.query(`SELECT ${movieColumns} FROM movies ORDER BY id`);
  const [showtimes] = await pool.query(`${showtimeQuery} ORDER BY s.starts_at DESC LIMIT 100`);
  const [bookings] = await pool.query(`${bookingQuery} ORDER BY b.id DESC LIMIT 100`);
  res.render('admin/dashboard', { movies, showtimes, bookings });
});
app.get('/admin/movies/new', adminOnly, (req, res) => res.render('admin/movie-form', { movie: null }));
app.get('/admin/movies/:id/edit', adminOnly, async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${movieColumns} FROM movies WHERE id=?`, [positiveId(req.params.id)]);
  if (!rows.length) throw new HttpError(404, 'Không tìm thấy phim.');
  res.render('admin/movie-form', { movie: rows[0] });
});
app.post('/admin/movies', adminOnly, async (req, res) => {
  await pool.execute('INSERT INTO movies(title,description,duration_minutes,genre,poster_key) VALUES(?,?,?,?,?)', movieFields(req.body));
  flash(req, 'Đã thêm phim.'); await redirectSaved(req, res, '/admin');
});
app.post('/admin/movies/:id', adminOnly, async (req, res) => {
  const id = positiveId(req.params.id); const fields = movieFields(req.body);
  await transaction(async db => {
    await db.execute('SELECT id FROM rooms WHERE id=1 FOR UPDATE');
    const [rows] = await db.execute('SELECT duration_minutes FROM movies WHERE id=? FOR UPDATE', [id]);
    if (!rows.length) throw new HttpError(404, 'Không tìm thấy phim.');
    const [scheduled] = await db.execute('SELECT id FROM showtimes WHERE movie_id=? LIMIT 1', [id]);
    if (scheduled.length && rows[0].duration_minutes !== fields[2]) throw new HttpError(409, 'Phim đã có lịch chiếu nên không thể đổi thời lượng.');
    await db.execute('UPDATE movies SET title=?,description=?,duration_minutes=?,genre=?,poster_key=? WHERE id=?', [...fields, id]);
  });
  flash(req, 'Đã cập nhật phim.'); await redirectSaved(req, res, '/admin');
});
app.post('/admin/movies/:id/archive', adminOnly, async (req, res) => {
  const id = positiveId(req.params.id);
  await transaction(async db => {
    await db.execute('SELECT id FROM rooms WHERE id=1 FOR UPDATE');
    const [open] = await db.execute("SELECT id FROM showtimes WHERE movie_id=? AND status='open' AND starts_at>UTC_TIMESTAMP(3) LIMIT 1", [id]);
    if (open.length) throw new HttpError(409, 'Đóng các suất chiếu sắp tới trước khi ngừng hiển thị phim.');
    const [result] = await db.execute('UPDATE movies SET is_active=0 WHERE id=?', [id]);
    if (!result.affectedRows) throw new HttpError(404, 'Không tìm thấy phim.');
  });
  flash(req, 'Đã ngừng hiển thị phim.'); await redirectSaved(req, res, '/admin');
});
app.get('/admin/showtimes/new', adminOnly, async (req, res) => {
  const [movies] = await pool.query(`SELECT ${movieColumns} FROM movies WHERE is_active=1 ORDER BY title`);
  res.render('admin/showtime-form', { showtime: null, movies });
});
app.get('/admin/showtimes/:id/edit', adminOnly, async (req, res) => {
  const [rows] = await pool.execute(`${showtimeQuery} WHERE s.id=?`, [positiveId(req.params.id)]);
  if (!rows.length) throw new HttpError(404, 'Không tìm thấy suất chiếu.');
  const [movies] = await pool.query(`SELECT ${movieColumns} FROM movies WHERE is_active=1 ORDER BY title`);
  res.render('admin/showtime-form', { showtime: rows[0], movies });
});
app.post('/admin/showtimes', adminOnly, async (req, res) => {
  await saveShowtime(null, req.body); flash(req, 'Đã thêm suất chiếu.'); await redirectSaved(req, res, '/admin');
});
app.post('/admin/showtimes/:id', adminOnly, async (req, res) => {
  await saveShowtime(positiveId(req.params.id), req.body); flash(req, 'Đã cập nhật suất chiếu.'); await redirectSaved(req, res, '/admin');
});
app.post('/admin/showtimes/:id/close', adminOnly, async (req, res) => {
  await transaction(async db => {
    const [rows] = await db.execute('SELECT id FROM showtimes WHERE id=? FOR UPDATE', [positiveId(req.params.id)]);
    if (!rows.length) throw new HttpError(404, 'Không tìm thấy suất chiếu.');
    await db.execute("UPDATE showtimes SET status='closed' WHERE id=?", [rows[0].id]);
  });
  flash(req, 'Đã đóng bán vé mới cho suất chiếu. Vé đã thanh toán vẫn được giữ.'); await redirectSaved(req, res, '/admin');
});

app.use((req, res, next) => next(new HttpError(404, 'Trang bạn tìm không tồn tại.')));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status >= 500) log('error', 'request_error', { requestId: req.requestId, code: error.code || error.name });
  const message = status >= 500 ? 'Hệ thống đang bận. Vui lòng thử lại sau.' : error.message;
  res.status(status);
  if (req.path.startsWith('/api/')) return res.json({ error: message });
  res.locals.admin ??= null; res.locals.flash ??= null; res.locals.csrfToken ??= ''; res.locals.siteName ??= 'Rạp Mây';
  res.render('error', { status, message });
});

export { app };
