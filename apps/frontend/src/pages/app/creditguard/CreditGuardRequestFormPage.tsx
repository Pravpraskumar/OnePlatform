import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, ChevronsUpDown, ExternalLink, FilePlus2, MailCheck, Paperclip, Save, Search, Trash2, Upload, X } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useProductSession } from '@/hooks/useProductSession';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useSession } from '@/state/SessionProvider';
import { notify } from '@/lib/systemEvents';

interface RequestDetailsForm {
  emailRequestToCorporateTreasury: boolean;
  enableMultiEntity: boolean;
  parentCompanyOfferingGuarantee: string[];
  parentEntityType: 'localEntity' | 'mil';
  dateSubmitted: string;
  requestingEntity: string[];
  contractingEntity: string[];
  proposalContractReference: string;
  currentContractStatus: string;
  beneficiaryAddress: string;
  pcgLanguage: 'Standard Description' | 'Beneficiary / Client Required Format';
  maximumLiabilityMode: 'number' | 'text';
  maximumLiabilityPercent: string;
  obligationsExtinguishedMode: 'date' | 'text';
  obligationsExtinguishedDate: string;
  backgroundRequirement: string;
  projectDescription: string;
  optionalComments: string;
  deliveryInstructions: string;
  attachments: string;
  requesterName: string;
  requesterApprovalDate: string;
  blFinanceVpNameTitle: string;
  blFinanceVpApprovalDate: string;
  blLegalDepartment: string;
  blLegalApprovalDate: string;
  sustainabilityGovernanceApproval: string;
  sustainabilityGovernanceApprovalDate: string;
  cfoApproval: string;
  cfoApprovalDate: string;
  corporateTreasuryApproval: string;
  corporateTreasuryApprovalDate: string;
  legalLanguageConfirmed: boolean;
}

interface BusinessEntityOption {
  id: string;
  jobCodeEntity: string;
  segment1: string;
  legalEntityName: string;
}

interface CreditGuardRequestRecord {
  id: string;
  orgId: string;
  projectId: string | null;
  requestNumber: string;
  instrumentType: string;
  beneficiary: string;
  amount: number;
  currency: string;
  status: string;
  requestedByUserId: string | null;
  assignedReviewerUserId: string | null;
  assignedReviewerName: string | null;
  assignedReviewerEmail: string | null;
  submittedForReviewAt: string | null;
  dueDate: string | null;
  nextReviewDate: string | null;
  notes: string | null;
  details: Partial<RequestDetailsForm> | null;
  previousReviewerUserId?: string | null;
}

interface RequestAttachment {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  isLegacyMarker?: boolean;
}

interface ReviewerOption {
  id: string;
  displayName: string;
  email: string;
}

interface RequestFormProps {
  mode: 'new' | 'edit';
}

const today = new Date().toISOString().slice(0, 10);
const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10';
const labelClass = 'text-sm font-medium text-slate-700';
const sectionTitleClass = 'text-base font-semibold text-slate-900';
const instrumentTypes = ['Letter of Comfort', 'Parent Company Guarantee', 'Standby Letter of Credit', 'Bank Guarantee', 'Documentary Letter of Credit'];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createInitialDetails(requesterName: string): RequestDetailsForm {
  return {
    emailRequestToCorporateTreasury: false,
    enableMultiEntity: false,
    parentCompanyOfferingGuarantee: [],
    parentEntityType: 'localEntity',
    dateSubmitted: today,
    requestingEntity: [],
    contractingEntity: [],
    proposalContractReference: '',
    currentContractStatus: '',
    beneficiaryAddress: '',
    pcgLanguage: 'Beneficiary / Client Required Format',
    maximumLiabilityMode: 'number',
    maximumLiabilityPercent: '',
    obligationsExtinguishedMode: 'date',
    obligationsExtinguishedDate: '',
    backgroundRequirement: '',
    projectDescription: '',
    optionalComments: '',
    deliveryInstructions: '',
    attachments: '',
    requesterName,
    requesterApprovalDate: today,
    blFinanceVpNameTitle: '',
    blFinanceVpApprovalDate: '',
    blLegalDepartment: '',
    blLegalApprovalDate: '',
    sustainabilityGovernanceApproval: '',
    sustainabilityGovernanceApprovalDate: '',
    cfoApproval: '',
    cfoApprovalDate: '',
    corporateTreasuryApproval: '',
    corporateTreasuryApprovalDate: '',
    legalLanguageConfirmed: false,
  };
}

