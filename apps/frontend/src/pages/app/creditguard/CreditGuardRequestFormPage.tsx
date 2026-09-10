import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, ChevronsUpDown, FilePlus2, Save, Search, X } from 'lucide-react';
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
  dateSubmitted: string;
  requestingEntity: string[];
  contractingEntity: string[];
  proposalContractReference: string;
  currentContractStatus: string;
  beneficiaryAddress: string;
  pcgLanguage: 'Standard Description' | 'Beneficiary / Client Required Format';
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
  dueDate: string | null;
  nextReviewDate: string | null;
  notes: string | null;
  details: Partial<RequestDetailsForm> | null;
}

interface RequestFormProps {
  mode: 'new' | 'edit';
}

const today = new Date().toISOString().slice(0, 10);
const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10';
const labelClass = 'text-sm font-medium text-slate-700';
const sectionTitleClass = 'text-base font-semibold text-slate-900';
const instrumentTypes = ['Letter of Comfort', 'Parent Company Guarantee', 'Standby Letter of Credit', 'Bank Guarantee', 'Documentary Letter of Credit'];

function createInitialDetails(requesterName: string): RequestDetailsForm {
  return {
    emailRequestToCorporateTreasury: false,
    enableMultiEntity: false,
    parentCompanyOfferingGuarantee: [],
    dateSubmitted: today,
    requestingEntity: [],
    contractingEntity: [],
    proposalContractReference: '',
    currentContractStatus: '',
    beneficiaryAddress: '',
    pcgLanguage: 'Beneficiary / Client Required Format',
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
    requestingEntity: Array.isArray(input.requestingEntity) ? input.requestingEntity : [],
    contractingEntity: Array.isArray(input.contractingEntity) ? input.contractingEntity : [],
    beneficiaryAddress: input.beneficiaryAddress ?? '',
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

async function creditGuardRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/creditguard-api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`CreditGuard API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
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
    creditGuardRequest<BusinessEntityOption[]>('/business-entities')
      .then(setBusinessEntities)
      .catch((error) => setErrorMessage((error as Error).message));
  }, [product]);

  useEffect(() => {
    if (!isEdit || !requestId || !selectedOrg) return;
    setLoadingRequest(true);
    setRequestLoadError('');
    creditGuardRequest<CreditGuardRequestRecord>(`/requests/${requestId}?orgId=${encodeURIComponent(selectedOrg.id)}`)
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
        setDetails(normaliseDetails(request.details, requesterName));
      })
      .catch((error) => setRequestLoadError((error as Error).message))
      .finally(() => setLoadingRequest(false));
  }, [isEdit, requestId, requesterName, selectedOrg]);

  const { session, loading: sessionLoading, error: sessionError } = useProductSession(api, selectedOrg?.id, product?.id, product?.name, projectId || undefined, projectRequired, allocationChecked);
  const updateDetail = <K extends keyof RequestDetailsForm>(key: K, value: RequestDetailsForm[K]) => setDetails((current) => ({ ...current, [key]: value }));
  const requestsUrl = `/app/product/CreditGuard/requests${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;

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
    if (isEdit && !details.legalLanguageConfirmed) {
      notify('Confirm that the guarantee language has been reviewed by the local legal team.', 'warning');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      const saved = await creditGuardRequest<{ id: string }>(isEdit ? `/requests/${requestId}` : '/requests', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          orgId: selectedOrg.id,
          projectId: projectId || null,
          requestNumber: summary.requestNumber,
          instrumentType: summary.instrumentType,
          applicant: businessEntities.find((entity) => entity.id === details.requestingEntity[0])?.legalEntityName ?? details.requestingEntity[0],
          beneficiary: summary.beneficiary,
          amount: Number(summary.amount),
          currency: summary.currency,
          status: isEdit ? summary.status : 'Draft',
          requestedBy: requesterName || details.requesterName,
          dueDate: summary.dueDate || null,
          nextReviewDate: summary.nextReviewDate || null,
          notes: summary.notes || null,
          details,
        }),
      });
      notify(isEdit ? 'Request updated successfully.' : 'Draft request saved successfully.', 'success');
      if (!isEdit) {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        navigate(`/app/product/CreditGuard/requests/${saved.id}/edit${query}`, { replace: true });
      }
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedOrg) return <Card><h1 className="text-xl font-semibold">Select an organisation</h1><p className="mt-2 text-sm text-slate-500">Choose an organisation before creating a request.</p></Card>;
  if (requestLoadError) return <Card><h1 className="text-xl font-semibold">Unable to load request</h1><p className="mt-2 text-sm text-red-600">{requestLoadError}</p><Link to={requestsUrl} className="mt-4 inline-block text-sm font-medium text-brand">Back to Requests</Link></Card>;
  if ((errorMessage && !product) || sessionError) return <Card><h1 className="text-xl font-semibold">Unable to create request</h1><p className="mt-2 text-sm text-red-600">{sessionError || errorMessage}</p><Link to={requestsUrl} className="mt-4 inline-block text-sm font-medium text-brand">Back to Requests</Link></Card>;
  if (!product || !allocationChecked || sessionLoading || !session || loadingRequest) return <p className="text-sm text-slate-500">{loadingRequest ? 'Loading request...' : 'Checking CreditGuard access...'}</p>;

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
        <Link to={requestsUrl} className="hover:text-brand">Requests</Link><ChevronRight size={14} /><span className="font-medium text-slate-900">{isEdit ? 'Edit Request' : 'New Request'}</span>
      </nav>
      <header className={`sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 rounded-md border px-4 py-3 backdrop-blur ${isEdit ? 'border-slate-200 bg-white/95 shadow-sm' : 'border-blue-500 bg-gradient-to-r from-sky-600 via-blue-500 to-indigo-500 text-white shadow-lg ring-1 ring-blue-300/50'}`}>
        <div><div className="flex items-center gap-2"><FilePlus2 size={22} className={isEdit ? 'text-brand' : 'text-white'} /><h1 className={`text-2xl font-semibold ${isEdit ? 'text-slate-900' : 'text-white'}`}>{isEdit ? 'Edit Company Guarantee Request' : 'New Company Guarantee Request'}</h1></div><p className={`mt-1 text-sm ${isEdit ? 'text-slate-500' : 'text-blue-50'}`}>{isEdit ? 'Update the saved request and complete approval information.' : 'Enter the initial request information and save it as a Draft.'}</p></div>
        <div className={`flex shrink-0 gap-2 ${isEdit ? '' : 'rounded-lg border border-white/80 bg-white/95 p-2 shadow-md'}`}><Button type="button" variant="secondary" className={isEdit ? undefined : '!border !border-slate-300 !bg-white !text-slate-800 shadow-sm hover:!bg-slate-100'} onClick={() => navigate(requestsUrl)}>Cancel</Button><Button type="submit" disabled={saving} className={isEdit ? undefined : '!bg-blue-700 !text-white shadow-sm hover:!bg-blue-800'}><Save size={16} />{saving ? 'Saving...' : isEdit ? 'Save changes' : 'Save Draft'}</Button></div>
      </header>

      {errorMessage && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

      {projectRequired && <Card><h2 className={sectionTitleClass}>Project</h2><label className={`${labelClass} mt-4 block`}>Assigned project<span className="ml-1 text-red-600">*</span><select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}</select></label></Card>}

      <Card>
        <h2 className={sectionTitleClass}>Request</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <TextField label="Request number" value={summary.requestNumber} onChange={(value) => setSummary({ ...summary, requestNumber: value })} required />
          <label className={labelClass}>Instrument type<span className="ml-1 text-red-600">*</span><select className={inputClass} value={summary.instrumentType} onChange={(event) => setSummary({ ...summary, instrumentType: event.target.value })} required>{instrumentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          {isEdit ? <label className={labelClass}>Workflow status<select className={inputClass} value={summary.status} onChange={(event) => setSummary({ ...summary, status: event.target.value })}><option>Draft</option><option>Under Review</option></select></label> : <div className={labelClass}>Workflow status<div className={`${inputClass} bg-slate-50 text-slate-600`}>Draft</div></div>}
          <label className={labelClass}>Email request to Corporate Treasury in earlier stages?<span className="ml-1 text-red-600">*</span><select className={inputClass} value={details.emailRequestToCorporateTreasury ? 'yes' : 'no'} onChange={(event) => updateDetail('emailRequestToCorporateTreasury', event.target.value === 'yes')} required><option value="no">No</option><option value="yes">Yes</option></select></label>
          <TextField label="Date submitted" type="date" value={details.dateSubmitted} onChange={(value) => updateDetail('dateSubmitted', value)} required />
          <TextField label="Date required by" type="date" value={summary.dueDate} onChange={(value) => setSummary({ ...summary, dueDate: value })} required />
          {!isEdit && <TextField label="Requested by" value={details.requesterName} onChange={(value) => updateDetail('requesterName', value)} required />}
        </div>
      </Card>

      <Card>
        <h2 className={sectionTitleClass}>Guarantee and contract</h2>
        <label className="mt-4 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={details.enableMultiEntity}
            onChange={(event) => changeMultiEntity(event.target.checked)}
            className="accent-brand"
          />
          <span><strong>Enable multientity</strong><span className="ml-1 text-slate-500">Allow more than one selection in each entity field.</span></span>
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <EntityLovField label="Parent company offering guarantee" values={details.parentCompanyOfferingGuarantee} options={businessEntities} multiple={details.enableMultiEntity} onChange={(values) => updateDetail('parentCompanyOfferingGuarantee', values)} />
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
          <TextField label="Maximum liability cap (% of contract value)" type="number" value={details.maximumLiabilityPercent} onChange={(value) => updateDetail('maximumLiabilityPercent', value)} />
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

      <Card>
        <h2 className={sectionTitleClass}>Supporting information</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextAreaField label="Background on requirement for guarantee" value={details.backgroundRequirement} onChange={(value) => updateDetail('backgroundRequirement', value)} required rows={5} />
          <TextAreaField label="Brief description of project/undertaking" value={details.projectDescription} onChange={(value) => updateDetail('projectDescription', value)} required rows={5} />
          <TextAreaField label="Optional comments" value={details.optionalComments} onChange={(value) => updateDetail('optionalComments', value)} />
          <TextAreaField label="Delivery instructions" value={details.deliveryInstructions} onChange={(value) => updateDetail('deliveryInstructions', value)} />
          <label className={labelClass}>PCG Language<select className={inputClass} value={details.pcgLanguage} onChange={(event) => updateDetail('pcgLanguage', event.target.value as RequestDetailsForm['pcgLanguage'])}><option>Standard Description</option><option>Beneficiary / Client Required Format</option></select></label>
          <TextAreaField label="Additional notes" value={summary.notes} onChange={(value) => setSummary({ ...summary, notes: value })} rows={2} />
          {isEdit && <div className="md:col-span-2"><TextAreaField label="Attachments" value={details.attachments} onChange={(value) => updateDetail('attachments', value)} rows={2} readOnly /></div>}
        </div>
      </Card>

      {isEdit && <Card>
        <h2 className={sectionTitleClass}>Requesting division and approvals</h2>
        <p className="mt-1 text-sm text-slate-500">The source form requires two requesting-division signatures. Approval fields may be completed as the request progresses.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <TextField label="Requester" value={details.requesterName} onChange={(value) => updateDetail('requesterName', value)} required />
          <TextField label="Requester date" type="date" value={details.requesterApprovalDate} onChange={(value) => updateDetail('requesterApprovalDate', value)} />
          <div />
          <TextField label="BL Finance VP - name and title" value={details.blFinanceVpNameTitle} onChange={(value) => updateDetail('blFinanceVpNameTitle', value)} />
          <TextField label="BL Finance VP date" type="date" value={details.blFinanceVpApprovalDate} onChange={(value) => updateDetail('blFinanceVpApprovalDate', value)} />
          <div />
          <TextField label="BL Legal Department" value={details.blLegalDepartment} onChange={(value) => updateDetail('blLegalDepartment', value)} />
          <TextField label="BL Legal date" type="date" value={details.blLegalApprovalDate} onChange={(value) => updateDetail('blLegalApprovalDate', value)} />
          <div />
          <TextField label="Head of Sustainability & Governance" value={details.sustainabilityGovernanceApproval} onChange={(value) => updateDetail('sustainabilityGovernanceApproval', value)} />
          <TextField label="Sustainability & Governance date" type="date" value={details.sustainabilityGovernanceApprovalDate} onChange={(value) => updateDetail('sustainabilityGovernanceApprovalDate', value)} />
          <div />
          <TextField label="CFO approval" value={details.cfoApproval} onChange={(value) => updateDetail('cfoApproval', value)} />
          <TextField label="CFO approval date" type="date" value={details.cfoApprovalDate} onChange={(value) => updateDetail('cfoApprovalDate', value)} />
          <div />
          <TextField label="Corporate Treasury approval" value={details.corporateTreasuryApproval} onChange={(value) => updateDetail('corporateTreasuryApproval', value)} />
          <TextField label="Corporate Treasury approval date" type="date" value={details.corporateTreasuryApprovalDate} onChange={(value) => updateDetail('corporateTreasuryApprovalDate', value)} />
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700"><input type="checkbox" checked={details.legalLanguageConfirmed} onChange={(event) => updateDetail('legalLanguageConfirmed', event.target.checked)} className="mt-0.5 accent-brand" /><span><strong>Local legal review confirmed.</strong> All Parent Company Guarantee language has been approved and reviewed by the local legal team.</span></label>
      </Card>}
    </form>
  );
}