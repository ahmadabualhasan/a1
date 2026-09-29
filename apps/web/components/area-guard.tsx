'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingState, PermissionDenied } from '@codek/ui';
import { useSession } from '@/lib/session';

/**
 * Client-side routing guard for UX only — every API call is authorized server-side (the frontend is never the
 * security boundary, spec §31.6).
 */
export function AreaGuard({ area, children }: { area: 'creator' | 'business' | 'admin' | 'any'; children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (area === 'creator' && session.user.accountType === 'creator' && !session.creatorId && !pathname.startsWith('/creator/onboarding')) router.replace('/creator/onboarding');
    if (area === 'business' && session.user.accountType === 'business' && session.businesses.length === 0 && !pathname.startsWith('/business/onboarding')) router.replace('/business/onboarding');
  }, [loading, session, area, pathname, router]);
  if (loading || !session) return <div className="p-8"><LoadingState /></div>;
  if (area === 'admin' && !session.platformPermissions.includes('admin.access')) return <div className="p-8"><PermissionDenied message="This area is for CODEK operations staff." /></div>;
  if ((area === 'creator' || area === 'business') && session.user.accountType !== area) {
    return <div className="p-8"><PermissionDenied message={`This area is for ${area} accounts.`} /></div>;
  }
  return <>{children}</>;
}
