import type { SavedPaper } from '../shared/types';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'arXivLab Library';
const MANIFEST_NAME = 'arxivlab-library.json';

async function driveJsonFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    throw new Error('Google Drive session expired. Please sign in again.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Drive API HTTP ${res.status}: ${text.slice(0, 180) || res.statusText}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return (await res.json()) as T;
}

export async function findOrCreateDriveFolder(
  accessToken: string,
  folderName: string = FOLDER_NAME,
  parentId?: string
): Promise<string> {
  const escaped = folderName.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const q = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`;
  const listUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5`;
  const existing = await driveJsonFetch<{ files?: DriveFileItem[] }>(listUrl, accessToken);
  if (existing.files && existing.files.length > 0) {
    return existing.files[0].id;
  }

  const created = await driveJsonFetch<DriveFileItem>(`${DRIVE_API}/files`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return created.id;
}

export async function listDriveLibraryFiles(accessToken: string): Promise<{
  folderId: string | null;
  files: DriveFileItem[];
}> {
  const q = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const folderList = await driveJsonFetch<{ files?: DriveFileItem[] }>(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5`,
    accessToken
  );
  const folder = folderList.files?.[0];
  if (!folder) {
    return { folderId: null, files: [] };
  }

  const childrenQ = `'${folder.id}' in parents and trashed = false`;
  const children = await driveJsonFetch<{ files?: DriveFileItem[] }>(
    `${DRIVE_API}/files?q=${encodeURIComponent(childrenQ)}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`,
    accessToken
  );

  return {
    folderId: folder.id,
    files: children.files || [],
  };
}

async function uploadMultipartToDrive(
  accessToken: string,
  options: {
    existingFileId?: string;
    name: string;
    mimeType: string;
    parentId: string;
    body: BlobPart;
  }
): Promise<DriveFileItem> {
  const boundary = `arxivlab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = options.existingFileId
    ? { name: options.name, mimeType: options.mimeType }
    : { name: options.name, mimeType: options.mimeType, parents: [options.parentId] };

  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const bodyBlob = new Blob([metaPart, mediaHeader, options.body, closing]);
  const endpoint = options.existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${options.existingFileId}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`;

  return driveJsonFetch<DriveFileItem>(endpoint, accessToken, {
    method: options.existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: bodyBlob,
  });
}

export async function pushLibraryToGoogleDrive(
  accessToken: string,
  papers: SavedPaper[],
  includeCachedPdfs: boolean
): Promise<{
  folderId: string;
  manifestFile: DriveFileItem;
  uploadedPdfs: number;
}> {
  const folderId = await findOrCreateDriveFolder(accessToken, FOLDER_NAME);
  const { files } = await listDriveLibraryFiles(accessToken);
  const existingManifest = files.find((f) => f.name === MANIFEST_NAME);

  const manifestPayload = JSON.stringify(
    {
      app: 'arXivLab',
      version: '2.0.0',
      syncedAt: new Date().toISOString(),
      paperCount: papers.length,
      papers,
    },
    null,
    2
  );

  const manifestFile = await uploadMultipartToDrive(accessToken, {
    existingFileId: existingManifest?.id,
    name: MANIFEST_NAME,
    mimeType: 'application/json',
    parentId: folderId,
    body: manifestPayload,
  });

  let uploadedPdfs = 0;
  if (includeCachedPdfs) {
    const pdfFolderId = await findOrCreateDriveFolder(accessToken, 'pdfs', folderId);
    const pdfQuery = `'${pdfFolderId}' in parents and trashed = false`;
    const existingPdfsRes = await driveJsonFetch<{ files?: DriveFileItem[] }>(
      `${DRIVE_API}/files?q=${encodeURIComponent(pdfQuery)}&fields=files(id,name)&pageSize=200`,
      accessToken
    );
    const existingPdfMap = new Map(
      (existingPdfsRes.files || []).map((f) => [f.name, f.id])
    );

    for (const paper of papers) {
      if (!paper.pdfCached) continue;
      try {
        const localRes = await fetch(
          `/api/library/cached-pdf?id=${encodeURIComponent(paper.id)}`
        );
        if (!localRes.ok) continue;
        const pdfBlob = await localRes.blob();
        const fileName = `${paper.id.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
        await uploadMultipartToDrive(accessToken, {
          existingFileId: existingPdfMap.get(fileName),
          name: fileName,
          mimeType: 'application/pdf',
          parentId: pdfFolderId,
          body: pdfBlob,
        });
        uploadedPdfs += 1;
      } catch {
        // Continue syncing remaining PDFs
      }
    }
  }

  return { folderId, manifestFile, uploadedPdfs };
}

export async function pullLibraryFromGoogleDrive(accessToken: string): Promise<{
  papers: SavedPaper[];
  syncedAt?: string;
  fileName: string;
}> {
  const { files } = await listDriveLibraryFiles(accessToken);
  const manifest = files.find((f) => f.name === MANIFEST_NAME);
  if (!manifest) {
    throw new Error(`No "${MANIFEST_NAME}" backup found in your "${FOLDER_NAME}" Drive folder.`);
  }

  const res = await fetch(`${DRIVE_API}/files/${manifest.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Error('Google Drive session expired. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error(`Failed to download ${MANIFEST_NAME} from Google Drive (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { papers?: SavedPaper[]; syncedAt?: string } | SavedPaper[];
  if (Array.isArray(data)) {
    return { papers: data, fileName: MANIFEST_NAME };
  }
  if (data && Array.isArray(data.papers)) {
    return { papers: data.papers, syncedAt: data.syncedAt, fileName: MANIFEST_NAME };
  }
  throw new Error('Google Drive backup file did not contain a valid arXivLab paper library.');
}

export async function deleteDriveFileById(
  accessToken: string,
  fileId: string
): Promise<void> {
  await driveJsonFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  });
}
