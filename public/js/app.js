// Account holder's app: sign in, pay, protected actions, guardians, recovery.
import { t, pick, explain, onLangChange } from './i18n.js';
import { ACTIONS, ruleByCode } from './catalog.js';
import {
  api, initChrome, say, sayProblem, clearMessage, reportFailure, webauthnCode, passkeysSupported,
  createPasskey, usePasskey, connectStream, $, show, mmss, rupees, el, busy,
  nativeDigitScript, toAsciiDigits,
} from './common.js';

const state = {
  profile: null,
  active: null,        // step-up shown in the pause band
  seen: new Map(),     // request id -> last status we announced
  recovery: null,      // recovery started from this device
  alertRecovery: null, // someone else recovering this account
  payment: null,
  otpPasted: false,
};

// ---------- boot ----------

initChrome();
onLangChange(() => {
  renderStaticLabels();
  if (state.profile) renderHome();
  if (state.active) renderPause();
  if (state.recovery) renderRecovery();
});
renderStaticLabels();
boot();

async function boot() {
  if (!passkeysSupported()) say('webauthn_not_supported', 'problem');
  try {
    enterHome(await api('/api/me'));
    return;
  } catch { /* not signed in */ }
  try {
    const rec = await api('/api/recovery/status');
    if (['pending_guardian', 'cancel_window', 'ready'].includes(rec.status)) {
      state.recovery = rec;
      show('screen-recover');
      $('#recover-form').hidden = true;
      renderRecovery();
      connectStream('user', { request: onRecoveryUpdate });
      return;
    }
  } catch { /* no recovery */ }
  show('screen-welcome');
}

function renderStaticLabels() {
  for (const form of document.querySelectorAll('form[data-action]')) {
    form.querySelector('button').textContent = pick(ACTIONS[form.dataset.action].text);
  }
  for (const span of document.querySelectorAll('[data-rule]')) {
    span.textContent = pick(ruleByCode(span.dataset.rule).text);
  }
}

// ---------- sign in / register ----------

$('#sign-in').addEventListener('click', busy($('#sign-in'), async () => {
  clearMessage();
  try {
    const options = await api('/api/login/options', {});
    const response = await usePasskey(options);
    enterHome(await api('/api/login/verify', response));
    say({ what: t('signedIn') }, 'success');
  } catch (err) {
    reportFailure(webauthnCode(err));
    sayProblem(err);
  }
}));

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#register-form button');
  await busy(button, async () => {
    clearMessage();
    const name = $('#register-name').value.trim();
    if (name.length < 2) {
      say('name_required', 'problem');
      $('#register-name').focus();
      return;
    }
    try {
      const options = await api('/api/register/options', { name });
      const response = await createPasskey(options);
      enterHome(await api('/api/register/verify', response));
      say({ what: t('accountCreated') }, 'success');
    } catch (err) {
      reportFailure(webauthnCode(err));
      sayProblem(err);
    }
  })();
});

$('#sign-out').addEventListener('click', async () => {
  await api('/api/logout', {}).catch(() => {});
  state.profile = null;
  hidePause();
  clearMessage();
  show('screen-welcome');
});

// ---------- home ----------

function enterHome(profile) {
  state.profile = profile;
  show('screen-home');
  renderHome();
  connectStream('user', {
    request: onRequestUpdate,
    risk: onRisk,
    recovery: onRecoveryAlert,
    guardians: (names) => { state.profile.user.guardians = names; renderHome(); },
  });
  const open = profile.stepups.at(-1);
  if (open) showRequest(open, { announce: false });
  for (const r of profile.recoveries) onRecoveryAlert(r);
  $('#hello').focus();
}

async function refresh() {
  try {
    state.profile = await api('/api/me');
    renderHome();
  } catch { /* keep what we have */ }
}

function renderHome() {
  const { user } = state.profile;
  $('#hello').textContent = t('hello', { name: user.name });
  $('#acct-balance').textContent = rupees(user.balance);
  $('#acct-phone').textContent = user.phone;
  $('#acct-limit').textContent = rupees(user.transferLimit);
  $('#device-key').textContent = user.signalToken;
  for (const box of document.querySelectorAll('[data-signal]')) box.checked = !!user.signals?.[box.dataset.signal];

  const list = $('#guardian-list');
  list.replaceChildren(...user.guardians.map((name) => el('li', {}, name)));
  $('#no-guardians').hidden = user.guardians.length > 0;
  renderSafety();
}

