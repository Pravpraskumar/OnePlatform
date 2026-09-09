import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useProductSession } from '@/hooks/useProductSession';
import { CreditGuardLanding } from './creditguard/CreditGuardLanding';

export function ProductLandingPage() {
  const { code } = useParams<{ code: string }>();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [product, setProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState('');
  const [projectOptions, setProjectOptions] = useState<{ id: string; code: string; name: string }[]>([]);
  const [projectRequired, setProjectRequired] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [allocationChecked, setAllocationChecked] = useState(false);
  const [projectSelectionError, setProjectSelectionError] = useState('');
  const [savingProject, setSavingProject] = useState(false);

  useEffect(() => {
    setModuleName(product?.name ?? null);
    return () => setModuleName(null);
  }, [product?.name, setModuleName]);

  useEffect(() => {
    setProduct(null);
    setProductError('');
    if (!selectedOrg) return;
    api
      .get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then((products) => {
        const match = products.find((candidate) => candidate.code.toLowerCase() === code?.toLowerCase());
        if (match) setProduct(match);
        else setProductError('This module is not assigned to the selected organisation.');
      })
      .catch((requestError) => setProductError((requestError as Error).message));
  }, [api, code, selectedOrg]);

  useEffect(() => {
    setProjectOptions([]);
    setProjectRequired(false);
    setProjectId('');
    setProjectSelectionError('');
    setAllocationChecked(false);
    if (!selectedOrg || !product) return;
    api
      .get<{ projectRequired: boolean; lastProjectId: string | null; projects: { id: string; code: string; name: string }[] }>(
        `/organisations/${selectedOrg.id}/modules/${product.id}/projects`,
      )
      .then((result) => {
        setProjectRequired(result.projectRequired);
        setProjectOptions(result.projects);
        setProjectId(result.lastProjectId ?? '');
        setAllocationChecked(true);
      })
      .catch((requestError) => setProductError((requestError as Error).message));
  }, [api, product, selectedOrg]);

  const { session, loading, error } = useProductSession(
    api,
    selectedOrg?.id,
    product?.id,
    product?.name,
    projectId || undefined,
    projectRequired,
    allocationChecked,
  );

  const selectProject = async (nextProjectId: string) => {
    if (!selectedOrg || !product) return;
    const previousProjectId = projectId;
    setProjectId(nextProjectId);
    setProjectSelectionError('');
    setSavingProject(true);
    try {
      await api.put(`/organisations/${selectedOrg.id}/modules/${product.id}/last-project`, {
        projectId: nextProjectId,
      });
    } catch (requestError) {
      setProjectId(previousProjectId);
      setProjectSelectionError((requestError as Error).message);
    } finally {
      setSavingProject(false);
    }
  };

  const projectSubheader = selectedOrg && product && projectRequired && allocationChecked ? (
    <div className="-mx-6 -mt-6 mb-6 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-md bg-brand/10 p-2 text-brand"><FolderKanban size={18} /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">Project context</p>
          <p className="truncate text-sm text-slate-700">{selectedOrg.name} / {product.name}</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        Project
        <select
          required
          value={projectId}
          disabled={savingProject}
          onChange={(event) => void selectProject(event.target.value)}
          className="min-w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand disabled:opacity-60"
        >
          <option value="" disabled>Select a project</option>
          {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}
        </select>
      </label>
      {projectSelectionError && <p className="w-full text-right text-xs text-red-600">The project selection could not be saved.</p>}
    </div>
  ) : null;

  if (!selectedOrg) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Select an organisation</h1>
        <p className="mt-2 text-sm text-slate-500">Choose an organisation before opening {code}.</p>
      </Card>
    );
  }

  if (productError || error) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Unable to open {code}</h1>
        <p className="mt-2 text-sm text-red-600">{productError || error}</p>
        <Link to="/app/products" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
          Back to products
        </Link>
      </Card>
    );
  }

  if (product && projectRequired && !projectId) {
    return (
      <div>
        {projectSubheader}
        <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
        <p className="mt-2 text-sm text-slate-500">Select a project in the subheader to open this module.</p>
      </div>
    );
  }

  if (!product || !allocationChecked || loading || !session) {
    return (
      <div>
        {projectSubheader}
        <p className="text-sm text-slate-500">Checking license availability...</p>
      </div>
    );
  }

  return (
    <div>
      {projectSubheader}
      {product.code.toLowerCase() === 'creditguard' ? (
        <CreditGuardLanding />
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
          <Card className="mt-6">
            <p className="text-slate-500">
              {product.name} module landing page. Detailed features will be added later.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
