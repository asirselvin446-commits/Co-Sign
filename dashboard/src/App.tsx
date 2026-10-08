import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { RegisterPage } from './pages/Register';
import { StaffPage } from './pages/Staff';

function RequireAdmin({ children, role }: { children: ReactNode; role?: 'admin' }) {
  const { admin, ready } = useAuth();
  if (!ready) return <p role="status" style={{ padding: 24 }}>Loading…</p>;
  if (!admin) return <Navigate to="/login" replace />;
  if (role && admin.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            element={
              <RequireAdmin>
                <Layout />
              </RequireAdmin>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route
              path="staff"
              element={
                <RequireAdmin role="admin">
                  <StaffPage />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