function renderSafety() {
  const risk = state.profile.risk;
  const section = $('#safety');
  section.dataset.level = risk.high ? 'high' : risk.score > 0 ? 'some' : 'clear';
  $('#safety-title').textContent = risk.score > 0 ? t('safetyRisk') : t('safetyClear');
  $('#safety-score').textContent = t('riskScore', { score: risk.score, threshold: risk.threshold });
  $('#safety-reasons').replaceChildren(...risk.reasons.map((code) => {
    const rule = ruleByCode(code);
    return el('li', {}, pick(rule.text), el('span', { class: 'points' }, ` +${rule.points}`));
  }));
}

function onRisk(risk) {
  if (!state.profile) return;
  state.profile.risk = risk;
  renderSafety();
}

// Simulated device signals (a real phone app would POST the same thing).
for (const box of document.querySelectorAll('[data-signal]')) {
  box.addEventListener('change', async () => {
    try {
      const out = await api('/api/signals', { [box.dataset.signal]: box.checked });
      state.profile.user.signals = out.signals;
      onRisk(out.risk);
    } catch (err) {
      box.checked = !box.checked;
      sayProblem(err);
    }
  });
}

// ---------- guardians ----------

$('#invite').addEventListener('click', busy($('#invite'), async () => {
  try {
    const { path } = await api('/api/invites', {});
    $('#invite-link').value = new URL(path, location.origin).href;
    $('#invite-box').hidden = false;
    $('#invite-link').select();
  } catch (err) {
    sayProblem(err);
  }
}));

$('#invite-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#invite-link').value);
  } catch {
    $('#invite-link').select();
    document.execCommand?.('copy');
  }
  $('#invite-copy').textContent = t('copied');
  setTimeout(() => { $('#invite-copy').textContent = t('copy'); }, 2000);
});

// ---------- protected actions ----------

for (const form of document.querySelectorAll('form[data-action]')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    await busy(button, async () => {
      clearMessage();
      const body = { action: form.dataset.action };
      if (form.phone) body.phone = form.phone.value;
      if (form.limit) body.limit = Number(form.limit.value);
      try {
        const { request, risk } = await api('/api/actions', body);
        onRisk(risk);
        if (request.status === 'self') {
          await finish(request); // low risk: just the user's own passkey
        } else {
          showRequest(request);
        }
      } catch (err) {
        sayProblem(err);
      }
    })();
  });
}

const guardianNames = () => state.profile?.user.guardians.join(', ') || '';

function showRequest(request, { announce = true } = {}) {
  state.active = request;
  renderPause();
  $('#pause').hidden = false;
  $('#pause-title').focus();
  if (announce) announceStatus(request);
  state.seen.set(request.id, request.status);
}

function hidePause() {
  state.active = null;
  $('#pause').hidden = true;
}

let pauseTimer = null;
function renderPause() {
  const r = state.active;
  if (!r) return;
  const pause = $('#pause');
  pause.dataset.status = r.status;
  $('#pause-action').textContent = pick(ACTIONS[r.action].text) + (r.params?.phone ? ` (${r.params.phone})` : '') + (r.params?.limit ? ` (${rupees(r.params.limit)})` : '');
  const coerced = r.reasons.some((c) => ['unknown_call', 'screen_share', 'remote_access'].includes(c));
  $('#pause-warning').hidden = !coerced;
  $('#pause-reasons').replaceChildren(...r.reasons.map((c) => el('li', {}, pick(ruleByCode(c).text))));

  const status = $('#pause-status');
  const countdown = $('#pause-countdown');
  countdown.hidden = true;
  clearInterval(pauseTimer);
  if (r.status === 'pending_guardian') status.textContent = t('askedGuardians', { names: guardianNames() });
  else if (r.status === 'approved') status.textContent = t('approvedBy', { name: r.decidedBy });
  else if (r.status === 'ready') status.textContent = t('readyNow');
  else if (r.status === 'denied') status.textContent = explainLine('guardian_denied', { name: r.decidedBy });
  else if (r.status === 'cooloff') {
    status.textContent = explain('cooloff', {}).next;
    countdown.hidden = false;
    const tickDown = () => {
      countdown.textContent = t('waitingTime', { time: mmss(r.coolOffUntil - Date.now()) });
    };
    tickDown();
    pauseTimer = setInterval(tickDown, 1000);
  }
  $('#pause-finish').hidden = !['approved', 'ready'].includes(r.status);
  $('#pause-cancel').hidden = !['pending_guardian', 'cooloff', 'approved', 'ready'].includes(r.status);
  $('#pause-close').hidden = r.status !== 'denied';
}

