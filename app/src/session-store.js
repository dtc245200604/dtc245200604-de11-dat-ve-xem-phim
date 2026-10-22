import session from 'express-session';
import { pool } from './db.js';

export class MysqlSessionStore extends session.Store {
  get(sid, callback) {
    pool.execute('SELECT data FROM sessions WHERE sid=? AND expires_at > UTC_TIMESTAMP(3)', [sid])
      .then(([rows]) => callback(null, rows[0] ? JSON.parse(rows[0].data) : null)).catch(callback);
  }
  set(sid, value, callback = () => {}) {
    const expiry = new Date(value.cookie.expires || Date.now() + 86400000);
    pool.execute('INSERT INTO sessions(sid,data,expires_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data), expires_at=VALUES(expires_at)', [sid, JSON.stringify(value), expiry])
      .then(() => callback()).catch(callback);
  }
  touch(sid, value, callback = () => {}) {
    const expiry = new Date(value.cookie.expires || Date.now() + 86400000);
    pool.execute('UPDATE sessions SET expires_at=? WHERE sid=?', [expiry, sid]).then(() => callback()).catch(callback);
  }
  destroy(sid, callback = () => {}) {
    pool.execute('DELETE FROM sessions WHERE sid=?', [sid]).then(() => callback()).catch(callback);
  }
}
