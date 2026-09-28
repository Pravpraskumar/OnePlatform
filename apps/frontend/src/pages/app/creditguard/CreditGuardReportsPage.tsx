import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, CalendarRange, FileText } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Link, useOutletContext } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useProductSession } from '@/hooks/useProductSession';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

interface CreditGuardRequest {
  id: string;
  instrumentType: string;
  parentEntityType: 'localEntity' | 'mil' | null;
  amount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  nextReviewDate: string | null;
  guaranteeByEntities: string[];
}

interface CurrencyTotal {
  currency: string;
  amount: number;
}

async function creditGuardRequest<T>(path: string): Promise<T> {
  const response = await fetch(`/creditguard-api${path}`, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error(`CreditGuard API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function quarterStart(date: Date, offset = 0) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 + offset * 3, 1);
}

function quarterLabel(date: Date) {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

function addCurrencyTotal(totals: Map<string, number>, request: CreditGuardRequest) {
  totals.set(request.currency, (totals.get(request.currency) ?? 0) + Number(request.amount));
}

function sortedCurrencyTotals(totals: Map<string, number>): CurrencyTotal[] {
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }));
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
}

function instrumentLabel(request: CreditGuardRequest) {
  return request.instrumentType === 'Parent Company Guarantee' && request.parentEntityType === 'mil'
    ? `${request.instrumentType} - MIL`
    : request.instrumentType;
}

export function CreditGuardReportsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projectRequired, setProjectRequired] = useState(false);
  const [allocationChecked, setAllocationChecked] = useState(false);
  const [rows, setRows] = useState<CreditGuardRequest[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    setModuleName('CreditGuard');
    return () => setModuleName(null);
  }, [setModuleName]);

  useEffect(() => {
    setProduct(null);
    setProjectId('');
    setProjectRequired(false);
    setAllocationChecked(false);
    if (!selectedOrg) return;
    api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then((products) => {
        const creditGuard = products.find((candidate) => candidate.code.toLowerCase() === 'creditguard');
        if (!creditGuard) throw new Error('CreditGuard is not available for this organisation.');
        setProduct(creditGuard);
        return api.get<{ projectRequired: boolean; lastProjectId: string | null }>(`/organisations/${selectedOrg.id}/modules/${creditGuard.id}/projects`);
      })
      .then((result) => {
        setProjectRequired(result.projectRequired);
        setProjectId(result.lastProjectId ?? '');
        setAllocationChecked(true);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, selectedOrg]);

  const { session, loading: sessionLoading, error: sessionError } = useProductSession(
    api,
    selectedOrg?.id,
    product?.id,
    product?.name,
    projectId || undefined,
    projectRequired,
    allocationChecked,
  );

  useEffect(() => {
    if (!selectedOrg || !session || (projectRequired && !projectId)) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    setErrorMessage('');
    const query = new URLSearchParams({ orgId: selectedOrg.id });
    if (projectId) query.set('projectId', projectId);
    creditGuardRequest<CreditGuardRequest[]>(`/requests?${query}`)
      .then(setRows)
      .catch((error) => setErrorMessage((error as Error).message))
      .finally(() => setLoadingRows(false));
  }, [projectId, projectRequired, selectedOrg, session]);

  const statusCounts = rows.reduce<Record<string, number>>((counts, request) => {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
    return counts;
  }, {});
  const instrumentCounts = rows.reduce<Record<string, number>>((counts, request) => {
    const instrument = instrumentLabel(request);
    counts[instrument] = (counts[instrument] ?? 0) + 1;
    return counts;
  }, {});
  const currencyTotals = rows.reduce<Record<string, number>>((totals, request) => {
    totals[request.currency] = (totals[request.currency] ?? 0) + Number(request.amount);
    return totals;
  }, {});
  const activeRequests = rows.filter((request) => !['Closed', 'Rejected'].includes(request.status));
  const openRequests = activeRequests.length;
  const approvedRequests = rows.filter((request) => request.status === 'Approved').length;
  const entityPortfolio = [...activeRequests.reduce((groups, request) => {
    const entity = request.guaranteeByEntities?.length ? request.guaranteeByEntities.join('; ') : 'Unspecified';
    const key = `${entity}\u0000${request.currency}`;
    const current = groups.get(key) ?? { entity, currency: request.currency, count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(request.amount);
    groups.set(key, current);
    return groups;
  }, new Map<string, { entity: string; currency: string; count: number; amount: number }>()).values()]
    .sort((left, right) => left.entity.localeCompare(right.entity) || left.currency.localeCompare(right.currency));
  const today = new Date();
  const todayKey = dateKey(today);
  const reviewQuarters = Array.from({ length: 4 }, (_, index) => {
    const start = quarterStart(today, index);
    const end = quarterStart(today, index + 1);
    const totals = new Map<string, number>();
    const reviews = activeRequests.filter((request) => request.nextReviewDate
      && request.nextReviewDate >= todayKey
      && request.nextReviewDate >= dateKey(start)
      && request.nextReviewDate < dateKey(end));
    reviews.forEach((request) => addCurrencyTotal(totals, request));
    return { label: quarterLabel(start), count: reviews.length, totals: sortedCurrencyTotals(totals) };
  });

  if (!selectedOrg) return <Card><h1 className="text-xl font-semibold text-slate-900">Select an organisation</h1><p className="mt-2 text-sm text-slate-500">Choose an organisation to view CreditGuard analytics.</p></Card>;

  const message = errorMessage || sessionError;
  if (message) return <Card><h1 className="text-xl font-semibold text-slate-900">Unable to load reports</h1><p className="mt-2 text-sm text-red-600">{message}</p></Card>;

  if (product && allocationChecked && projectRequired && !projectId) return <Card><h1 className="text-xl font-semibold text-slate-900">Select a project</h1><p className="mt-2 text-sm text-slate-500">Open the CreditGuard overview and select a project before viewing analytics.</p></Card>;

  if (!product || !allocationChecked || sessionLoading || !session || loadingRows) return <p className="text-sm text-slate-500">Loading CreditGuard analytics...</p>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Link to="/app/product/CreditGuard" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><ArrowLeft size={15} />Overview</Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Reports &amp; Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Current request portfolio for {selectedOrg.name}.</p>
        </div>
        <Link to="/app/product/CreditGuard/requests" className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"><FileText size={16} />Open requests</Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-md"><p className="text-sm text-slate-500">Total requests</p><p className="mt-2 text-3xl font-semibold text-slate-950">{rows.length}</p></Card>
        <Card className="rounded-md"><p className="text-sm text-slate-500">Open requests</p><p className="mt-2 text-3xl font-semibold text-slate-950">{openRequests}</p></Card>
        <Card className="rounded-md"><p className="text-sm text-slate-500">Approved Requests</p><p className="mt-2 text-3xl font-semibold text-slate-950">{approvedRequests}</p></Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-md lg:col-span-1">
          <div className="flex items-center gap-2"><BarChart3 size={18} className="text-brand" /><h2 className="font-semibold text-slate-900">Requests by status</h2></div>
          <div className="mt-5 space-y-3">{Object.entries(statusCounts).map(([status, count]) => <div key={status} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm"><span className="text-slate-600">{status}</span><strong className="text-slate-900">{count}</strong></div>)}{rows.length === 0 && <p className="text-sm text-slate-500">No request data available.</p>}</div>
        </Card>
        <Card className="rounded-md lg:col-span-1">
          <h2 className="font-semibold text-slate-900">Requests by instrument</h2>
          <div className="mt-5 space-y-3">{Object.entries(instrumentCounts).map(([instrument, count]) => <div key={instrument} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 text-sm"><span className="text-slate-600">{instrument}</span><strong className="text-slate-900">{count}</strong></div>)}{rows.length === 0 && <p className="text-sm text-slate-500">No request data available.</p>}</div>
        </Card>
        <Card className="rounded-md lg:col-span-1">
          <h2 className="font-semibold text-slate-900">Portfolio value by currency</h2>
          <div className="mt-5 space-y-3">{Object.entries(currencyTotals).map(([currency, amount]) => <div key={currency} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm"><span className="font-medium text-slate-600">{currency}</span><strong className="text-slate-900">{amount.toLocaleString()}</strong></div>)}{rows.length === 0 && <p className="text-sm text-slate-500">No request data available.</p>}</div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-md p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><Building2 size={18} className="text-brand" /><h2 className="font-semibold text-slate-900">Guarantees by entity</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600"><th className="px-5 py-3 font-semibold">Guarantee By</th><th className="px-4 py-3 text-right font-semibold">Guarantees</th><th className="px-4 py-3 font-semibold">Currency</th><th className="px-5 py-3 text-right font-semibold">Portfolio value</th></tr></thead>
              <tbody>{entityPortfolio.map((group) => <tr key={`${group.entity}-${group.currency}`} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3 text-slate-700">{group.entity}</td><td className="px-4 py-3 text-right font-medium text-slate-900">{group.count}</td><td className="px-4 py-3 text-slate-600">{group.currency}</td><td className="px-5 py-3 text-right font-semibold text-slate-900">{formatAmount(group.amount)}</td></tr>)}</tbody>
            </table>
            {entityPortfolio.length === 0 && <p className="px-5 py-6 text-sm text-slate-500">No active guarantees available.</p>}
          </div>
        </Card>

        <Card className="overflow-hidden rounded-md p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><CalendarRange size={18} className="text-brand" /><h2 className="font-semibold text-slate-900">Upcoming guarantee reviews</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600"><th className="px-5 py-3 font-semibold">Quarter</th><th className="px-4 py-3 text-right font-semibold">Reviews</th><th className="px-5 py-3 text-right font-semibold">Value by currency</th></tr></thead>
              <tbody>{reviewQuarters.map((quarter) => <tr key={quarter.label} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3 font-medium text-slate-900">{quarter.label}</td><td className="px-4 py-3 text-right font-medium text-slate-900">{quarter.count}</td><td className="px-5 py-3 text-right text-slate-700">{quarter.totals.length ? quarter.totals.map((total) => <span key={total.currency} className="ml-3 whitespace-nowrap"><span className="font-medium">{total.currency}</span> {formatAmount(total.amount)}</span>) : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
