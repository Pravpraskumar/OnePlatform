import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Search } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { helpTopics, type HelpCategory } from '@/help/helpContent';

export function ResourcesPage() {
  const { topicId } = useParams<{ topicId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const selected = helpTopics.find((topic) => topic.id === topicId) ?? null;
  const returnPath = (location.state as { from?: string } | null)?.from;
  const categories = [...new Set(helpTopics.map((topic) => topic.category))];
  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return helpTopics;
    return helpTopics.filter((topic) => [topic.title, topic.summary, ...topic.sections.flatMap((section) => [section.title, section.content, ...(section.steps ?? [])])].some((value) => value.toLowerCase().includes(normalized)));
  }, [query]);

  useEffect(() => {
    if (topicId && !selected) navigate('/app/help', { replace: true });
  }, [navigate, selected, topicId]);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [topicId]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-brand">Application documentation</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900"><BookOpen size={24} />Help Center</h1>
            <p className="mt-1 text-sm text-slate-500">Guidance for the platform, administration, and CreditGuard workflows.</p>
          </div>
          {returnPath && <Link to={returnPath} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand hover:text-brand"><ArrowLeft size={16} />Back to screen</Link>}
        </div>
        <label className="relative mt-5 block max-w-xl">
          <span className="sr-only">Search help</span>
          <Search size={17} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics" className="w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </label>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Help topics" className="lg:border-r lg:border-slate-200 lg:pr-6">
          {categories.map((category) => {
            const topics = filteredTopics.filter((topic) => topic.category === category);
            if (topics.length === 0) return null;
            return <TopicGroup key={category} category={category} topics={topics} selectedId={selected?.id} returnPath={returnPath} />;
          })}
          {filteredTopics.length === 0 && <p className="text-sm text-slate-500">No help topics match your search.</p>}
        </nav>

        {selected ? <TopicArticle topic={selected} /> : <HelpIndex categories={categories} topics={filteredTopics} returnPath={returnPath} />}
      </div>
    </div>
  );
}

function TopicGroup({ category, topics, selectedId, returnPath }: { category: HelpCategory; topics: typeof helpTopics; selectedId?: string; returnPath?: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">{category}</h2>
      <div className="space-y-1">
        {topics.map((topic) => <Link key={topic.id} to={`/app/help/${topic.id}`} state={returnPath ? { from: returnPath } : undefined} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${selectedId === topic.id ? 'bg-brand text-white' : 'text-slate-700 hover:bg-slate-100'}`}><span>{topic.title}</span><ChevronRight size={14} /></Link>)}
      </div>
    </section>
  );
}

function HelpIndex({ categories, topics, returnPath }: { categories: HelpCategory[]; topics: typeof helpTopics; returnPath?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-slate-900">Browse documentation</h2>
      <div className="mt-4 space-y-8">
        {categories.map((category) => {
          const categoryTopics = topics.filter((topic) => topic.category === category);
          if (categoryTopics.length === 0) return null;
          return (
            <section key={category} aria-labelledby={`category-${category.replaceAll(' ', '-').toLowerCase()}`}>
              <h3 id={`category-${category.replaceAll(' ', '-').toLowerCase()}`} className="border-b border-slate-200 pb-2 font-semibold text-slate-800">{category}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {categoryTopics.map((topic) => <Link key={topic.id} to={`/app/help/${topic.id}`} state={returnPath ? { from: returnPath } : undefined} className="group min-h-32 rounded-md border border-slate-200 bg-white p-4 hover:border-brand/50 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><h4 className="font-semibold text-slate-900">{topic.title}</h4><ChevronRight size={17} className="shrink-0 text-slate-400 group-hover:text-brand" /></div><p className="mt-2 text-sm leading-5 text-slate-500">{topic.summary}</p></Link>)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TopicArticle({ topic }: { topic: (typeof helpTopics)[number] }) {
  return (
    <article className="min-w-0">
      <p className="text-xs font-semibold uppercase text-brand">{topic.category}</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-900">{topic.title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{topic.summary}</p>
      <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
        {topic.sections.map((section) => (
          <section key={section.title} className="py-6">
            <h3 className="font-semibold text-slate-900">{section.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.content}</p>
            {section.steps && <ol className="mt-4 space-y-3">{section.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</span><span>{step}</span></li>)}</ol>}
            {section.note && <p className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Important:</strong> {section.note}</p>}
          </section>
        ))}
      </div>
    </article>
  );
}
