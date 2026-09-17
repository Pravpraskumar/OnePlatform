import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, Edit2, ExternalLink, GripVertical, Lock, Plus, Save, Trash2, Unlock, UserCheck, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';
import { useOrg } from '@/state/OrgProvider';
import { useSession } from '@/state/SessionProvider';

const approverTitles = [
  'Local Team',
  'Legal Team',
  'VP Legal',
  'VP Finance',
  'EXCOM',
  'Chief Legal Officer',
  'Chief Financial Officer',
  'Treasury Team',
  'Treasurer',
] as const;

type ApproverTitle = typeof approverTitles[number];

interface RequestDetails {
  id: string;
  requestNumber: string;
  status: string;
  instrumentType: string;
  requestedByUserId?: string | null;
  approversFinalizedByUserId?: string | null;
  approversFinalizedAt?: string | null;
  details?: {
    pcgLanguage?: 'Standard Description' | 'Beneficiary / Client Required Format' | 'Standard Approved Wording' | 'Non-Standard Wording' | 'Standard Text' | 'Non-Standard Text';
    parentEntityType?: 'localEntity' | 'mil';
  } | null;
}

interface ApproverContact {
  id: string;
  name: string;
  email: string;
}

interface ApproverRow {
  id: string;
  sequenceOrder: number;
  title: ApproverTitle;
  approverId: string | null;
  approverName?: string;
  approverEmail?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  actionedDate?: string;
  approvalLink?: string;
}

const createRowId = () => `draft-${crypto.randomUUID()}`;

function safeApprovalLink(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function resequence(rows: ApproverRow[]) {
  return rows.map((row, index) => ({ ...row, sequenceOrder: index + 1 }));
}

function getRequiredApprovers(request: RequestDetails): ApproverTitle[] {
  const { instrumentType } = request;
  const pcgLanguage = request.details?.pcgLanguage;
  const parentEntityType = request.details?.parentEntityType;
  const standardWording = ['Standard Description', 'Standard Approved Wording', 'Standard Text'].includes(pcgLanguage ?? '');
  
  if (instrumentType === 'Letter of Comfort') {
    return standardWording
      ? ['Local Team', 'Treasurer']
      : ['Local Team', 'Legal Team', 'Treasurer'];
  }
  
  if (instrumentType === 'Parent Company Guarantee') {
    return parentEntityType === 'mil'
      ? ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'EXCOM', 'Chief Legal Officer', 'Chief Financial Officer', 'Treasurer']
      : ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'Treasurer'];
  }
  
  return [];
}

