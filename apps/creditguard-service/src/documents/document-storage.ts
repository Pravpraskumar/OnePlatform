import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { ConfigService } from '@nestjs/config';

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

export interface StoredDocument {
  stream: NodeJS.ReadableStream;
  contentLength?: number;
}

export interface DocumentStorage {
  put(key: string, content: Buffer, contentType: string): Promise<void>;
  open(key: string): Promise<StoredDocument>;
  delete(key: string): Promise<void>;
}

class LocalDocumentStorage implements DocumentStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, content: Buffer): Promise<void> {
    const destination = this.resolveKey(key);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, { flag: 'wx' });
  }

  async open(key: string): Promise<StoredDocument> {
    const source = this.resolveKey(key);
    const metadata = await stat(source);
    return { stream: createReadStream(source), contentLength: metadata.size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    const destination = resolve(this.root, ...key.split('/'));
    if (!destination.startsWith(`${this.root}${sep}`)) {
      throw new Error('Invalid document storage key');
    }
    return destination;
  }
}

class AzureBlobDocumentStorage implements DocumentStorage {
  private readonly container: ContainerClient;
  private containerReady?: Promise<unknown>;

  constructor(accountName: string | undefined, containerName: string, connectionString?: string) {
    const service = connectionString
      ? BlobServiceClient.fromConnectionString(connectionString)
      : new BlobServiceClient(
          `https://${this.requireAccountName(accountName)}.blob.core.windows.net`,
          new DefaultAzureCredential(),
        );
    this.container = service.getContainerClient(containerName);
  }

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.ensureContainer();
    await this.container.getBlockBlobClient(key).uploadData(content, {
      blobHTTPHeaders: { blobContentType: contentType },
      conditions: { ifNoneMatch: '*' },
    });
  }

  async open(key: string): Promise<StoredDocument> {
    await this.ensureContainer();
    const response = await this.container.getBlobClient(key).download();
    if (!response.readableStreamBody) throw new Error('Document content is unavailable');
    return {
      stream: response.readableStreamBody,
      contentLength: response.contentLength,
    };
  }

  async delete(key: string): Promise<void> {
    await this.ensureContainer();
    await this.container.deleteBlob(key, { deleteSnapshots: 'include' }).catch((error: { statusCode?: number }) => {
      if (error.statusCode !== 404) throw error;
    });
  }

  private ensureContainer() {
    this.containerReady ??= this.container.createIfNotExists();
    return this.containerReady;
  }

  private requireAccountName(accountName?: string) {
    if (!accountName?.trim()) {
      throw new Error('AZURE_STORAGE_ACCOUNT_NAME is required when Azure document storage is enabled');
    }
    return accountName.trim();
  }
}

export function createDocumentStorage(config: ConfigService): DocumentStorage {
  const provider = config.get<string>('DOCUMENT_STORAGE_PROVIDER')?.trim().toLowerCase() || 'local';
  if (provider === 'local') {
    return new LocalDocumentStorage(
      config.get<string>('DOCUMENT_LOCAL_ROOT')?.trim() || resolve(process.cwd(), 'src', 'documents'),
    );
  }
  if (provider === 'azure') {
    return new AzureBlobDocumentStorage(
      config.get<string>('AZURE_STORAGE_ACCOUNT_NAME'),
      config.get<string>('AZURE_STORAGE_CONTAINER')?.trim() || 'creditguard-documents',
      config.get<string>('AZURE_STORAGE_CONNECTION_STRING')?.trim(),
    );
  }
  throw new Error(`Unsupported DOCUMENT_STORAGE_PROVIDER: ${provider}`);
}