import catalog from '../../shared/catalog.json';

const actions = catalog.actions as Record<string, { en: string }>;
const riskRules = catalog.riskRules as Record<string, { weight: number; en: string }>;

export const RULE_KEYS = Object.keys(riskRules);

/** Short staff-facing names; the long reasons in the catalogue are what end users hear. */
const ruleNames: Record<string, string> = {
  call_unknown_number: 'Call from unknown number',
  remote_access_app: 'Remote-access app present',
  screen_capture: 'Screen being captured',
  sim_changed_72h: 'SIM changed in last 72 h',
  code_pasted: 'Code was pasted',
  new_device_24h: 'Phone added in last 24 h',
  late_night: 'Late night (00:00–05:00)',
  repeated_failures: 'Repeated failed sign-ins',
  integrity_failed: 'Device integrity failed',
};

export const ruleName = (key: string) => ruleNames[key] ?? key;
export const actionName = (key: string) => actions[key]?.en ?? key;
export const ACTION_KEYS = Object.keys(actions);

export const STEPUP_STATUSES = [
  'pending_user',
  'pending_guardians',
  'cooloff',
  'ready_to_confirm',
  'approved',
  'completed',
  'denied',
  'cancelled',
  'expired',
  'failed',
] as const;

const statusNames: Record<string, string> = {
  pending_user: 'Waiting for user',
  pending_guardians: 'Waiting for guardian',
  cooloff: 'Cool-off',
  ready_to_confirm: 'Ready to confirm',
  approved: 'Approved',
  completed: 'Completed',
  denied: 'Denied',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Failed',
};
export const statusName = (s: string) => statusNames[s] ?? s;

/** Status pills use the reserved status colours, always with a text label. */
export function statusTone(s: string): 'ok' | 'warn' | 'bad' | '' {
  if (s === 'completed' || s === 'approved') return 'ok';
  if (s === 'denied' || s === 'failed') return 'bad';
  if (s === 'pending_guardians' || s === 'cooloff' || s === 'ready_to_confirm') return 'warn';
  return '';
}

export const shortId = (id: string) => id.slice(0, 8);
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