export function CreditGuardRequestApproversPage() {
  const api = useApi();
  const { user } = useSession();
  const navigate = useNavigate();
  const { selectedOrg } = useOrg();
  const { requestId } = useParams<{ requestId: string }>();
  const [searchParams] = useSearchParams();
  const [request, setRequest] = useState<RequestDetails | null>(null);
  const [approverContacts, setApproverContacts] = useState<ApproverContact[]>([]);
  const [approverRows, setApproverRows] = useState<ApproverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showFinalizeWarning, setShowFinalizeWarning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const projectId = searchParams.get('projectId');
  const requestsUrl = `/app/product/CreditGuard/requests${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
  const dragRef = useRef<string | null>(null);
  const chainActioned = approverRows.some(({ approvalStatus }) => approvalStatus && approvalStatus !== 'pending');
  const chainFinalized = !!request?.approversFinalizedAt;
  const chainLocked = chainActioned || chainFinalized;
  const isAdministrator = selectedOrg?.membership === 'Owner' || selectedOrg?.membership === 'Admin' || !!user?.globalRoles.includes('Global Administrator');
  const canFinalize = request?.requestedByUserId === user?.id || isAdministrator;

  useEffect(() => {
    if (!selectedOrg || !requestId) return;
    setLoading(true);
    
    Promise.all([
      api.creditGuard<RequestDetails>(`/requests/${requestId}?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.creditGuard<ApproverContact[]>(`/approvers?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.creditGuard<ApproverRow[]>(`/requests/${requestId}/approver-assignments?orgId=${encodeURIComponent(selectedOrg.id)}`),
    ]).then(([requestResult, contactRows, existingAssignments]) => {
      setRequest(requestResult);
      setApproverContacts(contactRows);
      
      const requiredTitles = getRequiredApprovers(requestResult);
      const existingRows = [...existingAssignments].sort((left, right) => left.sequenceOrder - right.sequenceOrder);
      const assignedTitles = new Set(existingRows.map(({ title }) => title));
      const defaultRows: ApproverRow[] = requiredTitles
        .filter((title) => !assignedTitles.has(title))
        .map((title) => ({
          id: createRowId(),
          sequenceOrder: 0,
          title,
          approverId: null,
          approvalStatus: 'pending',
        }));

      setApproverRows(resequence([...existingRows, ...defaultRows]));
      setHasUnsavedChanges(defaultRows.length > 0);
    }).catch((error) => notify((error as Error).message, 'error')).finally(() => setLoading(false));
  }, [api, requestId, selectedOrg]);

  const handleAddRow = () => {
    if (chainLocked) return;
    const newRow: ApproverRow = {
      id: createRowId(),
      sequenceOrder: approverRows.length + 1,
      title: approverTitles[0],
      approverId: null,
      approvalStatus: 'pending',
    };
    setApproverRows((current) => [...current, newRow]);
    setHasUnsavedChanges(true);
    setEditingId(newRow.id);
  };

  const handleDeleteRow = (id: string) => {
    if (chainLocked) return;
    setApproverRows((current) => resequence(current.filter((row) => row.id !== id)));
    setHasUnsavedChanges(true);
    if (editingId === id) setEditingId(null);
  };

  const handleUpdateRow = (id: string, updates: Partial<ApproverRow>) => {
    setApproverRows((current) => current.map((row) => (row.id === id ? { ...row, ...updates } : row)));
    setHasUnsavedChanges(true);
  };

  const handleApproverChange = (id: string, approverId: string) => {
    const contact = approverContacts.find((c) => c.id === approverId);
    if (contact) {
      handleUpdateRow(id, {
        approverId,
        approverName: contact.name,
        approverEmail: contact.email,
      });
    } else {
      handleUpdateRow(id, { approverId: null, approverName: undefined, approverEmail: undefined });
    }
  };

  const moveRow = (sourceId: string, targetId: string) => {
    if (chainLocked || sourceId === targetId) return;
    setApproverRows((current) => {
      const sourceIndex = current.findIndex(({ id }) => id === sourceId);
      const targetIndex = current.findIndex(({ id }) => id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      setHasUnsavedChanges(true);
      return resequence(next);
    });
  };

  const moveRowByOffset = (id: string, offset: -1 | 1) => {
    const index = approverRows.findIndex((row) => row.id === id);
    const target = approverRows[index + offset];
    if (target) moveRow(id, target.id);
  };

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, id: string) => {
    if (chainLocked) return;
    dragRef.current = id;
    setDraggedId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (event: React.DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = dragRef.current || event.dataTransfer.getData('text/plain');
    if (sourceId) moveRow(sourceId, targetId);
    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    dragRef.current = null;
  };

  const save = async () => {
    if (!selectedOrg || !requestId || approverRows.length === 0) return;
    
    setSaving(true);
    try {
      const savedRows = await api.creditGuard<ApproverRow[]>(`/requests/${requestId}/approver-assignments`, {
        method: 'PUT',
        body: JSON.stringify({
          orgId: selectedOrg.id,
          approvers: approverRows.map(({ sequenceOrder, title, approverId }) => ({ sequenceOrder, title, approverId })),
        }),
      });
      setApproverRows(savedRows);
      setHasUnsavedChanges(false);
      setEditingId(null);
      notify('Approvers saved successfully.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!selectedOrg || !requestId) return;
    setSaving(true);
    try {
      const updated = await api.creditGuard<RequestDetails>(`/requests/${requestId}/approver-assignments/finalize`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id }),
      });
      setRequest((current) => current ? { ...current, ...updated } : updated);
      setEditingId(null);
      setShowFinalizeWarning(false);
      notify('Approval chain finalized and locked.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const modify = async () => {
    if (!selectedOrg || !requestId) return;
    setSaving(true);
    try {
      const updated = await api.creditGuard<RequestDetails>(`/requests/${requestId}/approver-assignments/modify`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id }),
      });
      setRequest((current) => current ? { ...current, ...updated } : updated);
      notify('Approval chain unlocked for modification.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedOrg) return <Card>Select an organisation before assigning approvers.</Card>;
  if (loading) return <p className="text-sm text-slate-500">Loading approver assignments...</p>;
  if (!request) return <Card>Request not found.</Card>;

  return (
    <div className="mx-auto max-w-6xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500"><Link to={requestsUrl} className="hover:text-brand">Requests</Link><ChevronRight size={14} /><span className="font-medium text-slate-900">Assign Approvers</span></nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div><h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><UserCheck size={24} />Assign Approvers</h1><p className="mt-1 text-sm text-slate-500">{request.requestNumber} · {request.status}</p></div>
        <div className="flex gap-2">
          {chainFinalized && isAdministrator && <Button type="button" onClick={() => void modify()} disabled={saving || request.status !== 'Reviewed' || chainActioned}><Unlock size={16} />Modify</Button>}
          <Button variant="secondary" onClick={() => navigate(requestsUrl)}>Back to Requests</Button>
        </div>
      </div>
      
      {request.status !== 'Reviewed' ? (
        <Card className="mt-6"><p className="text-sm text-amber-700">Approvers can be assigned only after the request status is Reviewed.</p></Card>
      ) : (
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Approval Chain</h2>
            <Button type="button" onClick={handleAddRow} variant="secondary" disabled={chainLocked}><Plus size={16} />Add Approver</Button>
          </div>

          {chainFinalized && <p className="mb-4 text-sm text-amber-700">This approval chain is finalized and frozen. Only an organisation administrator can unlock it while the request remains Reviewed.</p>}
          {chainActioned && <p className="mb-4 text-sm text-amber-700">This approval chain can no longer be changed because an approver has actioned it.</p>}
          
          {approverRows.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No approvers configured. Click "Add Approver" to add approval roles.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="w-24 px-4 py-2 text-left text-xs font-semibold text-slate-600"><span className="sr-only">Reorder</span></th>
                    <th className="w-12 px-4 py-2 text-left text-xs font-semibold text-slate-600">Seq</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Approver Title</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Actioned Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Approval Link</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 w-16">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approverRows.map((row, index) => (
                    <tr
                      key={row.id}
                      onDragOver={handleDragOver}
                      onDrop={(event) => handleDrop(event, row.id)}
                      className={`border-b border-slate-200 transition-colors hover:bg-slate-50 ${draggedId === row.id ? 'bg-blue-50 opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-400">
                        <div className="flex items-center gap-1">
                          <button type="button" draggable={!chainLocked} disabled={chainLocked} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd} className="cursor-grab rounded p-1 hover:bg-slate-100 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Drag ${row.title}`} title="Drag to reorder"><GripVertical size={16} /></button>
                          <div className="flex flex-col">
                            <button type="button" onClick={() => moveRowByOffset(row.id, -1)} disabled={chainLocked || index === 0} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-25" aria-label={`Move ${row.title} up`}><ChevronUp size={12} /></button>
                            <button type="button" onClick={() => moveRowByOffset(row.id, 1)} disabled={chainLocked || index === approverRows.length - 1} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-25" aria-label={`Move ${row.title} down`}><ChevronDown size={12} /></button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{row.sequenceOrder}</td>
                      <td className="px-4 py-3">
                        {editingId === row.id ? (
                          <select
                            value={row.title}
                            onChange={(e) => handleUpdateRow(row.id, { title: e.target.value as ApproverTitle })}
                            aria-label={`Approver title for sequence ${row.sequenceOrder}`}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          >
                            {approverTitles.map((title) => (
                              <option key={title} value={title}>{title}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-900 font-medium">{row.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === row.id ? (
                          <select
                            value={row.approverId || ''}
                            onChange={(e) => handleApproverChange(row.id, e.target.value)}
                            aria-label={`Approver for ${row.title}`}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          >
                            <option value="">Select approver</option>
                            {approverContacts.map((contact) => (
                              <option key={contact.id} value={contact.id}>{contact.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={row.approverName ? 'text-slate-900' : 'text-slate-400'}>{row.approverName || 'Not assigned'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{row.approverEmail || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          row.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' :
                          row.approvalStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {row.approvalStatus === 'approved' ? 'Approved' : row.approvalStatus === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{row.actionedDate ? new Date(row.actionedDate).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-3 text-xs">{safeApprovalLink(row.approvalLink) ? <a href={safeApprovalLink(row.approvalLink)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">Open<ExternalLink size={13} /></a> : <span className="text-slate-400">-</span>}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {editingId === row.id ? (
                            <button type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                              title="Done"
                              aria-label={`Finish editing ${row.title}`}
                            >
                              <Check size={14} />
                            </button>
                          ) : (
                            <button type="button"
                              onClick={() => setEditingId(row.id)}
                              disabled={chainLocked}
                              className="rounded p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                              title="Edit"
                              aria-label={`Edit ${row.title}`}
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            disabled={chainLocked}
                            className="rounded p-1.5 text-slate-600 hover:bg-red-100 hover:text-red-700"
                            title="Delete"
                            aria-label={`Delete ${row.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {approverContacts.length === 0 && (
            <p className="mt-4 text-sm text-amber-700">No approver contacts are configured. Add contacts in Application Setup / Module Users.</p>
          )}
          
          <div className="mt-6 flex justify-end gap-2">
            {editingId && <Button type="button" variant="ghost" onClick={() => setEditingId(null)}><X size={16} />Finish Editing</Button>}
            <Button type="button" variant="secondary" onClick={() => navigate(requestsUrl)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={chainLocked || saving || approverRows.length === 0}>
              <Save size={16} />{saving ? 'Saving...' : 'Save Approvers'}
            </Button>
            {!chainFinalized && canFinalize && <Button type="button" onClick={() => setShowFinalizeWarning(true)} disabled={chainActioned || saving || hasUnsavedChanges || approverRows.length === 0 || approverRows.some(({ approverId }) => !approverId)}><Lock size={16} />Finalize</Button>}
          </div>
        </Card>
      )}

      {showFinalizeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="finalize-approvers-title" aria-describedby="finalize-approvers-description" className="w-full max-w-md rounded-md bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-100 p-2 text-amber-700"><Lock size={20} /></div>
              <div>
                <h2 id="finalize-approvers-title" className="text-lg font-semibold text-slate-900">Finalize approval chain?</h2>
                <p id="finalize-approvers-description" className="mt-2 text-sm text-slate-600">The approver list will be frozen and cannot be edited. Only an organisation administrator can unlock it while this request remains Reviewed.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowFinalizeWarning(false)} disabled={saving}>Keep editing</Button>
              <Button type="button" onClick={() => void finalize()} disabled={saving}><Lock size={16} />{saving ? 'Finalizing...' : 'Finalize and lock'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}