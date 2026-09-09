import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '@platform/shared';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

export function ProductsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!selectedOrg) {
      setProducts([]);
      return;
    }
    api
      .get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [api, selectedOrg]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Link key={p.id} to={`/app/product/${p.code}`}>
            <Card className="h-full transition hover:shadow-md">
              <h2 className="font-medium text-slate-800">{p.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{p.description ?? '—'}</p>
              <span className="mt-3 inline-block text-xs font-medium text-brand">Open module →</span>
            </Card>
          </Link>
        ))}
        {products.length === 0 && (
          <p className="text-slate-400">
            {selectedOrg
              ? 'No modules are assigned to this organisation.'
              : 'Select an organisation to view its modules.'}
          </p>
        )}
      </div>
    </div>
  );
}
