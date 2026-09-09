import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, FileText } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Link, useOutletContext } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useProductSession } from '@/hooks/useProductSession';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

interface CreditGuardRequest {
  id: string;
  instrumentType: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: string | null;
}

async function creditGuardRequest<T>(path: string): Promise<T> {
  const response = await fetch(`/creditguard-api${path}`, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error(`CreditGuard API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
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
    counts[request.instrumentType] = (counts[request.instrumentType] ?? 0) + 1;
    return counts;
  }, {});
  const currencyTotals = rows.reduce<Record<string, number>>((totals, request) => {
    totals[request.currency] = (totals[request.currency] ?? 0) + Number(request.amount);
    return totals;
  }, {});
  const openRequests = rows.filter((request) => !['Closed', 'Rejected'].includes(request.status)).length;

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
        <Card className="rounded-md"><p className="text-sm text-slate-500">Instrument types</p><p className="mt-2 text-3xl font-semibold text-slate-950">{Object.keys(instrumentCounts).length}</p></Card>
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
    </div>
  );
}
