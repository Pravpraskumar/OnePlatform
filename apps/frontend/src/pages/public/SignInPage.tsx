import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useTranslation } from 'react-i18next';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useSession } from '@/state/SessionProvider';
import { loginRequest } from '@/auth/msalConfig';

const field = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';
const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

export function SignInPage() {
  const { t } = useTranslation();
  const { login } = useSession();
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login({ email, password });
      if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      navigate('/app/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
            <Boxes size={20} />
          </div>
          <h1 className="text-xl font-semibold">{t('signIn')}</h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-600">Email</span>
            <input
              type="email"
              required
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Password</span>
            <input
              type="password"
              required
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : t('signIn')}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          OR
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => instance.loginRedirect(loginRequest)}
        >
          Continue with Microsoft
        </Button>

        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            {t('signUp')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
