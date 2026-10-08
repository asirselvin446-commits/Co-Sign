import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth';
import { ErrorNotice } from '../components/ErrorNotice';
import { explain, type Explained } from '../errors';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invite = params.get('invite') ?? '';
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Explained | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(invite, handle.trim().toLowerCase(), displayName.trim());
      navigate('/', { replace: true });
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <section className="card auth-card" aria-labelledby="reg-title">
        <h1 id="reg-title">Create your console passkey</h1>
        {!invite ? (
          <ErrorNotice error={{ code: 'INVITE_INVALID', cause: 'This page needs a one-time invite link.', next: 'Ask an administrator to send you an invite.' }} />
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <ErrorNotice error={error} />
            <div className="field">
              <label htmlFor="handle">Username</label>
              <input
                id="handle"
                autoComplete="username webauthn"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
                pattern="[a-z][a-z0-9._-]{2,39}"
                aria-describedby="handle-hint"
              />
              <div className="hint" id="handle-hint">
                Lowercase letters, numbers, dots, dashes. Shown in the audit log.
              </div>
            </div>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <button className="primary" type="submit" disabled={busy || !handle || !displayName} aria-busy={busy}>
              {busy ? 'Waiting for your passkey…' : 'Create passkey'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
