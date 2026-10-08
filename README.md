# SaathiAuth

Passkey sign-in that notices when someone is probably being scammed, pauses only the risky step, explains what is happening by voice in the user's language (English, Tamil, Hindi), and asks a trusted guardian, someone who is *not* on the scam call, to approve or deny it with their own passkey.

Normal sign-in stays one tap. Nothing to remember, no SMS fallback for login, no security questions.

## What's inside

| Page | Who it's for | What it does |
| --- | --- | --- |
| `/` | Account holder | Create an account with a passkey, sign in with no username, pay with an SMS code, run protected actions, invite guardians, recover a lost phone |
| `/guardian.html` | Guardian | Accept an invite, hold a separate passkey, get live requests with context, approve or deny by signing |
| `/dashboard.html` | Security team | Live audit log and counters: sign-ins, failures, pauses, approvals, denials, recoveries |

### How a risky action is handled

1. The risk engine adds up plain-language rules (`public/js/catalog.js`):

   | Signal | Points |
   | --- | --- |
   | On a call with an unknown number | +40 |
   | Remote-control app running | +30 |
   | Screen being shared | +30 |
   | SIM changed recently | +30 |
   | OTP pasted instead of typed | +15 |
   | Device added under 10 minutes ago | +20 |
   | Between midnight and 5 a.m. | +10 |
   | 3+ failures in 15 minutes | +15 |

2. **Below 50:** the user just re-confirms with their own passkey.
3. **50 or more:** the action is paused. Guardians get a live request (Server-Sent Events) that shows the action and the reasons.
4. The guardian signs a WebAuthn challenge equal to `sha256(requestId|action|userId|expiry|nonce|decision)` with **their own** passkey. Including the decision means a signed "deny" can never be replayed as an "approve". The nonce is rotated after every use.
5. After approval the user finishes with their own passkey, so both people must agree.
6. **No guardian, or no answer in time:** a cool-off delay starts, with alerts to the user's other sessions and to guardians. There is never a permanent lockout, and the user can cancel at any time.

### Failure explainer (tiered so it never helps an attacker)

Every failure shows one sentence about what happened and one next step, and reads them aloud.

- **Client-side, specific:** an OTP typed in Tamil (௦–௯) or Devanagari (०–९) digits gets a one-tap fix. Passkey prompt errors are each explained: cancelled or timed out (`NotAllowedError`), already registered (`InvalidStateError`), wrong address (`SecurityError`), and no passkey support (`NotSupportedError`).
- **Server-side, generic:** "wrong code", "expired code" and "couldn't sign you in with that passkey". Login is discoverable (`residentKey: 'required'`), so there is no username to probe.

### Lost phone

1. "I lost my phone" → enter the account name. The response is identical whether or not the account exists.
2. Guardians approve (2 if the account has 2+ guardians, otherwise 1).
3. A cancel window (`RECOVERY_DELAY_SECONDS`) opens. Any signed-in session of the real owner sees a red banner and can cancel.
4. The new phone registers a fresh passkey.

### Security notes

- Guardians never get account access. Their session holds no user id, and their only power is approve or deny on a step the user started.
- Every decision is written to the audit log and shown on the dashboard.
- The session is rotated on sign-in, cookies are `httpOnly` + `sameSite=lax`, there are strict CSP and frame headers, and OTPs are stored hashed with 5 attempts max.
- The relying-party ID and origin come from `Host` / `x-forwarded-proto`, so the same build works on localhost and through ngrok. **Pin `RP_ID` and `ORIGIN` in production.**

## Setup

Requires Node 22 or newer.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. Passkeys need a secure context: `localhost` counts, and plain-HTTP LAN IPs do not.

### Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | HTTP port |
| `GUARDIAN_WAIT_SECONDS` | 90 | Time guardians have before the cool-off starts |
| `COOL_OFF_SECONDS` | 120 | Cool-off delay when no guardian answers |
| `RECOVERY_DELAY_SECONDS` | 60 | Cancel window after guardians approve a recovery |
| `OTP_TTL_SECONDS` | 120 | Payment code lifetime |
| `RP_ID`, `ORIGIN` | from request | Pin the WebAuthn relying party |
| `SESSION_SECRET` | random per boot | Cookie signing secret |
| `DASHBOARD_KEY` | none | If set, the dashboard needs `?key=...` |
| `DATA_FILE` | `data/db.json` | JSON storage file (delete it to reset the demo) |

### Phone app signals

The "Simulated scam signals" panel calls `POST /api/signals`. A future Android companion can send the same JSON using the device key shown on the account page:

```bash
curl -X POST http://localhost:3000/api/signals -H "Content-Type: application/json" -H "x-signal-token: <device key>" -d "{\"unknownCall\": true, \"remoteAccess\": false, \"screenShare\": true, \"simChanged\": false}"
```

## Deployment (Render + Postgres)

Live at **https://saathiauth.onrender.com** (guardian: `/guardian.html`, desk: `/dashboard.html`).

**Why not Vercel:** the app needs one always-running server.
- Guardian alerts are pushed over long-lived Server-Sent Events connections.
- Cool-offs and recovery windows advance on a 1-second timer.
- All live state is in one process.

Serverless functions can't hold those connections or timers, and different requests can land on different instances. Render runs a normal Node process, so everything works exactly as it does locally.

**How it's set up** (also described in `render.yaml`):

| Piece | Setting |
| --- | --- |
| Web service `saathiauth` | Node, Singapore region, `npm ci --omit=dev` → `npm start`, auto-deploys on every push to `main` |
| Postgres `saathiauth-db` | Singapore region. When `DATABASE_URL` is set, the app stores its state in table `app_state` and sessions in `user_sessions`, so nothing is lost on restart or redeploy |
| `RP_ID` / `ORIGIN` | Pinned to `saathiauth.onrender.com`, so passkeys are bound to that domain |
| Session secret | Generated on first boot and stored with the state, unless `SESSION_SECRET` is set |

