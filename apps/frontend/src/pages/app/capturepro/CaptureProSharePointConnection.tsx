import { useEffect, useRef, useState } from 'react';
import { Link2, Unplug, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { isSharePointConfigured, SharePointConnection, type SharePointConfiguration } from '@/auth/sharePointConnection';
import { resolveSharePointFolder, sharePointTarget, uploadSharePointSample } from '@/lib/sharePointGraph';

const configuration: SharePointConfiguration = {
  enabled: import.meta.env.VITE_SHAREPOINT_ENABLED === 'true',
  tenantId: import.meta.env.VITE_SHAREPOINT_TENANT_ID ?? '',
  clientId: import.meta.env.VITE_SHAREPOINT_CLIENT_ID ?? '',
  organisationId: import.meta.env.VITE_SHAREPOINT_ORGANISATION_ID ?? '',
};

export function CaptureProSharePointConnection({ orgId, productId }: { orgId: string; productId: string }) {
  const configured = isSharePointConfigured(configuration, orgId) && window.isSecureContext && !!window.crypto?.subtle;
  const [connection] = useState(() => configured ? new SharePointConnection(configuration, orgId, productId) : null);
  const controller = useRef(new AbortController());
  const [connected, setConnected] = useState(false);
  const [folderAccessible, setFolderAccessible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!connection) return;
    let active = true;
    const requestController = new AbortController();
    controller.current = requestController;
    setBusy(true);
    connection.resume().then(async (resumed) => {
      if (!active || !resumed) return;
      setConnected(true);
      const token = await connection.getAccessToken();
      await resolveSharePointFolder(token, (input, init) => fetch(input, { ...init, signal: requestController.signal }));
      if (active) {
        setFolderAccessible(true);
        setStatus('SharePoint folder accessible. No file has been uploaded.');
      }
    }).catch(() => {
      if (active) setError('SharePoint connection could not be verified. Check Microsoft consent, site access, and the configured app registration. No file was uploaded.');
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; requestController.abort(); };
  }, [connection]);

  async function connect() {
    if (!connection) return;
    setBusy(true);
    setError('');
    try { await connection.connect(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Microsoft sign-in failed.'); setBusy(false); }
  }

  async function disconnect() {
    if (!connection) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await connection.disconnect();
      setConnected(false);
      setFolderAccessible(false);
    } catch { setError('The SharePoint connection could not be cleared. Close this tab to discard the in-memory connection.'); }
    finally { setBusy(false); }
  }

  async function uploadSample() {
    if (!connection || !folderAccessible || !window.confirm('Create sample.json in the McDermott_CIS_Test SharePoint folder? Existing files will not be overwritten.')) return;
    const requestController = controller.current;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const token = await connection.getAccessToken();
      await uploadSharePointSample(token, (input, init) => fetch(input, { ...init, signal: requestController.signal }));
      if (!requestController.signal.aborted) setStatus('sample.json was created in McDermott_CIS_Test.');
    } catch (failure) {
      if (!requestController.signal.aborted) setError(failure instanceof Error ? failure.message : 'SharePoint upload failed.');
    } finally { if (!requestController.signal.aborted) setBusy(false); }
  }

  return (
    <section aria-labelledby="sharepoint-heading" className="border-t border-slate-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sharepoint-heading" className="text-lg font-semibold">SharePoint</h2>
        <span className="text-sm text-slate-600">{!configured ? 'Not configured' : folderAccessible ? 'Folder accessible' : connected ? 'Signed in; folder unavailable' : 'Not connected'}</span>
      </div>
      <a href={`${sharePointTarget.siteUrl}/Shared%20Documents/${sharePointTarget.folder.split('/').map(encodeURIComponent).join('/')}`} target="_blank" rel="noopener noreferrer" className="mt-2 block break-words text-sm text-teal-700 hover:underline">Shared Documents / {sharePointTarget.folder}</a>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {status && <p role="status" className="mt-3 text-sm text-teal-800">{status}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={!configured || busy || connected} onClick={() => void connect()}><Link2 size={16} />Connect SharePoint</Button>
        <Button variant="secondary" disabled={!connected || busy} onClick={() => void disconnect()}><Unplug size={16} />Disconnect SharePoint</Button>
        <Button variant="secondary" disabled={!folderAccessible || busy} onClick={() => void uploadSample()}><Upload size={16} />Upload sample.json</Button>
      </div>
    </section>
  );
}