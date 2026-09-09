import { useEffect } from 'react';
import type { ApiClient } from '@/lib/apiClient';

interface AdministrationSession {
  id: string;
}

interface SessionLease {
  promise: Promise<AdministrationSession>;
  refs: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
}

const leases = new Map<string, SessionLease>();

function acquireLease(api: ApiClient, orgId: string) {
  let lease = leases.get(orgId);
  if (!lease) {
    lease = {
      promise: api.post<AdministrationSession>('/sessions/administration', { orgId }),
      refs: 0,
    };
    leases.set(orgId, lease);
  }
  lease.refs += 1;
  if (lease.releaseTimer) clearTimeout(lease.releaseTimer);

  const release = () => {
    lease!.refs -= 1;
    if (lease!.refs > 0) return;
    lease!.releaseTimer = setTimeout(() => {
      if (lease!.refs > 0) return;
      leases.delete(orgId);
      lease!.promise.then((session) => api.del(`/sessions/${session.id}`)).catch(() => undefined);
    }, 250);
  };

  return { promise: lease.promise, release };
}

export function useAdministrationSession(api: ApiClient, orgId: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!orgId || !enabled) return;

    const lease = acquireLease(api, orgId);
    const heartbeat = window.setInterval(() => {
      lease.promise
        .then((session) => api.post(`/sessions/${session.id}/heartbeat`))
        .catch(() => undefined);
    }, 30_000);

    return () => {
      window.clearInterval(heartbeat);
      lease.release();
    };
  }, [api, enabled, orgId]);
}