**Free-tier limits to know about:**
- The free web service sleeps after about 15 minutes without traffic. The first visit then takes 30–60 seconds. Open the site a minute before a demo, or switch to the Starter plan to avoid this.
- The free Postgres expires 30 days after creation. Upgrade it to a Basic plan in the Render dashboard to keep the data.

## Tests

End-to-end tests drive real WebAuthn ceremonies against Chromium's virtual authenticator (via the Chrome DevTools Protocol). Each "phone" is its own browser context with its own authenticator. They cover:

- register + login
- guardian invite + register (single use)
- high-risk step-up approved
- step-up denied
- cool-off plus cancel
- the Tamil-digit OTP explainer, in English and Tamil
- lost-phone recovery, including the identical response for unknown names
- the dashboard

```bash
npx playwright install chromium
```

```bash
npm test
```

If you already have a Chromium build, point the tests at it instead of downloading one: set `PW_CHROMIUM` to its `chrome.exe` path.

## Demo setup

### On one laptop (two browser windows)

1. Delete `data/db.json` for a clean start, then run `npm start`.
2. **Window A** (normal window, about half the screen): http://localhost:3000. This is Amma's phone.
3. **Window B** (a second Chrome profile, or a different browser): open the guardian invite link from window A. This is Selvin's phone.
4. **Window C** (optional, projector): http://localhost:3000/dashboard.html

On Windows Hello / macOS Touch ID both windows share the same platform authenticator, so the passkey picker may list both "Amma" and "Selvin (guardian)". Choose the matching one; picking the wrong one gets a friendly explanation.

### On a real phone (ngrok)

1. Run `npm start`, then `ngrok http 3000`.
2. Open the `https://….ngrok-free.app` URL on the laptop (Amma) **and** on the phone (Selvin). Use the same URL everywhere, because passkeys are bound to that exact domain.
3. Free ngrok URLs change on every restart, and passkeys made on an old URL stop working. Register everything again after a restart, or use a reserved domain and set `RP_ID` / `ORIGIN`.
4. To make Selvin's phone buzz on stage, keep the guardian page in the foreground (it vibrates on Android when a request arrives).

### Before you go on stage

- Install the Tamil voice: Windows Settings → Time & language → Speech → add Tamil. On Android, Google TTS → install Tamil. Without it, messages are still shown as text and a note says so.
- Create Amma's account and add Selvin as guardian beforehand, so the demo starts at "Normal day".
- Have a pre-recorded "CBI officer" call audio ready to play from a second phone.

## 3-minute demo script

**0:00, the problem (20 s).**
"Every bank tells Amma: never share your OTP. But when a fake 'CBI officer' keeps her on a call for two hours, she's frightened and alone, and warnings don't work on frightened people. Passkeys fixed easy logins. Nobody fixed the moment of fear, the confusing failure, or the lost phone."

**0:20, a normal day (20 s).**
Window A: tap **Sign in with my passkey** and use your fingerprint. "One tap. Nothing to remember. Security you don't feel."

**0:40, a confusing failure (35 s).**
Switch language to **தமிழ்**. Tap **Send code**; the SMS appears in the dashed "Simulated SMS" panel. Type the code with a Tamil keyboard (or paste ௪௮௨…). The app explains aloud in Tamil that the keyboard typed Tamil digits and offers **0–9 ஆக மாற்று**. Tap it, confirm, done. "Every failure explains itself. It only says what's safe to say."

**1:15, the scam (80 s).**
Play the recorded "This is CBI, your Aadhaar is linked to money laundering…" audio. Switch on **On a call with an unknown number** and **The screen is being shared** in the dashed demo panel ("in real use, the phone reports these"). The "officer" says "add a new device." Tap **Add a new device**.
The turmeric band takes over and speaks: *paused for your safety; no real police officer asks you to do this on a call; we've asked Selvin to check.*
Selvin's phone buzzes and shows exactly what was noticed. He taps **Deny** and signs with his own fingerprint. Amma's screen says *Selvin said no. Hang up, it was a scam.* The dashboard shows "Guardian denied … (signed with passkey)".
"The scammer can't talk his way past a person who isn't on the call."

**2:35, the lost phone (15 s, if time allows).**
New window → **I lost my phone** → "Amma". Selvin approves; Amma's old session shows a red "cancel" banner and a countdown; the new phone creates a passkey. "No SMS. No security questions. No help-desk call to social-engineer."

**2:50, close (10 s).**
"Same security against the attacker, less difficulty for Amma, and a calm person in the loop at the exact moment fear takes over. Security and usability are one problem, and this is one answer."

## Project layout

```
server/
  index.js          Express app, SSE endpoint, static files
  config.js         Timers from env
  db.js             JSON-file storage
  webauthn.js       SimpleWebAuthn wrapper, RP derivation
  risk.js           Rules engine
  requests.js       Step-up + recovery state machines, guardian challenge, timer
  audit.js          Audit log + counters
  sse.js            Server-Sent Events hub
  routes/           user, actions, guardian, recovery
public/
  index.html, guardian.html, dashboard.html
  css/app.css
  js/catalog.js     Risk rules + action names (shared with the server)
  js/i18n.js        UI text + failure explanations (en/ta/hi)
  js/common.js      API, passkeys, voice, live messages
  js/app.js, guardian.js, dashboard.js
tests/e2e.spec.js   Playwright + virtual authenticator
```

The Tamil and Hindi text should be reviewed by native speakers before real users see it.
