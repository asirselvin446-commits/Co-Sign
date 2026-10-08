import { useState } from 'react';
import { api } from '../api';
import { ErrorNotice } from '../components/ErrorNotice';
import { explain, type Explained } from '../errors';
import { useApi } from '../useApi';

interface Staff {
  id: string;
  handle: string;
  displayName: string;
  role: string;
  createdAt: string;
  disabled: boolean;
}

export function StaffPage() {
  const list = useApi<{ staff: Staff[] }>('/v1/admin/staff');
  const staff = list.data?.staff ?? [];
  const [role, setRole] = useState<'admin' | 'analyst'>('analyst');
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<Explained | null>(null);

  async function createInvite() {
    setError(null);
    try {
      setInvite(await api('POST', '/v1/admin/staff/invites', { role }));
    } catch (e) {
      setError(explain(e));
    }
  }

  async function disable(id: string) {
    if (!window.confirm('Disable this staff member? They are signed out immediately.')) return;
    try {
      await api('POST', `/v1/admin/staff/${id}/disable`);
      list.reload();
    } catch (e) {
      setError(explain(e));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p>Invite analysts (read-only) and administrators. Each person registers their own passkey.</p>
        </div>
      </div>
      <ErrorNotice error={error ?? list.error} />
      <section className="card" aria-labelledby="invite-h" style={{ marginBottom: 16 }}>
        <h2 id="invite-h">Invite someone</h2>
        <div className="row">
          <label htmlFor="role" className="sr-only">
            Role
          </label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'analyst')} style={{ maxWidth: 220 }}>
            <option value="analyst">Analyst (read-only)</option>
            <option value="admin">Administrator</option>
          </select>
          <button className="primary" onClick={createInvite}>
            Create one-time link
          </button>
        </div>
        {invite && (
          <div className="alert ok" role="status" style={{ marginTop: 12 }}>
            <strong>Send this link privately. It works once and expires {new Date(invite.expiresAt).toLocaleString()}.</strong>
            <span className="mono">{invite.url}</span>
          </div>
        )}
      </section>
      <section className="card table-wrap">
        <table>
          <caption className="sr-only">Staff accounts</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Role</th>
              <th scope="col">Since</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.displayName}</td>
                <td className="mono">{s.handle}</td>
                <td>{s.role}</td>
                <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                <td>{s.disabled ? <span className="pill bad">Disabled</span> : <span className="pill ok">Active</span>}</td>
                <td>
                  {!s.disabled && (
                    <button className="danger" onClick={() => disable(s.id)} aria-label={`Disable ${s.displayName}`}>
                      Disable
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
