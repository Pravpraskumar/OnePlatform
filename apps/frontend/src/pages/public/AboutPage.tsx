import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <Link to="/" className="text-sm text-brand hover:underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">About</h1>
      <p className="mt-4 text-slate-600">
        This platform hosts multiple enterprise products behind a single sign-on. Organisations
        register, receive module licenses, and manage their own teams and roles. Each product runs
        against its own isolated database while sharing the common identity, licensing and
        navigation layer.
      </p>
    </div>
  );
}
