'use strict';

(() => {
  const form = document.getElementById('seat-form');
  if (!form) return;
  const map = document.getElementById('seat-map');
  const message = document.getElementById('seat-message');
  const selectedInputs = document.getElementById('selected-inputs');
  const selectedLabel = document.getElementById('chosen-seats');
  const totalLabel = document.getElementById('chosen-total');
  const reserveButton = document.getElementById('reserve-button');
  const selected = new Set();
  const buttons = new Map([...map.querySelectorAll('[data-seat]')].map(button => [button.dataset.seat, button]));
  const price = Number(form.dataset.seatPrice);
  const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  let isSubmitting = false;
  let isRefreshing = false;
  let unavailable = false;
  let pollFailed = false;

  function announce(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function renderSelection() {
    const codes = [...selected].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
    selectedLabel.textContent = codes.length ? codes.join(', ') : 'Chưa chọn';
    totalLabel.textContent = money.format(codes.length * price);
    selectedInputs.replaceChildren(...codes.map(code => {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'seats'; input.value = code;
      return input;
    }));
    buttons.forEach((button, code) => {
      button.classList.toggle('is-selected', selected.has(code));
      button.setAttribute('aria-pressed', String(selected.has(code)));
    });
    reserveButton.disabled = !codes.length || unavailable || isSubmitting;
  }

  map.addEventListener('click', event => {
    const button = event.target.closest('[data-seat]');
    if (!button || button.disabled || isSubmitting || unavailable) return;
    const code = button.dataset.seat;
    if (selected.has(code)) selected.delete(code);
    else if (selected.size >= 8) {
      announce('Bạn có thể chọn tối đa 8 ghế trong một đơn đặt vé.', true);
      return;
    } else selected.add(code);
    renderSelection();
    announce(selected.size ? `Đã chọn ${selected.size}/8 ghế: ${[...selected].sort().join(', ')}. Ghế chưa được giữ cho đến khi bạn xác nhận.` : 'Chọn tối đa 8 ghế. Sơ đồ tự cập nhật mỗi 5 giây.');
  });

  async function refreshSeats() {
    if (isRefreshing || isSubmitting || document.hidden || unavailable) return;
    isRefreshing = true;
    try {
      const response = await fetch(`/api/showtimes/${encodeURIComponent(form.dataset.showtimeId)}/seats`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('Không tải được sơ đồ ghế');
      const data = await response.json();
      if (!Array.isArray(data.seats)) throw new Error('Dữ liệu ghế không hợp lệ');
      if (data.status === 'closed' || new Date(data.startsAt).getTime() <= new Date(data.serverNow).getTime()) {
        unavailable = true;
        buttons.forEach(button => { button.disabled = true; });
        announce('Suất chiếu đã đóng hoặc đã bắt đầu. Vui lòng chọn một suất chiếu khác.', true);
        renderSelection();
        return;
      }
      const removed = [];
      data.seats.forEach(seat => {
        const button = buttons.get(seat.code);
        if (!button || !['available', 'held', 'sold'].includes(seat.status)) return;
        const disabled = seat.status !== 'available';
        button.dataset.status = seat.status;
        button.disabled = disabled;
        button.classList.toggle('seat-held', seat.status === 'held');
        button.classList.toggle('seat-sold', seat.status === 'sold');
        button.setAttribute('aria-label', `Ghế ${seat.code}, ${seat.status === 'available' ? 'còn trống' : seat.status === 'sold' ? 'đã bán' : 'đang giữ'}`);
        if (disabled && selected.delete(seat.code)) removed.push(seat.code);
      });
      renderSelection();
      if (removed.length) announce(`Ghế ${removed.join(', ')} vừa được khách khác giữ hoặc mua. Vui lòng chọn ghế khác.`, true);
      else if (pollFailed) announce('Đã kết nối lại và cập nhật sơ đồ ghế.');
      pollFailed = false;
    } catch {
      if (!pollFailed) announce('Chưa cập nhật được sơ đồ ghế. Hệ thống sẽ thử lại; chỗ ngồi được kiểm tra lần nữa khi đặt vé.', true);
      pollFailed = true;
    } finally {
      isRefreshing = false;
    }
  }

  form.addEventListener('submit', event => {
    if (!selected.size || unavailable || isSubmitting) {
      event.preventDefault();
      if (!isSubmitting) announce('Vui lòng chọn ít nhất một ghế trước khi tiếp tục.', true);
      return;
    }
    isSubmitting = true;
    reserveButton.disabled = true;
    reserveButton.textContent = 'Đang giữ ghế…';
  });
  window.addEventListener('pageshow', () => {
    isSubmitting = false;
    reserveButton.textContent = 'Tiếp tục thanh toán →';
    renderSelection();
    refreshSeats();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSeats(); });
  setInterval(refreshSeats, 5000);
  renderSelection();
})();
