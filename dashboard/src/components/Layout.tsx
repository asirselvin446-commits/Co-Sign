import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth';
import { closeSocket } from '../realtime';

const links: Array<{ to: string; label: string; adminOnly?: boolean }> = [
  { to: '/', label: 'Overview' },
  { to: '/stepups', label: 'Step-ups' },
  { to: '/users', label: 'Accounts' },
  { to: '/risk-rules', label: 'Risk rules' },
  { to: '/audit', label: 'Audit log' },
  { to: '/staff', label: 'Staff', adminOnly: true },
];

export function Layout() {
  const { admin, logout } = useAuth();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <span>Co-Sign Console</span>
        </div>
        <nav className="nav" aria-label="Main">
          {links
            .filter((l) => !l.adminOnly || admin?.role === 'admin')
            .map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'}>
                {l.label}
              </NavLink>
            ))}
        </nav>
        <div className="who">
          <div>
            Signed in as <strong>{admin?.displayName}</strong>
          </div>
          <div>Role: {admin?.role === 'admin' ? 'Administrator' : 'Analyst (read-only)'}</div>
          <button
            style={{ marginTop: 8 }}
            onClick={() => {
              closeSocket();
              void logout();
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
