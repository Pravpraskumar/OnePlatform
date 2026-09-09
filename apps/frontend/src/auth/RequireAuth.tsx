import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { useSession } from '@/state/SessionProvider';

// Allows access when either a platform-local session or a B2C account exists.
export function RequireAuth({ children }: { children: ReactNode }) {
  const isB2cAuthenticated = useIsAuthenticated();
  const { inProgress } = useMsal();
  const { isLocalAuthenticated } = useSession();

  if (isLocalAuthenticated || isB2cAuthenticated) {
    return <>{children}</>;
  }

  if (inProgress !== 'none') {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">Authenticating…</div>
    );
  }

  return <Navigate to="/signin" replace />;
}
