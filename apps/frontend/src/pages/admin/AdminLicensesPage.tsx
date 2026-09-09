import { useCallback, useEffect, useState } from 'react';
import type { OrganisationModule, Product } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';

interface Organisation {
  id: string;
  name: string;
}

export function AdminLicensesPage() {
  const api = useApi();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [organisationId, setOrganisationId] = useState('');
  const [assignments, setAssignments] = useState<OrganisationModule[]>([]);
  const [seatDrafts, setSeatDrafts] = useState<Record<string, number>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  const loadAssignments = useCallback(async (orgId: string) => {
    try {
      const rows = await api.get<OrganisationModule[]>(`/organisations/${orgId}/modules`);
      setAssignments(rows);
      setSeatDrafts(Object.fromEntries(rows.map((row) => [row.productId, row.licensedSeats])));
    } catch {
      setAssignments([]);
    }
  }, [api]);

  useEffect(() => {
    Promise.all([api.get<Organisation[]>('/organisations'), api.get<Product[]>('/products')])
      .then(([orgRows, productRows]) => {
        setOrganisations(orgRows);
        setProducts(productRows);
        setOrganisationId((current) => current || orgRows[0]?.id || '');
      })
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (organisationId) loadAssignments(organisationId);
  }, [organisationId, loadAssignments]);

  const saveAssignment = async (productId: string) => {
    if (!organisationId) return;
    setSavingProductId(productId);
    try {
      await api.put(`/organisations/${organisationId}/modules`, {
        productId,
        licensedSeats: Math.max(1, seatDrafts[productId] ?? 1),
      });
      await loadAssignments(organisationId);
      notify('Module assignment saved.', 'success');
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setSavingProductId(null);
    }
  };

  const removeAssignment = async (productId: string) => {
    if (!organisationId) return;
    setSavingProductId(productId);
    try {
      await api.del(`/organisations/${organisationId}/modules/${productId}`);
      await loadAssignments(organisationId);
      notify('Module assignment removed.', 'success');
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setSavingProductId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Module Assignments</h1>
      <p className="mt-1 text-slate-500">Control which modules are available to each organisation.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block w-full max-w-md text-sm text-slate-600">
          Organisation
          <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={organisationId} onChange={(event) => setOrganisationId(event.target.value)}>
            {organisations.map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.name}</option>)}
          </select>
        </label>
      </div>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Description</th>
              <th className="w-36 px-4 py-3">Concurrent seats</th>
              <th className="w-32 px-4 py-3">Availability</th>
              <th className="w-36 px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const assignment = assignments.find((row) => row.productId === product.id);
              const isAssigned = !!assignment && assignment.status === 'active';
              return (
                <tr key={product.id} className="border-b border-slate-100 align-middle">
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{product.name}</div><div className="text-xs text-slate-500">{product.code}</div></td>
                  <td className="max-w-md px-4 py-3 text-slate-600">{product.description ?? 'No description'}</td>
                  <td className="px-4 py-3">
                    <input type="number" min={1} disabled={!isAssigned} className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" value={seatDrafts[product.id] ?? 1} onChange={(event) => setSeatDrafts((current) => ({ ...current, [product.id]: Number(event.target.value) }))} aria-label={`${product.name} concurrent seats`} />
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${isAssigned ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{isAssigned ? 'Assigned' : 'Not assigned'}</span></td>
                  <td className="px-4 py-3 text-right">
                    {isAssigned ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" disabled={savingProductId === product.id} onClick={() => saveAssignment(product.id)}>Save</Button>
                        <Button variant="ghost" disabled={savingProductId === product.id} onClick={() => removeAssignment(product.id)}>Remove</Button>
                      </div>
                    ) : (
                      <Button disabled={savingProductId === product.id} onClick={() => saveAssignment(product.id)}>Assign</Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No active modules are configured.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}