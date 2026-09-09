import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';

interface ManagedOrg {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
  memberCount: number;
  moduleCount: number;
}

const field = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Global Administrator: create, rename and (de)activate organisations.
export function AdminOrganisationsPage() {
  const api = useApi();
  const [orgs, setOrgs] = useState<ManagedOrg[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<string, { name: string; slug: string }>>({});

  const load = useCallback(() => {
    api.get<ManagedOrg[]>('/organisations').then(setOrgs).catch((e) => setError((e as Error).message));
  }, [api]);

  useEffect(() => load(), [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/organisations', { name, slug: slug || slugify(name) });
      setName('');
      setSlug('');
      setSlugEdited(false);
      load();
    } catch (err) {
      setError((err as Error).message.includes('409') ? 'That slug is already in use.' : 'Create failed.');
    }
  };

  const saveEdit = async (id: string) => {
    const draft = editing[id];
    if (!draft) return;
    setError('');
    try {
      await api.put(`/organisations/${id}`, draft);
      setEditing((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      load();
    } catch (err) {
      setError((err as Error).message.includes('409') ? 'That slug is already in use.' : 'Update failed.');
    }
  };

  const setStatus = async (id: string, status: ManagedOrg['status']) => {
    setError('');
    try {
      await api.patch(`/organisations/${id}/status`, { status });
      load();
    } catch (err) {
      setError((err as Error).message.includes('409') ? 'The Global organisation cannot be deactivated.' : 'Update failed.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Organisations</h1>
      <p className="mt-1 text-slate-500">Create and manage organisations across the platform.</p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Card className="mt-6">
        <h2 className="font-medium text-slate-800">Create organisation</h2>
        <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm">
            <span className="text-slate-600">Name</span>
            <input
              required
              className={field}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Slug</span>
            <input
              required
              className={field}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
            />
          </label>
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Modules</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => {
              const draft = editing[o.id];
              return (
                <tr key={o.id} className="border-b border-slate-100 align-middle">
                  <td className="px-4 py-3">
                    {draft ? (
                      <div className="flex flex-col gap-2">
                        <input
                          className={field}
                          value={draft.name}
                          onChange={(e) =>
                            setEditing((s) => ({ ...s, [o.id]: { ...draft, name: e.target.value } }))
                          }
                        />
                        <input
                          className={field}
                          value={draft.slug}
                          onChange={(e) =>
                            setEditing((s) => ({ ...s, [o.id]: { ...draft, slug: e.target.value } }))
                          }
                        />
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-slate-800">{o.name}</div>
                        <div className="text-xs text-slate-500">{o.slug}</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs ' +
                        (o.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : o.status === 'suspended'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700')
                      }
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.memberCount}</td>
                  <td className="px-4 py-3 text-slate-600">{o.moduleCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {draft ? (
                        <>
                          <Button variant="secondary" onClick={() => saveEdit(o.id)}>
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setEditing((s) => {
                                const next = { ...s };
                                delete next[o.id];
                                return next;
                              })
                            }
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setEditing((s) => ({ ...s, [o.id]: { name: o.name, slug: o.slug } }))
                            }
                          >
                            Edit
                          </Button>
                          {o.status === 'active' ? (
                            <Button
                              variant="secondary"
                              disabled={o.slug === 'global'}
                              onClick={() => setStatus(o.id, 'suspended')}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="secondary" onClick={() => setStatus(o.id, 'active')}>
                              Activate
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-400">
                  No organisations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
