import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, MessageSquare, Paperclip, Plus, RefreshCw, Send, X } from 'lucide-react';
import type { FoundryChatStatus, FoundryConversation, FoundryConversationDetail, SalesforceOpportunityList, SpinergieCharterList, SpinergieVesselList } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useSession } from '@/state/SessionProvider';
import { CaptureProAgentsPage } from './CaptureProPages';

type Selection = { opportunityId: string; vesselId: string; charterId: string };
type Option = { value: string; label: string };
const emptySelection: Selection = { opportunityId: '', vesselId: '', charterId: '' };
const sourceLabels: Record<keyof Selection, string> = { opportunityId: 'Opportunity', vesselId: 'Vessel', charterId: 'Charter' };

export function CaptureProAgentChatPage() {
  const { selectedOrg } = useOrg();
  const { user } = useSession();
  return selectedOrg && user ? <AgentWorkspace key={`${selectedOrg.id}:${user.id}`} orgId={selectedOrg.id} /> : <p role="alert">Select an organisation and sign in to open Agent Workspace.</p>;
}

function AgentWorkspace({ orgId }: { orgId: string }) {
  const api = useApi();
  const active = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'chat' | 'overview'>('chat');
  const [status, setStatus] = useState<FoundryChatStatus | null>(null);
  const [conversations, setConversations] = useState<FoundryConversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [detail, setDetail] = useState<FoundryConversationDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [needsNew, setNeedsNew] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [options, setOptions] = useState<Record<keyof Selection, Option[]>>({ opportunityId: [], vesselId: [], charterId: [] });
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([
      api.capturePro<FoundryChatStatus>(`/agent-chat/status?orgId=${encodeURIComponent(orgId)}`).then((result) => { if (!cancelled) setStatus(result); }),
      api.capturePro<FoundryConversation[]>(`/agent-chat/conversations?orgId=${encodeURIComponent(orgId)}`).then((result) => {
        if (!Array.isArray(result)) throw new Error('Unexpected conversation response.');
        if (!cancelled) setConversations(result);
      }),
    ]).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Agent Workspace could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, orgId, attempt]);
  useEffect(() => {
    if (!conversationId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    api.capturePro<FoundryConversationDetail>(`/agent-chat/conversations/${encodeURIComponent(conversationId)}?orgId=${encodeURIComponent(orgId)}`)
      .then((result) => { if (!cancelled) { setDetail(result); setNeedsNew(result.conversation.blocked); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Conversation could not be loaded.'); });
    return () => { cancelled = true; };
  }, [api, orgId, conversationId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [detail, sending]);
  useEffect(() => {
    if (!contextOpen) return;
    let cancelled = false;
    setSourceLoading(true); setSourceError('');
    const query = `orgId=${encodeURIComponent(orgId)}`;
    Promise.all([
      api.capturePro<SalesforceOpportunityList>(`/salesforce-opportunities?${query}`),
      api.capturePro<SpinergieVesselList>(`/spinergie-vessels?${query}`),
      api.capturePro<SpinergieCharterList>(`/spinergie-charters?${query}`),
    ]).then(([opportunities, vessels, charters]) => {
      if (!Array.isArray(opportunities.opportunities) || !Array.isArray(vessels.vessels) || !Array.isArray(charters.charters)) throw new Error('Unexpected source response.');
      if (!cancelled) setOptions({
        opportunityId: opportunities.opportunities.map((row) => ({ value: row.salesforceId, label: `${row.opportunityNumber} - ${row.opportunityName ?? 'Opportunity'}` })),
        vesselId: vessels.vessels.map((row) => ({ value: row.vesselId, label: `${row.name ?? 'Vessel'} - ${row.vesselId}` })),
        charterId: charters.charters.map((row) => ({ value: row.charterId, label: `${row.name ?? row.vesselId} - ${String(row.fields.status ?? 'Charter')} - ${String(row.fields.dateStart ?? '')}` })),
      });
    }).catch((reason: unknown) => { if (!cancelled) setSourceError(reason instanceof Error ? reason.message : 'Source records could not be loaded.'); })
      .finally(() => { if (!cancelled) setSourceLoading(false); });
    return () => { cancelled = true; };
  }, [api, orgId, contextOpen]);

  const canSend = !!status?.ready && !sending && !needsNew && !detail?.conversation.blocked && (!conversationId || !!detail);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !canSend) return;
    setSending(true); setError('');
    let id = conversationId;
    try {
      if (!id) id = (await api.capturePro<FoundryConversation>('/agent-chat/conversations', { method: 'POST', body: JSON.stringify({ orgId }) })).id;
      const result = await api.capturePro<FoundryConversationDetail>(`/agent-chat/conversations/${encodeURIComponent(id)}/messages`, {
        method: 'POST', body: JSON.stringify({ orgId, message: draft.trim(), context: Object.fromEntries(Object.entries(selection).filter(([, value]) => value)) }),
      });
      if (active.current) { setConversationId(id); setDetail(result); setDraft(''); setConversations((current) => [result.conversation, ...current.filter((row) => row.id !== id)]); }
    } catch (reason: unknown) {
      if (active.current) { setError(reason instanceof Error ? reason.message : 'The agent could not complete the response.'); setNeedsNew(true); if (id) setConversationId(id); }
    } finally { if (active.current) setSending(false); }
  }
  function newConversation() { setConversationId(''); setDetail(null); setNeedsNew(false); setDraft(''); setError(''); setSelection(emptySelection); }
  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="agent-workspace-title">
      <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div><h1 id="agent-workspace-title" className="text-2xl font-semibold text-slate-950">Agent Workspace</h1><p className="mt-1 text-xs text-slate-500">{status?.agentName ?? 'Foundry agent'}</p></div>
        <div className="flex items-center gap-2"><span className={`text-xs font-medium ${status?.ready ? 'text-emerald-700' : 'text-amber-800'}`}>{loading ? 'Checking connection...' : status?.ready ? 'Connected' : 'Not connected'}</span><Button variant="ghost" disabled={loading || sending} aria-label="Refresh agent connection" title="Refresh connection" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} className={loading ? 'animate-spin' : undefined} /></Button></div>
      </header>
      <div role="tablist" aria-label="Agent workspace views" className="mb-3 flex shrink-0 gap-4 border-b border-slate-200">{(['chat', 'overview'] as const).map((view) => <button key={view} type="button" role="tab" aria-selected={tab === view} aria-controls={`agent-${view}-panel`} disabled={sending} onClick={() => setTab(view)} className={`flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-semibold ${tab === view ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500'}`}>{view === 'chat' ? <MessageSquare size={16} /> : <Bot size={16} />}{view === 'chat' ? 'Chat' : 'Agent overview'}</button>)}</div>
      {tab === 'overview' ? <div id="agent-overview-panel" role="tabpanel" className="min-h-0 overflow-auto"><CaptureProAgentsPage /></div> : <div id="agent-chat-panel" role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {!loading && !status?.ready && <p role="status" className="mb-3 shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{status?.reason ?? 'Agent connection status is unavailable.'}</p>}
        {error && <p role="alert" className="mb-3 shrink-0 break-words text-sm text-red-700">{error}</p>}
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-1">
          <aside aria-label="Your conversations" className="min-h-0 border-b border-slate-200 pb-3 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pr-3"><Button variant="secondary" disabled={sending} onClick={newConversation} className="w-full"><Plus size={16} />New conversation</Button><div className="mt-3 flex max-h-32 gap-2 overflow-auto lg:max-h-none lg:flex-col">{conversations.map((row) => <button key={row.id} disabled={sending} onClick={() => { setConversationId(row.id); setNeedsNew(row.blocked); setDraft(''); setError(''); setSelection(emptySelection); }} className={`min-w-32 rounded-md px-3 py-2 text-left text-sm lg:min-w-0 ${row.id === conversationId ? 'bg-teal-50 font-medium text-teal-900' : 'text-slate-600 hover:bg-slate-50'}`}><span className="block truncate">{row.title}</span><span className="mt-1 block text-[10px] text-slate-500">{new Date(row.updatedAt).toLocaleDateString()}</span></button>)}</div></aside>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div role="log" aria-label="Agent conversation" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2 pb-4">
              {!detail?.messages.length && !sending && <div className="flex h-full min-h-36 items-center justify-center text-slate-400"><MessageSquare size={32} /></div>}
              {detail?.messages.map((message) => <article key={message.id} className={`w-fit max-w-[90%] rounded-lg px-4 py-3 ${message.role === 'user' ? 'ml-auto bg-teal-50 text-slate-900' : 'bg-slate-50 text-slate-900'}`}><p className="mb-1 text-[11px] font-semibold text-slate-500">{message.role === 'user' ? 'You' : status?.agentName ?? 'Agent'}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>{message.error && <p className="mt-2 text-xs text-red-700">{message.error}</p>}{message.sources.length > 0 && <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Sources ({message.sources.length})</summary><ul className="mt-2 space-y-1">{message.sources.map((source, index) => <li key={index} className="break-words">{source.label}</li>)}</ul></details>}</article>)}
              {sending && <p role="status" className="flex items-center gap-2 text-sm text-teal-700"><RefreshCw size={15} className="animate-spin" />Agent is responding...</p>}<div ref={end} />
            </div>
            {contextOpen && <div className="mb-3 shrink-0 border-t border-slate-200 pt-3">
              <div className="mb-2 flex items-center gap-2"><input aria-label="Search source records" placeholder="Search source records" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm" /><Button variant="ghost" aria-label="Close source selection" title="Close source selection" onClick={() => setContextOpen(false)}><X size={16} /></Button></div>
              {sourceLoading && <p className="text-xs text-slate-500">Loading sources...</p>}{sourceError && <p role="alert" className="text-xs text-red-700">{sourceError}</p>}
              <div className="grid gap-2 sm:grid-cols-3">{(Object.keys(sourceLabels) as Array<keyof Selection>).map((key) => {
                const selected = options[key].find((option) => option.value === selection[key]);
                const matches = options[key].filter((option) => option.value !== selected?.value && option.label.toLowerCase().includes(sourceSearch.toLowerCase())).slice(0, 99);
                const choices = selected ? [selected, ...matches] : matches;
                return <label key={key} className="min-w-0 text-xs text-slate-500">{sourceLabels[key]}<select aria-label={`Select ${sourceLabels[key].toLowerCase()} context`} disabled={sending || sourceLoading} value={selection[key]} onChange={(event) => setSelection((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"><option value="">None</option>{choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
              })}</div>
              {selection.charterId && <p className="mt-2 text-xs text-amber-800">Charter context includes commercial terms and counterparties.</p>}
            </div>}
            <form onSubmit={(event) => void send(event)} className="shrink-0 border-t border-slate-200 pt-3">
              <textarea aria-label="Message the Foundry agent" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={8000} rows={3} disabled={!canSend} placeholder="Ask the agent..." onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50" />
              <div className="mt-2 flex items-center justify-between gap-3"><Button type="button" variant="ghost" disabled={sending} aria-label="Select source context" title="Select source context" onClick={() => setContextOpen((current) => !current)}><Paperclip size={16} /><span className="text-xs">{Object.values(selection).filter(Boolean).length || ''}</span></Button><Button type="submit" disabled={!canSend || !draft.trim()} aria-label="Send message" title="Send message" className="h-10 w-10 p-0"><Send size={17} /></Button></div>
              {(needsNew || detail?.conversation.blocked) && <p role="status" className="mt-2 text-xs text-amber-800">Start a new conversation to continue.</p>}<p className="mt-2 text-[11px] text-slate-500">Verify source evidence before making commercial or engineering decisions.</p>
            </form>
          </div>
        </div>
      </div>}
    </section>
  );
}