function explainLine(code, vars) {
  const m = explain(code, vars);
  return m ? `${m.what} ${m.next}` : '';
}

function announceStatus(r) {
  if (r.status === 'pending_guardian') say('paused', 'pause', { names: guardianNames() });
  else if (r.status === 'cooloff') say('cooloff', 'pause', { time: mmss(r.coolOffUntil - Date.now()) });
  else if (r.status === 'approved') say({ what: t('approvedBy', { name: r.decidedBy }) }, 'success');
  else if (r.status === 'ready') say({ what: t('readyNow') }, 'info');
  else if (r.status === 'denied') say('guardian_denied', 'problem', { name: r.decidedBy });
  else if (r.status === 'expired') say({ what: t('expired') }, 'info');
}

function onRequestUpdate(r) {
  if (r.type !== 'stepup') return;
  if (state.active && state.active.id !== r.id) return;
  // Nothing on screen: only surface requests that still need the user's attention.
  if (!state.active && !['pending_guardian', 'cooloff', 'approved', 'ready', 'denied'].includes(r.status)) return;
  if (['completed', 'cancelled'].includes(r.status)) {
    if (state.active?.id === r.id) hidePause();
    return;
  }
  if (r.status === 'self') return;
  const changed = state.seen.get(r.id) !== r.status;
  state.active = r;
  renderPause();
  $('#pause').hidden = false;
  if (changed) {
    announceStatus(r);
    state.seen.set(r.id, r.status);
    if (r.status === 'expired') hidePause();
  }
}

async function finish(request) {
  try {
    const options = await api(`/api/actions/${request.id}/finish/options`, {});
    const response = await usePasskey(options);
    const { result } = await api(`/api/actions/${request.id}/finish/verify`, response);
    hidePause();
    const vars = { ...result };
    if (vars.transferLimit) vars.transferLimit = Number(vars.transferLimit).toLocaleString('en-IN');
    say({ what: t(`done_${request.action}`, vars) }, 'success');
    refresh();
  } catch (err) {
    reportFailure(webauthnCode(err));
    sayProblem(err);
  }
}

$('#pause-finish').addEventListener('click', busy($('#pause-finish'), () => state.active && finish(state.active)));

$('#pause-cancel').addEventListener('click', busy($('#pause-cancel'), async () => {
  if (!state.active) return;
  try {
    await api(`/api/actions/${state.active.id}/cancel`, {});
    hidePause();
    say({ what: t('cancelled') }, 'info');
  } catch (err) {
    sayProblem(err);
  }
}));

$('#pause-close').addEventListener('click', () => {
  hidePause();
  clearMessage();
});

// ---------- payment with SMS OTP ----------

$('#pay-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#pay-form button');
  await busy(button, async () => {
    clearMessage();
    try {
      const out = await api('/api/payment/start', { payee: $('#pay-payee').value, amount: Number($('#pay-amount').value) });
      state.payment = out;
      state.otpPasted = false;
      $('#sms-text').textContent = out.sms.text;
      $('#sms').hidden = false;
      $('#otp-form').hidden = false;
      $('#otp').value = '';
      $('#convert-digits').hidden = true;
      say({ what: t('codeSent') }, 'info');
      $('#otp').focus();
    } catch (err) {
      sayProblem(err);
    }
  })();
});

const otpInput = $('#otp');
otpInput.addEventListener('paste', () => { state.otpPasted = true; });
otpInput.addEventListener('input', () => {
  const script = nativeDigitScript(otpInput.value);
  if (script && $('#convert-digits').hidden) explainDigits(script);
  if (!script) $('#convert-digits').hidden = true;
});

function explainDigits(script) {
  $('#convert-digits').hidden = false;
  say('otp_native_digits', 'problem', { script });
  reportFailure('otp_native_digits');
}

$('#convert-digits').addEventListener('click', () => {
  otpInput.value = toAsciiDigits(otpInput.value);
  $('#convert-digits').hidden = true;
  say({ what: t('digitsFixed') }, 'success');
  otpInput.focus();
});

$('#otp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#otp-form button[type=submit]');
  await busy(button, async () => {
    const otp = otpInput.value.trim();
    // Client-side tier: diagnose without asking the server (nothing here helps an attacker).
    const script = nativeDigitScript(otp);
    if (script) return explainDigits(script);
    try {
      const out = await api('/api/payment/confirm', { otp, pasted: state.otpPasted });
      $('#sms').hidden = true;
      $('#otp-form').hidden = true;
      say({ what: t('paymentDone', { amount: out.amount, payee: out.payee }) }, 'success');
      refresh();
    } catch (err) {
      sayProblem(err);
      if (['otp_expired', 'otp_too_many'].includes(err.code)) $('#otp-form').hidden = true;
      refresh();
    }
  })();
});

