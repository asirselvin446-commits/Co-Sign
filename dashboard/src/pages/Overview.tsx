import { useState } from 'react';
import { useRealtime } from '../realtime';

export interface FeedEvent {
  id: string;
  createdAt: string;
  action: string;
  actorType: string;
  subjectType: string | null;
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

export function OverviewPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Live view of authentication activity.</p>
        </div>
      </div>
      <LiveFeed />
    </>
  );
}
