import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { secret } from '../src/config.js';

const base = process.env.BASE_URL || 'http://localhost:8080';
class Browser {
  cookie = '';
  csrf = '';
  async request(path, data) {
    const headers = this.cookie ? { Cookie: this.cookie } : {};
    const options = { headers, redirect: 'manual' };
    if (data) {
      options.method = 'POST'; headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(data)) for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
      options.body = form;
    }
    const response = await fetch(`${base}${path}`, options);
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith('rapmay.sid=')) this.cookie = cookie.split(';')[0];
    const body = await response.text();
    const csrf = body.match(/name="_csrf"[^>]*value="([^"]+)"/);
    if (csrf) this.csrf = csrf[1];
    return { status: response.status, body, location: response.headers.get('location'), headers: response.headers };
  }
  async select(showtimeId) {
    const page = await this.request(`/showtimes/${showtimeId}/seats`);
    assert.equal(page.status, 200, page.body.slice(0, 300));
    const token = page.body.match(/name="idempotencyKey"[^>]*value="([^"]+)"/);
    assert.ok(token, 'Trang chọn ghế có khóa idempotency');
    return token[1];
  }
  async book(showtimeId, seats, key) {
    return this.request('/bookings', { _csrf: this.csrf, showtimeId, seats, idempotencyKey: key, name: 'Khách kiểm thử', email: 'kiemthu@example.test' });
  }
  async pay(id, outcome) { return this.request(`/bookings/${id}/pay`, { _csrf: this.csrf, outcome }); }
}
const bookingId = response => Number(response.location?.match(/^\/bookings\/(\d+)/)?.[1]);
let movieId; let showtimeId; let adminMovieId; let adminShowtimeId;

