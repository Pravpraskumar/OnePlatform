import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Cloud, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/state/SessionProvider';
import { isMsalAvailable, loginRequest } from '@/auth/msalConfig';
import { coreApiUrl } from '@/lib/apiClient';
import { useApi } from '@/lib/ApiProvider';

const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

interface OidcConfig {
  enabled: boolean;
  providerLabel: string;
}

export function SignInPage() {
  const { t } = useTranslation();
  const api = useApi();
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
    void api.get<OidcConfig>('/auth/oidc/config')
      .then(setOidcConfig)
      .catch(() => setOidcConfig(null));
  }, [api]);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get('oidc_token');
    const oidcError = fragment.get('oidc_error');
    if (!accessToken && !oidcError) return;

    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (oidcError) {
      setError('Authentication failed. Please try again.');
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
    <main className="relative min-h-screen overflow-hidden bg-[#eef6fb] text-slate-950">
      <img
        src="/assets/cloud-pattern.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.12] mix-blend-multiply"
      />
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#b8e3ef]/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-24 h-96 w-96 rounded-full bg-[#f7d9a8]/50 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7490]" href="/">
          <img src="/assets/unify-logo.png" alt="Unify" className="h-10 w-10 object-contain" />
          <span className="text-xl font-semibold tracking-tight text-slate-900">Unify</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
          <a className="transition-colors hover:text-[#0e7490]" href="/docs/users" target="_blank">Documentation</a>
          <a className="transition-colors hover:text-[#0e7490]" href="/docs/users/support" target="_blank">Support</a>
          <a className="transition-colors hover:text-[#0e7490]" href="/docs/about" target="_blank">About</a>
        </nav>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">v2.13.0</span>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-88px)] w-full max-w-7xl items-center gap-12 px-6 pb-12 pt-4 lg:grid-cols-[1fr_460px] lg:gap-24 lg:px-10 lg:pb-20">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-900/10 bg-white/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#0e7490] shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
            One workspace. Every team.
          </div>
          <h2 className="max-w-lg text-5xl font-semibold leading-[1.04] tracking-[-0.04em] text-slate-950 xl:text-6xl">
            Bring your work into focus.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-8 text-slate-600">
            Unify gives your teams one clear place to move work forward, make decisions, and stay connected.
          </p>
          <div className="mt-10 flex items-center gap-3 text-sm font-medium text-slate-600">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0e7490] shadow-sm ring-1 ring-slate-900/5">
              <LockKeyhole size={18} />
            </span>
            Secure access for your organization
            <ArrowUpRight size={16} className="text-[#0e7490]" />
          </div>
        </section>

        <section className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-[0_24px_80px_rgba(15,55,75,0.14)] backdrop-blur-xl sm:p-10">
          <div className="mb-8">
            <div className="mb-5 flex items-center gap-4">
              <img src="/assets/unify-logo.png" alt="Unify" className="h-12 w-12 flex-shrink-0 object-contain" />
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{t('signIn')}</h1>
            </div>
            <p className="text-sm leading-6 text-slate-500">Welcome back to Unify. Sign in to continue.</p>
          </div>

          <form className="flex w-full flex-col gap-y-4" onSubmit={handleLocalLogin}>
            <fieldset className="flex w-full flex-col gap-y-4">
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <label className="block text-sm font-medium text-slate-700">
                <span>Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0e7490] focus:bg-white focus:ring-4 focus:ring-cyan-700/10"
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
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0e7490] focus:bg-white focus:ring-4 focus:ring-cyan-700/10"
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
                  className="h-4 w-4 rounded border-slate-300 text-[#0e7490] accent-[#0e7490]"
                />
                Remember me
              </label>

              <Button type="submit" className="mt-2 h-12 w-full rounded-xl bg-[#0e7490] shadow-lg shadow-cyan-900/15 hover:bg-[#155e75]" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign In'}
              </Button>

              {isMsalAvailable && (
                <>
                  <div className="my-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    Or continue with
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={handleMsalLogin}
                    disabled={busy}
                  >
                    <Cloud size={18} className="text-[#0e7490]" />
                    {busy ? 'Signing in…' : 'McDermott SSO'}
                  </Button>
                </>
              )}

              {oidcConfig?.enabled && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => window.location.assign(coreApiUrl('/auth/oidc/start'))}
                  disabled={busy}
                >
                  <Cloud size={18} className="text-[#0e7490]" />
                  {busy ? 'Signing in…' : oidcConfig.providerLabel}
                </Button>
              )}
            </fieldset>
          </form>
        </section>
      </div>
    </main>
  );
}
