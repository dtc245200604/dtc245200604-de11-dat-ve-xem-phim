import fs from 'node:fs/promises';
import { pool, transaction } from './db.js';
import { secret } from './config.js';
import { passwordHash, vietnamDate } from './security.js';

const films = [
  ['Bên Kia Bình Minh', 'Một nhiếp ảnh gia trở về thị trấn ven biển, tìm lại những bức thư cũ và lời hẹn chưa thành. Bộ phim hư cấu dành riêng cho hệ thống thực hành.', 110, 'Tâm lý', 'dawn'],
  ['Quỹ Đạo Lạ', 'Phi hành đoàn của trạm nghiên cứu nhận được tín hiệu từ một hành tinh chưa có trên bản đồ. Bộ phim hư cấu dành riêng cho hệ thống thực hành.', 120, 'Khoa học viễn tưởng', 'orbit'],
  ['Mùa Nước Trong', 'Ba thế hệ cùng sửa lại căn nhà bên sông, học cách lắng nghe nhau qua một mùa hè nhiều thay đổi. Bộ phim hư cấu dành riêng cho hệ thống thực hành.', 100, 'Gia đình', 'river'],
  ['Tiếng Vọng Cuối Hẻm', 'Một người thợ sửa radio lần theo bản nhạc vang lên mỗi đêm và bí mật của khu phố cũ. Bộ phim hư cấu dành riêng cho hệ thống thực hành.', 115, 'Bí ẩn', 'echo']
];

try {
  const sql = await fs.readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
  await transaction(async db => {
    await db.execute("INSERT IGNORE INTO rooms(id,name) VALUES(1,'Phòng 01')");
    await db.execute('SELECT id FROM rooms WHERE id=1 FOR UPDATE');
    const [[count]] = await db.query('SELECT COUNT(*) AS total FROM movies');
    if (!count.total) {
      for (const film of films) await db.execute('INSERT INTO movies(title,description,duration_minutes,genre,poster_key) VALUES(?,?,?,?,?)', film);
    }
    const [movies] = await db.query('SELECT id,duration_minutes FROM movies WHERE is_active=1 ORDER BY id LIMIT 4');
    const [[nowRow]] = await db.query('SELECT UTC_TIMESTAMP(3) AS now');
    const localDay = vietnamDate(nowRow.now);
    for (let day = 0; day < 7; day += 1) {
      const base = new Date(`${localDay}T00:00:00+07:00`);
      base.setUTCDate(base.getUTCDate() + day);
      for (let index = 0; index < movies.length; index += 1) {
        const movie = movies[index];
        const starts = new Date(base.getTime() + (9 + index * 3) * 3600000);
        if (starts <= nowRow.now) continue;
        const ends = new Date(starts.getTime() + (movie.duration_minutes + 20) * 60000);
        const [overlaps] = await db.execute('SELECT id FROM showtimes WHERE room_id=1 AND starts_at < ? AND ends_at > ?', [ends, starts]);
        if (overlaps.length) continue;
        const [result] = await db.execute('INSERT INTO showtimes(movie_id,room_id,starts_at,ends_at,price) VALUES(?,1,?,?,?)', [movie.id, starts, ends, index === 1 ? 95000 : 75000]);
        for (const row of 'ABCDEF') for (let col = 1; col <= 8; col += 1) await db.execute('INSERT INTO showtime_seats(showtime_id,seat_code) VALUES(?,?)', [result.insertId, `${row}${col}`]);
      }
    }
    const [admins] = await db.execute('SELECT id FROM admins WHERE username=?', ['admin']);
    if (!admins.length) {
      const password = secret('ADMIN_PASSWORD');
      if (password.length < 6) throw new Error('Mật khẩu quản trị cần tối thiểu 6 ký tự.');
      await db.execute('INSERT INTO admins(username,password_hash) VALUES(?,?)', ['admin', await passwordHash(password)]);
    }
  });
  console.log('Đã khởi tạo cơ sở dữ liệu, tài khoản quản trị và lịch chiếu mẫu. Dữ liệu hiện có được giữ nguyên.');
} catch (error) {
  console.error('Khởi tạo không thành công:', error.code || error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