test('Kiểm thử toàn luồng qua Nginx và MySQL', { timeout: 90000 }, async t => {
  try {
    const [movie] = await pool.execute("INSERT INTO movies(title,description,duration_minutes,genre,poster_key) VALUES('Phim kiểm thử tự động','Dữ liệu tạm được dọn sau bộ kiểm thử.',100,'Kiểm thử','dawn')");
    movieId = movie.insertId;
    const [showtime] = await pool.execute('INSERT INTO showtimes(movie_id,room_id,starts_at,ends_at,price) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 31 DAY),75000)', [movieId]);
    showtimeId = showtime.insertId;
    for (const row of 'ABCDEF') for (let col = 1; col <= 8; col += 1) await pool.execute('INSERT INTO showtime_seats(showtime_id,seat_code) VALUES(?,?)', [showtimeId, `${row}${col}`]);
    const a = new Browser(); const b = new Browser();
    let paidId;

    await t.test('Trang chủ qua Nginx có header bảo mật; metrics không công khai', async () => {
      const response = await a.request('/');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('content-security-policy'));
      const metrics = await a.request('/metrics'); assert.ok([403, 404].includes(metrics.status));
    });

    await t.test('Hai khách tranh cùng ghế chỉ có một đơn; request lặp trả cùng đơn', async () => {
      const keyA = await a.select(showtimeId); const keyB = await b.select(showtimeId);
      const results = await Promise.all([a.book(showtimeId, ['A1'], keyA), b.book(showtimeId, ['A1'], keyB)]);
      assert.deepEqual(results.map(r => r.status).sort(), [303, 409]);
      const winner = results[0].status === 303 ? a : b;
      const loser = winner === a ? b : a;
      const key = winner === a ? keyA : keyB;
      paidId = bookingId(results.find(r => r.status === 303));
      const replay = await winner.book(showtimeId, ['A1'], key);
      assert.equal(bookingId(replay), paidId);
      const changed = await winner.book(showtimeId, ['A2'], key); assert.equal(changed.status, 409);
      assert.equal((await loser.request(`/bookings/${paidId}`)).status, 404);
      assert.equal((await loser.pay(paidId, 'success')).status, 404);
      const success = await winner.pay(paidId, 'success'); assert.equal(success.location, `/bookings/${paidId}/ticket`);
      const repeated = await winner.pay(paidId, 'fail'); assert.equal(repeated.location, `/bookings/${paidId}/ticket`);
      const ticket = await winner.request(`/bookings/${paidId}/ticket`); assert.equal(ticket.status, 200);
      const [[count]] = await pool.execute("SELECT COUNT(*) AS total FROM bookings WHERE showtime_id=? AND status='paid'", [showtimeId]); assert.equal(count.total, 1);
    });

    await t.test('Đặt nhiều ghế không thành công một phần; giá lấy ở server', async () => {
      const key = await a.select(showtimeId);
      const conflict = await a.book(showtimeId, ['A1', 'A2'], key); assert.equal(conflict.status, 409);
      const [[seat]] = await pool.execute("SELECT booking_id FROM showtime_seats WHERE showtime_id=? AND seat_code='A2'", [showtimeId]); assert.equal(seat.booking_id, null);
      const response = await a.request('/bookings', { _csrf: a.csrf, showtimeId, seats: ['B1', 'B2'], idempotencyKey: key, name: 'Khách kiểm thử', email: 'kiemthu@example.test', total: 1, price: 1 });
      assert.equal(response.status, 303);
      const id = bookingId(response);
      const [[booking]] = await pool.execute('SELECT total FROM bookings WHERE id=?', [id]); assert.equal(booking.total, 150000);
      await a.pay(id, 'fail');
      const [[released]] = await pool.execute('SELECT COUNT(*) AS total FROM showtime_seats WHERE booking_id=?', [id]); assert.equal(released.total, 0);
    });

    await t.test('Hết hạn trả ghế và không cho thanh toán booking cũ', async () => {
      const key = await a.select(showtimeId); const response = await a.book(showtimeId, ['C1'], key); assert.equal(response.status, 303);
      const id = bookingId(response);
      await pool.execute('UPDATE bookings SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?', [id]);
      const keyB = await b.select(showtimeId); const newResponse = await b.book(showtimeId, ['C1'], keyB); assert.equal(newResponse.status, 303);
      await a.pay(id, 'success');
      const [[expired]] = await pool.execute('SELECT status FROM bookings WHERE id=?', [id]); assert.equal(expired.status, 'expired');
      await b.pay(bookingId(newResponse), 'fail');
    });

    await t.test('CSRF và truy cập quản trị được bảo vệ', async () => {
      const bad = await a.request('/bookings', { _csrf: 'sai', showtimeId, seats: 'D1' }); assert.equal(bad.status, 403);
      assert.equal((await a.request('/admin')).location, '/admin/login');
      const admin = new Browser(); await admin.request('/admin/login');
      const login = await admin.request('/admin/login', { _csrf: admin.csrf, username: 'admin', password: secret('ADMIN_PASSWORD') });
      assert.equal(login.status, 303); assert.equal(login.location, '/admin');
      const dashboard = await admin.request('/admin'); assert.equal(dashboard.status, 200);
      const start = new Date(Date.now() + 30 * 86400000 + 7 * 3600000).toISOString().slice(0, 16);
      const overlap = await admin.request('/admin/showtimes', { _csrf: admin.csrf, movieId, startsAt: start, price: 75000 }); assert.equal(overlap.status, 409);
      const edit = await admin.request(`/admin/showtimes/${showtimeId}`, { _csrf: admin.csrf, movieId, startsAt: start, price: 85000 }); assert.equal(edit.status, 409);
    });

    await t.test('Quản trị thêm sửa phim và suất chiếu, đóng lịch rồi ẩn phim', async () => {
      const admin = new Browser(); await admin.request('/admin/login');
      await admin.request('/admin/login', { _csrf: admin.csrf, username: 'admin', password: secret('ADMIN_PASSWORD') });
      await admin.request('/admin');
      const title = `Phim kiểm thử quản trị ${Date.now()}`;
      const fields = { title, description: 'Mô tả phim phục vụ kiểm thử quản trị tự động.', durationMinutes: 105, genre: 'Kiểm thử', posterKey: 'river' };
      assert.equal((await admin.request('/admin/movies', { _csrf: admin.csrf, ...fields })).status, 303);
      const [[movie]] = await pool.execute('SELECT id FROM movies WHERE title=?', [title]); adminMovieId = movie.id;
      assert.equal((await admin.request(`/admin/movies/${adminMovieId}`, { _csrf: admin.csrf, ...fields, title: `${title} đã sửa`, durationMinutes: 110 })).status, 303);
      const startsAt = new Date(Date.now() + 40 * 86400000 + 7 * 3600000).toISOString().slice(0, 16);
      const schedule = { _csrf: admin.csrf, movieId: adminMovieId, startsAt, price: 85000 };
      assert.equal((await admin.request('/admin/showtimes', schedule)).status, 303);
      const [[slot]] = await pool.execute('SELECT id FROM showtimes WHERE movie_id=?', [adminMovieId]); adminShowtimeId = slot.id;
      assert.equal((await admin.request(`/admin/showtimes/${adminShowtimeId}`, { ...schedule, price: 90000 })).status, 303);
      const [[seatCount]] = await pool.execute('SELECT COUNT(*) AS total FROM showtime_seats WHERE showtime_id=?', [adminShowtimeId]); assert.equal(seatCount.total, 48);
      assert.equal((await admin.request(`/admin/showtimes/${adminShowtimeId}/close`, { _csrf: admin.csrf })).status, 303);
      assert.equal((await admin.request(`/showtimes/${adminShowtimeId}/seats`)).status, 409);
      assert.equal((await admin.request(`/admin/movies/${adminMovieId}/archive`, { _csrf: admin.csrf })).status, 303);
      const [[archived]] = await pool.execute('SELECT is_active FROM movies WHERE id=?', [adminMovieId]); assert.equal(archived.is_active, 0);
      assert.equal((await admin.request('/admin/logout', { _csrf: admin.csrf })).status, 303);
      assert.equal((await admin.request('/admin')).location, '/admin/login');
    });

    await t.test('Suất chiếu bắt đầu làm hết hạn giữ ghế và từ chối thanh toán muộn', async () => {
      const key = await a.select(showtimeId);
      const response = await a.book(showtimeId, ['E1'], key); assert.equal(response.status, 303);
      const id = bookingId(response);
      await pool.execute('UPDATE showtimes SET starts_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?', [showtimeId]);
      await a.pay(id, 'success');
      const [[booking]] = await pool.execute('SELECT status FROM bookings WHERE id=?', [id]); assert.equal(booking.status, 'expired');
      const [[seat]] = await pool.execute("SELECT booking_id FROM showtime_seats WHERE showtime_id=? AND seat_code='E1'", [showtimeId]); assert.equal(seat.booking_id, null);
      assert.equal((await a.request(`/showtimes/${showtimeId}/seats`)).status, 409);
    });
  } finally {
    if (adminShowtimeId) {
      await pool.execute('DELETE FROM showtime_seats WHERE showtime_id=?', [adminShowtimeId]);
      await pool.execute('DELETE FROM showtimes WHERE id=?', [adminShowtimeId]);
    }
    if (adminMovieId) await pool.execute('DELETE FROM movies WHERE id=?', [adminMovieId]);
    if (showtimeId) {
      await pool.execute('UPDATE showtime_seats SET booking_id=NULL WHERE showtime_id=?', [showtimeId]);
      await pool.execute('DELETE bi FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id WHERE b.showtime_id=?', [showtimeId]);
      await pool.execute('DELETE FROM bookings WHERE showtime_id=?', [showtimeId]);
      await pool.execute('DELETE FROM showtime_seats WHERE showtime_id=?', [showtimeId]);
      await pool.execute('DELETE FROM showtimes WHERE id=?', [showtimeId]);
    }
    if (movieId) await pool.execute('DELETE FROM movies WHERE id=?', [movieId]);
    await pool.end();
  }
});
