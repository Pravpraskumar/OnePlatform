export const sharePointTarget = {
  siteUrl: 'https://mcdermottinc.sharepoint.com/sites/SPMATTeam',
  library: 'Shared Documents',
  folder: 'General/SMAT Documents/Project Setup/McDermott_CIS_Test',
};

export interface SharePointFolder {
  driveId: string;
  itemId: string;
}

type GraphRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function graphJson(path: string, accessToken: string, request: GraphRequest, init?: RequestInit): Promise<unknown> {
  const response = await request(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Microsoft sign-in has expired. Disconnect and connect again.',
      403: 'SharePoint access denied. The signed-in account and application need permission for this site.',
      404: 'The configured SharePoint site, library, or folder was not found.',
      409: 'sample.json already exists. No file was overwritten.',
      429: 'Microsoft Graph is throttling requests. Try again later.',
    };
    throw new Error(messages[response.status] ?? `SharePoint request failed (HTTP ${response.status}).`);
  }
  return response.json();
}

export async function resolveSharePointFolder(accessToken: string, request: GraphRequest = fetch): Promise<SharePointFolder> {
  const site = await graphJson('/sites/mcdermottinc.sharepoint.com:/sites/SPMATTeam?$select=id', accessToken, request);
  if (!isObject(site) || typeof site.id !== 'string' || !site.id) throw new Error('Microsoft Graph returned an invalid site.');
  let path = `/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl&$top=100`;
  const expectedLibraryPath = '/sites/SPMATTeam/Shared Documents';
  for (let page = 0; page < 10; page++) {
    const drives = await graphJson(path, accessToken, request);
    if (!isObject(drives) || !Array.isArray(drives.value)) throw new Error('Microsoft Graph returned an invalid library list.');
    for (const drive of drives.value) {
      if (!isObject(drive) || typeof drive.id !== 'string' || !drive.id || typeof drive.webUrl !== 'string') continue;
      const libraryUrl = new URL(drive.webUrl);
      if (libraryUrl.origin !== new URL(sharePointTarget.siteUrl).origin
        || decodeURIComponent(libraryUrl.pathname).replace(/\/$/, '') !== expectedLibraryPath) continue;
      const folderPath = sharePointTarget.folder.split('/').map(encodeURIComponent).join('/');
      const folder = await graphJson(`/drives/${encodeURIComponent(drive.id)}/root:/${folderPath}?$select=id,folder`, accessToken, request);
      if (!isObject(folder) || typeof folder.id !== 'string' || !folder.id || !isObject(folder.folder)) {
        throw new Error('The configured SharePoint destination is not a folder.');
      }
      return { driveId: drive.id, itemId: folder.id };
    }
    const nextLink: unknown = drives['@odata.nextLink'];
    if (!nextLink) throw new Error('The Shared Documents library was not found on the configured site.');
    if (typeof nextLink !== 'string') throw new Error('Microsoft Graph returned an invalid library page.');
    const nextUrl = new URL(nextLink);
    if (nextUrl.origin !== 'https://graph.microsoft.com'
      || nextUrl.pathname !== `/v1.0/sites/${encodeURIComponent(site.id)}/drives`) {
      throw new Error('Microsoft Graph returned an unexpected library page.');
    }
    path = `${nextUrl.pathname.slice('/v1.0'.length)}${nextUrl.search}`;
  }
  throw new Error('SharePoint library pagination exceeded the safety limit.');
}

export async function uploadSharePointSample(accessToken: string, request: GraphRequest = fetch): Promise<void> {
  const folder = await resolveSharePointFolder(accessToken, request);
  const result = await graphJson(
    `/drives/${encodeURIComponent(folder.driveId)}/items/${encodeURIComponent(folder.itemId)}:/sample.json:/content?@microsoft.graph.conflictBehavior=fail`,
    accessToken,
    request,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application: 'Capture-Pro', type: 'connection-test', schemaVersion: 1, createdAt: new Date().toISOString(), data: [] }, null, 2),
    },
  );
  if (!isObject(result) || result.name !== 'sample.json' || !isObject(result.file)) {
    throw new Error('Microsoft Graph did not confirm creation of sample.json. Check SharePoint before retrying.');
  }
}