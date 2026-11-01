import { FormEvent, useEffect, useState } from 'react';
import {
  Activity, ArrowRight, BookOpenCheck, Bot, CheckCircle2, Cloud, Database,
  FileStack, FileText, Gauge, GitBranch, Plus, Radar, ShieldCheck, Sparkles, Target, Users,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useSession } from '@/state/SessionProvider';

type Opportunity = {
  id: string;
  opportunityNumber: string;
  name: string;
  client: string;
  region: string;
  scopeType: string | null;
  status: string;
  campaignWindow: string | null;
  estimatedValueUsdMillions: number | null;
  waterDepthMetres: number | null;
  updatedAt: string;
};

type DataSet = {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  sourceLocation: string;
  itemCount: number;
  freshnessPolicy: string | null;
};

type SourceDocument = {
  id: string;
  fileName: string;
  documentType: string;
  sourceUrl: string | null;
  asOfDate: string | null;
};

type PlanRow = {
  plan: { id: string; title: string; status: string; currentVersion: number; updatedAt: string };
  opportunity: Opportunity;
};

type PlanDetail = PlanRow & {
  version: { version: number; changeSummary: string; createdAt: string };
  sections: Array<{ id: string; code: string; title: string; owningAgent: string; status: string; content: Record<string, unknown>; citations: Array<{ label: string; sourceDocumentId?: string }> }>;
  runs: Array<{ id: string; agent: string; status: string; createdAt: string }>;
  auditEvents: AuditEvent[];
};

type AuditEvent = {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  createdAt: string;
};

const lifecycle = [
  ['01', 'Opportunity intake', 'Pre-ITT opportunity facts and commercial constraints'],
  ['02', 'Knowledge grounding', 'TG3, Salesforce, vessel, rate, and market sources'],
  ['03', 'Tender verification', 'Human-confirmed ITT, SOW, schedule, and MTO values'],
  ['04', 'Agent orchestration', 'Five governed specialist agents through one orchestrator'],
  ['05', 'Capture plan', 'Fourteen cited sections assembled as a versioned artefact'],
  ['06', 'Bid decision', 'Human refinement, authorisation, outcome, and lessons learned'],
] as const;

const agents = [
  ['Vessel Matching', 'Ranks eligible vessel spreads and records explicit rejection rationale.', 'CP-05, CP-13'],
  ['Competitor SWOT', 'Builds attributed competitor positioning from licensed intelligence.', 'CP-12'],
  ['Capture Strategy', 'Coordinates ten section producers and synthesises the plan.', 'CP-01-04, CP-06-09, CP-11, CP-14'],
  ['Scenario Modeling', 'Tests price, margin, weather, vessel substitution, and FX assumptions.', 'CP-10'],
  ['Bid Review', 'Checks completeness, grounding, governance, precedent, and playbook rules.', 'All sections'],
] as const;

