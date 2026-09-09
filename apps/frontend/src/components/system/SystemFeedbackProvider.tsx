import { ReactNode, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { clearLocalSession } from '@/state/localSession';
import {
  NotificationKind,
  SESSION_EXPIRED_EVENT,
  SYSTEM_NOTIFICATION_EVENT,
  SystemNotification,
} from '@/lib/systemEvents';

interface Toast extends SystemNotification {
  id: number;
}

const presentation: Record<NotificationKind, { Icon: typeof Info; className: string }> = {
  success: { Icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  error: { Icon: AlertCircle, className: 'border-red-200 bg-red-50 text-red-800' },
  warning: { Icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  info: { Icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-800' },
};

export function SystemFeedbackProvider({ children }: { children: ReactNode }) {
  const { instance } = useMsal();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const nextId = useRef(0);
  const okButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const showNotification = (event: Event) => {
      const detail = (event as CustomEvent<SystemNotification>).detail;
      const id = ++nextId.current;
      setToasts((current) => [...current, { ...detail, id }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 3000);
    };
    const showSessionExpired = () => setSessionExpired(true);
    window.addEventListener(SYSTEM_NOTIFICATION_EVENT, showNotification);
    window.addEventListener(SESSION_EXPIRED_EVENT, showSessionExpired);
    return () => {
      window.removeEventListener(SYSTEM_NOTIFICATION_EVENT, showNotification);
      window.removeEventListener(SESSION_EXPIRED_EVENT, showSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (sessionExpired) okButton.current?.focus();
  }, [sessionExpired]);

  const acknowledgeExpiry = async () => {
    clearLocalSession();
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
    if (account) {
      await instance.logoutRedirect({ postLogoutRedirectUri: `${window.location.origin}/signin` });
      return;
    }
    window.location.assign('/signin');
  };

  return (
    <>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-5 right-5 z-[110] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const { Icon, className } = presentation[toast.kind];
          return (
            <div key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 shadow-lg ${className}`}>
              <Icon size={19} className="mt-0.5 shrink-0" />
              <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
              <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss notification"><X size={16} /></button>
            </div>
          );
        })}
      </div>
      {sessionExpired && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 px-4" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="session-expired-title" aria-describedby="session-expired-description" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle size={21} /></span>
              <div><h2 id="session-expired-title" className="text-lg font-semibold text-slate-900">Session expired</h2><p id="session-expired-description" className="mt-1 text-sm leading-6 text-slate-600">Your session has expired. Select OK to sign out and return to the sign-in page.</p></div>
            </div>
            <div className="mt-6 flex justify-end"><button ref={okButton} type="button" onClick={() => void acknowledgeExpiry()} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2">OK</button></div>
          </div>
        </div>
      )}
    </>
  );
}