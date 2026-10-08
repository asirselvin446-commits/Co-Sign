# Deploying Co-Sign: Render + Supabase + Firebase

| Piece | Where | Plan |
|---|---|---|
| API + security console (one Docker service) | Render `co-sign-api`, Singapore | Free |
| Redis (rate limits, challenges, realtime) | Render Key Value `co-sign-redis`, Singapore | Free |
| PostgreSQL | Supabase project `co-sign` (`gvextlfilsdjsbejzsqv`), Mumbai | Free |
| Push notifications | Firebase Cloud Messaging | Free |

Secrets are never committed. Render generates `JWT_SECRET`, `DATA_ENCRYPTION_KEY` and
`BLIND_INDEX_KEY`; you enter the rest in the Render and GitHub dashboards.

Already done in Supabase: a login role `cosign_app` (no password yet) that owns a private
schema `cosign`. Co-Sign's tables live there, outside Supabase's auto-generated REST API.

## 1. Supabase: give the backend a password

1. Supabase Dashboard → project **co-sign** → **SQL Editor**, run (use a long random password of
   letters and digits only, so it needs no URL escaping):
   ```sql
   ALTER ROLE cosign_app WITH PASSWORD 'replace-with-a-long-random-password';
   ```
2. **Connect** (top bar) → **Session pooler**. Copy the host, e.g. `aws-1-ap-south-1.pooler.supabase.com`.
   Render cannot reach Supabase's direct host (IPv6 only), so the pooler is required.
3. Your `DATABASE_URL` is:
   ```
   postgresql://cosign_app.gvextlfilsdjsbejzsqv:PASSWORD@POOLER-HOST:5432/postgres?schema=cosign&sslmode=require&connection_limit=5
   ```

## 2. Android signing key (once, keep it safe)

Passkeys only work for an app whose signing certificate the server lists. On your computer
(the `keytool` from Flutter's Java works):

```
keytool -genkeypair -v -keystore cosign-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias cosign
keytool -list -v -keystore cosign-release.jks -alias cosign
```

Copy the `SHA256:` line (`AB:CD:…`, 32 pairs). In GitHub → repository **Settings → Secrets and
variables → Actions**, add these secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cosign-release.jks"))` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `cosign` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password unless you chose another) |

Losing this keystore means existing installs cannot be updated; back it up.

## 3. Firebase (push notifications)

1. [Firebase console](https://console.firebase.google.com) → create a project (Analytics not needed).
2. **Add app → Android**, package name `app.cosign.mobile`, add the SHA-256 from step 2.
   Download `google-services.json` and save its full contents as the GitHub secret
   `GOOGLE_SERVICES_JSON`.
3. **Project settings → Service accounts → Generate new private key**. Base64-encode the
   downloaded JSON (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))`);
   this is `FIREBASE_SERVICE_ACCOUNT_BASE64` for Render. Delete the JSON file afterwards.

## 4. Render: apply the Blueprint

1. Render Dashboard → **New → Blueprint** → repository **Co-Sign**, branch
   `claude/compassionate-feynman-u6tib2` (or `main` once that branch is merged).
2. Render reads `render.yaml` and asks for:
   - `DATABASE_URL` from step 1
   - `ANDROID_SHA256_CERT_FINGERPRINTS` from step 2
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` from step 3
3. **Apply**. The first build takes several minutes; migrations run automatically on start.
4. Open **co-sign-api → Logs** and find *"No staff accounts yet"*. Open that one-time link
   (valid 24 h) to create the first administrator with a passkey. Further staff are invited
   from the console's Staff page. You can then set `BOOTSTRAP_ADMIN_INVITE` to `false`.
5. Check `https://co-sign-api.onrender.com/.well-known/assetlinks.json` lists your SHA-256
   (use the service's actual URL if Render added a suffix).

## 5. Build the app for this server

GitHub → **Settings → Secrets and variables → Actions → Variables**: add `API_BASE_URL` =
the service URL (e.g. `https://co-sign-api.onrender.com`). Then **Actions → Android APK → Run
workflow**. The run summary shows the signing SHA-256, which must match step 2.

## Free-tier behaviour

- Render free web services sleep after ~15 minutes without traffic; the next request takes
  up to a minute. Timers (cool-off, guardian-change delays) run only while it is awake.
- Render free Key Value is not persisted: a restart signs staff out of the live feed and drops
  in-flight challenges, nothing else.
- Supabase pauses free projects after a week without activity; restore from its dashboard.
- The old `saathiauth` Render service deploys `main` with the previous app's commands and will
  fail on new commits; suspend or delete it in the Render Dashboard.
