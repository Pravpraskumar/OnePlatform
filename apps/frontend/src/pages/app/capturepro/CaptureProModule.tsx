import { useEffect, useState } from 'react';
import { BriefcaseBusiness, FolderKanban } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Outlet, useOutletContext } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useProductSession } from '@/hooks/useProductSession';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

export function CaptureProModule() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projectRequired, setProjectRequired] = useState(false);
  const [allocationChecked, setAllocationChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setModuleName('Capture-Pro');
    return () => setModuleName(null);
  }, [setModuleName]);

  useEffect(() => {
    setProduct(null);
    setAllocationChecked(false);
    setErrorMessage('');
    if (!selectedOrg) return;
    api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then((products) => {
        const match = products.find((candidate) => candidate.code.toLowerCase() === 'capture-pro');
        if (!match) throw new Error('Capture-Pro is not assigned to this organisation.');
        setProduct(match);
        return api.get<{ projectRequired: boolean; lastProjectId: string | null }>(`/organisations/${selectedOrg.id}/modules/${match.id}/projects`);
      })
      .then((result) => {
        setProjectRequired(result.projectRequired);
        setProjectId(result.lastProjectId ?? '');
        setAllocationChecked(true);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, selectedOrg]);

  const { session, loading, error } = useProductSession(
    api,
    selectedOrg?.id,
    product?.id,
    product?.name,
    projectId || undefined,
    projectRequired,
    allocationChecked,
  );

  if (errorMessage || error) {
    return <Card><h1 className="text-lg font-semibold text-slate-950">Unable to open Capture-Pro</h1><p className="mt-2 text-sm text-red-700">{errorMessage || error}</p></Card>;
  }
  if (projectRequired && !projectId && allocationChecked) {
    return <Card><FolderKanban className="text-amber-600" size={22} /><h1 className="mt-3 text-lg font-semibold">Project context required</h1><p className="mt-1 text-sm text-slate-600">Select an allocated project from the product overview before opening Capture-Pro.</p></Card>;
  }
  if (!selectedOrg || !product || !allocationChecked || loading || !session) {
    return <div className="flex items-center gap-3 text-sm text-slate-600"><BriefcaseBusiness size={18} className="text-brand" />Checking Capture-Pro access...</div>;
  }
  return <Outlet context={{ productId: product.id }} />;
}