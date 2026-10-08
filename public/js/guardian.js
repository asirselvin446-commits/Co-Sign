// Guardian app: accept an invite, then approve or deny paused actions and
// recoveries by signing a request-bound challenge with the guardian's own passkey.
import { t, pick, onLangChange } from './i18n.js';
import { ACTIONS, RISK_THRESHOLD, ruleByCode } from './catalog.js';
import {
  api, initChrome, say, sayProblem, clearMessage, reportFailure, webauthnCode,
  createPasskey, usePasskey, connectStream, $, show, mmss, rupees, el, busy, passkeysSupported,
} from './common.js';

const params = new URLSearchParams(location.search);
const state = { profile: null, invite: params.get('invite'), inviter: null, known: new Set() };

initChrome();
onLangChange(() => {
  if (state.inviter) $('#g-invite-title').textContent = t('gInvitedBy', { name: state.inviter });
  if (state.profile) render();
});
boot();

async function boot() {
  if (!passkeysSupported()) say('webauthn_not_supported', 'problem');
  let signedIn = null;
  try { signedIn = await api('/api/guardian/me'); } catch { /* signed out */ }

  if (state.invite) {
    try {
      const { userName } = await api(`/api/guardian/invites/${encodeURIComponent(state.invite)}`);
      state.inviter = userName;
      $('#g-invite-title').textContent = t('gInvitedBy', { name: userName });
      $('#g-register-form').hidden = !!signedIn;
      $('#g-accept-existing').hidden = !signedIn;
      show('screen-invite');
      return;
    } catch (err) {
      say(err.code || 'invite_invalid', 'problem');
    }
  }
  if (signedIn) enterHome(signedIn);
  else show('screen-signin');
}

function dropInviteFromUrl() {
  state.invite = null;
  history.replaceState(null, '', '/guardian.html');
}

$('#g-register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#g-register-form button');
  await busy(button, async () => {
    clearMessage();
    const name = $('#g-name').value.trim();
    if (name.length < 2) return say('name_required', 'problem');
    try {
      const options = await api('/api/guardian/register/options', { name, invite: state.invite });
      const response = await createPasskey(options);
      const profile = await api('/api/guardian/register/verify', response);
      dropInviteFromUrl();
      enterHome(profile);
      say({ what: t('gWelcome', { name: state.inviter }) }, 'success');
    } catch (err) {
      reportFailure(webauthnCode(err));
      sayProblem(err);
    }
  })();
});

$('#g-accept-existing').addEventListener('click', busy($('#g-accept-existing'), async () => {
  try {
    const profile = await api('/api/guardian/accept', { invite: state.invite });
    dropInviteFromUrl();
    enterHome(profile);
    say({ what: t('gWelcome', { name: state.inviter }) }, 'success');
  } catch (err) {
    sayProblem(err);
  }
}));

$('#g-sign-in').addEventListener('click', busy($('#g-sign-in'), async () => {
  clearMessage();
  try {
    const options = await api('/api/guardian/login/options', {});
    const response = await usePasskey(options);
    enterHome(await api('/api/guardian/login/verify', response));
  } catch (err) {
    reportFailure(webauthnCode(err));
    sayProblem(err);
  }
}));

$('#g-sign-out').addEventListener('click', async () => {
  await api('/api/guardian/logout', {}).catch(() => {});
  state.profile = null;
  show('screen-signin');
});

function enterHome(profile) {
  state.profile = profile;
  for (const r of profile.requests) state.known.add(r.id);
  show('screen-home');
  render();
  connectStream('guardian', { request: onUpdate });
  $('#g-home-title').focus();
}

async function onUpdate(v) {
  try {
    state.profile = await api('/api/guardian/me');
  } catch { return; }
  const fresh = state.profile.requests.find((r) => r.id === v.id && !state.known.has(r.id));
  render();
  if (fresh) {
    state.known.add(fresh.id);
    say({ what: t('gNewRequest', { name: fresh.userName }) }, 'pause');
    navigator.vibrate?.([200, 100, 200]);
    document.querySelector(`[data-request="${fresh.id}"] h2`)?.focus();
  }
}

let timer = null;
function render() {
  const { guardian, requests } = state.profile;
  $('#g-home-title').textContent = guardian.name;
  $('#g-guarding').textContent = t('gGuarding', { names: guardian.guarding.join(', ') || '—' });
  $('#g-empty').hidden = requests.length > 0;
  $('#g-requests').replaceChildren(...requests.map(card));
  clearInterval(timer);
  timer = setInterval(updateTimers, 1000);
  updateTimers();
}

function card(r) {
  const isRecovery = r.type === 'recovery';
  const detail = r.params?.phone ? ` (${r.params.phone})` : r.params?.limit ? ` (${rupees(r.params.limit)})` : '';
  const approve = el('button', { class: 'button approve', type: 'button' }, t('gApprove'));
  const deny = el('button', { class: 'button danger', type: 'button' }, t('gDeny'));
  approve.addEventListener('click', busy(approve, () => decide(r, 'approve')));
  deny.addEventListener('click', busy(deny, () => decide(r, 'deny')));
  return el('article', { class: 'request', 'data-request': r.id, 'data-status': r.status, 'aria-labelledby': `rq-${r.id}` },
    el('h2', { id: `rq-${r.id}`, tabindex: '-1' }, t('gRequestTitle', { name: r.userName })),
    el('p', { class: 'request-action' }, t('gWants', { action: pick(ACTIONS[r.action].text) + detail })),
    r.reasons.length ? el('h3', {}, t('gWhatWeSee')) : null,
    r.reasons.length ? el('ul', { class: 'reasons' }, ...r.reasons.map((c) => el('li', {}, pick(ruleByCode(c).text)))) : null,
    r.score != null ? el('p', { class: 'muted' }, t('riskScore', { score: r.score, threshold: RISK_THRESHOLD })) : null,
    el('p', { class: 'advice' }, t(isRecovery ? 'gRecoveryAdvice' : 'gAdvice', { name: r.userName })),
    el('p', { class: 'countdown', role: 'timer', 'data-expires': r.status === 'pending_guardian' && !isRecovery ? r.expiresAt : '' }),
    el('div', { class: 'button-row' }, approve, deny),
  );
}

function updateTimers() {
  for (const node of document.querySelectorAll('.request .countdown')) {
    const article = node.closest('.request');
    if (article.dataset.status === 'cooloff') node.textContent = t('gInCooloff');
    else if (node.dataset.expires) node.textContent = t('gTimeLeft', { time: mmss(Number(node.dataset.expires) - Date.now()) });
    else node.hidden = true;
  }
}

async function decide(r, decision) {
  clearMessage();
  try {
    const options = await api(`/api/guardian/decisions/${r.id}/options`, { decision });
    const response = await usePasskey(options);
    const out = await api(`/api/guardian/decisions/${r.id}/verify`, { decision, response });
    state.profile = { guardian: out.guardian, requests: out.requests };
    render();
    say({ what: t(decision === 'approve' ? 'gApproved' : 'gDenied', { name: r.userName }) }, decision === 'approve' ? 'success' : 'info');
  } catch (err) {
    reportFailure(webauthnCode(err));
    sayProblem(err);
  }
}
