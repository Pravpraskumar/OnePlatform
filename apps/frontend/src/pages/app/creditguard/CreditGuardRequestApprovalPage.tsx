import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, ExternalLink, FileText, RefreshCw, RotateCcw, Send, UsersRound } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';
import { useOrg } from '@/state/OrgProvider';
import { useSession } from '@/state/SessionProvider';

interface RequestSummary {
  id: string;
  requestNumber: string;
  instrumentType: string;
  beneficiary: string;
  status: string;
  approversFinalizedAt?: string | null;
  signitEnvelopeId?: string | null;
  approvalInitiatedAt?: string | null;
}

interface RequestAttachment {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

interface ApproverAssignment {
  id: string;
  sequenceOrder: number;
  title: string;
  approverName?: string | null;
  approverEmail?: string | null;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  actionedDate?: string | null;
  approvalLink?: string | null;
}

interface EnvelopeStatus {
  title: string | null;
  status: string | null;
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeApprovalLink(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function CreditGuardRequestApprovalPage() {
  const api = useApi();
  const { user } = useSession();
  const navigate = useNavigate();
  const { selectedOrg } = useOrg();
  const { requestId } = useParams<{ requestId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const requestsUrl = `/app/product/CreditGuard/requests${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
  const [request, setRequest] = useState<RequestSummary | null>(null);
  const [productId, setProductId] = useState('');
  const [attachments, setAttachments] = useState<RequestAttachment[]>([]);
  const [approvers, setApprovers] = useState<ApproverAssignment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [showRecallConfirmation, setShowRecallConfirmation] = useState(false);
  const [envelopeStatus, setEnvelopeStatus] = useState<EnvelopeStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedOrg || !requestId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.creditGuard<RequestSummary>(`/requests/${requestId}?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.creditGuard<RequestAttachment[]>(`/requests/${requestId}/attachments?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.creditGuard<ApproverAssignment[]>(`/requests/${requestId}/approver-assignments?orgId=${encodeURIComponent(selectedOrg.id)}`),
    ])
      .then(([products, requestResult, attachmentRows, approverRows]) => {
        const product = products.find((candidate) => candidate.code.toLowerCase() === 'creditguard');
        if (!product) throw new Error('CreditGuard is not available for this organisation.');
        setProductId(product.id);
        setRequest(requestResult);
        setAttachments(attachmentRows.filter(({ mimeType }) => mimeType === 'application/pdf'));
        setApprovers([...approverRows].sort((left, right) => left.sequenceOrder - right.sequenceOrder));
      })
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setLoading(false));
  }, [api, requestId, selectedOrg]);

  const toggleAttachment = (id: string) => {
    setSelectedAttachmentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendToSignit = async () => {
    if (!selectedOrg || !requestId || !productId || selectedAttachmentIds.size === 0) return;
    setSending(true);
    setError('');
    try {
      const updated = await api.creditGuard<RequestSummary>(`/requests/${requestId}/initiate-approval`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id, productId, attachmentIds: [...selectedAttachmentIds] }),
      });
      const approverRows = await api.creditGuard<ApproverAssignment[]>(`/requests/${requestId}/approver-assignments?orgId=${encodeURIComponent(selectedOrg.id)}`);
      setRequest(updated);
      setApprovers([...approverRows].sort((left, right) => left.sequenceOrder - right.sequenceOrder));
      notify('Approval sent to Signit.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSending(false);
    }
  };

  const recallFromSignit = async () => {
    if (!selectedOrg || !requestId || !productId) return;
    setRecalling(true);
    setError('');
    try {
      const updated = await api.creditGuard<RequestSummary>(`/requests/${requestId}/recall-approval`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id, productId }),
      });
      const approverRows = await api.creditGuard<ApproverAssignment[]>(`/requests/${requestId}/approver-assignments?orgId=${encodeURIComponent(selectedOrg.id)}`);
      setRequest(updated);
      setApprovers([...approverRows].sort((left, right) => left.sequenceOrder - right.sequenceOrder));
      setShowRecallConfirmation(false);
      notify('Approval recalled from Signit.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
      setShowRecallConfirmation(false);
    } finally {
      setRecalling(false);
    }
  };

  const refreshFromSignit = async () => {
    if (!selectedOrg || !requestId || !productId) return;
    setRefreshing(true);
    setError('');
    try {
      const result = await api.creditGuard<EnvelopeStatus>(`/requests/${requestId}/refresh-approval`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id, productId }),
      });
      const approverRows = await api.creditGuard<ApproverAssignment[]>(`/requests/${requestId}/approver-assignments?orgId=${encodeURIComponent(selectedOrg.id)}`);
      setEnvelopeStatus(result);
      setApprovers([...approverRows].sort((left, right) => left.sequenceOrder - right.sequenceOrder));
      notify('Approval status refreshed from Signit.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  if (!selectedOrg) return <Card>Select an organisation before opening approval.</Card>;
  if (loading) return <p className="text-sm text-slate-500">Loading approval details...</p>;
  if (!request) return <Card>Request not found.</Card>;

  const sent = request.status === 'Sent for Approval';
  const canSend = request.status === 'Reviewed' && !!request.approversFinalizedAt && approvers.length > 0 && approvers.every(({ approverEmail }) => !!approverEmail);
  const isAdministrator = selectedOrg.membership === 'Owner' || selectedOrg.membership === 'Admin' || !!user?.globalRoles.includes('Global Administrator');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
        <Link to={requestsUrl} className="hover:text-brand">Requests</Link><ChevronRight size={14} />
        <span className="font-medium text-slate-900">{sent ? 'Approval Status' : 'Initiate Approval'}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div><h1 className="text-2xl font-semibold text-slate-900">{sent ? 'Approval Status' : 'Initiate Approval'}</h1><p className="mt-1 text-sm text-slate-500">{request.requestNumber} · {request.status}</p></div>
        <Button variant="secondary" onClick={() => navigate(requestsUrl)}>Back to Requests</Button>
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs font-medium uppercase text-slate-500">Type of Instrument</p><p className="mt-1 font-medium text-slate-900">{request.instrumentType}</p></div>
          <div><p className="text-xs font-medium uppercase text-slate-500">Beneficiary</p><p className="mt-1 font-medium text-slate-900">{request.beneficiary}</p></div>
          {request.signitEnvelopeId && <div><p className="text-xs font-medium uppercase text-slate-500">Signit Envelope ID</p><p className="mt-1 font-mono text-sm text-slate-900">{request.signitEnvelopeId}</p></div>}
          {request.approvalInitiatedAt && <div><p className="text-xs font-medium uppercase text-slate-500">Initiated</p><p className="mt-1 text-sm text-slate-900">{new Date(request.approvalInitiatedAt).toLocaleString()}</p></div>}
          {envelopeStatus?.status && <div><p className="text-xs font-medium uppercase text-slate-500">Signit Status</p><p className="mt-1 text-sm font-medium text-slate-900">{envelopeStatus.status}</p></div>}
        </div>
      </Card>

      {!sent && (
        <Card className="p-5">
          <div className="flex items-center gap-2"><FileText size={19} className="text-brand" /><h2 className="font-semibold text-slate-900">PDF documents</h2></div>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {attachments.map((attachment) => <label key={attachment.id} className="flex cursor-pointer items-center gap-3 px-2 py-3 hover:bg-slate-50"><input type="checkbox" checked={selectedAttachmentIds.has(attachment.id)} onChange={() => toggleAttachment(attachment.id)} className="h-4 w-4 accent-brand" /><FileText size={18} className="text-red-600" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{attachment.originalFileName}</span><span className="text-xs text-slate-500">{formatFileSize(attachment.fileSizeBytes)}</span></label>)}
            {attachments.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-500">No PDF documents are attached to this request.</p>}
          </div>
          {!request.approversFinalizedAt && <p className="mt-3 text-sm text-amber-700">Finalize the approver list before sending to Signit.</p>}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2"><UsersRound size={19} className="text-brand" /><h2 className="font-semibold text-slate-900">Approvers and actions</h2></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-600"><th className="px-3 py-2">Seq</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Approver</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Actioned</th><th className="px-3 py-2">Link</th></tr></thead><tbody>{approvers.map((approver) => { const link = safeApprovalLink(approver.approvalLink); return <tr key={approver.id} className="border-b border-slate-100"><td className="px-3 py-3">{approver.sequenceOrder}</td><td className="px-3 py-3 font-medium text-slate-900">{approver.title}</td><td className="px-3 py-3"><p>{approver.approverName || 'Not assigned'}</p><p className="text-xs text-slate-500">{approver.approverEmail || '-'}</p></td><td className="px-3 py-3 capitalize">{approver.approvalStatus || 'pending'}</td><td className="px-3 py-3">{approver.actionedDate ? new Date(approver.actionedDate).toLocaleString() : '-'}</td><td className="px-3 py-3">{link ? <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">Open<ExternalLink size={13} /></a> : '-'}</td></tr>; })}</tbody></table></div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(requestsUrl)}>Cancel</Button>
        {!sent && <Button onClick={() => void sendToSignit()} disabled={sending || !canSend || selectedAttachmentIds.size === 0}><Send size={16} />{sending ? 'Sending...' : 'Send to Signit for Approval'}</Button>}
        {sent && <Button variant="secondary" onClick={() => void refreshFromSignit()} disabled={refreshing || recalling}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing...' : 'Refresh'}</Button>}
        {sent && isAdministrator && <Button variant="danger" onClick={() => setShowRecallConfirmation(true)} disabled={recalling}><RotateCcw size={16} />Recall from Signit</Button>}
        {sent && <div className="inline-flex items-center gap-2 rounded-md bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} />Sent to Signit</div>}
      </div>

      {showRecallConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="recall-title" aria-describedby="recall-description" className="w-full max-w-md rounded-md bg-white p-6 shadow-xl">
            <h2 id="recall-title" className="text-lg font-semibold text-slate-900">Recall approval?</h2>
            <p id="recall-description" className="mt-2 text-sm text-slate-600">This deletes the envelope from Signit and returns the request to Reviewed.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowRecallConfirmation(false)} disabled={recalling}>Cancel</Button>
              <Button variant="danger" onClick={() => void recallFromSignit()} disabled={recalling}><RotateCcw size={16} />{recalling ? 'Recalling...' : 'Recall approval'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
