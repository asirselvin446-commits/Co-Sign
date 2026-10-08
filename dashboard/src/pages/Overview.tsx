import { useState } from 'react';
import { ErrorNotice } from '../components/ErrorNotice';
import { StepupChart, TopRulesChart, type DailyPoint } from '../components/Charts';
import { useRealtime } from '../realtime';
import { useApi } from '../useApi';

export interface FeedEvent {
  id: string;
  createdAt: string;
  action: string;
  actorType: string;
  subjectType: string | null;
}

interface Overview {
  window: { days: number; start: string; timezone: string };
  totals: { activeUsers: number; activeDevices: number; activeGuardianLinks: number; openRecoveries: number };
  stepups: { byStatus: Record<string, number>; daily: DailyPoint[] };
  guardians: { approved: number; denied: number; medianResponseMs: number | null };
  risk: { assessments: number; topRules: Array<{ key: string; count: number }>; ruleSetVersion: number; guardianThreshold: number };
  recoveries: { started: number; completed: number; cancelled: number };
}

const MAX = 200;

export function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  useRealtime<FeedEvent>('audit.event', (e) => setEvents((prev) => [e, ...prev].slice(0, MAX)));
  return (
    <section className="card" aria-labelledby="feed-h">
      <h2 id="feed-h">Live events</h2>
      {events.length === 0 ? (
        <p className="hint">Waiting for activity. New sign-ins, step-ups and recoveries appear here as they happen.</p>
      ) : (
        <ul className="feed" aria-live="polite" aria-relevant="additions">
          {events.map((e) => (
            <li key={e.id}>
              <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleTimeString()}</time>
              <span>
                <span className="mono">{e.action}</span> <span className="hint">by {e.actorType}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function seconds(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  return s < 120 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export function OverviewPage() {
  const [days, setDays] = useState(14);
  const { data: o, error } = useApi<Overview>(`/v1/admin/overview?days=${days}`);
  const decisions = o ? o.guardians.approved + o.guardians.denied : 0;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Authentication and co-sign activity{o ? ` (days in ${o.window.timezone})` : ''}.</p>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="days">Period</label>
          <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 160 }}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>
      <ErrorNotice error={error} />
      {o && (
        <div className="stack">
          <div className="grid cols-4">
            <Stat label="Active accounts" value={o.totals.activeUsers} hint={`${o.totals.activeDevices} ${o.totals.activeDevices === 1 ? 'phone' : 'phones'}`} />
            <Stat label="Guardian links" value={o.totals.activeGuardianLinks} />
            <Stat
              label="Guardian decisions"
              value={decisions}
              hint={decisions ? `${o.guardians.denied} denied · median ${seconds(o.guardians.medianResponseMs)}` : 'None in this period'}
            />
            <Stat
              label="Open recoveries"
              value={o.totals.openRecoveries}
              hint={`${o.recoveries.started} started · ${o.recoveries.completed} completed · ${o.recoveries.cancelled} cancelled`}
            />
            <Stat label="Risk rules" value={`v${o.risk.ruleSetVersion}`} hint={`Guardian needed at score ${o.risk.guardianThreshold}`} />
          </div>
          <div className="grid cols-2">
            <StepupChart daily={o.stepups.daily} />
            <TopRulesChart rules={o.risk.topRules} assessments={o.risk.assessments} />
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <LiveFeed />
      </div>
    </>
  );
}
