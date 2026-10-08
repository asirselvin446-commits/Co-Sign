import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { ErrorNotice } from '../components/ErrorNotice';
import { explain, type Explained } from '../errors';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Explained | null>(null);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await login();
      navigate('/', { replace: true });
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <section className="card auth-card" aria-labelledby="login-title">
        <div className="brand" style={{ marginBottom: 12 }}>
          <img src="/favicon.svg" alt="" />
          <span>Co-Sign Security Console</span>
        </div>
        <h1 id="login-title">Sign in</h1>
        <p>Use the passkey you registered for this console. No password is needed.</p>
        <ErrorNotice error={error} />
        <button className="primary" onClick={onSignIn} disabled={busy} aria-busy={busy}>
          {busy ? 'Waiting for your passkey…' : 'Sign in with passkey'}
        </button>
        <p className="hint" style={{ marginTop: 16 }}>
          New staff member? Open the one-time invite link you were sent.
        </p>
      </section>
    </div>
  );
}
