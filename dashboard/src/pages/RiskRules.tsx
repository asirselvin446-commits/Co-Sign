import { useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorNotice } from '../components/ErrorNotice';
import { explain, type Explained } from '../errors';
import { ruleName, when } from '../labels';
import { useApi } from '../useApi';

interface Rule {
  key: string;
  weight: number;
  enabled: boolean;
  reasons: { en: string; ta: string; hi: string };
}
interface Version {
  version: number;
  guardianThreshold: number;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}
interface RuleSet extends Version {
  rules: Rule[];
}
interface Draft {
  guardianThreshold: number;
  rules: Rule[];
}
interface Preview {
  days: number;
  activeVersion: number;
  assessed: number;
  truncated: boolean;
  guardedBefore: number;
  guardedAfter: number;
  newlyGuarded: number;
  noLongerGuarded: number;
  unobservable: string[];
}

const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'ta', name: 'Tamil' },
  { code: 'hi', name: 'Hindi' },
] as const;

const toDraft = (s: Pick<RuleSet, 'guardianThreshold' | 'rules'>): Draft => ({
  guardianThreshold: s.guardianThreshold,
  rules: s.rules.map((r) => ({ ...r, reasons: { ...r.reasons } })),
});

export function RiskRulesPage() {
  const { admin } = useAuth();
  const canPublish = admin?.role === 'admin';
  const res = useApi<{ active: RuleSet; versions: Version[] }>('/v1/admin/risk/rules');
  const active = res.data?.active;
  // Edits are keyed to the live version they started from, so publishing (or someone else's
  // publish being reloaded) resets the editor to the new live rules.
  const [edit, setEdit] = useState<{ base: number; draft: Draft; loadedFrom: number | null } | null>(null);
  const liveDraft = useMemo(() => (active ? toDraft(active) : null), [active]);
  const draft = active && edit?.base === active.version ? edit.draft : liveDraft;
  const loadedFrom = active && edit?.base === active.version ? edit.loadedFrom : null;
  const setDraft = (d: Draft, from: number | null = loadedFrom) => {
    if (active) setEdit({ base: active.version, draft: d, loadedFrom: from });
  };
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<Explained | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(liveDraft), [draft, liveDraft]);
  const maxScore = draft ? draft.rules.filter((r) => r.enabled).reduce((n, r) => n + r.weight, 0) : 0;
  const thresholdUnreachable = !!draft && maxScore < draft.guardianThreshold;

  function patchRule(key: string, patch: Partial<Rule>) {
    if (draft) setDraft({ ...draft, rules: draft.rules.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
    setPreview(null);
  }

  async function runPreview() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await api<Preview>('POST', '/v1/admin/risk/rules/preview', { draft, days: 30 }));
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!draft || !active) return;
    if (!window.confirm(`Publish these rules as version ${active.version + 1}? They apply to every new assessment within seconds.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ version: number }>('POST', '/v1/admin/risk/rules', { baseVersion: active.version, note, draft });
      setPublished(r.version);
      setNote('');
      setPreview(null);
      res.reload();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadVersion(version: number) {
    setError(null);
    try {
      const v = await api<RuleSet>('GET', `/v1/admin/risk/rules/${version}`);
      setDraft(toDraft(v), version);
      setPreview(null);
      document.getElementById('editor-h')?.focus();
    } catch (e) {
      setError(explain(e));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Risk rules</h1>
          <p>
            Each matching signal adds its weight to the score. At or above the threshold, a guardian must approve.
            {!canPublish && ' You can try changes and preview their impact; only administrators can publish.'}
          </p>
        </div>
      </div>
      <ErrorNotice error={error ?? res.error} />
      {error?.code === 'RULES_CHANGED' && (
        <p>
          <button onClick={() => res.reload()}>Reload latest rules</button>
        </p>
      )}
      {published && (
        <div className="alert ok" role="status">
          <strong>Version {published} is live.</strong>
          <span>New assessments use it from now on. The change is recorded in the audit log.</span>
        </div>
      )}
      {active && draft && (
        <div className="stack">
          <section className="card" aria-labelledby="editor-h">
            <h2 id="editor-h" tabIndex={-1}>
              {loadedFrom ? `Draft from version ${loadedFrom}` : dirty ? 'Draft' : `Version ${active.version} (live)`}
            </h2>
            <p className="hint">
              Live: version {active.version}, published {when(active.createdAt)}
              {active.createdBy ? ` by ${active.createdBy}` : ''}
              {active.note ? ` — “${active.note}”` : ''}
            </p>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="threshold">Guardian threshold</label>
              <input
                id="threshold"
                type="number"
                min={1}
                max={500}
                value={draft.guardianThreshold}
                onChange={(e) => {
                  setDraft({ ...draft, guardianThreshold: Number(e.target.value) });
                  setPreview(null);
                }}
              />
              {thresholdUnreachable && (
                <p className="hint warn-text" role="status">
                  All enabled rules together reach only {maxScore}: no action would ever need a guardian.
                </p>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Risk rules</caption>
                <thead>
                  <tr>
                    <th scope="col">On</th>
                    <th scope="col">Signal</th>
                    <th scope="col">Weight</th>
                    <th scope="col">What the person hears</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rules.map((r) => {
                    const live = active.rules.find((a) => a.key === r.key);
                    const changed = !live || live.weight !== r.weight || live.enabled !== r.enabled;
                    return (
                      <tr key={r.key} className={changed ? 'changed' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            aria-label={`${ruleName(r.key)} enabled`}
                            onChange={(e) => patchRule(r.key, { enabled: e.target.checked })}
                          />
                        </td>
                        <td>
                          {ruleName(r.key)}
                          <div className="hint mono">{r.key}</div>
                          {changed && live && (
                            <div className="hint">
                              was {live.enabled ? live.weight : 'off'}
                            </div>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={200}
                            value={r.weight}
                            aria-label={`${ruleName(r.key)} weight`}
                            onChange={(e) => patchRule(r.key, { weight: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <details>
                            <summary>{r.reasons.en}</summary>
                            {LANGS.map((l) => (
                              <div className="field" key={l.code}>
                                <label htmlFor={`${r.key}-${l.code}`}>{l.name}</label>
                                <textarea
                                  id={`${r.key}-${l.code}`}
                                  rows={2}
                                  lang={l.code}
                                  value={r.reasons[l.code]}
                                  onChange={(e) => patchRule(r.key, { reasons: { ...r.reasons, [l.code]: e.target.value } })}
                                />
                              </div>
                            ))}
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={runPreview} disabled={busy}>
                Preview impact
              </button>
              <button
                onClick={() => {
                  setEdit(null);
                  setPreview(null);
                }}
                disabled={!dirty}
              >
                Discard changes
              </button>
            </div>

            {preview && (
              <div className="alert ok preview" role="status" style={{ marginTop: 14 }}>
                <strong>
                  Over the last {preview.days} days ({preview.assessed.toLocaleString()} step-ups{preview.truncated ? ', newest only' : ''}), a guardian
                  would have been needed {preview.guardedAfter.toLocaleString()} times instead of {preview.guardedBefore.toLocaleString()}.
                </strong>
                <span>
                  {preview.newlyGuarded} more would pause for a guardian; {preview.noLongerGuarded} would no longer need one.
                </span>
                {preview.unobservable.length > 0 && (
                  <span>
                    Not counted: {preview.unobservable.map(ruleName).join(', ')}. These are off in the live rules, so past matches were never recorded.
                  </span>
                )}
              </div>
            )}

            {canPublish && (
              <div className="publish">
                <div className="field">
                  <label htmlFor="note">Reason for the change</label>
                  <input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. More screen-sharing scams reported" />
                  <p className="hint">Shown in the version history and the audit log.</p>
                </div>
                <button className="primary" onClick={publish} disabled={busy || !dirty || note.trim().length < 3}>
                  Publish version {active.version + 1}
                </button>
              </div>
            )}
          </section>

          <section className="card table-wrap" aria-labelledby="history-h">
            <h2 id="history-h">Version history</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Published</th>
                  <th scope="col">By</th>
                  <th scope="col">Threshold</th>
                  <th scope="col">Reason</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.data!.versions.map((v) => (
                  <tr key={v.version}>
                    <td>
                      v{v.version} {v.version === active.version && <span className="pill ok">Live</span>}
                    </td>
                    <td>{when(v.createdAt)}</td>
                    <td>{v.createdBy ?? 'System'}</td>
                    <td>{v.guardianThreshold}</td>
                    <td>{v.note ?? '—'}</td>
                    <td>
                      {v.version !== active.version && (
                        <button className="link" onClick={() => loadVersion(v.version)}>
                          Load into editor
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  );
}
