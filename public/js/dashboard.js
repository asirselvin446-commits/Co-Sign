// Security desk: live audit log and counters.
import { api, connectStream, el, $ } from './common.js';

const state = { events: [], filter: 'all' };

// How each event type reads on the desk.
const TONE = {
  'login.success': 'ok',
  'otp.success': 'ok',
  'action.completed': 'ok',
  'recovery.completed': 'ok',
  'stepup.approved': 'ok',
  'recovery.approved': 'ok',
  'login.failure': 'bad',
  'otp.failure': 'bad',
  'client.failure': 'bad',
  'stepup.denied': 'bad',
  'recovery.denied': 'bad',
  'stepup.created': 'warn',
  'stepup.cooloff': 'warn',
  'recovery.started': 'warn',
  'recovery.cancelled': 'warn',
  'stepup.cancelled': 'warn',
};

const LABEL = {
  'login.success': 'Signed in',
  'login.failure': 'Sign-in failed',
  'user.registered': 'New account',
  'guardian.linked': 'Guardian added',
  'guardian.login': 'Guardian signed in',
  'invite.created': 'Invite created',
  'signals.updated': 'Device signals',
  'action.selfcheck': 'Passkey re-check',
  'action.completed': 'Action completed',
  'stepup.created': 'Paused for guardian',
  'stepup.approved': 'Guardian approved',
  'stepup.denied': 'Guardian denied',
  'stepup.cooloff': 'Cool-off started',
  'stepup.cancelled': 'Cancelled by user',
  'otp.sent': 'OTP sent',
  'otp.success': 'Payment confirmed',
  'otp.failure': 'OTP failed',
  'client.failure': 'Client-side failure',
  'recovery.started': 'Recovery requested',
  'recovery.approved': 'Recovery approved',
  'recovery.denied': 'Recovery denied',
  'recovery.cancelled': 'Recovery cancelled',
  'recovery.completed': 'Recovery completed',
};

const FILTERS = {
  all: () => true,
  decisions: (e) => /^(stepup|recovery)\./.test(e.type),
  failures: (e) => e.counter === 'failures',
};

const keyQuery = new URLSearchParams(location.search).get('key');
const withKey = (p) => (keyQuery ? `${p}?key=${encodeURIComponent(keyQuery)}` : p);

function renderCounters(counters) {
  for (const [name, value] of Object.entries(counters)) {
    const dd = document.querySelector(`[data-counter="${name}"] dd`);
    if (dd && dd.textContent !== String(value)) {
      dd.textContent = value;
      dd.parentElement.classList.remove('bumped');
      void dd.offsetWidth; // restart the highlight
      dd.parentElement.classList.add('bumped');
    }
  }
}

function row(e) {
  const time = new Date(e.ts);
  return el('li', { class: 'event', 'data-tone': TONE[e.type] || 'neutral' },
    el('time', { datetime: time.toISOString() }, time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
    el('span', { class: 'event-type' }, LABEL[e.type] || e.type),
    el('span', { class: 'event-summary' }, e.summary),
  );
}

function renderFeed() {
  const items = state.events.filter(FILTERS[state.filter]).slice(0, 150).map(row);
  $('#feed').replaceChildren(...items);
}

for (const b of document.querySelectorAll('[data-filter]')) {
  b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderFeed();
  });
}

async function boot() {
  try {
    const data = await api(withKey('/api/dashboard'));
    state.events = data.events;
    renderCounters(data.counters);
    renderFeed();
  } catch {
    $('#live').textContent = 'Not authorised';
    $('#live').dataset.state = 'off';
    return;
  }
  const source = connectStream('dashboard', {
    audit: ({ event, counters }) => {
      state.events.unshift(event);
      renderCounters(counters);
      if (FILTERS[state.filter](event)) $('#feed').prepend(row(event));
    },
  });
  source.addEventListener('open', () => { $('#live').textContent = 'Live'; $('#live').dataset.state = 'on'; });
  source.addEventListener('error', () => { $('#live').textContent = 'Reconnecting'; $('#live').dataset.state = 'connecting'; });
}

boot();
