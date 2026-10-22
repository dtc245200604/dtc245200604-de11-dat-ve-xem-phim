import test from 'node:test';
import assert from 'node:assert/strict';
import { customerFields, equalToken, passwordHash, passwordMatches, positiveId, selectedSeats, parseShowtime, vietnamDate } from '../src/security.js';

test('Chọn ghế chuẩn hóa thứ tự và từ chối yêu cầu sai', () => {
  assert.deepEqual(selectedSeats(['F8', 'A1']), ['A1', 'F8']);
  assert.deepEqual(selectedSeats('B3'), ['B3']);
  for (const value of [[], ['A1', 'A1'], ['G1'], ['A9'], ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'B1'], '<script>']) assert.throws(() => selectedSeats(value), { status: 400 });
});
test('Mã dữ liệu phải là số nguyên dương an toàn', () => {
  assert.equal(positiveId('42'), 42);
  for (const value of ['abc', 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => positiveId(value), { status: 400 });
});
test('Thông tin khách được kiểm tra và email được chuẩn hóa', () => {
  assert.deepEqual(customerFields({ name: ' Nguyễn An ', email: ' AN@example.com ' }), { name: 'Nguyễn An', email: 'an@example.com' });
  for (const body of [{ name: 'A', email: 'a@example.com' }, { name: 'Nguyễn An', email: 'bad' }, { name: 'Nguyễn An', email: 'a@b.c\nHeader:bad' }]) assert.throws(() => customerFields(body), { status: 400 });
});
test('Ngày suất chiếu chuyển từ giờ Việt Nam sang UTC đúng', () => {
  assert.equal(parseShowtime('2099-10-11T19:30').toISOString(), '2099-10-11T12:30:00.000Z');
  assert.equal(vietnamDate(new Date('2026-10-10T20:00:00Z')), '2026-10-11');
  for (const value of ['2000-01-01T10:00', '2099-02-30T10:00', '2099-13-12T20:30', 'x']) assert.throws(() => parseShowtime(value));
});
test('CSRF so sánh đúng token và từ chối kiểu không hợp lệ', () => {
  assert.equal(equalToken('abc', 'abc'), true);
  assert.equal(equalToken('abc', 'abd'), false);
  assert.equal(equalToken('abc', 'abcd'), false);
  assert.equal(equalToken(undefined, 'abc'), false);
});
test('Mật khẩu scrypt có salt riêng và xác thực đúng', async () => {
  const password = 'MatKhauKiemThu-Rieng-2026!';
  const one = await passwordHash(password); const two = await passwordHash(password);
  assert.notEqual(one, two);
  assert.equal(await passwordMatches(password, one), true);
  assert.equal(await passwordMatches('sai', one), false);
  assert.equal(await passwordMatches(password, 'invalid'), false);
});
