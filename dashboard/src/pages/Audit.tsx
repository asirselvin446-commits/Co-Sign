import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { ErrorNotice } from '../components/ErrorNotice';
import { downloadCsv, query } from '../download';
import { explain, type Explained } from '../errors';
import { when } from '../labels';
import { usePaged } from '../usePaged';

interface AuditRow {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  payload: unknown;
  hash: string;
}

interface Verification {
  ok: boolean;
  checked: number;
  headHash: string;
  brokenAtId: string | null;
  reason: string | null;
}

const ACTOR_TYPES = ['user', 'guardian', 'admin', 'device', 'system', 'anonymous'];

export function AuditPage() {
  const [params] = useSearchParams();
  const [draft, setDraft] = useState({ action: '', actorType: '', subjectId: params.get('subject') ?? '' });
  const [filters, setFilters] = useState(draft);
  const list = usePaged<AuditRow>(`/v1/admin/audit${query(filters)}`, 'before', 'nextBefore');
  const { items, loading } = list;
  const [error, setError] = useState<Explained | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);

  async function verify() {
    setVerifying(true);
    setError(null);
    try {
      setVerification(await api<Verification>('POST', '/v1/admin/audit/verify'));
    } catch (e) {
      setError(explain(e));
    } finally {
      setVerifying(false);
    }
  }

  async function exportCsv() {
    try {
      await downloadCsv(`/v1/admin/audit/export.csv${query(filters)}`, 'cosign-audit.csv');
    } catch (e) {
      setError(explain(e));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every security event, hash-chained so any later change is detectable.</p>
        </div>
        <div className="row">
          <button onClick={exportCsv}>Export CSV</button>
          <button className="primary" onClick={verify} disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify chain'}
          </button>
        </div>
      </div>
      <ErrorNotice error={error ?? list.error} />
      {verification &&
        (verification.ok ? (
          <div className="alert ok" role="status">
            <strong>Chain intact: all {verification.checked.toLocaleString()} events verified.</strong>
            <span className="mono">Head {verification.headHash}</span>
          </div>
        ) : (
          <div className="alert" role="alert">
            <strong>
              Chain broken at event {verification.brokenAtId} ({verification.reason === 'hash_mismatch' ? 'contents changed' : 'link changed'}).
            </strong>
            <span>
              {verification.checked.toLocaleString()} earlier events are intact. Treat this as a security incident and follow the runbook.
            </span>
          </div>
        ))}
      <form
        className="card filters"
        role="search"
        aria-label="Filter audit events"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        <div className="field">
          <label htmlFor="a-action">Action starts with</label>
          <input id="a-action" value={draft.action} placeholder="stepup." onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="a-actor">Actor</label>
          <select id="a-actor" value={draft.actorType} onChange={(e) => setDraft({ ...draft, actorType: e.target.value })}>
            <option value="">Any</option>
            {ACTOR_TYPES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-subject">Subject ID</label>
          <input id="a-subject" value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value.trim() })} />
        </div>
        <button type="submit">Apply</button>
      </form>
      <section className="card table-wrap">
        <table>
          <caption className="sr-only">Audit events, newest first</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">When</th>
              <th scope="col">Action</th>
              <th scope="col">Actor</th>
              <th scope="col">Subject</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.id}</td>
                <td>{when(r.createdAt)}</td>
                <td className="mono">{r.action}</td>
                <td>
                  {r.actorType}
                  {r.actorId && <div className="hint mono">{r.actorId.slice(0, 8)}</div>}
                </td>
                <td>
                  {r.subjectType ?? '—'}
                  {r.subjectId && (
                    <div>
                      <button className="link mono" onClick={() => {
                          const next = { ...draft, subjectId: r.subjectId! };
                          setDraft(next);
                          setFilters(next);
                        }} title="Show only this subject">
                        {r.subjectId.slice(0, 8)}
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  <details>
                    <summary>Payload</summary>
                    <pre className="mono payload">{JSON.stringify(r.payload, null, 2)}</pre>
                    <div className="hint mono">hash {r.hash}</div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && <p className="hint">No events match these filters.</p>}
        {loading && <p role="status">Loading…</p>}
        {list.hasMore && (
          <button style={{ marginTop: 12 }} onClick={list.loadMore}>
            Load older
          </button>
        )}
      </section>
    </>
  );
}