function normaliseDetails(input: Partial<RequestDetailsForm> | null, requesterName: string): RequestDetailsForm {
  const defaults = createInitialDetails(requesterName);
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    parentCompanyOfferingGuarantee: Array.isArray(input.parentCompanyOfferingGuarantee) ? input.parentCompanyOfferingGuarantee : [],
    parentEntityType: (input.parentEntityType === 'mil' || input.parentEntityType === 'localEntity') ? input.parentEntityType : 'localEntity',
    requestingEntity: Array.isArray(input.requestingEntity) ? input.requestingEntity : [],
    contractingEntity: Array.isArray(input.contractingEntity) ? input.contractingEntity : [],
    beneficiaryAddress: input.beneficiaryAddress ?? '',
    maximumLiabilityMode: input.maximumLiabilityMode === 'text' ? 'text' : 'number',
    maximumLiabilityPercent: input.maximumLiabilityPercent ?? '',
    obligationsExtinguishedDate: input.obligationsExtinguishedDate ?? '',
    optionalComments: input.optionalComments ?? '',
    deliveryInstructions: input.deliveryInstructions ?? '',
    attachments: input.attachments ?? '',
    requesterApprovalDate: input.requesterApprovalDate ?? '',
    blFinanceVpNameTitle: input.blFinanceVpNameTitle ?? '',
    blFinanceVpApprovalDate: input.blFinanceVpApprovalDate ?? '',
    blLegalDepartment: input.blLegalDepartment ?? '',
    blLegalApprovalDate: input.blLegalApprovalDate ?? '',
    sustainabilityGovernanceApproval: input.sustainabilityGovernanceApproval ?? '',
    sustainabilityGovernanceApprovalDate: input.sustainabilityGovernanceApprovalDate ?? '',
    cfoApproval: input.cfoApproval ?? '',
    cfoApprovalDate: input.cfoApprovalDate ?? '',
    corporateTreasuryApproval: input.corporateTreasuryApproval ?? '',
    corporateTreasuryApprovalDate: input.corporateTreasuryApprovalDate ?? '',
  };
}

function TextField({ label, value, onChange, required, type = 'text', readOnly }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; readOnly?: boolean }) {
  return <label className={labelClass}>{label}{required && <span className="ml-1 text-red-600">*</span>}<input className={`${inputClass} ${readOnly ? 'bg-slate-50 text-slate-500' : ''}`} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} readOnly={readOnly} /></label>;
}

function TextAreaField({ label, value, onChange, required, rows = 3, readOnly }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; rows?: number; readOnly?: boolean }) {
  return <label className={labelClass}>{label}{required && <span className="ml-1 text-red-600">*</span>}<textarea className={`${inputClass} ${readOnly ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`} value={value} onChange={(event) => onChange(event.target.value)} required={required} rows={rows} readOnly={readOnly} /></label>;
}

function EntityLovField({ label, values, options, multiple, onChange }: { label: string; values: string[]; options: BusinessEntityOption[]; multiple: boolean; onChange: (values: string[]) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = values.map((value) => options.find((option) => option.id === value)).filter((option): option is BusinessEntityOption => !!option);
  const searchTerm = search.trim().toLowerCase();
  const filtered = options.filter((option) => `${option.jobCodeEntity} ${option.segment1} ${option.legalEntityName}`.toLowerCase().includes(searchTerm));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick, true);
  }, [open]);

  const select = (id: string) => {
    if (!multiple) {
      onChange([id]);
      setOpen(false);
      setSearch('');
      return;
    }
    onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  };

  return (
    <div ref={containerRef} className="relative">
      <span className={labelClass}>{label}<span className="ml-1 text-red-600">*</span></span>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className={`${inputClass} flex min-h-10 items-center justify-between gap-2 text-left ${open ? 'relative z-30' : ''}`}>
        <span className={selected.length ? 'text-slate-900' : 'text-slate-400'}>{selected.length ? `${selected.length} selected` : 'Select a business entity'}</span>
        <ChevronsUpDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {selected.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selected.map((option) => <span key={option.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-md"><span className="truncate">{option.jobCodeEntity} - {option.legalEntityName}</span><button type="button" onClick={() => onChange(values.filter((value) => value !== option.id))} title={`Remove ${option.legalEntityName}`} className="shrink-0 rounded-full p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X size={12} /></button></span>)}</div>}
      {open && <button type="button" tabIndex={-1} aria-label="Close entity list" onClick={() => { setOpen(false); setSearch(''); }} className="fixed inset-0 z-20 cursor-default" />}
      {open && <div className="absolute z-30 mt-1 w-full min-w-80 rounded-md border border-slate-200 bg-white shadow-lg">
        <div className="relative border-b border-slate-200 p-2"><Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or entity name" className="w-full rounded border border-slate-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-brand" /></div>
        <div className="max-h-64 overflow-y-auto p-1">{filtered.map((option) => {
          const isSelected = values.includes(option.id);
          return <button key={option.id} type="button" onClick={() => select(option.id)} className="flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-100"><Check size={15} className={`mt-0.5 shrink-0 ${isSelected ? 'text-brand' : 'text-transparent'}`} /><span><span className="font-medium text-slate-800">{option.jobCodeEntity} - {option.legalEntityName}</span><span className="block text-xs text-slate-500">Segment {option.segment1}</span></span></button>;
        })}{filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">No business entities found.</p>}</div>
      </div>}
    </div>
  );
}

