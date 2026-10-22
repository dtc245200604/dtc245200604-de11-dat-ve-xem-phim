import crypto from 'node:crypto';
import { pool, transaction } from './db.js';
import { HttpError } from './security.js';
import { bookingCount, paymentCount } from './metrics.js';
import { log } from './logger.js';

export const movieColumns = 'id,title,description,duration_minutes AS durationMinutes,genre,poster_key AS posterKey,is_active AS isActive';
export const showtimeQuery = `SELECT s.id,s.movie_id AS movieId,s.starts_at AS startsAt,s.ends_at AS endsAt,s.price,s.status,m.title,m.description,m.genre,m.poster_key AS posterKey,m.duration_minutes AS durationMinutes,r.name AS roomName FROM showtimes s JOIN movies m ON m.id=s.movie_id JOIN rooms r ON r.id=s.room_id`;
export const bookingQuery = `SELECT b.id,b.code,b.owner_id AS ownerId,b.status,b.total,b.expires_at AS expiresAt,b.customer_name AS name,b.customer_email AS email,b.created_at AS createdAt,b.showtime_id AS showtimeId,s.starts_at AS startsAt,m.title,m.poster_key AS posterKey,r.name AS roomName FROM bookings b JOIN showtimes s ON s.id=b.showtime_id JOIN movies m ON m.id=s.movie_id JOIN rooms r ON r.id=s.room_id`;

async function lockShowtime(db, showtimeId) {
  const [rows] = await db.execute('SELECT id,status,starts_at AS startsAt,price FROM showtimes WHERE id=? FOR UPDATE', [showtimeId]);
  if (!rows.length) throw new HttpError(404, 'Không tìm thấy suất chiếu.');
  // Đọc giờ sau khi lấy được khóa, tránh dùng mốc thời gian trước thời gian chờ khóa.
  const [[clock]] = await db.query('SELECT UTC_TIMESTAMP(3) AS now');
  return { ...rows[0], now: clock.now };
}

async function expireLocked(db, showtimeId) {
  const [rows] = await db.execute("SELECT b.id FROM bookings b JOIN showtimes s ON s.id=b.showtime_id WHERE b.showtime_id=? AND b.status='pending' AND (b.expires_at<=UTC_TIMESTAMP(3) OR s.starts_at<=UTC_TIMESTAMP(3))", [showtimeId]);
  if (!rows.length) return 0;
  // Dùng cùng tập ID cho cả hai UPDATE: đồng hồ tiến qua hạn giữa các câu SQL
  // không thể tạo đơn expired nhưng vẫn chiếm ghế trong showtime_seats.
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`UPDATE showtime_seats SET booking_id=NULL WHERE showtime_id=? AND booking_id IN (${placeholders})`, [showtimeId, ...ids]);
  await db.execute(`UPDATE bookings SET status='expired' WHERE id IN (${placeholders})`, ids);
  return rows.length;
}

function recordExpiry(count, showtimeId) {
  if (!count) return;
  bookingCount.inc({ outcome: 'expired' }, count);
  log('info', 'booking_expired', { showtimeId, count });
}

export async function expireShowtime(showtimeId) {
  const count = await transaction(async db => { await lockShowtime(db, showtimeId); return expireLocked(db, showtimeId); });
  recordExpiry(count, showtimeId);
}

export async function expireAll() {
  const [rows] = await pool.query("SELECT DISTINCT b.showtime_id AS id FROM bookings b JOIN showtimes s ON s.id=b.showtime_id WHERE b.status='pending' AND (b.expires_at<=UTC_TIMESTAMP(3) OR s.starts_at<=UTC_TIMESTAMP(3)) LIMIT 200");
  for (const row of rows) await expireShowtime(row.id);
  await pool.query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3) LIMIT 1000');
}

export async function getSeatMap(showtimeId) {
  await expireShowtime(showtimeId);
  const [showtimes] = await pool.execute(`${showtimeQuery} WHERE s.id=?`, [showtimeId]);
  const [seats] = await pool.execute("SELECT ss.seat_code AS code,CASE WHEN b.status='paid' THEN 'sold' WHEN b.status='pending' AND b.expires_at>UTC_TIMESTAMP(3) THEN 'held' ELSE 'available' END AS status FROM showtime_seats ss LEFT JOIN bookings b ON b.id=ss.booking_id WHERE ss.showtime_id=? ORDER BY ss.seat_code", [showtimeId]);
  const [[clock]] = await pool.query('SELECT UTC_TIMESTAMP(3) AS now');
  return { showtime: showtimes[0], seats, serverNow: clock.now };
}

