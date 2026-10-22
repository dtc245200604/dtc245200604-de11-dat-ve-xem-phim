import { transaction } from './db.js';
import { HttpError, parseShowtime, positiveId } from './security.js';

export function movieFields(body) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const genre = String(body.genre || '').trim();
  const duration = Number(body.durationMinutes);
  const poster = String(body.posterKey || 'dawn');
  if (title.length < 2 || title.length > 160 || description.length < 10 || description.length > 4000 || genre.length < 2 || genre.length > 80 || !Number.isInteger(duration) || duration < 30 || duration > 240 || !['dawn', 'orbit', 'river', 'echo'].includes(poster)) {
    throw new HttpError(400, 'Kiểm tra tên phim, mô tả, thể loại, thời lượng (30–240 phút) và poster.');
  }
  return [title, description, duration, genre, poster];
}

export async function saveShowtime(id, body) {
  const movieId = positiveId(body.movieId);
  const startsAt = parseShowtime(body.startsAt);
  const price = Number(body.price);
  if (!Number.isInteger(price) || price < 10000 || price > 1000000) throw new HttpError(400, 'Giá vé phải từ 10.000 đến 1.000.000 đồng.');
  return transaction(async db => {
    await db.execute('SELECT id FROM rooms WHERE id=1 FOR UPDATE');
    const [movies] = await db.execute('SELECT duration_minutes FROM movies WHERE id=? AND is_active=1', [movieId]);
    if (!movies.length) throw new HttpError(400, 'Phim không còn mở bán.');
    if (id) {
      const [existing] = await db.execute('SELECT id FROM showtimes WHERE id=? FOR UPDATE', [id]);
      if (!existing.length) throw new HttpError(404, 'Không tìm thấy suất chiếu.');
      const [bookings] = await db.execute('SELECT id FROM bookings WHERE showtime_id=? LIMIT 1', [id]);
      if (bookings.length) throw new HttpError(409, 'Suất chiếu đã có đơn đặt vé nên không thể đổi lịch hoặc giá.');
    }
    const endsAt = new Date(startsAt.getTime() + (movies[0].duration_minutes + 20) * 60000);
    const [overlap] = await db.execute('SELECT id FROM showtimes WHERE room_id=1 AND id<>? AND starts_at<? AND ends_at>? LIMIT 1', [id || 0, endsAt, startsAt]);
    if (overlap.length) throw new HttpError(409, 'Lịch chiếu trùng với một suất khác, tính cả 20 phút dọn phòng.');
    if (id) {
      await db.execute('UPDATE showtimes SET movie_id=?,starts_at=?,ends_at=?,price=? WHERE id=?', [movieId, startsAt, endsAt, price, id]);
      return id;
    }
    const [result] = await db.execute('INSERT INTO showtimes(movie_id,room_id,starts_at,ends_at,price) VALUES(?,1,?,?,?)', [movieId, startsAt, endsAt, price]);
    for (const row of 'ABCDEF') for (let col = 1; col <= 8; col += 1) await db.execute('INSERT INTO showtime_seats(showtime_id,seat_code) VALUES(?,?)', [result.insertId, `${row}${col}`]);
    return result.insertId;
  });
}