export function CreditGuardRequestFormPage({ mode }: RequestFormProps) {
  const isEdit = mode === 'edit';
  const formRef = useRef<HTMLFormElement>(null);
  const api = useApi();
  const { instance } = useMsal();
  const navigate = useNavigate();
  const { requestId } = useParams<{ requestId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useSession();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  const requesterName = user?.displayName ?? account?.name ?? account?.username ?? '';
  const { selectedOrg } = useOrg();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [businessEntities, setBusinessEntities] = useState<BusinessEntityOption[]>([]);
  const [projects, setProjects] = useState<{ id: string; code: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  const [projectRequired, setProjectRequired] = useState(false);
  const [allocationChecked, setAllocationChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(isEdit);
  const [requestLoadError, setRequestLoadError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [attachments, setAttachments] = useState<RequestAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachingRequest, setAttachingRequest] = useState(false);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState('');
  const [assignedReviewer, setAssignedReviewer] = useState<ReviewerOption | null>(null);
  const [requestedByUserId, setRequestedByUserId] = useState<string | null>(null);
  const [submittedForReviewAt, setSubmittedForReviewAt] = useState<string | null>(null);
  const [submittingForReview, setSubmittingForReview] = useState(false);
  const [completingReview, setCompletingReview] = useState(false);
  const [summary, setSummary] = useState({
    requestNumber: `CG-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    instrumentType: 'Letter of Comfort',
    beneficiary: '',
    amount: '',
    currency: 'USD',
    status: 'Draft',
    dueDate: '',
    nextReviewDate: '',
    notes: '',
  });
  const [details, setDetails] = useState<RequestDetailsForm>(() => createInitialDetails(requesterName));

  useEffect(() => {
    setModuleName('CreditGuard');
    return () => setModuleName(null);
  }, [setModuleName]);

  useEffect(() => {
    if (!selectedOrg) return;
    setErrorMessage('');
    api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then((products) => {
        const match = products.find((candidate) => candidate.code.toLowerCase() === 'creditguard');
        if (!match) throw new Error('CreditGuard is not available for this organisation.');
        setProduct(match);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, selectedOrg]);

  useEffect(() => {
    if (!selectedOrg || !product) return;
    api.get<{ projectRequired: boolean; lastProjectId: string | null; projects: { id: string; code: string; name: string }[] }>(`/organisations/${selectedOrg.id}/modules/${product.id}/projects`)
      .then((result) => {
        setProjects(result.projects);
        setProjectRequired(result.projectRequired);
        setProjectId((current) => current || result.lastProjectId || '');
        setAllocationChecked(true);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, product, selectedOrg]);

  useEffect(() => {
    if (!product) return;
    api.creditGuard<BusinessEntityOption[]>('/business-entities')
      .then(setBusinessEntities)
      .catch((error) => setErrorMessage((error as Error).message));
  }, [product]);

  useEffect(() => {
    if (!isEdit || !requestId || !selectedOrg) return;
    setLoadingRequest(true);
    setRequestLoadError('');
    api.creditGuard<CreditGuardRequestRecord>(`/requests/${requestId}?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then((request) => {
        setProjectId(request.projectId ?? '');
        setSummary({
          requestNumber: request.requestNumber,
          instrumentType: request.instrumentType,
          beneficiary: request.beneficiary,
          amount: String(request.amount),
          currency: request.currency,
          status: request.status,
          dueDate: request.dueDate ?? '',
          nextReviewDate: request.nextReviewDate ?? '',
          notes: request.notes ?? '',
        });
        setSelectedReviewerId(request.assignedReviewerUserId ?? '');
        setRequestedByUserId(request.requestedByUserId);
        setAssignedReviewer(request.assignedReviewerUserId && request.assignedReviewerName && request.assignedReviewerEmail ? {
          id: request.assignedReviewerUserId,
          displayName: request.assignedReviewerName,
          email: request.assignedReviewerEmail,
        } : null);
        setSubmittedForReviewAt(request.submittedForReviewAt);
        setDetails(normaliseDetails(request.details, requesterName));
      })
      .catch((error) => setRequestLoadError((error as Error).message))
      .finally(() => setLoadingRequest(false));
  }, [isEdit, requestId, requesterName, selectedOrg]);

  useEffect(() => {
    if (!isEdit || !requestId || !selectedOrg) return;
    api.creditGuard<RequestAttachment[]>(`/requests/${requestId}/attachments?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then(setAttachments)
      .catch((error) => setErrorMessage((error as Error).message));
  }, [isEdit, requestId, selectedOrg]);

  useEffect(() => {
    if (!isEdit || !selectedOrg || !product) return;
    api.get<ReviewerOption[]>(`/notifications/reviewers?orgId=${encodeURIComponent(selectedOrg.id)}&productId=${encodeURIComponent(product.id)}`)
      .then(setReviewers)
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, isEdit, product, selectedOrg]);

  const { session, loading: sessionLoading, error: sessionError } = useProductSession(api, selectedOrg?.id, product?.id, product?.name, projectId || undefined, projectRequired, allocationChecked);
  const updateDetail = <K extends keyof RequestDetailsForm>(key: K, value: RequestDetailsForm[K]) => setDetails((current) => ({ ...current, [key]: value }));
  
  useEffect(() => {
    if (summary.instrumentType !== 'Parent Company Guarantee' && details.parentEntityType !== 'localEntity') {
      setDetails((current) => ({ ...current, parentEntityType: 'localEntity' }));
    }
  }, [summary.instrumentType, details.parentEntityType]);
  
  const requestsUrl = `/app/product/CreditGuard/requests${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
  const isWorkflowReadOnly = isEdit && ['Under Review', 'Reviewed', 'Sent for Approval'].includes(summary.status);
  const canCompleteReview = summary.status === 'Under Review' && !!user && user.id === assignedReviewer?.id;
  const canAssignReviewer = summary.status === 'Draft' || (summary.status === 'Under Review' && !!user && (
    user.id === requestedByUserId
    || ['Owner', 'Admin'].includes(selectedOrg?.membership ?? '')
    || user.globalRoles.includes('Global Administrator')
  ));
  const requestPdfFileName = `${summary.requestNumber.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')} latest.pdf`;
  const hasRequestPdf = attachments.some((attachment) => attachment.originalFileName === requestPdfFileName);
  const requestPayload = (status: string) => ({
    orgId: selectedOrg!.id,
    projectId: projectId || null,
    requestNumber: summary.requestNumber,
    instrumentType: summary.instrumentType,
    applicant: businessEntities.find((entity) => entity.id === details.requestingEntity[0])?.legalEntityName ?? details.requestingEntity[0],
    beneficiary: summary.beneficiary,
    amount: Number(summary.amount),
    currency: summary.currency,
    status,
    requestedBy: requesterName || details.requesterName,
    dueDate: summary.dueDate || null,
    nextReviewDate: summary.nextReviewDate || null,
    notes: summary.notes || null,
    details,
  });

  const uploadFiles = async (savedRequestId: string, files: File[]) => {
    if (!selectedOrg) return;
    setUploading(true);
    try {
      const uploaded: RequestAttachment[] = [];
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        body.append('orgId', selectedOrg.id);
        body.append('uploadedBy', requesterName || details.requesterName);
        uploaded.push(await api.creditGuard<RequestAttachment>(`/requests/${savedRequestId}/attachments`, {
          method: 'POST',
          body,
        }));
      }
      setAttachments((current) => [...uploaded, ...current]);
    } finally {
      setUploading(false);
    }
  };

  const chooseFiles = async (files: FileList | null) => {
    if (!files || !requestId) return;
    const selected = Array.from(files);
    try {
      await uploadFiles(requestId, selected);
      notify('Attachment uploaded successfully.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const attachRequest = async () => {
    if (!requestId || !selectedOrg || !['Draft', 'Under Review'].includes(summary.status)) return;
    setAttachingRequest(true);
    try {
      if (summary.status === 'Draft') {
        await api.creditGuard(`/requests/${requestId}`, {
          method: 'PATCH',
          body: JSON.stringify(requestPayload('Draft')),
        });
      }
      const attachment = await api.creditGuard<RequestAttachment>(`/requests/${requestId}/attach-request`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id }),
      });
      setAttachments((current) => [attachment, ...current.filter((candidate) => !candidate.isLegacyMarker && candidate.originalFileName !== attachment.originalFileName)]);
      notify('Request PDF attached successfully.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setAttachingRequest(false);
    }
  };

  const removeAttachment = async (attachment: RequestAttachment) => {
    if (!requestId || !selectedOrg || !window.confirm(`Delete ${attachment.originalFileName}?`)) return;
    try {
      await api.creditGuard(`/requests/${requestId}/attachments/${attachment.id}?orgId=${encodeURIComponent(selectedOrg.id)}`, { method: 'DELETE' });
      setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id));
      notify('Attachment deleted.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const openAttachment = (attachment: RequestAttachment) => {
    if (!requestId || !selectedOrg) return;
    window.open(`/creditguard-api/requests/${requestId}/attachments/${attachment.id}/content?orgId=${encodeURIComponent(selectedOrg.id)}`, '_blank', 'noopener,noreferrer');
  };

  const changeMultiEntity = (enabled: boolean) => {
    if (enabled) {
      updateDetail('enableMultiEntity', true);
      return;
    }
    const hasMultipleSelections = [details.parentCompanyOfferingGuarantee, details.requestingEntity, details.contractingEntity].some((values) => values.length > 1);
    if (hasMultipleSelections && !window.confirm('Disabling multientity will remove previously selected entities from each field. Only the first entity in selection order will remain. Continue?')) {
      notify('Multientity remains enabled. No entity selections were removed.', 'warning');
      return;
    }
    setDetails((current) => ({
      ...current,
      enableMultiEntity: false,
      parentCompanyOfferingGuarantee: current.parentCompanyOfferingGuarantee.slice(0, 1),
      requestingEntity: current.requestingEntity.slice(0, 1),
      contractingEntity: current.contractingEntity.slice(0, 1),
    }));
    if (hasMultipleSelections) notify('Multientity disabled. Only the first selected entity was retained in each field.', 'warning');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrg || !session || (projectRequired && !projectId)) return;
    if ([details.parentCompanyOfferingGuarantee, details.requestingEntity, details.contractingEntity].some((values) => values.length === 0)) {
      notify('Select a business entity in each required entity field.', 'warning');
      return;
    }
    if (isEdit && summary.status === 'Under Review' && !details.legalLanguageConfirmed) {
      notify('Confirm that the guarantee language has been reviewed by the local legal team.', 'warning');
      return;
    }
    if (isEdit && summary.status === 'Under Review' && attachments.length === 0) {
      notify('Attach at least one PDF or DOCX document before sending for approval.', 'warning');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      const saved = await (isEdit ? api.creditGuard<{ id: string }>(`/requests/${requestId}`, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(requestPayload(isEdit ? summary.status : 'Draft')),
      }) : api.creditGuard<{ id: string }>('/requests', { method: 'POST', body: JSON.stringify(requestPayload('Draft')) }));
      if (!isEdit) {
        notify('Draft request saved successfully.', 'success');
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        navigate(`/app/product/CreditGuard/requests/${saved.id}/edit${query}`, { replace: true });
      } else {
        notify('Request updated successfully.', 'success');
      }
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    if (!selectedOrg || !product || !requestId || !['Draft', 'Under Review'].includes(summary.status)) return;
    const isReassignment = summary.status === 'Under Review';
    const reviewer = reviewers.find((candidate) => candidate.id === selectedReviewerId);
    if (!reviewer) {
      notify('Select a reviewer before submitting the request.', 'warning');
      return;
    }
    if (isReassignment && reviewer.id === assignedReviewer?.id) {
      notify('Select a different reviewer before reassigning the request.', 'warning');
      return;
    }
    if (!isReassignment && !hasRequestPdf) {
      notify('Use Attach Request before submitting for review.', 'warning');
      return;
    }
    if (!isReassignment && !formRef.current?.reportValidity()) return;
    if (!isReassignment && [details.parentCompanyOfferingGuarantee, details.requestingEntity, details.contractingEntity].some((values) => values.length === 0)) {
      notify('Select a business entity in each required entity field.', 'warning');
      return;
    }

    setSubmittingForReview(true);
    try {
      const draftPayload = requestPayload('Draft');
      if (!isReassignment) {
        await api.creditGuard(`/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify(draftPayload) });
      }
      const submitted = await api.creditGuard<CreditGuardRequestRecord>(`/requests/${requestId}/submit-for-review`, {
        method: 'POST',
        body: JSON.stringify({
          orgId: selectedOrg.id,
          reviewerUserId: reviewer.id,
          reviewerName: reviewer.displayName,
          reviewerEmail: reviewer.email,
        }),
      });
      setSummary((current) => ({ ...current, status: submitted.status }));
      setAssignedReviewer(reviewer);
      setSubmittedForReviewAt(submitted.submittedForReviewAt);

      const notificationFailures: string[] = [];
      if (isReassignment && submitted.previousReviewerUserId) {
        try {
          const pullback = await api.post<{ status: 'sent' | 'failed'; message?: string }>('/notifications/reviewer-reassignment', {
            orgId: selectedOrg.id,
            productId: product.id,
            previousReviewerUserId: submitted.previousReviewerUserId,
            newReviewerUserId: reviewer.id,
            requestId,
            requestNumber: summary.requestNumber,
          });
          if (pullback.status === 'failed') notificationFailures.push(`previous reviewer: ${pullback.message ?? 'See Email Delivery Logs.'}`);
        } catch (error) {
          notificationFailures.push(`previous reviewer: ${(error as Error).message}`);
        }
      }

      try {
        const delivery = await api.post<{ status: 'sent' | 'failed'; message?: string }>('/notifications/request-review', {
          orgId: selectedOrg.id,
          productId: product.id,
          reviewerUserId: reviewer.id,
          requestId,
          requestNumber: summary.requestNumber,
          instrumentType: summary.instrumentType,
          applicant: draftPayload.applicant,
          beneficiary: summary.beneficiary,
          amount: Number(summary.amount),
          currency: summary.currency,
          requestedBy: requesterName || details.requesterName,
        });
        if (delivery.status === 'failed') notificationFailures.push(`new reviewer: ${delivery.message ?? 'See Email Delivery Logs.'}`);
      } catch (error) {
        notificationFailures.push(`new reviewer: ${(error as Error).message}`);
      }
      if (notificationFailures.length > 0) {
        notify(`Reviewer ${isReassignment ? 'reassigned' : 'assigned'}, but email delivery failed for ${notificationFailures.join('; ')}`, 'warning');
      } else {
        notify(isReassignment ? 'Reviewer reassigned and both reviewers notified.' : 'Request submitted for review and reviewer notified.', 'success');
      }
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSubmittingForReview(false);
    }
  };

  const completeReview = async () => {
    if (!requestId || !selectedOrg || !canCompleteReview) return;
    setCompletingReview(true);
    try {
      const reviewed = await api.creditGuard<CreditGuardRequestRecord>(`/requests/${requestId}/review-done`, {
        method: 'POST',
        body: JSON.stringify({ orgId: selectedOrg.id }),
      });
      setSummary((current) => ({ ...current, status: reviewed.status }));
      notify('Review completed.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setCompletingReview(false);
    }
  };

  if (!selectedOrg) return <Card><h1 className="text-xl font-semibold">Select an organisation</h1><p className="mt-2 text-sm text-slate-500">Choose an organisation before creating a request.</p></Card>;
  if (requestLoadError) return <Card><h1 className="text-xl font-semibold">Unable to load request</h1><p className="mt-2 text-sm text-red-600">{requestLoadError}</p><Link to={requestsUrl} className="mt-4 inline-block text-sm font-medium text-brand">Back to Requests</Link></Card>;
  if ((errorMessage && !product) || sessionError) return <Card><h1 className="text-xl font-semibold">Unable to create request</h1><p className="mt-2 text-sm text-red-600">{sessionError || errorMessage}</p><Link to={requestsUrl} className="mt-4 inline-block text-sm font-medium text-brand">Back to Requests</Link></Card>;
  if (!product || !allocationChecked || sessionLoading || !session || loadingRequest) return <p className="text-sm text-slate-500">{loadingRequest ? 'Loading request...' : 'Checking CreditGuard access...'}</p>;

  return (
    <form ref={formRef} onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
        <Link to={requestsUrl} className="hover:text-brand">Requests</Link><ChevronRight size={14} /><span className="font-medium text-slate-900">{isEdit ? 'Edit Request' : 'New Request'}</span>
      </nav>
      <header className="sticky top-0 z-20 mb-2 flex flex-wrap items-center justify-between gap-4 rounded-md border border-blue-500 bg-gradient-to-r from-sky-600 via-blue-500 to-indigo-500 px-4 py-3 text-white shadow-lg ring-1 ring-blue-300/50 backdrop-blur">
        <div><div className="flex items-center gap-2"><FilePlus2 size={22} className="text-white" /><h1 className="text-2xl font-semibold text-white">{isEdit ? 'Edit Company Guarantee Request' : 'New Guarantee Request'}</h1></div><p className="mt-1 text-sm text-blue-50">{isEdit ? 'Update the saved request and complete approval information.' : 'Enter the initial request information and save it as a Draft.'}</p></div>
        <div className="flex shrink-0 gap-2 rounded-lg border border-white/80 bg-white/95 p-2 shadow-md"><Button type="button" variant="secondary" className="!border !border-slate-300 !bg-white !text-slate-800 shadow-sm hover:!bg-slate-100" onClick={() => navigate(requestsUrl)}>Cancel</Button>{!isWorkflowReadOnly && <Button type="submit" disabled={saving} className="!bg-blue-700 !text-white shadow-sm hover:!bg-blue-800"><Save size={16} />{saving ? 'Saving...' : isEdit ? 'Save changes' : 'Save Draft'}</Button>}{canCompleteReview && <Button type="button" onClick={() => void completeReview()} disabled={completingReview} className="!bg-emerald-700 !text-white hover:!bg-emerald-800">{completingReview ? 'Completing...' : 'Review done'}</Button>}</div>
      </header>

      {errorMessage && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

      {isWorkflowReadOnly && <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Request details are read-only while review and approvals are in progress.</div>}
      <fieldset disabled={isWorkflowReadOnly} className="min-w-0 space-y-6 border-0 p-0">
      {projectRequired && <Card><h2 className={sectionTitleClass}>Project</h2><label className={`${labelClass} mt-4 block`}>Assigned project<span className="ml-1 text-red-600">*</span><select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}</select></label></Card>}

      <Card>
        <h2 className={sectionTitleClass}>Request</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <TextField label="Request number" value={summary.requestNumber} onChange={(value) => setSummary({ ...summary, requestNumber: value })} required />
          <label className={labelClass}>Instrument type<span className="ml-1 text-red-600">*</span><select className={inputClass} value={summary.instrumentType} onChange={(event) => setSummary({ ...summary, instrumentType: event.target.value })} required>{instrumentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <div className={labelClass}>Workflow status<div className={`${inputClass} bg-slate-50 text-slate-600`}>{isEdit ? summary.status : 'Draft'}</div></div>
          <label className={labelClass}>Email request to Corporate Treasury in earlier stages?<span className="ml-1 text-red-600">*</span><select className={inputClass} value={details.emailRequestToCorporateTreasury ? 'yes' : 'no'} onChange={(event) => updateDetail('emailRequestToCorporateTreasury', event.target.value === 'yes')} required><option value="no">No</option><option value="yes">Yes</option></select></label>
          <TextField label="Date submitted" type="date" value={details.dateSubmitted} onChange={(value) => updateDetail('dateSubmitted', value)} required />
          <TextField label="Date required by" type="date" value={summary.dueDate} onChange={(value) => setSummary({ ...summary, dueDate: value })} required />
          {!isEdit && <TextField label="Requested by" value={details.requesterName} onChange={(value) => updateDetail('requesterName', value)} required />}
        </div>
      </Card>

      <Card className="mb-2">
        <h2 className={sectionTitleClass}>Guarantee and contract</h2>
        
        {summary.instrumentType === 'Parent Company Guarantee' && (
          <div className="mt-4">
            <label className={`${labelClass} block mb-4`}>Parent Entity Type<span className="ml-1 text-red-600">*</span></label>
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              {(['localEntity', 'mil'] as const).map((type) => {
                const isSelected = details.parentEntityType === type;
                const typeLabel = type === 'localEntity' ? 'Local Entity' : 'MIL';
                const typeDescription = type === 'localEntity' 
                  ? 'Select a business entity from your organisation'
                  : 'McDermott International Limited - Fixed parent company';
                
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      updateDetail('parentEntityType', type);
                      if (type === 'mil') {
                        updateDetail('parentCompanyOfferingGuarantee', []);
                        if (details.enableMultiEntity) {
                          changeMultiEntity(false);
                        }
                      }
                    }}
                    className={`relative flex flex-col gap-3 rounded-lg border-2 p-4 text-left transition-all ${
                      isSelected
                        ? 'border-brand bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">{typeLabel}</h3>
                        <p className="mt-1 text-sm text-slate-600">{typeDescription}</p>
                      </div>
                      <div className={`ml-3 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        isSelected
                          ? 'border-brand bg-brand'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        <label className="mt-4 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" title={details.parentEntityType === 'mil' ? 'Multiple entities selection is not available when MIL is selected' : ''}>
          <input
            type="checkbox"
            checked={details.enableMultiEntity}
            onChange={(event) => changeMultiEntity(event.target.checked)}
            disabled={details.parentEntityType === 'mil'}
            className="accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span><strong>Enable Multiple Entities selection</strong><span className="ml-1 text-slate-500">Allow more than one selection in each entity field.</span></span>
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {summary.instrumentType === 'Parent Company Guarantee' && details.parentEntityType === 'mil' ? (
            <div className="md:col-span-2">
              <label className={labelClass}>Parent company offering guarantee<span className="ml-1 text-red-600">*</span></label>
              <div className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}>
                McDermott International Limited
              </div>
            </div>
          ) : (
            <EntityLovField label="Parent company offering guarantee" values={details.parentCompanyOfferingGuarantee} options={businessEntities} multiple={details.enableMultiEntity} onChange={(values) => updateDetail('parentCompanyOfferingGuarantee', values)} />
          )}
          <EntityLovField label="Name of requesting entity" values={details.requestingEntity} options={businessEntities} multiple={details.enableMultiEntity} onChange={(values) => updateDetail('requestingEntity', values)} />
          <EntityLovField label="Name of contracting entity" values={details.contractingEntity} options={businessEntities} multiple={details.enableMultiEntity} onChange={(values) => updateDetail('contractingEntity', values)} />
          <TextField label="Proposal/contract reference number and name" value={details.proposalContractReference} onChange={(value) => updateDetail('proposalContractReference', value)} required />
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className={labelClass}>Current status<span className="ml-1 text-red-600">*</span></span>
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5" aria-label="Current status presets">
                {(['Bid', 'Award'] as const).map((status) => <button key={status} type="button" onClick={() => updateDetail('currentContractStatus', status)} aria-pressed={details.currentContractStatus === status} className={`rounded px-2.5 py-1 text-xs font-medium ${details.currentContractStatus === status ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{status}</button>)}
              </div>
            </div>
            <input aria-label="Current status" className={inputClass} value={details.currentContractStatus} onChange={(event) => updateDetail('currentContractStatus', event.target.value)} required />
          </div>
          <fieldset className="grid gap-4 rounded-md border border-slate-200 bg-slate-50/60 p-4 md:col-span-2 md:grid-cols-2">
            <legend className="px-1 text-sm font-semibold text-slate-800">Beneficiary of guarantee</legend>
            <TextField label="Beneficiary name" value={summary.beneficiary} onChange={(value) => setSummary({ ...summary, beneficiary: value })} required />
            <TextAreaField label="Beneficiary address" value={details.beneficiaryAddress} onChange={(value) => updateDetail('beneficiaryAddress', value)} required rows={2} />
          </fieldset>
          <div className="grid grid-cols-[1fr_7rem] gap-3"><TextField label="Contract value" type="number" value={summary.amount} onChange={(value) => setSummary({ ...summary, amount: value })} required /><TextField label="Currency" value={summary.currency} onChange={(value) => setSummary({ ...summary, currency: value.toUpperCase() })} required /></div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className={labelClass}>Maximum liability cap</span>
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5" aria-label="Maximum liability cap input mode">
                {(['number', 'text'] as const).map((mode) => <button key={mode} type="button" onClick={() => setDetails((current) => current.maximumLiabilityMode === mode ? current : { ...current, maximumLiabilityMode: mode, maximumLiabilityPercent: '' })} className={`rounded px-2.5 py-1 text-xs font-medium ${details.maximumLiabilityMode === mode ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{mode === 'number' ? 'Number' : 'Text'}</button>)}
              </div>
            </div>
            <input aria-label="Maximum liability cap value" className={inputClass} type={details.maximumLiabilityMode === 'number' ? 'number' : 'text'} value={details.maximumLiabilityPercent} onChange={(event) => updateDetail('maximumLiabilityPercent', event.target.value)} placeholder={details.maximumLiabilityMode === 'text' ? 'e.g. As agreed in the final contract' : '% of contract value'} />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className={labelClass}>All contractual obligations should be extinguished</span>
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5" aria-label="Obligations extinguished input mode">
                {(['date', 'text'] as const).map((mode) => <button key={mode} type="button" onClick={() => setDetails((current) => current.obligationsExtinguishedMode === mode ? current : { ...current, obligationsExtinguishedMode: mode, obligationsExtinguishedDate: '' })} className={`rounded px-2.5 py-1 text-xs font-medium ${details.obligationsExtinguishedMode === mode ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{mode === 'date' ? 'Date' : 'Text'}</button>)}
              </div>
            </div>
            <input aria-label="Contractual obligations extinguished value" className={inputClass} type={details.obligationsExtinguishedMode === 'date' ? 'date' : 'text'} value={details.obligationsExtinguishedDate} onChange={(event) => updateDetail('obligationsExtinguishedDate', event.target.value)} placeholder={details.obligationsExtinguishedMode === 'text' ? 'e.g. Upon final acceptance or contract completion' : undefined} />
          </div>
          <TextField label="Next review date" type="date" value={summary.nextReviewDate} onChange={(value) => setSummary({ ...summary, nextReviewDate: value })} />
        </div>
      </Card>

      <Card className="mb-2">
        <h2 className={sectionTitleClass}>Supporting information</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextAreaField label="Background on requirement for guarantee" value={details.backgroundRequirement} onChange={(value) => updateDetail('backgroundRequirement', value)} required rows={5} />
          <TextAreaField label="Brief description of project/undertaking" value={details.projectDescription} onChange={(value) => updateDetail('projectDescription', value)} required rows={5} />
          <TextAreaField label="Optional comments" value={details.optionalComments} onChange={(value) => updateDetail('optionalComments', value)} />
          <TextAreaField label="Delivery instructions" value={details.deliveryInstructions} onChange={(value) => updateDetail('deliveryInstructions', value)} />
          <label className={labelClass}>PCG Language<select className={inputClass} value={details.pcgLanguage} onChange={(event) => updateDetail('pcgLanguage', event.target.value as RequestDetailsForm['pcgLanguage'])}><option>Standard Description</option><option>Beneficiary / Client Required Format</option></select></label>
          <TextAreaField label="Additional notes" value={summary.notes} onChange={(value) => setSummary({ ...summary, notes: value })} rows={2} />
        </div>
      </Card>
      </fieldset>
      {isEdit && <Card>
          <div>
            <span className={labelClass}>Attachments<span className="ml-1 text-red-600">*</span></span>
            <div className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">PDF or DOCX, up to 10 MB each. At least one is required before approval.</p>
                {!['Reviewed', 'Sent for Approval'].includes(summary.status) && <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => void attachRequest()} disabled={attachingRequest || uploading}>
                    <FilePlus2 size={16} />{attachingRequest ? 'Attaching...' : 'Attach Request'}
                  </Button>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-100">
                    <Upload size={16} />{uploading ? 'Uploading...' : 'Attach documents'}
                    <input
                      aria-label="Attach documents"
                      className="sr-only"
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      multiple
                      disabled={uploading || attachingRequest}
                      onChange={(event) => { void chooseFiles(event.target.files); event.target.value = ''; }}
                    />
                  </label>
                </div>}
              </div>
              {attachments.length > 0 && <ul className="mt-3 divide-y divide-slate-200 border-t border-slate-200">
                {attachments.map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><Paperclip size={15} className="shrink-0 text-slate-500" /><span className="truncate">{attachment.originalFileName}</span><span className="shrink-0 text-xs text-slate-400">{attachment.isLegacyMarker ? 'Already attached' : formatFileSize(attachment.fileSizeBytes)}</span></span>
                  <span className="flex shrink-0 items-center gap-1">
                    {!attachment.isLegacyMarker && <button type="button" title={`Open ${attachment.originalFileName}`} onClick={() => openAttachment(attachment)} className="rounded p-1.5 text-slate-600 hover:bg-white hover:text-brand"><ExternalLink size={16} /></button>}
                    {!attachment.isLegacyMarker && !['Reviewed', 'Sent for Approval'].includes(summary.status) && <button type="button" title={`Delete ${attachment.originalFileName}`} onClick={() => void removeAttachment(attachment)} className="rounded p-1.5 text-slate-600 hover:bg-white hover:text-red-700"><Trash2 size={16} /></button>}
                  </span>
                </li>)}
              </ul>}
              {attachments.length === 0 && <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-400">No documents attached.</p>}
            </div>
          </div>
      </Card>}

      {isEdit && <Card>
        <h2 className={`flex items-center gap-2 ${sectionTitleClass}`}><MailCheck size={18} />Assign Reviewer and Submit</h2>
        {canAssignReviewer ? <>
          <p className="mt-4 text-sm text-slate-500">{summary.status === 'Draft' ? 'Choose a registered Module User assigned the CreditGuard Reviewer role. Submission changes the status to Under Review and sends an email using Global Administration SMTP settings.' : 'The reviewer can be changed until review is completed. The previous reviewer receives a pullback notice and the new reviewer receives the review request.'}</p>
          {summary.status === 'Under Review' && <p className="mt-3 text-sm text-slate-700"><span className="font-medium">Current reviewer:</span> {assignedReviewer ? `${assignedReviewer.displayName} (${assignedReviewer.email})` : 'Not available'}</p>}
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end">
            <label className={`${labelClass} min-w-0 flex-1`}>Reviewer<span className="ml-1 text-red-600">*</span><select className={inputClass} value={selectedReviewerId} onChange={(event) => setSelectedReviewerId(event.target.value)}><option value="">Select a reviewer</option>{reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} ({reviewer.email})</option>)}</select></label>
            <Button type="button" onClick={() => void submitForReview()} disabled={submittingForReview || !selectedReviewerId || (summary.status === 'Draft' && !hasRequestPdf) || (summary.status === 'Under Review' && selectedReviewerId === assignedReviewer?.id)}><MailCheck size={16} />{submittingForReview ? 'Submitting...' : summary.status === 'Under Review' ? 'Reassign reviewer' : 'Submit for review'}</Button>
          </div>
          {reviewers.length === 0 && <p className="mt-3 text-sm text-amber-700">No eligible reviewers are configured for this organisation. Assign the CreditGuard Reviewer role in user administration.</p>}
        </> : <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><span className="font-medium">Assigned reviewer:</span> {assignedReviewer ? `${assignedReviewer.displayName} (${assignedReviewer.email})` : 'Not available'}{submittedForReviewAt && <span className="ml-2 text-slate-500">Submitted {new Date(submittedForReviewAt).toLocaleString()}</span>}</div>}
      </Card>}

    </form>
  );
}