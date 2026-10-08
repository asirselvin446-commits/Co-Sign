import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import { ErrorNotice } from '../components/ErrorNotice';
import { explain, type Explained } from '../errors';
import { actionName, shortId, statusName, statusTone, when } from '../labels';

interface Account {
  id: string;
  handle: string;
  locale: string;
  status: string;
  createdAt: string;
  deletedAt: string | null;
  hasPhone: boolean;
  phoneVerified: boolean;
  hasEmail: boolean;
  signalConsent: boolean;
  passkeys: { active: number; revoked: number };
  devices: Array<{
    id: string;
    platform: string;
    appVersion: string | null;
    enrolledAt: string;
    lastSeenAt: string;
    revokedAt: string | null;
    revokeReason: string | null;
    integrityVerdict: string | null;
    simChangedAt: string | null;
  }>;
  guardians: Array<{ linkId: string; guardianId: string; status: string; activatesAt: string; removesAt: string | null }>;
  guardingCount: number;
  recentStepups: Array<{ id: string; action: string; status: string; score: number; needsGuardian: boolean; createdAt: string }>;
  recoveries: Array<{ id: string; status: string; requiredApprovals: number; approvals: number; createdAt: string }>;
}

const languages: Record<string, string> = { en: 'English', ta: 'Tamil', hi: 'Hindi' };
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [seenQ, setSeenQ] = useState(q);
  const [result, setResult] = useState<{ q: string; account: Account | null; error: Explained | null } | null>(null);

  // Following a link to another account (e.g. a guardian) changes q: show it in the search box too.
  if (q !== seenQ) {
    setSeenQ(q);
    setInput(q);
  }

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    api<Account>('GET', `/v1/admin/users/lookup?q=${encodeURIComponent(q)}`).then(
      (account) => {
        if (!cancelled) setResult({ q, account, error: null });
      },
      (e: unknown) => {
        if (!cancelled) setResult({ q, account: null, error: explain(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [q]);

  const loading = !!q && result?.q !== q;
  const current = q && result?.q === q ? result : null;
  const account = current?.account ?? null;
  const error = current?.error ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p>Look up one account for support. Names, phone numbers and email addresses are never shown, and every lookup is audited.</p>
        </div>
      </div>
      <form
        className="card filters"
        role="search"
        aria-label="Find an account"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) setParams({ q: input.trim() });
        }}
      >
        <div className="field" style={{ flex: '1 1 320px' }}>
          <label htmlFor="lookup">Username or account ID</label>
          <input id="lookup" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <button type="submit" className="primary">
          Look up
        </button>
      </form>
      <ErrorNotice error={error} />
      {loading && <p role="status">Loading…</p>}
      {account && !loading && (
        <div className="stack">
          <section className="card" aria-labelledby="acct-h">
            <h2 id="acct-h">
              @{account.handle}{' '}
              <span className={`pill ${account.status === 'active' ? 'ok' : 'bad'}`}>{account.status === 'active' ? 'Active' : 'Deleted'}</span>
            </h2>
            <dl className="facts">
              <dt>Account ID</dt>
              <dd className="mono">{account.id}</dd>
              <dt>Since</dt>
              <dd>{when(account.createdAt)}</dd>
              <dt>Language</dt>
              <dd>{languages[account.locale] ?? account.locale}</dd>
              <dt>Passkeys</dt>
              <dd>
                {account.passkeys.active} active{account.passkeys.revoked ? `, ${account.passkeys.revoked} revoked` : ''}
              </dd>
              <dt>Phone number</dt>
              <dd>{account.hasPhone ? (account.phoneVerified ? 'Verified' : 'Not verified') : 'None'}</dd>
              <dt>Email</dt>
              <dd>{yesNo(account.hasEmail)}</dd>
              <dt>Risk-signal consent</dt>
              <dd>{account.signalConsent ? 'Granted' : <span className="pill warn">Not granted</span>}</dd>
              <dt>Guards others</dt>
              <dd>{account.guardingCount}</dd>
            </dl>
            <p className="row" style={{ marginTop: 8 }}>
              <Link to={`/audit?subject=${account.id}`}>Audit events for this account</Link>
            </p>
          </section>

          <section className="card table-wrap" aria-labelledby="dev-h">
            <h2 id="dev-h">Phones</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Phone</th>
                  <th scope="col">Added</th>
                  <th scope="col">Last seen</th>
                  <th scope="col">Integrity</th>
                  <th scope="col">SIM changed</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {account.devices.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.platform} {d.appVersion && <span className="hint">app {d.appVersion}</span>}
                      <div className="hint mono">{shortId(d.id)}</div>
                    </td>
                    <td>{when(d.enrolledAt)}</td>
                    <td>{when(d.lastSeenAt)}</td>
                    <td>{d.integrityVerdict === 'fail' ? <span className="pill bad">Failed</span> : (d.integrityVerdict ?? '—')}</td>
                    <td>{when(d.simChangedAt)}</td>
                    <td>{d.revokedAt ? <span className="pill bad">Removed ({d.revokeReason ?? 'revoked'})</span> : <span className="pill ok">Active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid cols-2">
            <section className="card table-wrap" aria-labelledby="g-h">
              <h2 id="g-h">Guardians</h2>
              {account.guardians.length === 0 ? (
                <p className="hint">No guardians. High-risk actions cannot be co-signed.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Guardian</th>
                      <th scope="col">Status</th>
                      <th scope="col">Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.guardians.map((g) => (
                      <tr key={g.linkId}>
                        <td>
                          <Link className="mono" to={`/users?q=${g.guardianId}`}>
                            {shortId(g.guardianId)}
                          </Link>
                        </td>
                        <td>{g.status.replace(/_/g, ' ')}</td>
                        <td>{when(g.activatesAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card table-wrap" aria-labelledby="r-h">
              <h2 id="r-h">Recoveries</h2>
              {account.recoveries.length === 0 ? (
                <p className="hint">No recoveries.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Started</th>
                      <th scope="col">Approvals</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.recoveries.map((r) => (
                      <tr key={r.id}>
                        <td>{when(r.createdAt)}</td>
                        <td>
                          {r.approvals} of {r.requiredApprovals}
                        </td>
                        <td>{r.status.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card table-wrap" aria-labelledby="s-h">
            <h2 id="s-h">Recent step-ups</h2>
            {account.recentStepups.length === 0 ? (
              <p className="hint">No step-ups.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Score</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {account.recentStepups.map((s) => (
                    <tr key={s.id}>
                      <td>{when(s.createdAt)}</td>
                      <td>{actionName(s.action)}</td>
                      <td>
                        {s.score}
                        {s.needsGuardian && <span className="hint"> · guardian</span>}
                      </td>
                      <td>
                        <span className={`pill ${statusTone(s.status)}`}>{statusName(s.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </>
  );
}
