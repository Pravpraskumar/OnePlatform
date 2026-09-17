import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LockKeyhole, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';

interface ManagedRole {
  id: string;
  name: string;
  scope: 'global' | 'org';
  productId: string | null;
  productName: string | null;
  description: string | null;
  isSystem: boolean;
}

interface Module {
  id: string;
  name: string;
  isActive: boolean;
}

interface ScreenMenu {
  id: string;
  name: string;
  route: string | null;
  parentId: string | null;
  productId: string | null;
  type: 'Global' | 'Secured';
  displayOrder: number;
  isActive: boolean;
  accessMode?: 'readonly' | 'editable';
}

interface MenuNode extends ScreenMenu {
  children: MenuNode[];
}

function MenuTreeItem({ node, selectedIds, accessModes, expandedIds, disabled, onToggle, onAccessModeChange, onExpansionToggle }: {
  node: MenuNode;
  selectedIds: Set<string>;
  accessModes: Map<string, 'readonly' | 'editable'>;
  expandedIds: Set<string>;
  disabled: boolean;
  onToggle: (node: MenuNode, checked: boolean) => void;
  onAccessModeChange: (id: string, accessMode: 'readonly' | 'editable') => void;
  onExpansionToggle: (id: string) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const branchIds = [node.id, ...node.children.flatMap((child) => collectMenuIds(child))];
  const selectedCount = branchIds.filter((id) => selectedIds.has(id)).length;
  const checked = selectedCount === branchIds.length;
  const indeterminate = selectedCount > 0 && !checked;
  const expanded = expandedIds.has(node.id);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <li>
      <div className="flex min-h-10 items-center gap-2 px-3 py-2 hover:bg-slate-50">
        {node.children.length > 0 ? (
          <button type="button" onClick={() => onExpansionToggle(node.id)} className="rounded p-0.5 text-slate-500 hover:bg-slate-200" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`} title={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onToggle(node, event.currentTarget.checked)}
            className="h-4 w-4 shrink-0 accent-brand"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{node.name}</span>
            {node.route && <span className="block truncate text-xs text-slate-500">{node.route}</span>}
          </span>
          {!node.isActive && <span className="text-xs text-slate-400">Inactive</span>}
        </label>
        {node.route && (
          <select
            value={accessModes.get(node.id) ?? 'editable'}
            disabled={disabled || !selectedIds.has(node.id)}
            onChange={(event) => onAccessModeChange(node.id, event.target.value as 'readonly' | 'editable')}
            aria-label={`Access mode for ${node.name}`}
            className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="editable">Editable</option>
            <option value="readonly">Read-only</option>
          </select>
        )}
      </div>
      {node.children.length > 0 && expanded && (
        <ul className="ml-5 border-l border-slate-200 pl-3">
          {node.children.map((child) => (
            <MenuTreeItem key={child.id} node={child} selectedIds={selectedIds} accessModes={accessModes} expandedIds={expandedIds} disabled={disabled} onToggle={onToggle} onAccessModeChange={onAccessModeChange} onExpansionToggle={onExpansionToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

function collectMenuIds(node: MenuNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectMenuIds(child))];
}

const field = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-slate-100 disabled:text-slate-500';

export function AdminRolesPage() {
  const api = useApi();
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [screenMenus, setScreenMenus] = useState<ScreenMenu[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', productId: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignedMenuIds, setAssignedMenuIds] = useState<Set<string>>(new Set());
  const [menuAccessModes, setMenuAccessModes] = useState<Map<string, 'readonly' | 'editable'>>(new Map());
  const [expandedMenuIds, setExpandedMenuIds] = useState<Set<string>>(new Set());
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [savingMenus, setSavingMenus] = useState(false);
  const [error, setError] = useState('');

  const selectedRole = roles.find((role) => role.id === selectedId) ?? null;
  const menuTree = useMemo(() => {
    const nodes = new Map(screenMenus.map((menu) => [menu.id, { ...menu, children: [] } as MenuNode]));
    const roots: MenuNode[] = [];
    nodes.forEach((node) => {
      const parent = node.parentId ? nodes.get(node.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    const sort = (items: MenuNode[]) => {
      items.sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
      items.forEach((item) => sort(item.children));
    };
    sort(roots);
    return roots;
  }, [screenMenus]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [roleRows, moduleRows, menuRows] = await Promise.all([
        api.get<ManagedRole[]>('/roles'),
        api.get<Module[]>('/products'),
        api.get<ScreenMenu[]>('/menus'),
      ]);
      setRoles(roleRows);
      setModules(moduleRows.filter((module) => module.isActive));
      const securedMenus = menuRows.filter((menu) => menu.type === 'Secured');
      setScreenMenus(securedMenus);
      setExpandedMenuIds(new Set(securedMenus.filter((menu) => securedMenus.some((child) => child.parentId === menu.id)).map((menu) => menu.id)));
      setSelectedId((current) => current ?? roleRows[0]?.id ?? null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedRole || creating) return;
    setDraft({
      name: selectedRole.name,
      productId: selectedRole.productId ?? '',
      description: selectedRole.description ?? '',
    });
  }, [creating, selectedRole]);

  useEffect(() => {
    if (!selectedId || creating) {
      setAssignedMenuIds(new Set());
      setMenuAccessModes(new Map());
      return;
    }
    let cancelled = false;
    setLoadingMenus(true);
    api.get<ScreenMenu[]>(`/roles/${selectedId}/menus`)
      .then((rows) => {
        if (!cancelled) {
          setAssignedMenuIds(new Set(rows.map((menu) => menu.id)));
          setMenuAccessModes(new Map(rows.map((menu) => [menu.id, menu.accessMode ?? 'editable'])));
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError((requestError as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMenus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, creating, selectedId]);

  const toggleMenu = (node: MenuNode, checked: boolean) => {
    const branchIds = collectMenuIds(node);
    const ancestorIds: string[] = [];
    if (checked) {
      const byId = new Map(screenMenus.map((menu) => [menu.id, menu]));
      let parentId = node.parentId;
      while (parentId) {
        ancestorIds.push(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    setAssignedMenuIds((current) => {
      const next = new Set(current);
      branchIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      ancestorIds.forEach((id) => next.add(id));
      return next;
    });
    setMenuAccessModes((current) => {
      const next = new Map(current);
      branchIds.forEach((id) => {
        if (checked && !next.has(id)) next.set(id, 'editable');
        if (!checked) next.delete(id);
      });
      ancestorIds.forEach((id) => {
        if (!next.has(id)) next.set(id, 'editable');
      });
      return next;
    });
  };

  const setMenuAccessMode = (id: string, accessMode: 'readonly' | 'editable') => {
    setMenuAccessModes((current) => new Map(current).set(id, accessMode));
  };

  const toggleMenuExpansion = (id: string) => {
    setExpandedMenuIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMenuAssignments = async () => {
    if (!selectedRole) return;
    setSavingMenus(true);
    setError('');
    try {
      const assignments = [...assignedMenuIds].map((menuId) => ({
        menuId,
        accessMode: menuAccessModes.get(menuId) ?? 'editable',
      }));
      const rows = await api.put<ScreenMenu[]>(`/roles/${selectedRole.id}/menus`, { assignments });
      setAssignedMenuIds(new Set(rows.map((menu) => menu.id)));
      setMenuAccessModes(new Map(rows.map((menu) => [menu.id, menu.accessMode ?? 'editable'])));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSavingMenus(false);
    }
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setDraft({ name: '', productId: modules[0]?.id ?? '', description: '' });
    setError('');
  };

  const selectRole = (role: ManagedRole) => {
    setCreating(false);
    setSelectedId(role.id);
    setError('');
  };

  const saveRole = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (creating) {
        const created = await api.post<ManagedRole>('/roles', draft);
        setCreating(false);
        setSelectedId(created.id);
      } else if (selectedRole && !selectedRole.isSystem) {
        await api.put(`/roles/${selectedRole.id}`, draft);
      }
      await load();
    } catch (requestError) {
      setError((requestError as Error).message.includes('409') ? 'A role with this name already exists.' : (requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async () => {
    if (!selectedRole || selectedRole.isSystem || !window.confirm(`Delete role ${selectedRole.name}?`)) return;
    setSaving(true);
    setError('');
    try {
      await api.del(`/roles/${selectedRole.id}`);
      setSelectedId(null);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-7rem)] overflow-hidden rounded-md border border-slate-200 bg-white">
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h1 className="font-semibold text-slate-900">Roles</h1>
          <button type="button" onClick={startCreate} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Create role" title="Create role">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => selectRole(role)}
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${selectedId === role.id ? 'bg-brand/10 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {role.isSystem && <LockKeyhole size={14} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{role.name}</span>
                <span className="block truncate text-xs text-slate-400">{role.productName ?? 'Global'}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {(selectedRole || creating) ? (
          <>
            <form onSubmit={saveRole} className="border-b border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{creating ? 'Create role' : selectedRole?.name}</h2>
                  {selectedRole?.isSystem && <p className="mt-1 text-sm text-slate-500">System role details cannot be modified or deleted.</p>}
                </div>
                <div className="flex gap-2">
                  {selectedRole && !selectedRole.isSystem && (
                    <button type="button" onClick={deleteRole} className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label="Delete role" title="Delete role">
                      <Trash2 size={18} />
                    </button>
                  )}
                  {(creating || !selectedRole?.isSystem) && <Button type="submit" disabled={saving}><Save size={16} />Save role</Button>}
                </div>
              </div>
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-600">Name<input required disabled={selectedRole?.isSystem} className={`mt-1 ${field}`} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="text-sm text-slate-600">{selectedRole?.isSystem ? 'Role type' : 'Module'}
                  {selectedRole?.isSystem ? (
                    <input disabled className={`mt-1 ${field}`} value={selectedRole.productName ?? 'Global role'} />
                  ) : (
                    <select required className={`mt-1 ${field}`} value={draft.productId} onChange={(event) => setDraft((current) => ({ ...current, productId: event.target.value }))}>
                      <option value="" disabled>Select a module</option>
                      {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                    </select>
                  )}
                </label>
                <label className="text-sm text-slate-600 md:col-span-2">Description<textarea disabled={selectedRole?.isSystem} rows={2} className={`mt-1 ${field}`} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              </div>
            </form>

            {!creating && selectedRole && (
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">Screen menu assignments</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedRole.isSystem
                        ? 'Select the navigation groups and screens available to this system role.'
                        : 'Select the navigation groups and screens available to this role.'}
                    </p>
                  </div>
                  <Button type="button" disabled={savingMenus || loadingMenus} onClick={saveMenuAssignments}>
                    <Save size={16} />Save assignments
                  </Button>
                </div>
                <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
                    <span className="text-xs font-semibold uppercase text-slate-500">Menu hierarchy</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setExpandedMenuIds(new Set(screenMenus.filter((menu) => screenMenus.some((child) => child.parentId === menu.id)).map((menu) => menu.id)))} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">
                        <ChevronDown size={14} />Expand all
                      </button>
                      <button type="button" onClick={() => setExpandedMenuIds(new Set())} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">
                        <ChevronRight size={14} />Collapse all
                      </button>
                    </div>
                  </div>
                  {loadingMenus ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">Loading assignments...</p>
                  ) : menuTree.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">No screen menus are configured.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {menuTree.map((node) => (
                        <MenuTreeItem key={node.id} node={node} selectedIds={assignedMenuIds} accessModes={menuAccessModes} expandedIds={expandedMenuIds} disabled={savingMenus} onToggle={toggleMenu} onAccessModeChange={setMenuAccessMode} onExpansionToggle={toggleMenuExpansion} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a role or create a new one.</div>
        )}
      </section>
    </div>
  );
}