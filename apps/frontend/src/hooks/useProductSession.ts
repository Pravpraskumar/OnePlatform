import { useEffect, useState } from 'react';
import type { ApiClient } from '@/lib/apiClient';

interface ProductSession {
  id: string;
}

interface SessionLease {
  promise: Promise<ProductSession>;
  refs: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
}

const leases = new Map<string, SessionLease>();

function acquireLease(api: ApiClient, orgId: string, productId: string, projectId?: string) {
  const key = `${orgId}:${productId}:${projectId ?? 'organisation'}`;
  let lease = leases.get(key);
  if (!lease) {
    lease = {
      promise: api.post<ProductSession>('/sessions', { orgId, productId, projectId }),
      refs: 0,
    };
    leases.set(key, lease);
  }
  lease.refs += 1;
  if (lease.releaseTimer) clearTimeout(lease.releaseTimer);

  const release = () => {
    lease!.refs -= 1;
    if (lease!.refs > 0) return;
    lease!.releaseTimer = setTimeout(() => {
      if (lease!.refs > 0) return;
      leases.delete(key);
      lease!.promise.then((session) => api.del(`/sessions/${session.id}`)).catch(() => undefined);
    }, 250);
  };

  return { promise: lease.promise, release };
}

export function useProductSession(
  api: ApiClient,
  orgId?: string,
  productId?: string,
  productName = 'module',
  projectId?: string,
  projectRequired = false,
  allocationChecked = true,
) {
  const [session, setSession] = useState<ProductSession | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !productId || !allocationChecked || (projectRequired && !projectId)) {
      setSession(null);
      setError('');
      setLoading(false);
      return;
    }

    let active = true;
    setSession(null);
    setError('');
    setLoading(true);
    const lease = acquireLease(api, orgId, productId, projectId);
    lease.promise
      .then((openedSession) => {
        if (!active) return;
        setSession(openedSession);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        const message = (requestError as Error).message;
        setError(
          message.includes('Concurrent seat limit reached')
            ? `No ${productName} seats are currently available for this organisation.`
            : message.includes('not licensed')
              ? `This organisation is not licensed for ${productName}.`
              : message,
        );
        setLoading(false);
      });

    return () => {
      active = false;
      lease.release();
    };
  }, [api, orgId, productId, productName, projectId, projectRequired, allocationChecked]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      api.post(`/sessions/${session.id}/heartbeat`).catch(() => {
        setSession(null);
        setError('Your module session expired. Return to Products and open the module again.');
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [api, session]);

  return { session, loading, error };
}