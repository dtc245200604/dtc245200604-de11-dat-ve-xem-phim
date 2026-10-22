import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { expireAll } from './booking-service.js';
import { log } from './logger.js';

const server = app.listen(config.port, '0.0.0.0', () => log('info', 'server_started', { port: config.port }));
server.requestTimeout = 30000;
server.headersTimeout = 35000;
let sweeping = false;
async function sweep() {
  if (sweeping) return;
  sweeping = true;
  try { await expireAll(); } catch (error) { log('error', 'expiry_worker_error', { code: error.code || error.name }); }
  finally { sweeping = false; }
}
const timer = setInterval(sweep, 15000).unref();
void sweep();
let stopping = false;
function shutdown(signal) {
  if (stopping) return; stopping = true;
  clearInterval(timer);
  log('info', 'server_stopping', { signal });
  const force = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await pool.end(); clearTimeout(force); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
