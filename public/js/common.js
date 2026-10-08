// Browser helpers shared by the user, guardian and dashboard pages.
import { LANGS, lang, setLang, onLangChange, t, explain, applyStatic } from './i18n.js';

// ---------- API ----------

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'network', res.status);
  return data;
}

// ---------- passkeys ----------

const WebAuthn = () => window.SimpleWebAuthnBrowser;

/** Maps browser WebAuthn exceptions to explainer codes (client-side, safe to be specific). */
export function webauthnCode(err) {
  if (err instanceof ApiError) return err.code;
  const name = err?.name || err?.cause?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return 'webauthn_not_allowed';
  if (name === 'InvalidStateError') return 'webauthn_invalid_state';
  if (name === 'SecurityError') return 'webauthn_security';
  if (name === 'NotSupportedError') return 'webauthn_not_supported';
  return 'verification_failed';
}

export function passkeysSupported() {
  return !!(window.PublicKeyCredential && WebAuthn()?.browserSupportsWebAuthn());
}

export const createPasskey = (optionsJSON) => WebAuthn().startRegistration({ optionsJSON });
export const usePasskey = (optionsJSON) => WebAuthn().startAuthentication({ optionsJSON });

// ---------- voice ----------

const VOICE_KEY = 'saathi.voice';
let voiceOn = (() => { try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; } })();
let warnedNoVoice = {};

function voiceFor(code) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const want = LANGS[code].speech.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === want) || voices.find((v) => v.lang.toLowerCase().startsWith(code));
}

export function speak(text) {
  if (!voiceOn || !window.speechSynthesis || !text) return;
  const code = lang();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = LANGS[code].speech;
  const voice = voiceFor(code);
  if (voice) utter.voice = voice;
  else if (window.speechSynthesis.getVoices().length && !warnedNoVoice[code]) {
    warnedNoVoice[code] = true;
    note(t('noVoice'));
  }
  utter.rate = 0.92; // a little slower: clearer for everyone
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ---------- message area (aria-live) ----------

let lastSpoken = '';

/**
 * Shows a message in the page's live region and reads it aloud.
 * `kind`: 'info' | 'success' | 'problem'. `body` is a code (explained via
 * i18n) or { what, next } already in the current language.
 */
export function say(body, kind = 'info', vars) {
  const box = document.getElementById('message');
  if (!box) return;
  const msg = typeof body === 'string' ? explain(body, vars) || { what: body, next: '' } : body;
  // The live region itself stays in the DOM so screen readers keep listening;
  // only the card inside it is shown or hidden.
  const card = box.querySelector('.message-card');
  card.dataset.kind = kind;
  card.hidden = false;
  box.querySelector('.message-what').textContent = msg.what;
  box.querySelector('.message-next').textContent = msg.next || '';
  lastSpoken = [msg.what, msg.next].filter(Boolean).join(' ');
  speak(lastSpoken);
}

export const sayProblem = (err, vars) => say(webauthnCode(err), 'problem', vars);

export function clearMessage() {
  const card = document.querySelector('#message .message-card');
  if (card) card.hidden = true;
}

function note(text) {
  const el = document.getElementById('voice-note');
  if (el) { el.textContent = text; el.hidden = false; }
}

/** Reports client-side failures so the risk engine can count them. Best effort. */
export function reportFailure(code) {
  if (['webauthn_not_allowed', 'webauthn_invalid_state', 'webauthn_security', 'webauthn_not_supported', 'otp_native_digits'].includes(code)) {
    api('/api/failures', { code }).catch(() => {});
  }
}

// ---------- chrome: language switcher + voice toggle ----------

export function initChrome() {
  document.documentElement.lang = lang();
  const switcher = document.getElementById('lang-switch');
  if (switcher) {
    for (const [code, { label }] of Object.entries(LANGS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.lang = code;
      b.dataset.lang = code;
      b.addEventListener('click', () => setLang(code));
      switcher.append(b);
    }
  }
  const voiceBtn = document.getElementById('voice-toggle');
  const syncChrome = () => {
    switcher?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang())));
    if (voiceBtn) {
      voiceBtn.textContent = voiceOn ? t('voiceOn') : t('voiceOff');
      voiceBtn.setAttribute('aria-pressed', String(voiceOn));
    }
  };
  voiceBtn?.addEventListener('click', () => {
    voiceOn = !voiceOn;
    try { localStorage.setItem(VOICE_KEY, voiceOn ? 'on' : 'off'); } catch { /* ignore */ }
    if (!voiceOn) window.speechSynthesis?.cancel();
    syncChrome();
  });
  document.getElementById('hear-again')?.addEventListener('click', () => {
    const was = voiceOn;
    voiceOn = true;
    speak(lastSpoken);
    voiceOn = was;
  });
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => {});
  onLangChange(() => {
    syncChrome();
    const voiceNote = document.getElementById('voice-note');
    if (voiceNote) voiceNote.hidden = true; // it described the previous language's voice
  });
  applyStatic();
  syncChrome();
}

// ---------- live updates ----------

/** Opens (or reopens) the page's SSE stream. Returns the EventSource. */
let source = null;
export function connectStream(role, handlers) {
  source?.close();
  source = new EventSource(`/api/stream?role=${role}${location.search.includes('key=') ? `&${new URLSearchParams(location.search).toString()}` : ''}`);
  for (const [event, fn] of Object.entries(handlers)) {
    source.addEventListener(event, (e) => fn(JSON.parse(e.data)));
  }
  return source;
}

// ---------- small utilities ----------

export const $ = (sel, root = document) => root.querySelector(sel);

export function show(id) {
  for (const el of document.querySelectorAll('[data-screen]')) el.hidden = el.id !== id;
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

/** Disables a button while its async handler runs. */
export function busy(button, fn) {
  return async (...args) => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try { await fn(...args); } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };
}

// ---------- digits ----------

const TAMIL_ZERO = 0x0be6;
const DEVANAGARI_ZERO = 0x0966;

/** Which non-ASCII digit script, if any, appears in the text. */
export function nativeDigitScript(text) {
  if (/[௦-௯]/.test(text)) return 'tamil';
  if (/[०-९]/.test(text)) return 'devanagari';
  return null;
}

export function toAsciiDigits(text) {
  return text.replace(/[௦-௯०-९]/g, (ch) => {
    const cp = ch.codePointAt(0);
    return String(cp >= TAMIL_ZERO ? cp - TAMIL_ZERO : cp - DEVANAGARI_ZERO);
  });
}
