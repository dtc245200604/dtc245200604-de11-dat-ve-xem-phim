import fs from 'node:fs';
import path from 'node:path';

const file = process.env.LOG_FILE || '/var/log/app/app.log';
const limit = Number(process.env.LOG_MAX_BYTES || 10485760);
let fileReady = false;
try { fs.mkdirSync(path.dirname(file), { recursive: true }); fileReady = true; } catch { /* stdout vẫn hoạt động */ }
function rotate() {
  if (!fs.existsSync(file) || fs.statSync(file).size < limit) return;
  for (let n = 2; n >= 1; n -= 1) {
    if (fs.existsSync(`${file}.${n}`)) fs.renameSync(`${file}.${n}`, `${file}.${n + 1}`);
  }
  fs.renameSync(file, `${file}.1`);
}
export function log(level, event, data = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...data }) + '\n';
  process.stdout.write(line);
  if (fileReady) {
    try { rotate(); fs.appendFileSync(file, line, { mode: 0o644 }); }
    catch { process.stderr.write('Không ghi được tệp log ứng dụng.\n'); }
  }
}
