import { put, head, del } from '@vercel/blob';

/**
 * Blob Storage Service
 * Manages file uploads to Vercel Blob storage for evidence
 * Supports mock mode for development without API keys
 */
export class BlobStorageService {
  private readWriteToken: string;
  private useMockMode: boolean;

  constructor() {
    this.readWriteToken = process.env.BLOB_READ_WRITE_TOKEN || '';
    this.useMockMode = process.env.USE_MOCK_BLOB === 'true' || !this.readWriteToken;

    if (this.useMockMode) {
      console.warn('[BlobStorage] Running in MOCK mode - files will not be uploaded to Vercel');
    } else {
      if (!this.readWriteToken) {
        throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not set');
      }
    }
  }

  /**
   * Upload a file to Vercel Blob storage
   * @param fileBuffer - The file data as a Buffer
   * @param fileName - The name of the file
   * @param contentType - MIME type of the file
   * @returns The public URL of the uploaded file
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    contentType: string
  ): Promise<{
    url: string;
    blobPath: string;
    size: number;
  }> {
    try {
      // Create a unique path to avoid collisions
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const blobPath = `evidence/${timestamp}-${randomSuffix}-${fileName}`;

      console.log('[BlobStorage] Uploading file:', blobPath, 'Size:', fileBuffer.length, 'bytes');

      // Mock mode: return simulated response without uploading
      if (this.useMockMode) {
        const mockUrl = `https://blob.vercel.com/mock/${blobPath}?token=${randomSuffix}`;
        console.log('[BlobStorage] MOCK: File would be uploaded to:', mockUrl);
        return {
          url: mockUrl,
          blobPath,
          size: fileBuffer.length,
        };
      }

      // Upload to Vercel Blob
      const blob = await put(blobPath, fileBuffer, {
        access: 'private',
        contentType,
        token: this.readWriteToken,
      });

      console.log('[BlobStorage] Upload successful:', blob.url);

      return {
        url: blob.url,
        blobPath: blob.pathname,
        size: fileBuffer.length,
      };
    } catch (error) {
      console.error('[BlobStorage] Upload failed:', error);
      throw new Error(`Failed to upload file to blob storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file exists in blob storage
   */
  async fileExists(blobPath: string): Promise<boolean> {
    try {
      await head(blobPath, {
        token: this.readWriteToken,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a file from blob storage
   */
  async deleteFile(blobPath: string): Promise<void> {
    try {
      console.log('[BlobStorage] Deleting file:', blobPath);
      await del(blobPath, {
        token: this.readWriteToken,
      });
      console.log('[BlobStorage] File deleted successfully');
    } catch (error) {
      console.error('[BlobStorage] Delete failed:', error);
      throw new Error(`Failed to delete file from blob storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
