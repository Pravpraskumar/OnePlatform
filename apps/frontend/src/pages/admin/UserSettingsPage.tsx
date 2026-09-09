import { useCallback, useEffect, useState } from 'react';
import { Bell, Building2, KeyRound, LayoutGrid, ShieldCheck, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';

type Tab = 'overview' | 'notifications' | 'access' | 'security';

interface UserOption {
  id: string;
  displayName: string;
  email: string;
  status: 'active' | 'suspended' | 'pending';
}

interface NotificationPreferences {
  accessChanges: boolean;
  projectUpdates: boolean;
  sessionAlerts: boolean;
  platformAnnouncements: boolean;
  digest: 'instant' | 'daily' | 'weekly' | 'off';
}

interface UserSettings {
  profile: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
    username: string;
    status: 'active' | 'suspended' | 'pending';
    source: string;
    createdAt: string;
    updatedAt: string;
    lastSignedInAt: string | null;
  };
  notifications: NotificationPreferences;
  access: {
    organisations: { id: string; name: string; membership: string; status: string }[];
    roles: { name: string; scope: string; productName: string | null; orgId: string | null; orgName: string | null }[];
    modules: { id: string; name: string; code: string; orgId: string; orgName: string; teamId: string | null }[];
    projects: { id: string; code: string; name: string; orgId: string; orgName: string }[];
    teams: { id: string; name: string; orgId: string; orgName: string }[];
  };
  sessions: { id: string; orgName: string; productName: string | null; projectName: string | null; startedAt: string; lastSeenAt: string; endedAt: string | null; ip: string | null }[];
}

const tabs: { id: Tab; label: string; Icon: typeof UserRound }[] = [
  { id: 'overview', label: 'Overview', Icon: UserRound },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'access', label: 'Access Details', Icon: ShieldCheck },
  { id: 'security', label: 'Security & Activity', Icon: KeyRound },
];

const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never';

function EmptyState({ children }: { children: string }) {
  return <p className="py-5 text-sm text-slate-400">{children}</p>;
}