// ---------- someone is recovering this account (shown on existing sessions) ----------

function onRecoveryAlert(r) {
  const open = ['pending_guardian', 'cancel_window', 'ready'].includes(r.status);
  const isNew = state.alertRecovery?.id !== r.id;
  state.alertRecovery = open ? r : null;
  $('#recovery-alert').hidden = !open;
  if (open && isNew) say({ what: t('recoveryAlert'), next: t('recoveryAlertNext') }, 'problem');
}

$('#recovery-cancel').addEventListener('click', busy($('#recovery-cancel'), async () => {
  if (!state.alertRecovery) return;
  try {
    await api(`/api/recovery/${state.alertRecovery.id}/cancel`, {});
    $('#recovery-alert').hidden = true;
    state.alertRecovery = null;
    say({ what: t('cancelled') }, 'info');
  } catch (err) {
    sayProblem(err);
  }
}));

// ---------- "I lost my phone" ----------

$('#go-recover').addEventListener('click', () => {
  clearMessage();
  show('screen-recover');
  $('#recover-form').hidden = false;
  $('#recover-status').hidden = true;
  $('#recover-name').focus();
});

$('#recover-back').addEventListener('click', () => {
  clearInterval(recoverTimer);
  clearMessage();
  show('screen-welcome');
});

$('#recover-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#recover-form button');
  await busy(button, async () => {
    const name = $('#recover-name').value.trim();
    if (name.length < 2) return say('name_required', 'problem');
    try {
      state.recovery = await api('/api/recovery/start', { name });
      $('#recover-form').hidden = true;
      renderRecovery();
      say('recovery_waiting', 'info');
      connectStream('user', { request: onRecoveryUpdate });
    } catch (err) {
      sayProblem(err);
    }
  })();
});

function onRecoveryUpdate(v) {
  if (!state.recovery || v.id !== state.recovery.id) return;
  const before = state.recovery.status;
  state.recovery = { ...state.recovery, ...v };
  renderRecovery();
  if (before === v.status) return;
  if (v.status === 'cancel_window') say({ what: t('recoveryWindow', { time: mmss(v.readyAt - Date.now()) }) }, 'info');
  if (v.status === 'ready') say({ what: t('recoveryReady') }, 'success');
  if (v.status === 'denied') say({ what: t('recoveryDenied') }, 'problem');
  if (v.status === 'cancelled') say({ what: t('recoveryCancelled') }, 'problem');
}

let recoverTimer = null;
function renderRecovery() {
  const r = state.recovery;
  $('#recover-status').hidden = false;
  const progress = $('#recover-progress');
  const countdown = $('#recover-countdown');
  countdown.hidden = true;
  clearInterval(recoverTimer);
  $('#recover-register').hidden = r.status !== 'ready';
  if (r.status === 'pending_guardian') {
    progress.textContent = r.approvals ? t('recoveryProgress', { approvals: r.approvals, required: r.required }) : explainLine('recovery_waiting');
    // Fallback poll in case the live stream drops (tunnels, sleepy phones).
    recoverTimer = setInterval(pollRecovery, 5000);
  } else if (r.status === 'cancel_window') {
    progress.textContent = t('recoveryWindow', { time: mmss(r.readyAt - Date.now()) });
    countdown.hidden = false;
    const tickDown = () => {
      countdown.textContent = mmss(r.readyAt - Date.now());
      if (Date.now() >= r.readyAt + 1500) pollRecovery();
    };
    tickDown();
    recoverTimer = setInterval(tickDown, 1000);
  } else if (r.status === 'ready') progress.textContent = t('recoveryReady');
  else if (r.status === 'denied') progress.textContent = t('recoveryDenied');
  else if (r.status === 'cancelled') progress.textContent = t('recoveryCancelled');
}

async function pollRecovery() {
  try { onRecoveryUpdate(await api('/api/recovery/status')); } catch { /* ignore */ }
}

$('#recover-register').addEventListener('click', busy($('#recover-register'), async () => {
  try {
    const options = await api('/api/recovery/register/options', {});
    const response = await createPasskey(options);
    await api('/api/recovery/register/verify', response);
    clearInterval(recoverTimer);
    state.recovery = null;
    enterHome(await api('/api/me'));
    say({ what: t('signedIn') }, 'success');
  } catch (err) {
    reportFailure(webauthnCode(err));
    sayProblem(err);
  }
}));
