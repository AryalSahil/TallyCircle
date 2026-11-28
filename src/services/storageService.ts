import {
  deleteObject,
  getBlob,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from '../lib/firebase';
import type { ReceiptMetadata } from '../types';

export const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const MAX_RECEIPT_RAW_BYTES = 5 * 1024 * 1024; // 5 MB

export type ReceiptScope = 'groups' | 'trips';

export function validateReceiptFile(file: File): void {
  const mime = (file.type || '').toLowerCase();
  const nameLower = (file.name || '').toLowerCase();
  const hasAllowedExt = /\.(jpe?g|png|webp)$/.test(nameLower);
  const hasAllowedMime = (ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(mime);

  if (!hasAllowedMime && !hasAllowedExt) {
    throw new Error('Only JPG, JPEG, PNG, and WEBP receipt images are allowed.');
  }
  if (file.size <= 0) {
    throw new Error('The selected file appears to be empty.');
  }
  if (file.size > MAX_RECEIPT_RAW_BYTES) {
    throw new Error('Receipt image must be 5 MB or smaller.');
  }
}

function inferMimeType(file: File): 'image/jpeg' | 'image/png' | 'image/webp' {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/png') return 'image/png';
  if (mime === 'image/webp') return 'image/webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg';
  const nameLower = (file.name || '').toLowerCase();
  if (nameLower.endsWith('.png')) return 'image/png';
  if (nameLower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function prepareReceiptBlob(
  file: File
): Promise<{ blob: Blob; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  validateReceiptFile(file);
  const originalType = inferMimeType(file);

  // If <= 750 KB, preserve crisp original directly without re-encoding
  if (file.size <= 750 * 1024 || typeof document === 'undefined') {
    return { blob: file, contentType: originalType };
  }

  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve({ blob: file, contentType: originalType });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const targetType: 'image/jpeg' | 'image/webp' =
          originalType === 'image/webp' ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(
          (compressed) => {
            URL.revokeObjectURL(objectUrl);
            if (compressed && compressed.size > 0 && compressed.size < file.size) {
              resolve({ blob: compressed, contentType: targetType });
            } else {
              resolve({ blob: file, contentType: originalType });
            }
          },
          targetType,
          0.84
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve({ blob: file, contentType: originalType });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ blob: file, contentType: originalType });
    };
    img.src = objectUrl;
  });
}

function sanitizeReceiptFileName(rawName: string, contentType: string): string {
  const cleanBase = (rawName || 'receipt')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'receipt';
  const ext =
    contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return `${cleanBase}.${ext}`;
}

export async function uploadReceiptAttachment(params: {
  scope: ReceiptScope;
  parentId: string;
  expenseId: string;
  file: File;
  uid: string;
  onProgress?: (percent: number) => void;
}): Promise<ReceiptMetadata> {
  if (!auth.currentUser) {
    throw new Error('You must be signed in to upload receipts.');
  }

  const { blob, contentType } = await prepareReceiptBlob(params.file);
  if (blob.size > MAX_RECEIPT_RAW_BYTES) {
    throw new Error('Compressed receipt still exceeds the 5 MB limit.');
  }

  const fileName = sanitizeReceiptFileName(params.file.name, contentType);
  const uniquePrefix = Date.now().toString(36);
  const storagePath = `receipts/${params.scope}/${params.parentId}/${params.expenseId}/${uniquePrefix}_${fileName}`;
  const storageRef = ref(storage, storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType,
      customMetadata: {
        uploadedByUid: params.uid,
        scope: params.scope,
        parentId: params.parentId,
        expenseId: params.expenseId,
      },
    });

    task.on(
      'state_changed',
      (snapshot) => {
        if (params.onProgress && snapshot.totalBytes > 0) {
          const pct = Math.min(
            100,
            Math.max(1, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          );
          params.onProgress(pct);
        }
      },
      (error) => {
        const code = (error as { code?: string })?.code || '';
        if (code === 'storage/unauthorized') {
          reject(
            new Error(
              'Storage permission denied while uploading receipt. Verify Firebase Storage rules are deployed.'
            )
          );
          return;
        }
        reject(error);
      },
      () => {
        if (params.onProgress) params.onProgress(100);
        resolve();
      }
    );
  });

  return {
    storagePath,
    fileName,
    contentType,
    sizeBytes: Math.round(blob.size),
    uploadedByUid: params.uid,
    uploadedAt: new Date().toISOString(),
  };
}

export async function fetchAuthorizedReceiptUrl(storagePath: string): Promise<string> {
  if (!storagePath || !storagePath.startsWith('receipts/')) {
    throw new Error('Invalid receipt storage path.');
  }
  const blob = await getBlob(ref(storage, storagePath));
  return URL.createObjectURL(blob);
}

export async function deleteReceiptObject(storagePath?: string | null): Promise<void> {
  if (!storagePath || !storagePath.startsWith('receipts/')) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'storage/object-not-found') return;
    console.warn('Could not delete receipt object:', storagePath, err);
  }
}
