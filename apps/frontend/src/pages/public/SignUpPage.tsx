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

export function SignUpPage() {
  const { t } = useTranslation();
  const { register } = useSession();
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register({ email, password, displayName });
      navigate('/app/dashboard');
    } catch (err) {
      setError((err as Error).message.includes('409') ? 'Email already registered.' : 'Sign up failed.');
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
          <h1 className="text-xl font-semibold">{t('signUp')}</h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-600">Full name</span>
            <input
              required
              className={field}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
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
              minLength={8}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Creating account…' : t('signUp')}
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
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-brand hover:underline">
            {t('signIn')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
