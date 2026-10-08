import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api, applySession, publicApi, refreshSession, setSessionListener, type AdminProfile, type AdminSession } from './api';

interface AuthState {
  admin: AdminProfile | null;
  ready: boolean;
  login: () => Promise<void>;
  register: (inviteToken: string, handle: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionListener((s) => setAdmin(s?.admin ?? null));
    void refreshSession().finally(() => setReady(true));
  }, []);

  // Keep the 10-minute access token fresh while the console is open.
  useEffect(() => {
    if (!admin) return;
    const id = window.setInterval(() => void refreshSession(), 8 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [admin]);

  const login = useCallback(async () => {
    const { options } = await publicApi<{ options: PublicKeyCredentialRequestOptionsJSON }>('POST', '/v1/admin/auth/login/options');
    const response = await startAuthentication({ optionsJSON: options });
    const session = await publicApi<AdminSession>('POST', '/v1/admin/auth/login/verify', { response });
    applySession(session);
  }, []);

  const register = useCallback(async (inviteToken: string, handle: string, displayName: string) => {
    const { options } = await publicApi<{ options: PublicKeyCredentialCreationOptionsJSON }>('POST', '/v1/admin/auth/register/options', {
      inviteToken,
      handle,
      displayName,
    });
    const response = await startRegistration({ optionsJSON: options });
    const session = await publicApi<AdminSession>('POST', '/v1/admin/auth/register/verify', { response });
    applySession(session);
  }, []);

  const logout = useCallback(async () => {
    await api('POST', '/v1/admin/auth/logout').catch(() => undefined);
    applySession(null);
  }, []);

  const value = useMemo(() => ({ admin, ready, login, register, logout }), [admin, ready, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
