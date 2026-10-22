CREATE TABLE IF NOT EXISTS rooms (
  id INT UNSIGNED PRIMARY KEY,
  name VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS movies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  genre VARCHAR(80) NOT NULL,
  poster_key VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS showtimes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movie_id INT UNSIGNED NOT NULL,
  room_id INT UNSIGNED NOT NULL DEFAULT 1,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  price INT UNSIGNED NOT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  UNIQUE KEY uq_room_start (room_id,starts_at),
  KEY ix_showtime_start (starts_at),
  CONSTRAINT fk_showtime_movie FOREIGN KEY(movie_id) REFERENCES movies(id),
  CONSTRAINT fk_showtime_room FOREIGN KEY(room_id) REFERENCES rooms(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(20) NOT NULL,
  owner_id CHAR(48) NOT NULL,
  idempotency_key CHAR(48) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  showtime_id INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
  expires_at DATETIME(3) NOT NULL,
  total INT UNSIGNED NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(160) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at DATETIME(3) NULL,
  UNIQUE KEY uq_booking_code(code),
  UNIQUE KEY uq_booking_idempotency(owner_id,idempotency_key),
  KEY ix_booking_expiry(status,expires_at),
  KEY ix_booking_owner(owner_id,created_at),
  CONSTRAINT fk_booking_showtime FOREIGN KEY(showtime_id) REFERENCES showtimes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS showtime_seats (
  showtime_id INT UNSIGNED NOT NULL,
  seat_code CHAR(2) NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  PRIMARY KEY(showtime_id,seat_code),
  CONSTRAINT fk_seat_showtime FOREIGN KEY(showtime_id) REFERENCES showtimes(id),
  CONSTRAINT fk_seat_booking FOREIGN KEY(booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_items (
  booking_id BIGINT UNSIGNED NOT NULL,
  seat_code CHAR(2) NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  PRIMARY KEY(booking_id,seat_code),
  CONSTRAINT fk_item_booking FOREIGN KEY(booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(180) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR(128) PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY ix_session_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
