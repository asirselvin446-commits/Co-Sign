import { useEffect, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ruleName } from '../labels';

// Two categorical slots validated (CVD + contrast) against this console's light and dark surfaces.
const palettes = {
  light: { s1: '#2a78d6', s2: '#eb6834', surface: '#ffffff', grid: '#e4e7ec', text: '#4a5361', ink: '#14181f' },
  dark: { s1: '#3987e5', s2: '#d95926', surface: '#171b21', grid: '#2d343e', text: '#a7b0bd', ink: '#e8ebf0' },
};

function useChartColors() {
  const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  return dark ? palettes.dark : palettes.light;
}

/** A chart card with a "Show table" toggle, so every figure has a non-visual equivalent. */
function ChartCard({ id, title, summary, chart, table }: { id: string; title: string; summary: string; chart: ReactNode; table: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <div className="chart-head">
        <div>
          <h2 id={`${id}-h`}>{title}</h2>
          <p className="hint">{summary}</p>
        </div>
        <button className="link" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {asTable ? <div className="table-wrap">{table}</div> : <div aria-hidden="true">{chart}</div>}
    </section>
  );
}

export interface DailyPoint {
  day: string;
  total: number;
  guarded: number;
  denied: number;
  completed: number;
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function StepupChart({ daily }: { daily: DailyPoint[] }) {
  const c = useChartColors();
  const data = daily.map((d) => ({ ...d, label: dayLabel(d.day), passkeyOnly: d.total - d.guarded }));
  const total = daily.reduce((n, d) => n + d.total, 0);
  const guarded = daily.reduce((n, d) => n + d.guarded, 0);
  const tick = { fill: c.text, fontSize: 12 };
  return (
    <ChartCard
      id="stepups-chart"
      title="Sensitive actions per day"
      summary={`${total} step-ups, ${guarded} of them paused for a guardian.`}
      chart={
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={12} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.4 }}
              contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, color: c.ink }}
              labelStyle={{ color: c.ink, fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} formatter={(value: string) => <span style={{ color: c.text }}>{value}</span>} />
            <Bar dataKey="passkeyOnly" name="Passkey only" stackId="s" fill={c.s1} stroke={c.surface} strokeWidth={2} maxBarSize={24} />
            <Bar dataKey="guarded" name="Guardian needed" stackId="s" fill={c.s2} stroke={c.surface} strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <table>
          <caption className="sr-only">Step-ups per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Total</th>
              <th scope="col">Guardian needed</th>
              <th scope="col">Denied</th>
              <th scope="col">Completed</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.total}</td>
                <td>{d.guarded}</td>
                <td>{d.denied}</td>
                <td>{d.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function TopRulesChart({ rules, assessments }: { rules: Array<{ key: string; count: number }>; assessments: number }) {
  const c = useChartColors();
  const data = rules.map((r) => ({ ...r, name: ruleName(r.key) }));
  const tick = { fill: c.text, fontSize: 12 };
  const empty = <p className="hint">No risk rule matched in this period.</p>;
  return (
    <ChartCard
      id="rules-chart"
      title="Most frequent risk signals"
      summary={`Across ${assessments} risk assessments.`}
      chart={
        data.length === 0 ? (
          empty
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36 + 24)}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 8 }}>
              <CartesianGrid horizontal={false} stroke={c.grid} />
              <XAxis type="number" allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={170} tick={tick} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: c.grid, opacity: 0.4 }}
                contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, color: c.ink }}
                labelStyle={{ color: c.ink, fontWeight: 600 }}
              />
              <Bar dataKey="count" name="Matches" fill={c.s1} maxBarSize={20} radius={[0, 4, 4, 0]} label={{ position: 'right', fill: c.text, fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        )
      }
      table={
        data.length === 0 ? (
          empty
        ) : (
          <table>
            <caption className="sr-only">Risk rule matches</caption>
            <thead>
              <tr>
                <th scope="col">Signal</th>
                <th scope="col">Matches</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    />
  );
}