export function UserSettingsPage() {
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(searchParams.get('userId') ?? '');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<UserOption[]>('/users').then((rows) => {
      setUsers(rows);
      setSelectedUserId((current) => current || rows[0]?.id || '');
    }).catch(() => undefined);
  }, [api]);

  const loadSettings = useCallback(async () => {
    if (!selectedUserId) {
      setSettings(null);
      return;
    }
    setLoading(true);
    try {
      setSettings(await api.get<UserSettings>(`/users/${selectedUserId}/settings`));
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [api, selectedUserId]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const selectUser = (userId: string) => {
    setSelectedUserId(userId);
    setSearchParams(userId ? { userId } : {});
    setActiveTab('overview');
  };

  const patchNotifications = (patch: Partial<NotificationPreferences>) => {
    setSettings((current) => current ? { ...current, notifications: { ...current.notifications, ...patch } } : current);
  };

  const saveNotifications = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const notifications = await api.patch<NotificationPreferences>(
        `/users/${settings.profile.id}/settings/notifications`,
        settings.notifications,
      );
      setSettings((current) => current ? { ...current, notifications } : current);
      notify('Notification preferences saved.', 'success');
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">User Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Review a user’s preferences, effective access, and account activity.</p>
        </div>
        <label className="block w-full text-sm font-medium text-slate-700 lg:w-96">
          User
          <select value={selectedUserId} onChange={(event) => selectUser(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-normal outline-none focus:border-brand">
            <option value="">Select a user</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.displayName} ({user.email})</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading user settings...</p>}

      {settings && !loading && (
        <>
          <div className="mt-6 flex overflow-x-auto border-b border-slate-200" role="tablist" aria-label="User settings sections">
            {tabs.map(({ id, label, Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${activeTab === id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <h2 className="font-semibold text-slate-900">Profile</h2>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  {[
                    ['Display name', settings.profile.displayName],
                    ['Username', settings.profile.username || 'Not set'],
                    ['Email', settings.profile.email],
                    ['Account source', settings.profile.source],
                    ['Created', formatDate(settings.profile.createdAt)],
                    ['Last updated', formatDate(settings.profile.updatedAt)],
                  ].map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value}</dd></div>)}
                </dl>
              </Card>
              <Card>
                <h2 className="font-semibold text-slate-900">Account state</h2>
                <span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${settings.profile.status === 'active' ? 'bg-emerald-50 text-emerald-700' : settings.profile.status === 'suspended' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{settings.profile.status}</span>
                <dl className="mt-6 space-y-4">
                  <div><dt className="text-xs uppercase text-slate-500">Last signed in</dt><dd className="mt-1 text-sm text-slate-800">{formatDate(settings.profile.lastSignedInAt)}</dd></div>
                  <div><dt className="text-xs uppercase text-slate-500">Effective modules</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{settings.access.modules.length}</dd></div>
                </dl>
              </Card>
            </div>
          )}

          {activeTab === 'notifications' && (
            <Card className="mt-6 max-w-3xl">
              <h2 className="font-semibold text-slate-900">Notification preferences</h2>
              <p className="mt-1 text-sm text-slate-500">Choose which operational changes should notify this user.</p>
              <div className="mt-5 divide-y divide-slate-200">
                {[
                  ['accessChanges', 'Access changes', 'Role, organisation, team, or module access changes.'],
                  ['projectUpdates', 'Project updates', 'Project assignments and module project allocation changes.'],
                  ['sessionAlerts', 'Session alerts', 'Seat-limit, session expiry, and access revocation alerts.'],
                  ['platformAnnouncements', 'Platform announcements', 'Maintenance, release, and service announcements.'],
                ].map(([key, label, description]) => (
                  <div key={key} className="flex items-center justify-between gap-5 py-4">
                    <div><h3 className="text-sm font-medium text-slate-800">{label}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
                    <Toggle checked={settings.notifications[key as keyof Omit<NotificationPreferences, 'digest'>] as boolean} onChange={(value) => patchNotifications({ [key]: value })} label={label} />
                  </div>
                ))}
              </div>
              <label className="mt-5 block max-w-xs text-sm font-medium text-slate-700">Delivery frequency<select value={settings.notifications.digest} onChange={(event) => patchNotifications({ digest: event.target.value as NotificationPreferences['digest'] })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-normal"><option value="instant">Instant</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option><option value="off">Do not send</option></select></label>
              <div className="mt-6 flex justify-end"><Button disabled={saving} onClick={() => void saveNotifications()}>{saving ? 'Saving...' : 'Save preferences'}</Button></div>
            </Card>
          )}

          {activeTab === 'access' && (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <Card><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Building2 size={17} />Organisations</h2>{settings.access.organisations.length ? <div className="mt-4 divide-y divide-slate-100">{settings.access.organisations.map((organisation) => <div key={organisation.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium text-slate-800">{organisation.name}</span><span className="text-slate-500">{organisation.membership} · {organisation.status}</span></div>)}</div> : <EmptyState>No organisation memberships.</EmptyState>}</Card>
              <Card><h2 className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck size={17} />Roles</h2>{settings.access.roles.length ? <div className="mt-4 flex flex-wrap gap-2">{settings.access.roles.map((role, index) => <span key={`${role.name}-${role.orgId ?? index}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{role.name}{role.productName ? ` · ${role.productName}` : ''}{role.orgName ? ` · ${role.orgName}` : ''}</span>)}</div> : <EmptyState>No assigned roles.</EmptyState>}</Card>
              <Card><h2 className="flex items-center gap-2 font-semibold text-slate-900"><LayoutGrid size={17} />Effective modules</h2>{settings.access.modules.length ? <div className="mt-4 divide-y divide-slate-100">{settings.access.modules.map((module) => <div key={`${module.orgId}-${module.id}`} className="py-3"><div className="text-sm font-medium text-slate-800">{module.name}</div><div className="mt-0.5 text-xs text-slate-500">{module.orgName}{module.teamId ? ' · Team restricted' : ' · Organisation access'}</div></div>)}</div> : <EmptyState>No effective module access.</EmptyState>}</Card>
              <Card><h2 className="font-semibold text-slate-900">Projects & teams</h2><div className="mt-4"><h3 className="text-xs font-semibold uppercase text-slate-500">Projects</h3>{settings.access.projects.length ? <div className="mt-2 flex flex-wrap gap-2">{settings.access.projects.map((project) => <span key={`${project.orgId}-${project.id}`} className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{project.name} ({project.code}) · {project.orgName}</span>)}</div> : <EmptyState>No project access.</EmptyState>}<h3 className="mt-5 text-xs font-semibold uppercase text-slate-500">Teams</h3>{settings.access.teams.length ? <div className="mt-2 flex flex-wrap gap-2">{settings.access.teams.map((team) => <span key={team.id} className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{team.name} · {team.orgName}</span>)}</div> : <EmptyState>No team memberships.</EmptyState>}</div></Card>
            </div>
          )}

          {activeTab === 'security' && (
            <Card className="mt-6 overflow-x-auto p-0">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Recent sessions</h2><p className="mt-1 text-sm text-slate-500">The ten most recent module and administration sessions.</p></div>
              <table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500"><th className="px-4 py-3">Organisation</th><th className="px-4 py-3">Module / project</th><th className="px-4 py-3">Started</th><th className="px-4 py-3">Last activity</th><th className="px-4 py-3">State</th></tr></thead><tbody>{settings.sessions.map((session) => <tr key={session.id} className="border-b border-slate-100"><td className="px-4 py-3">{session.orgName}</td><td className="px-4 py-3"><div>{session.productName ?? 'Administration'}</div>{session.projectName && <div className="text-xs text-slate-500">{session.projectName}</div>}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(session.startedAt)}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(session.lastSeenAt)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${session.endedAt ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{session.endedAt ? 'Ended' : 'Active'}</span></td></tr>)}{settings.sessions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No session activity recorded.</td></tr>}</tbody></table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}