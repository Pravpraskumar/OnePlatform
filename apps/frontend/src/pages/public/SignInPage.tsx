import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Cloud, FileCheck2, Landmark, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/state/SessionProvider';
import { isMsalAvailable, loginRequest } from '@/auth/msalConfig';
import { coreApiUrl } from '@/lib/apiClient';

const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

interface OidcConfig {
  enabled: boolean;
  providerLabel: string;
}

export function SignInPage() {
  const { t } = useTranslation();
  const { completeExternalLogin, login } = useSession();
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [oidcConfig, setOidcConfig] = useState<OidcConfig | null>(null);

  useEffect(() => {
    let active = true;
    fetch(coreApiUrl('/auth/oidc/config'))
      .then(async (response) => response.ok ? response.json() as Promise<OidcConfig> : null)
      .then((config) => {
        if (active && config?.enabled) setOidcConfig(config);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('oidc_token');
    const oidcError = params.get('oidc_error');
    if (!accessToken && !oidcError) return;

    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (oidcError) {
      setError(oidcError);
      return;
    }

    setBusy(true);
    void completeExternalLogin(accessToken!)
      .then(() => navigate('/app/dashboard'))
      .catch(() => setError('Authentication failed. Please try again.'))
      .finally(() => setBusy(false));
  }, [completeExternalLogin, navigate]);

  const handleLocalLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login({ email, password });
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      navigate('/app/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setBusy(false);
    }
  };

  const handleMsalLogin = async () => {
    try {
      setBusy(true);
      await instance.loginPopup(loginRequest);
      navigate('/app/dashboard');
    } catch (err) {
      setError('Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f7f5] text-slate-950">
      <img
        src="/assets/cloud-pattern.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.07] mix-blend-multiply"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#173f35_0%,#2f7d62_55%,#d6a84b_100%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between border-b border-slate-900/10 px-6 py-5 lg:px-10">
        <a className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f7d62]" href="/">
          <img src="/assets/unify-logo.png" alt="Unify" className="h-9 w-9 object-contain" />
          <span className="text-lg font-semibold text-slate-900">Unify</span>
          <span className="h-5 w-px bg-slate-300" aria-hidden="true" />
          <span className="text-sm font-semibold text-[#245f4c]">CreditGuard</span>
        </a>
        <div className="flex items-center gap-5">
          <a className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-[#245f4c] sm:inline" href="/about">About Unify</a>
          <span className="text-xs font-semibold uppercase text-slate-500">v2.13.0</span>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-81px)] w-full max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20 lg:px-10">
        <section className="hidden max-w-2xl lg:block">
          <div className="mb-7 inline-flex items-center gap-2 border-l-4 border-[#d6a84b] bg-white/70 px-3 py-2 text-xs font-semibold uppercase text-[#245f4c] shadow-sm backdrop-blur">
            <ShieldCheck size={16} />
            Financial security control
          </div>
          <h2 className="max-w-xl text-5xl font-semibold leading-[1.08] text-slate-950">
            CreditGuard
          </h2>
          <p className="mt-4 max-w-xl text-xl font-medium leading-8 text-[#245f4c]">
            Govern guarantees from request through approval.
          </p>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">
            A controlled workspace for financial-security requests, document review, ordered approvals, and portfolio oversight.
          </p>

          <div className="mt-10 grid max-w-xl gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-3">
            <div className="bg-white p-4">
              <FileCheck2 size={19} className="text-[#2f7d62]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Controlled requests</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Structured records and documents</p>
            </div>
            <div className="bg-white p-4">
              <CheckCircle2 size={19} className="text-[#2f7d62]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Auditable review</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Assigned review and approval history</p>
            </div>
            <div className="bg-white p-4">
              <Landmark size={19} className="text-[#2f7d62]" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Portfolio view</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Status and value oversight</p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3 text-sm font-medium text-slate-600">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#173f35] text-white"><LockKeyhole size={17} /></span>
            Access is limited by organisation, role, and product assignment.
          </div>
        </section>

        <section className="w-full rounded-md border border-slate-200 bg-white p-7 shadow-[0_20px_55px_rgba(20,47,40,0.12)] sm:p-9">
          <div className="mb-7">
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#173f35] text-white"><ShieldCheck size={21} /></span>
              <div><p className="text-xs font-semibold uppercase text-[#2f7d62]">Unify</p><p className="font-semibold text-slate-900">CreditGuard</p></div>
            </div>
            <p className="text-xs font-semibold uppercase text-[#2f7d62]">Secure workspace</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t('signIn')} to CreditGuard</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Use your approved Unify credentials to continue.</p>
          </div>

          <form className="flex w-full flex-col gap-y-4" onSubmit={handleLocalLogin}>
            <fieldset className="flex w-full flex-col gap-y-4">
              {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <label className="block text-sm font-medium text-slate-700">
                <span>Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2f7d62] focus:ring-2 focus:ring-[#2f7d62]/15"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                <span>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2f7d62] focus:ring-2 focus:ring-[#2f7d62]/15"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  aria-label="Remember me"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#2f7d62] accent-[#2f7d62]"
                />
                Remember me
              </label>

              <Button type="submit" className="mt-2 h-12 w-full rounded-md !bg-[#173f35] shadow-md shadow-emerald-950/10 hover:!bg-[#245f4c]" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign In'}
              </Button>

              {(oidcConfig || isMsalAvailable) && (
                <div className="my-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  Or continue with
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              {oidcConfig && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 w-full rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => window.location.assign(coreApiUrl('/auth/oidc/start'))}
                  disabled={busy}
                >
                  <Cloud size={18} className="text-[#2f7d62]" />
                  {oidcConfig.providerLabel}
                </Button>
              )}

              {isMsalAvailable && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 w-full rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={handleMsalLogin}
                  disabled={busy}
                >
                  <Cloud size={18} className="text-[#2f7d62]" />
                  {busy ? 'Signing in…' : 'McDermott SSO'}
                </Button>
              )}
            </fieldset>
          </form>
        </section>
      </div>
    </main>
  );
}
