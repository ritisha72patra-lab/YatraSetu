import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api';

export type User = { id: string; name: string; email: string; role: string; preferences?: any };

type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signInWithFirebaseToken: (idToken: string) => Promise<void>;
  demoLogin: (role?: 'traveller' | 'admin') => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const t = await getToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const me = await api<User>('/api/auth/me');
      setUser(me);
    } catch {
      await setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, []);

  const save = async (data: { token: string; user: User }) => {
    await setToken(data.token);
    setUser(data.user);
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        refreshMe,
        signIn: async (email, password) => save(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)),
        register: async (name, email, password) =>
          save(await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }, false)),
        signInWithFirebaseToken: async (idToken) =>
          save(await api('/api/auth/firebase', { method: 'POST', body: JSON.stringify({ idToken }) }, false)),
        demoLogin: async (role) =>
          save(await api('/api/auth/demo-login', { method: 'POST', body: JSON.stringify({ role: role || 'traveller' }) }, false)),
        signOut: async () => {
          await setToken(null);
          setUser(null);
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
