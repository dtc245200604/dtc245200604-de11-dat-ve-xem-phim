'use strict';

(() => {
  const timer = document.getElementById('hold-timer');
  const form = document.getElementById('payment-form');
  if (!timer || !form) return;
  const countdown = document.getElementById('countdown');
  const expiresMessage = document.getElementById('payment-expired');
  const retryLink = document.getElementById('retry-booking');
  const initialSeconds = Math.max(0, Number(timer.dataset.seconds) || 0);
  const deadline = performance.now() + initialSeconds * 1000;
  let isSubmitting = false;

  function secondsRemaining() {
    return Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  }

  function updateCountdown() {
    const seconds = secondsRemaining();
    countdown.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-urgent', seconds <= 60);
    if (!seconds) {
      form.querySelectorAll('button').forEach(button => { button.disabled = true; });
      expiresMessage.hidden = false;
      retryLink.hidden = false;
      timer.querySelector('div > span:last-child').textContent = 'Đã hết thời gian giữ ghế';
    }
  }

  form.addEventListener('submit', event => {
    if (isSubmitting || !secondsRemaining()) {
      event.preventDefault(); updateCountdown(); return;
    }
    isSubmitting = true;
    const outcome = event.submitter?.value;
    if (!['success', 'fail'].includes(outcome)) {
      event.preventDefault(); isSubmitting = false; return;
    }
    // Keep the chosen outcome in the form when the submit buttons are disabled.
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = 'outcome'; input.value = outcome;
    form.append(input);
    form.querySelectorAll('button').forEach(button => { button.disabled = true; });
    event.submitter.textContent = 'Đang xử lý…';
  });

  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  document.addEventListener('visibilitychange', updateCountdown);
  setInterval(updateCountdown, 250);
  updateCountdown();
})();
