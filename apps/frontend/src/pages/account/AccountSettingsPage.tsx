import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useSession } from '@/state/SessionProvider';

interface AccountProfile {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  displayName?: string;
  isLocalAccount: boolean;
}

const emptyProfile: AccountProfile = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  isLocalAccount: false,
};

const field = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-slate-50 disabled:text-slate-500';

function messageFrom(error: unknown, fallback: string) {
  const message = (error as Error).message;
  const match = message.match(/"message":"([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function AccountSettingsPage() {
  const api = useApi();
  const { logout, updateUser } = useSession();
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteStatus, setDeleteStatus] = useState('');

  useEffect(() => {
    api
      .get<AccountProfile>('/account')
      .then(setProfile)
      .catch((error) => setProfileStatus(messageFrom(error, 'Account information could not be loaded.')))
      .finally(() => setLoading(false));
  }, [api]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileStatus('Saving...');
    try {
      const updated = await api.patch<AccountProfile>('/account', profile);
      setProfile((current) => ({ ...current, ...updated }));
      updateUser({ displayName: updated.displayName ?? `${updated.firstName} ${updated.lastName}`, email: updated.email });
      setProfileStatus('Personal information saved.');
    } catch (error) {
      setProfileStatus(messageFrom(error, 'Personal information could not be saved.'));
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus('New passwords do not match.');
      return;
    }
    setPasswordStatus('Updating...');
    try {
      await api.put('/account/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus('Password updated.');
    } catch (error) {
      setPasswordStatus(messageFrom(error, 'Password could not be updated.'));
    }
  };

  const deleteAccount = async () => {
    setDeleteStatus('Deleting...');
    try {
      await api.del('/account', { currentPassword: deletePassword });
      logout();
      window.location.href = '/';
    } catch (error) {
      setDeleteStatus(messageFrom(error, 'Account could not be deleted.'));
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading account settings...</p>;

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-semibold text-slate-900">Account Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your account settings and preferences.</p>

      <Card className="mt-6">
        <h2 className="font-semibold text-slate-900">Personal Information</h2>
        <p className="mt-1 text-sm text-slate-500">Update the personal information displayed on your profile.</p>
        <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">First Name<input required className={field} value={profile.firstName} onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))} /></label>
          <label className="text-sm font-medium text-slate-700">Last Name<input required className={field} value={profile.lastName} onChange={(event) => setProfile((current) => ({ ...current, lastName: event.target.value }))} /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Email Address<input required type="email" disabled={!profile.isLocalAccount} className={field} value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Username<input required minLength={3} className={field} value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} /></label>
          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            {profileStatus && <span className="text-sm text-slate-600">{profileStatus}</span>}
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-5">
        <h2 className="font-semibold text-slate-900">Change Password</h2>
        <p className="mt-1 text-sm text-slate-500">Update your password to keep your account secure.</p>
        {profile.isLocalAccount ? (
          <form onSubmit={changePassword} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">Current Password<input required type="password" autoComplete="current-password" className={field} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label className="block text-sm font-medium text-slate-700">New Password<input required minLength={8} type="password" autoComplete="new-password" className={field} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <label className="block text-sm font-medium text-slate-700">Confirm New Password<input required minLength={8} type="password" autoComplete="new-password" className={field} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            <div className="flex items-center justify-end gap-3">
              {passwordStatus && <span className="text-sm text-slate-600">{passwordStatus}</span>}
              <Button type="submit">Update password</Button>
            </div>
          </form>
        ) : (
          <p className="mt-5 text-sm text-slate-600">Your password is managed by your identity provider.</p>
        )}
      </Card>

      <Card className="mt-5 border-red-200">
        <h2 className="font-semibold text-slate-900">Danger Zone</h2>
        <p className="mt-1 text-sm text-slate-500">Irreversible and destructive actions.</p>
        <div className="mt-5 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-sm font-semibold text-slate-900">Delete Account</h3><p className="mt-1 text-sm text-slate-500">Permanently delete your account and all associated data.</p></div>
          <Button variant="danger" disabled={!profile.isLocalAccount} onClick={() => setConfirmDelete(true)}>Delete Account</Button>
        </div>
        {confirmDelete && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">This action cannot be undone. Enter your current password to confirm.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input type="password" autoComplete="current-password" className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm sm:max-w-sm" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
              <Button variant="danger" disabled={!deletePassword} onClick={deleteAccount}>Confirm deletion</Button>
              <Button variant="ghost" onClick={() => { setConfirmDelete(false); setDeletePassword(''); setDeleteStatus(''); }}>Cancel</Button>
            </div>
            {deleteStatus && <p className="mt-3 text-sm text-red-700">{deleteStatus}</p>}
          </div>
        )}
        {!profile.isLocalAccount && <p className="mt-4 text-sm text-slate-500">External accounts must be deleted through the identity provider.</p>}
      </Card>
    </div>
  );
}