export async function createBooking({ showtimeId, seats, ownerId, idempotencyKey, name, email }) {
  const hash = crypto.createHash('sha256').update(JSON.stringify({ showtimeId, seats, name, email })).digest('hex');
  const result = await transaction(async db => {
    const showtime = await lockShowtime(db, showtimeId);
    const [existing] = await db.execute('SELECT id,request_hash AS requestHash FROM bookings WHERE owner_id=? AND idempotency_key=?', [ownerId, idempotencyKey]);
    if (existing.length) {
      if (existing[0].requestHash !== hash) throw new HttpError(409, 'Yêu cầu đã thay đổi. Vui lòng tải lại trang chọn ghế.');
      return { id: existing[0].id, repeated: true, expired: 0 };
    }
    const expired = await expireLocked(db, showtimeId);
    if (showtime.status !== 'open' || showtime.startsAt <= showtime.now) throw new HttpError(409, 'Suất chiếu đã đóng hoặc đã bắt đầu.');
    const placeholders = seats.map(() => '?').join(',');
    const [available] = await db.execute(`SELECT seat_code FROM showtime_seats WHERE showtime_id=? AND seat_code IN (${placeholders}) AND booking_id IS NULL`, [showtimeId, ...seats]);
    if (available.length !== seats.length) throw new HttpError(409, 'Một ghế vừa được người khác chọn. Vui lòng quay lại sơ đồ ghế.');
    const code = crypto.randomBytes(10).toString('hex').toUpperCase();
    const [insert] = await db.execute("INSERT INTO bookings(code,owner_id,idempotency_key,request_hash,showtime_id,expires_at,total,customer_name,customer_email) SELECT ?,?,?,?,id,LEAST(DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE),starts_at),price*?,?,? FROM showtimes WHERE id=? AND status='open' AND starts_at>UTC_TIMESTAMP(3)", [code, ownerId, idempotencyKey, hash, seats.length, name, email, showtimeId]);
    if (!insert.affectedRows) throw new HttpError(409, 'Suất chiếu đã đóng hoặc đã bắt đầu.');
    for (const seat of seats) await db.execute('INSERT INTO booking_items(booking_id,seat_code,unit_price) VALUES(?,?,?)', [insert.insertId, seat, showtime.price]);
    await db.execute(`UPDATE showtime_seats SET booking_id=? WHERE showtime_id=? AND seat_code IN (${placeholders})`, [insert.insertId, showtimeId, ...seats]);
    return { id: insert.insertId, repeated: false, expired };
  }).catch(error => {
    if (error.code === 'ER_DUP_ENTRY') error = new HttpError(409, 'Yêu cầu đặt vé đã được sử dụng. Vui lòng tải lại trang.');
    if (error.status === 409) bookingCount.inc({ outcome: 'conflict' });
    throw error;
  });
  recordExpiry(result.expired, showtimeId);
  if (!result.repeated) {
    bookingCount.inc({ outcome: 'created' });
    log('info', 'booking_created', { bookingId: result.id, showtimeId, seatsCount: seats.length });
  }
  return result.id;
}

export async function getBooking(id, ownerId, allowAdmin = false) {
  const [found] = await pool.execute(`${bookingQuery} WHERE b.id=?${allowAdmin ? '' : ' AND b.owner_id=?'}`, allowAdmin ? [id] : [id, ownerId]);
  if (!found.length) throw new HttpError(404, 'Không tìm thấy đơn đặt vé của bạn.');
  await expireShowtime(found[0].showtimeId);
  const [rows] = await pool.execute(`${bookingQuery} WHERE b.id=?`, [id]);
  const [items] = await pool.execute('SELECT seat_code AS seatCode,unit_price AS unitPrice FROM booking_items WHERE booking_id=? ORDER BY seat_code', [id]);
  const [[clock]] = await pool.query('SELECT UTC_TIMESTAMP(3) AS now');
  return { booking: rows[0], items, remainingSeconds: Math.max(0, Math.floor((rows[0].expiresAt - clock.now) / 1000)) };
}

export async function payBooking(id, ownerId, outcome) {
  const [found] = await pool.execute('SELECT showtime_id AS showtimeId FROM bookings WHERE id=? AND owner_id=?', [id, ownerId]);
  if (!found.length) throw new HttpError(404, 'Không tìm thấy đơn đặt vé của bạn.');
  const showtimeId = found[0].showtimeId;
  const result = await transaction(async db => {
    await lockShowtime(db, showtimeId);
    const expired = await expireLocked(db, showtimeId);
    const [[booking]] = await db.execute('SELECT status FROM bookings WHERE id=? AND owner_id=?', [id, ownerId]);
    if (booking.status !== 'pending') return { status: booking.status, changed: false, expired };
    if (outcome === 'success') {
      const [payment] = await db.execute("UPDATE bookings b JOIN showtimes s ON s.id=b.showtime_id SET b.status='paid',b.paid_at=UTC_TIMESTAMP(3) WHERE b.id=? AND b.status='pending' AND b.expires_at>UTC_TIMESTAMP(3) AND s.starts_at>UTC_TIMESTAMP(3)", [id]);
      if (!payment.affectedRows) {
        const newlyExpired = await expireLocked(db, showtimeId);
        return { status: 'expired', changed: false, expired: expired + newlyExpired };
      }
      return { status: 'paid', changed: true, expired };
    }
    await db.execute("UPDATE bookings SET status='failed' WHERE id=?", [id]);
    await db.execute('UPDATE showtime_seats SET booking_id=NULL WHERE booking_id=?', [id]);
    return { status: 'failed', changed: true, expired };
  });
  recordExpiry(result.expired, showtimeId);
  if (result.changed) {
    const state = result.status === 'paid' ? 'success' : 'failed';
    paymentCount.inc({ outcome: state });
    log('info', `payment_${state}`, { bookingId: id, showtimeId });
  }
  return result.status;
}