function useCaptureProRequest<T>(path: string, dependencies: unknown[] = []) {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    setError('');
    api.capturePro<T>(`${path}${path.includes('?') ? '&' : '?'}orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then(setData)
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, selectedOrg, path, ...dependencies]);
  return { data, error, loading, setData };
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-xs font-semibold uppercase text-teal-700">{eyebrow}</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></div>
      {action}
    </header>
  );
}

function LoadingState() {
  return <Card><p className="text-sm text-slate-500">Loading Capture-Pro data...</p></Card>;
}

function ErrorState({ message }: { message: string }) {
  return <Card><p role="alert" className="text-sm text-red-700">{message}</p></Card>;
}

function DataSetCard({ item }: { item: DataSet }) {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { data, error, loading, setData } = useCaptureProRequest<SourceDocument[]>(`/data-sets/${encodeURIComponent(item.id)}/documents`, [item.id]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrg) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true); setFormError('');
    try {
      const created = await api.capturePro<SourceDocument>(`/data-sets/${encodeURIComponent(item.id)}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          orgId: selectedOrg.id,
          fileName: fields.get('fileName'),
          documentType: fields.get('documentType'),
          sourceUrl: fields.get('sourceUrl'),
          asOfDate: fields.get('asOfDate'),
        }),
      });
      setData([created, ...(data ?? [])]); setShowForm(false);
    } catch (requestError) { setFormError((requestError as Error).message); } finally { setSaving(false); }
  };
  return <Card className="min-h-52"><div className="flex items-start justify-between gap-3"><Database size={18} className="text-teal-700" /><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{item.itemCount} items</span></div><h2 className="mt-4 font-semibold text-slate-900">{item.name}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p><div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><p>{item.sourceLocation}</p><p className="mt-1">Refresh: {item.freshnessPolicy || 'On demand'}</p></div>
    <div className="mt-4 border-t border-slate-100 pt-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-slate-500">Registered sources</p><Button variant="secondary" onClick={() => setShowForm((value) => !value)}><Plus size={14} />Add</Button></div>
      {showForm && <form onSubmit={submit} className="mt-3 space-y-2"><input aria-label={`${item.name} file name`} name="fileName" required placeholder="File name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /><input aria-label={`${item.name} document type`} name="documentType" required placeholder="Document type" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /><input aria-label={`${item.name} source URL`} name="sourceUrl" type="url" placeholder="HTTPS SharePoint URL" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /><input aria-label={`${item.name} as-of date`} name="asOfDate" type="date" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />{formError && <p role="alert" className="text-xs text-red-700">{formError}</p>}<Button type="submit" disabled={saving}>{saving ? 'Registering...' : 'Register source'}</Button></form>}
      {loading ? <p className="mt-3 text-xs text-slate-500">Loading sources...</p> : error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : data?.length ? <ul className="mt-3 space-y-2">{data.map((document) => <li key={document.id} className="flex items-start gap-2 text-xs"><FileText size={14} className="mt-0.5 shrink-0 text-teal-700" /><div className="min-w-0"><p className="truncate font-medium text-slate-800">{document.fileName}</p><p className="text-slate-500">{document.documentType}{document.asOfDate ? ` · ${new Date(document.asOfDate).toLocaleDateString()}` : ''}</p>{document.sourceUrl && <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline">Open governed source</a>}</div></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No source references registered.</p>}
    </div>
  </Card>;
}

function PlanSectionEditor({ section, sourceDocuments, onSaved }: { section: PlanDetail['sections'][number]; sourceDocuments: SourceDocument[]; onSaved: (section: PlanDetail['sections'][number]) => void }) {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { planId = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const [narrative, setNarrative] = useState(typeof section.content.narrative === 'string' ? section.content.narrative : '');
  const [citationLabels, setCitationLabels] = useState(section.citations.filter((citation) => !citation.sourceDocumentId).map((citation) => citation.label).join('\n'));
  const [linkedCitations, setLinkedCitations] = useState(section.citations.filter((citation) => citation.sourceDocumentId));
  const [sourceDocumentId, setSourceDocumentId] = useState('');
  const [status, setStatus] = useState(section.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!selectedOrg) return;
    setSaving(true); setError('');
    try {
      const updated = await api.capturePro<PlanDetail['sections'][number]>(`/plans/${encodeURIComponent(planId)}/sections/${encodeURIComponent(section.code)}`, {
        method: 'PATCH',
        body: JSON.stringify({ orgId: selectedOrg.id, status, content: { ...section.content, narrative }, citations: [...linkedCitations, ...citationLabels.split('\n').map((label) => label.trim()).filter(Boolean).map((label) => ({ label }))] }),
      });
      onSaved(updated); setEditing(false);
    } catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };
  return <div className="px-4 py-4"><button type="button" onClick={() => setEditing((value) => !value)} className="grid w-full gap-3 text-left md:grid-cols-[5rem_1fr_12rem_8rem] md:items-center" aria-expanded={editing}><span className="font-mono text-xs font-semibold text-teal-700">{section.code}</span><div><h2 className="text-sm font-semibold text-slate-900">{section.title}</h2><p className="mt-1 text-xs text-slate-500">{section.citations.length} citations</p></div><span className="text-xs text-slate-600">{section.owningAgent}</span><span className="rounded bg-slate-100 px-2 py-1 text-center text-xs font-medium text-slate-600">{section.status}</span></button>
    {editing && <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4"><label className="text-xs font-semibold text-slate-600">Section narrative<textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} rows={7} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-slate-600">Unlinked citation labels<textarea value={citationLabels} onChange={(event) => setCitationLabels(event.target.value)} rows={3} placeholder="One citation label per line" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label><div><label className="text-xs font-semibold text-slate-600">Governed source<select value={sourceDocumentId} onChange={(event) => setSourceDocumentId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal"><option value="">Select registered source</option>{sourceDocuments.filter((document) => !linkedCitations.some((citation) => citation.sourceDocumentId === document.id)).map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}</select></label><Button variant="secondary" disabled={!sourceDocumentId} onClick={() => { const document = sourceDocuments.find((item) => item.id === sourceDocumentId); if (document) setLinkedCitations((current) => [...current, { label: document.fileName, sourceDocumentId: document.id }]); setSourceDocumentId(''); }}>Add governed source</Button>{linkedCitations.length > 0 && <ul className="mt-2 space-y-1">{linkedCitations.map((citation) => <li key={citation.sourceDocumentId} className="flex items-center justify-between gap-2 text-xs text-slate-600"><span>{citation.label}</span><button type="button" onClick={() => setLinkedCitations((current) => current.filter((item) => item.sourceDocumentId !== citation.sourceDocumentId))} className="font-medium text-red-700">Remove</button></li>)}</ul>}</div><label className="text-xs font-semibold text-slate-600">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal"><option>Waiting</option><option>Generated</option><option>Needs Input</option><option>Accepted</option></select></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving...' : 'Save section'}</Button></div></div>}
  </div>;
}

export function CaptureProOverviewPage() {
  const { data, error, loading } = useCaptureProRequest<{ opportunityCount: number; planCount: number; dataSetCount: number; sourceItemCount: number; recentOpportunities: Opportunity[] }>('/overview');
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error || 'Overview is unavailable.'} />;
  const recentOpportunities = Array.isArray(data.recentOpportunities) ? data.recentOpportunities : [];
  const metrics = [
    [data.opportunityCount, 'Active opportunities', Radar], [data.planCount, 'Capture plans', FileStack],
    [data.dataSetCount, 'Governed data sets', Database], [data.sourceItemCount, 'Catalogued source items', BookOpenCheck],
  ] as const;
  return (
    <div>
      <PageHeader eyebrow="Commercial intelligence" title="Capture-Pro command center" description="Turn fragmented pursuit evidence into a cited, reviewable capture plan for upcoming bids. AI output remains decision support; commitments require human authorisation." action={<Link to="opportunities"><Button><Cloud size={16} />Salesforce opportunities</Button></Link>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([value, label, Icon]) => <Card key={label} className="border-t-4 border-t-teal-600"><Icon size={18} className="text-teal-700" /><p className="mt-4 text-3xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></Card>)}</div>
      <section className="mt-7"><h2 className="text-base font-semibold text-slate-900">Pursuit lifecycle</h2><div className="mt-3 grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 md:grid-cols-3 xl:grid-cols-6">{lifecycle.map(([number, title, description]) => <div key={number} className="min-h-36 bg-white p-4"><span className="text-xs font-bold text-teal-700">{number}</span><h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{description}</p></div>)}</div></section>
      <div className="mt-7 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Recent Capture-Pro opportunities</h2></div>{recentOpportunities.length === 0 ? <p className="mt-6 text-sm text-slate-500">No Capture-Pro opportunities yet. Review imported pursuits in Salesforce Opportunities.</p> : <div className="mt-4 divide-y divide-slate-100">{recentOpportunities.map((opportunity) => <div key={opportunity.id} className="flex items-center gap-3 py-3"><span className="rounded-md bg-slate-100 p-2 text-slate-600"><Target size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{opportunity.opportunityNumber} · {opportunity.name}</p><p className="text-xs text-slate-500">{opportunity.client} · {opportunity.region}</p></div><span className="text-xs font-medium text-slate-600">{opportunity.status}</span></div>)}</div>}</Card>
        <Card className="bg-slate-950 text-white"><Sparkles size={19} className="text-teal-300" /><h2 className="mt-4 font-semibold">Grounded by design</h2><p className="mt-2 text-sm leading-6 text-slate-300">TG3 sources are catalogued with ownership and freshness. Generated sections retain citations, versions, actor history, and human decision points.</p><Link to="data-library" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-teal-300">Open data library <ArrowRight size={15} /></Link></Card>
      </div>
    </div>
  );
}

export function CaptureProDataLibraryPage() {
  const { data, error, loading } = useCaptureProRequest<DataSet[]>('/data-sets');
  return <div><PageHeader eyebrow="Knowledge layer" title="TG3 governed data library" description="A metadata catalog of the Commercial Intelligence TG3 folder. Capture-Pro does not copy SharePoint binaries; source access remains governed by Microsoft 365 permissions." />
    <div className="mb-5 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">SharePoint content ingestion requires an approved application identity, least-privilege site access, retention rules, and licensing review. This release records source metadata and freshness only.</div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.map((item) => <DataSetCard key={item.id} item={item} />)}</div>}
  </div>;
}

export function CaptureProAgentsPage() {
  return <div><PageHeader eyebrow="Orchestration" title="Agent workspace" description="Specialist responsibilities and hand-offs from the Commercial Intelligence concept. The orchestrator mediates every hand-off; agents do not call one another directly." />
    <div className="grid gap-4 xl:grid-cols-[1fr_18rem_1fr]"><div className="space-y-3">{agents.slice(0, 3).map(([name, description, sections]) => <Card key={name}><div className="flex gap-3"><Bot size={19} className="mt-0.5 text-teal-700" /><div><h2 className="font-semibold text-slate-900">{name}</h2><p className="mt-1 text-sm text-slate-600">{description}</p><p className="mt-3 text-xs font-medium text-slate-500">Owns {sections}</p></div></div></Card>)}</div><Card className="flex min-h-72 flex-col items-center justify-center bg-slate-950 text-center text-white"><GitBranch size={28} className="text-teal-300" /><h2 className="mt-4 font-semibold">Capture-Pro Orchestrator</h2><p className="mt-2 text-sm leading-6 text-slate-300">Dispatches section jobs, enforces source boundaries, records run state, and hands structured output to composition.</p><span className="mt-5 rounded bg-amber-300/15 px-3 py-1 text-xs font-medium text-amber-200">Execution runtime not configured</span></Card><div className="space-y-3">{agents.slice(3).map(([name, description, sections]) => <Card key={name}><div className="flex gap-3"><Bot size={19} className="mt-0.5 text-teal-700" /><div><h2 className="font-semibold text-slate-900">{name}</h2><p className="mt-1 text-sm text-slate-600">{description}</p><p className="mt-3 text-xs font-medium text-slate-500">Owns {sections}</p></div></div></Card>)}<Card><ShieldCheck size={19} className="text-amber-700" /><h2 className="mt-3 font-semibold">Control boundary</h2><p className="mt-2 text-sm leading-6 text-slate-600">Top tension, rates, and FX must come from validated deterministic services. Models may explain these values but cannot invent them.</p></Card></div></div>
  </div>;
}

export function CaptureProPlansPage() {
  const api = useApi(); const { selectedOrg } = useOrg(); const navigate = useNavigate();
  const { data: plans, error, loading, setData } = useCaptureProRequest<PlanRow[]>('/plans');
  const { data: opportunities } = useCaptureProRequest<Opportunity[]>('/opportunities');
  const [opportunityId, setOpportunityId] = useState(''); const [saving, setSaving] = useState(false); const [createError, setCreateError] = useState('');
  const available = opportunities?.filter((opportunity) => !plans?.some((row) => row.opportunity.id === opportunity.id)) ?? [];
  const createPlan = async () => { if (!selectedOrg || !opportunityId) return; setSaving(true); setCreateError(''); try { const plan = await api.capturePro<PlanRow['plan']>('/plans', { method: 'POST', body: JSON.stringify({ orgId: selectedOrg.id, opportunityId }) }); const opportunity = opportunities?.find((item) => item.id === opportunityId); if (opportunity) setData([{ plan, opportunity }, ...(plans ?? [])]); setOpportunityId(''); } catch (requestError) { setCreateError((requestError as Error).message); } finally { setSaving(false); } };
  return <div><PageHeader eyebrow="Composition" title="Capture plans" description="Commission one governed capture plan per opportunity. Each plan starts with the corporate 14-section structure and an immutable version record." action={<div className="flex gap-2"><select aria-label="Opportunity" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} className="min-w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select opportunity</option>{available.map((item) => <option key={item.id} value={item.id}>{item.opportunityNumber} · {item.name}</option>)}</select><Button disabled={!opportunityId || saving} onClick={() => void createPlan()}><Plus size={16} />Commission</Button></div>} />
    {createError && <p role="alert" className="mb-4 text-sm text-red-700">{createError}</p>}{loading ? <LoadingState /> : error ? <ErrorState message={error} /> : !plans?.length ? <Card><p className="text-sm text-slate-500">No plans commissioned. Add an opportunity, then commission its 14-section capture plan.</p></Card> : <div className="grid gap-3 lg:grid-cols-2">{plans.map(({ plan, opportunity }) => <button key={plan.id} type="button" onClick={() => navigate(`/app/product/Capture-Pro/plans/${plan.id}`)} className="text-left"><Card className="transition hover:border-teal-400 hover:shadow-md"><div className="flex items-start justify-between"><FileStack size={19} className="text-teal-700" /><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">v{plan.currentVersion}</span></div><h2 className="mt-4 font-semibold text-slate-900">{plan.title}</h2><p className="mt-1 text-sm text-slate-500">{opportunity.client} · {opportunity.region}</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-medium text-amber-700">{plan.status}</span><ArrowRight size={16} className="text-slate-400" /></div></Card></button>)}</div>}
  </div>;
}

export function CaptureProPlanPage() {
  const { planId = '' } = useParams();
  const api = useApi(); const { selectedOrg } = useOrg(); const { user } = useSession();
  const [refreshKey, setRefreshKey] = useState(0); const [showVersionForm, setShowVersionForm] = useState(false); const [versionError, setVersionError] = useState(''); const [versioning, setVersioning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('Capture Strategy'); const [queueing, setQueueing] = useState(false); const [queueError, setQueueError] = useState('');
  const [statusError, setStatusError] = useState(''); const [updatingStatus, setUpdatingStatus] = useState(false);
  const { data, error, loading, setData } = useCaptureProRequest<PlanDetail>(`/plans/${encodeURIComponent(planId)}`, [planId, refreshKey]);
  const { data: sourceDocuments } = useCaptureProRequest<SourceDocument[]>(`/plans/${encodeURIComponent(planId)}/source-documents`, [planId]);
  if (loading) return <LoadingState />; if (error || !data) return <ErrorState message={error || 'Capture plan not found.'} />;
  const createVersion = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedOrg) return; const fields = new FormData(event.currentTarget); setVersioning(true); setVersionError(''); try { await api.capturePro(`/plans/${encodeURIComponent(planId)}/versions`, { method: 'POST', body: JSON.stringify({ orgId: selectedOrg.id, changeSummary: fields.get('changeSummary') }) }); setShowVersionForm(false); setRefreshKey((value) => value + 1); } catch (requestError) { setVersionError((requestError as Error).message); } finally { setVersioning(false); } };
  const queueAgentRun = async () => { if (!selectedOrg) return; setQueueing(true); setQueueError(''); try { const run = await api.capturePro<PlanDetail['runs'][number]>(`/plans/${encodeURIComponent(planId)}/agent-runs`, { method: 'POST', body: JSON.stringify({ orgId: selectedOrg.id, agent: selectedAgent, inputSnapshot: { version: data.version.version } }) }); setData({ ...data, runs: [run, ...data.runs] }); } catch (requestError) { setQueueError((requestError as Error).message); } finally { setQueueing(false); } };
  const isAdministrator = selectedOrg?.membership === 'Owner' || selectedOrg?.membership === 'Admin' || !!user?.globalRoles.includes('Global Administrator');
  const nextStatuses = data.plan.status === 'Draft' ? ['In Review'] : data.plan.status === 'In Review' ? ['Draft', ...(isAdministrator ? ['Authorised'] : [])] : data.plan.status === 'Authorised' && isAdministrator ? ['Archived'] : [];
  const updateStatus = async (status: string) => { if (!selectedOrg) return; setUpdatingStatus(true); setStatusError(''); try { const plan = await api.capturePro<PlanDetail['plan']>(`/plans/${encodeURIComponent(planId)}/status`, { method: 'PATCH', body: JSON.stringify({ orgId: selectedOrg.id, status }) }); setData({ ...data, plan }); } catch (requestError) { setStatusError((requestError as Error).message); } finally { setUpdatingStatus(false); } };
  return <div><PageHeader eyebrow={`${data.opportunity.opportunityNumber} · Version ${data.version.version}`} title={data.plan.title} description={`${data.opportunity.client} · ${data.opportunity.region}. ${data.version.changeSummary}`} action={<div className="flex gap-2"><Button onClick={() => setShowVersionForm((value) => !value)}><GitBranch size={16} />New version</Button><Link to="/app/product/Capture-Pro/plans"><Button variant="secondary">Back to plans</Button></Link></div>} />
    {showVersionForm && <Card className="mb-5"><form onSubmit={createVersion} className="flex flex-wrap items-end gap-3"><label className="min-w-72 flex-1 text-xs font-semibold text-slate-600">Change summary<input name="changeSummary" required maxLength={2000} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label><Button type="submit" disabled={versioning}>{versioning ? 'Creating...' : 'Create version'}</Button>{versionError && <p role="alert" className="w-full text-sm text-red-700">{versionError}</p>}</form></Card>}
    <Card className="mb-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-slate-500">Plan status</p><p className="mt-1 font-semibold text-slate-900">{data.plan.status}</p></div><div className="flex flex-wrap gap-2">{nextStatuses.map((status) => <Button key={status} variant={status === 'Authorised' || status === 'Archived' ? 'primary' : 'secondary'} disabled={updatingStatus} onClick={() => void updateStatus(status)}>{status === 'In Review' ? 'Send for review' : status === 'Draft' ? 'Return to draft' : status}</Button>)}</div>{statusError && <p role="alert" className="w-full text-sm text-red-700">{statusError}</p>}</div></Card>
    <div className="grid gap-3 sm:grid-cols-3"><Card><Gauge size={18} className="text-teal-700" /><p className="mt-3 text-2xl font-semibold">{data.sections.filter((section) => section.status === 'Accepted').length}/14</p><p className="text-sm text-slate-500">Sections accepted</p></Card><Card><Activity size={18} className="text-teal-700" /><p className="mt-3 text-2xl font-semibold">{data.runs.length}</p><p className="text-sm text-slate-500">Recorded agent runs</p></Card><Card><ShieldCheck size={18} className="text-teal-700" /><p className="mt-3 text-2xl font-semibold">{data.auditEvents.length}</p><p className="text-sm text-slate-500">Audit events</p></Card></div>
    <Card className="mt-5"><div className="flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-xs font-semibold text-slate-600">Specialist agent<select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal">{agents.map(([name]) => <option key={name}>{name}</option>)}</select></label><Button onClick={() => void queueAgentRun()} disabled={queueing}><Bot size={16} />{queueing ? 'Queueing...' : 'Queue run'}</Button><p className="w-full text-xs text-amber-700">This records a queued request only. No execution runtime is configured.</p>{queueError && <p role="alert" className="w-full text-sm text-red-700">{queueError}</p>}</div></Card>
    <Card className="mt-5 overflow-hidden p-0"><div className="divide-y divide-slate-100">{data.sections.map((section) => <PlanSectionEditor key={section.id} section={section} sourceDocuments={sourceDocuments ?? []} onSaved={(updated) => setData({ ...data, sections: data.sections.map((item) => item.id === updated.id ? updated : item) })} />)}</div></Card>
  </div>;
}

export function CaptureProGovernancePage() {
  const { data, error, loading } = useCaptureProRequest<AuditEvent[]>('/audit');
  return <div><PageHeader eyebrow="Control and evidence" title="Governance & audit" description="Trace human and system actions while preserving source boundaries, versions, and decision authority." />
    <div className="mb-5 grid gap-3 md:grid-cols-3"><Card><Users size={18} className="text-teal-700" /><h2 className="mt-3 font-semibold">Human in the loop</h2><p className="mt-2 text-sm text-slate-600">Agents recommend. Authorised people approve assumptions, capture plans, and bid decisions.</p></Card><Card><BookOpenCheck size={18} className="text-teal-700" /><h2 className="mt-3 font-semibold">Source grounding</h2><p className="mt-2 text-sm text-slate-600">Commercially material assertions retain citations and freshness metadata.</p></Card><Card><CheckCircle2 size={18} className="text-teal-700" /><h2 className="mt-3 font-semibold">Deterministic controls</h2><p className="mt-2 text-sm text-slate-600">Engineering calculations, rates, and FX remain validated service outputs.</p></Card></div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : <Card className="overflow-x-auto p-0"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Reference</th></tr></thead><tbody className="divide-y divide-slate-100">{data?.length ? data.map((event) => <tr key={event.id}><td className="px-4 py-3 text-slate-500">{new Date(event.createdAt).toLocaleString()}</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{event.actorType}</span></td><td className="px-4 py-3 font-medium text-slate-900">{event.action}</td><td className="px-4 py-3 font-mono text-xs text-slate-500">{event.actorId}</td></tr>) : <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No Capture-Pro activity has been recorded.</td></tr>}</tbody></table></Card>}
  </div>;
}