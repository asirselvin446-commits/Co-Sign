import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorNotice } from '../components/ErrorNotice';
import { downloadCsv, query } from '../download';
import { explain, type Explained } from '../errors';
import { usePaged } from '../usePaged';
import { ACTION_KEYS, STEPUP_STATUSES, actionName, ruleName, shortId, statusName, statusTone, when } from '../labels';

interface Stepup {
  id: string;
  userId: string;
  deviceId: string;
  action: string;
  status: string;
  score: number;
  needsGuardian: boolean;
  ruleSetVersion: number;
  rules: Array<{ key: string; weight: number }>;
  createdAt: string;
  resolvedAt: string | null;
  failureCode: string | null;
  decisions: Array<{ decision: string; responseMs: number; createdAt: string }>;
}

export function StepupsPage() {
  const [filters, setFilters] = useState({ status: '', action: '', guarded: '' });
  const list = usePaged<Stepup>(`/v1/admin/stepups${query(filters)}`, 'cursor', 'nextCursor');
  const [error, setError] = useState<Explained | null>(null);
  const { items, loading } = list;

  async function exportCsv() {
    try {
      await downloadCsv(`/v1/admin/stepups/export.csv${query(filters)}`, 'cosign-stepups.csv');
    } catch (e) {
      setError(explain(e));
    }
  }

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Step-ups</h1>
          <p>Sensitive actions, their risk score and who approved them. Action details stay encrypted.</p>
        </div>
        <button onClick={exportCsv}>Export CSV</button>
      </div>
      <ErrorNotice error={error ?? list.error} />
      <div className="card filters" role="search" aria-label="Filter step-ups">
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={filters.status} onChange={set('status')}>
            <option value="">Any</option>
            {STEPUP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusName(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-action">Action</label>
          <select id="f-action" value={filters.action} onChange={set('action')}>
            <option value="">Any</option>
            {ACTION_KEYS.map((a) => (
              <option key={a} value={a}>
                {actionName(a)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-guarded">Guardian</label>
          <select id="f-guarded" value={filters.guarded} onChange={set('guarded')}>
            <option value="">Any</option>
            <option value="true">Guardian needed</option>
            <option value="false">Passkey only</option>
          </select>
        </div>
      </div>
      <section className="card table-wrap">
        <table>
          <caption className="sr-only">Step-up requests, newest first</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Action</th>
              <th scope="col">Account</th>
              <th scope="col">Score</th>
              <th scope="col">Signals</th>
              <th scope="col">Guardians</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{when(s.createdAt)}</td>
                <td>{actionName(s.action)}</td>
                <td>
                  <Link className="mono" to={`/users?q=${s.userId}`} title={s.userId}>
                    {shortId(s.userId)}
                  </Link>
                </td>
                <td>
                  <strong>{s.score}</strong>
                  {s.needsGuardian && <span className="hint"> · guardian</span>}
                  <div className="hint">rules v{s.ruleSetVersion}</div>
                </td>
                <td>{s.rules.length ? s.rules.map((r) => `${ruleName(r.key)} (+${r.weight})`).join(', ') : <span className="hint">None</span>}</td>
                <td>
                  {s.decisions.length === 0
                    ? '—'
                    : s.decisions.map((d, i) => (
                        <div key={i}>
                          {d.decision === 'approve' ? 'Approved' : 'Denied'} <span className="hint">in {Math.round(d.responseMs / 1000)} s</span>
                        </div>
                      ))}
                </td>
                <td>
                  <span className={`pill ${statusTone(s.status)}`}>{statusName(s.status)}</span>
                  {s.failureCode && <div className="hint mono">{s.failureCode}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && <p className="hint">No step-ups match these filters.</p>}
        {loading && <p role="status">Loading…</p>}
        {list.hasMore && (
          <button style={{ marginTop: 12 }} onClick={list.loadMore}>
            Load more
          </button>
        )}
      </section>
    </>
  );
}
