'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@codek/api-client';
import { useApi } from './api';

export interface SessionData {
  user: { id: string; email: string; displayName: string; emailVerified: boolean; accountType: 'business' | 'creator' | 'admin'; twoFactorEnabled: boolean };
  creatorId: string | null;
  businesses: Array<{ businessId: string; role: string; permissions: string[] }>;
  platformRoles: string[];
  platformPermissions: string[];
  creatorPermissions: string[];
}

interface SessionCtx {
  session: SessionData | null;
  loading: boolean;
  businessId: string | null;
  setBusinessId: (id: string) => void;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const q = useApi<SessionData>('/auth/session', { retry: false, staleTime: 30_000 });
  const qc = useQueryClient();
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const session = q.error ? null : (q.data?.data ?? null);
  useEffect(() => {
    if (!session?.businesses.length) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('codek.businessId') : null;
    const valid = session.businesses.find((b) => b.businessId === stored)?.businessId ?? session.businesses[0]!.businessId;
    setBusinessIdState(valid);
  }, [session]);
  const value = useMemo<SessionCtx>(
    () => ({
      session,
      loading: q.isLoading,
      businessId,
      setBusinessId: (id) => {
        window.localStorage.setItem('codek.businessId', id);
        setBusinessIdState(id);
      },
      can: (perm) => {
        if (!session) return false;
        if (session.platformPermissions.includes(perm) || session.creatorPermissions.includes(perm)) return true;
        return !!session.businesses.find((b) => b.businessId === businessId)?.permissions.includes(perm);
      },
      signOut: async () => {
        await api('/auth/sign-out', { method: 'POST', json: {} }).catch(() => undefined);
        qc.clear();
        window.location.href = '/';
      },
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ['/auth/session'] });
      },
    }),
    [session, q.isLoading, businessId, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
