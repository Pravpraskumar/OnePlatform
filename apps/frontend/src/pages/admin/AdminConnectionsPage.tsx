import { useEffect, useState } from 'react';
import type { Product } from '@platform/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';

interface ConnectionForm {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

const empty: ConnectionForm = { host: '', port: 5432, database: '', username: '', password: '', ssl: true };

// Global Administrator: configure each product's dedicated database connection.
export function AdminConnectionsPage() {
  const api = useApi();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [form, setForm] = useState<ConnectionForm>(empty);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    api.get<Product[]>('/products').then((p) => {
      setProducts(p);
      if (p[0]) setSelected(p[0].id);
    });
  }, [api]);

  useEffect(() => {
    if (!selected) return;
    setStatus('');
    api
      .get<Partial<ConnectionForm> | null>(`/products/${selected}/connection`)
      .then((c) => setForm({ ...empty, ...(c ?? {}), password: '' }))
      .catch(() => setForm(empty));
  }, [api, selected]);

  const save = async () => {
    setStatus('Saving…');
    try {
      await api.put(`/products/${selected}/connection`, form);
      setStatus('Saved.');
      setForm((f) => ({ ...f, password: '' }));
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const field = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Product Database Connections</h1>
      <p className="mt-1 text-slate-500">Connection secrets are encrypted at rest.</p>

      <Card className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-slate-600">Product</span>
          <select className={field} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-slate-600">Host</span>
            <input className={field} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Port</span>
            <input
              type="number"
              className={field}
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Database</span>
            <input
              className={field}
              value={form.database}
              onChange={(e) => setForm({ ...form, database: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Username</span>
            <input
              className={field}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Password</span>
            <input
              type="password"
              placeholder="••••••••"
              className={field}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => setForm({ ...form, ssl: e.target.checked })}
            />
            Require SSL
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save}>Save connection</Button>
          {status && <span className="text-sm text-slate-500">{status}</span>}
        </div>
      </Card>
    </div>
  );
}
