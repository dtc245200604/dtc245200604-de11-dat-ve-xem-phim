import fs from 'node:fs';

export function secret(name, required = true) {
  const file = process.env[`${name}_FILE`];
  const value = file ? fs.readFileSync(file, 'utf8').trim() : process.env[name];
  if (!value && required) throw new Error(`Chưa cấu hình ${name}_FILE hoặc ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  secureCookies: process.env.COOKIE_SECURE === 'true' ? true : process.env.COOKIE_SECURE === 'false' ? false : 'auto',
  database: {
    host: process.env.DB_HOST || 'mysql',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'cinema',
    user: process.env.DB_USER || 'cinema_app',
    password: secret('DB_PASSWORD'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 100,
    timezone: 'Z',
    charset: 'utf8mb4',
    decimalNumbers: true,
    multipleStatements: false,
    connectTimeout: 10000
  }
};
