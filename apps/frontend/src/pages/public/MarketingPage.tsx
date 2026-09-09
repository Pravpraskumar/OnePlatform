import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Boxes, Gauge, ShieldCheck, Users } from 'lucide-react';
import { BrandingLogoIcon } from '@/components/layout/BrandingLogo';

const appName = (import.meta.env.VITE_APP_NAME as string) ?? 'Platform';

const metrics = [
  { value: '2', label: 'Enterprise modules' },
  { value: '99.9%', label: 'Platform uptime' },
  { value: '24/7', label: 'Access control' },
  { value: '1', label: 'Unified workspace' },
];

export function MarketingPage() {
  const { t } = useTranslation();

  return (
    <main className="marketing-page min-h-screen bg-[#f2f6ff] text-white">
      <section className="marketing-hero relative flex min-h-[92vh] flex-col overflow-hidden bg-[#142a9e]">
        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3" aria-label={`${appName} home`}>
            <span className="flex h-10 w-14 items-center justify-center overflow-hidden">
              <BrandingLogoIcon className="h-10 w-16" />
            </span>
            <span className="text-base font-bold uppercase text-white">{appName}</span>
          </Link>

          <nav className="hidden items-center gap-8 text-xs font-bold uppercase text-blue-100 md:flex">
            <a href="#platform" className="transition hover:text-white">Platform</a>
            <a href="#modules" className="transition hover:text-white">Modules</a>
            <Link to="/about" className="transition hover:text-white">About</Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/signin" className="hidden px-3 py-2 text-sm font-semibold text-white transition hover:text-[#a2e771] sm:block">
              {t('signIn')}
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-white px-4 py-2 text-sm font-bold text-[#142a9e] shadow-lg transition hover:bg-[#a2e771]"
            >
              {t('signUp')}
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-5 pb-10 pt-8 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12 lg:pb-6 lg:pt-4">
          <div className="marketing-reveal max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-md bg-[#a2e771] px-3 py-1.5 text-xs font-bold uppercase text-[#10225f]">
              <ShieldCheck size={14} /> Secure enterprise workspace
            </span>
            <h1 className="mt-6 text-5xl font-black leading-[0.95] text-white sm:text-6xl lg:text-7xl">
              {appName}
            </h1>
            <p className="mt-5 max-w-lg text-xl font-bold leading-tight text-blue-50 sm:text-2xl">
              One command centre for every enterprise module.
            </p>
            <p className="mt-4 max-w-lg text-base leading-7 text-blue-100">
              License products, manage organisations, govern roles and keep every active session visible from one responsive workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-md bg-[#a2e771] px-5 py-3 text-sm font-bold text-[#10225f] shadow-lg transition hover:bg-white"
              >
                Get started <ArrowRight size={17} />
              </Link>
              <Link
                to="/signin"
                className="inline-flex items-center rounded-md border border-white/60 px-5 py-3 text-sm font-bold text-white transition hover:bg-white hover:text-[#142a9e]"
              >
                Open workspace
              </Link>
            </div>
          </div>

          <div className="marketing-console relative mx-auto w-full max-w-2xl" aria-label="Platform administration dashboard preview">
            <div className="marketing-console-shell overflow-hidden rounded-md border border-white/20 bg-[#edf3ff] shadow-2xl">
              <div className="flex h-10 items-center justify-between bg-[#0d1f77] px-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#a2e771]" />
                  <span className="text-[10px] font-bold uppercase text-white">MQ Control Centre</span>
                </div>
                <div className="flex gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-white/40" /><span className="h-1.5 w-1.5 rounded-full bg-white/40" /></div>
              </div>
              <div className="grid min-h-[340px] grid-cols-[72px_1fr] sm:grid-cols-[116px_1fr]">
                <aside className="bg-[#13298f] p-3 text-blue-100">
                  <div className="space-y-3 text-[9px] font-bold uppercase">
                    <div className="rounded bg-white/10 px-2 py-2 text-white">Overview</div>
                    <div className="px-2 py-1.5">Products</div>
                    <div className="px-2 py-1.5">Teams</div>
                    <div className="px-2 py-1.5">Sessions</div>
                  </div>
                </aside>
                <div className="p-4 text-[#15214a] sm:p-6">
                  <div className="flex items-start justify-between">
                    <div><p className="text-[10px] font-bold uppercase text-[#52618f]">Organisation</p><p className="mt-1 text-lg font-black">Global workspace</p></div>
                    <span className="rounded bg-[#dff8d4] px-2 py-1 text-[9px] font-bold uppercase text-[#31731b]">Systems active</span>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="rounded-md bg-white p-3 shadow-sm"><Boxes size={17} className="text-[#2854d7]" /><p className="mt-4 text-xl font-black">02</p><p className="text-[9px] uppercase text-[#66739a]">Modules</p></div>
                    <div className="rounded-md bg-white p-3 shadow-sm"><Users size={17} className="text-[#6cc04a]" /><p className="mt-4 text-xl font-black">148</p><p className="text-[9px] uppercase text-[#66739a]">Members</p></div>
                    <div className="rounded-md bg-white p-3 shadow-sm"><Gauge size={17} className="text-[#ff8e4f]" /><p className="mt-4 text-xl font-black">96%</p><p className="text-[9px] uppercase text-[#66739a]">Capacity</p></div>
                  </div>
                  <div className="mt-4 rounded-md bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between"><p className="text-xs font-bold">Module activity</p><p className="text-[9px] text-[#66739a]">Live</p></div>
                    <div className="mt-5 flex h-24 items-end gap-2">
                      {[42, 68, 50, 82, 58, 90, 72, 96, 78].map((height, index) => <span key={index} className="flex-1 rounded-t bg-[#2854d7]" style={{ height: `${height}%`, opacity: 0.55 + index * 0.04 }} />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="platform" className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-2 gap-y-5 border-t border-white/20 px-5 py-6 sm:grid-cols-4 sm:px-8 lg:px-12">
          {metrics.map((metric) => (
            <div key={metric.label} className="marketing-metric border-white/20 px-3 first:pl-0 sm:border-r sm:last:border-r-0">
              <div className="text-2xl font-black text-white">{metric.value}</div>
              <div className="mt-1 text-[10px] font-bold uppercase text-blue-200">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="modules" className="mx-auto max-w-7xl px-5 py-12 text-[#15214a] sm:px-8 lg:px-12">
        <p className="text-xs font-bold uppercase text-[#2854d7]">Built to operate</p>
        <h2 className="mt-2 max-w-xl text-3xl font-black">CreditGuard and PRIME, governed as one platform.</h2>
      </section>
    </main>
  );
}
