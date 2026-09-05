import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../../lib/auth-client';

/** `useSession().data` is `null` (not `undefined`) once resolved with no session — verified
 * against a real `GET /auth/get-session` response, not assumed from the client's types alone. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();

  if (isPending) {
    return <p style={{ fontFamily: 'sans-serif', padding: '2rem' }}>Loading…</p>;
  }
  if (!data) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
