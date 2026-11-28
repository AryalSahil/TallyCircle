import React, { useEffect, useState } from 'react';
import { Camera, ImagePlus, Trash2, FileCheck2, AlertCircle } from 'lucide-react';
import type { ReceiptMetadata } from '../types';
import {
  fetchAuthorizedReceiptUrl,
  validateReceiptFile,
} from '../services/storageService';

export function ReceiptAttachmentControl({
  pendingFile,
  existingMetadata,
  legacyReceiptImage,
  uploadProgress,
  disabled,
  onSelectFile,
  onRemove,
  onValidationError,
}: {
  pendingFile: File | null;
  existingMetadata?: ReceiptMetadata | null;
  legacyReceiptImage?: string;
  uploadProgress?: number | null;
  disabled?: boolean;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  onValidationError: (message: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrlToRevoke: string | null = null;
    setLoadFailed(false);

    if (pendingFile) {
      const localUrl = URL.createObjectURL(pendingFile);
      objectUrlToRevoke = localUrl;
      setPreviewUrl(localUrl);
      setLoadingExisting(false);
    } else if (existingMetadata?.storagePath) {
      setLoadingExisting(true);
      fetchAuthorizedReceiptUrl(existingMetadata.storagePath)
        .then((url) => {
          if (!active) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrlToRevoke = url;
          setPreviewUrl(url);
          setLoadingExisting(false);
        })
        .catch(() => {
          if (active) {
            setPreviewUrl('');
            setLoadingExisting(false);
            setLoadFailed(true);
          }
        });
    } else if (legacyReceiptImage) {
      setPreviewUrl(legacyReceiptImage);
      setLoadingExisting(false);
    } else {
      setPreviewUrl('');
      setLoadingExisting(false);
    }

    return () => {
      active = false;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [pendingFile, existingMetadata?.storagePath, legacyReceiptImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      validateReceiptFile(file);
      onSelectFile(file);
    } catch (err: unknown) {
      onValidationError(err instanceof Error ? err.message : 'Invalid receipt file.');
    }
  };

  const hasReceipt = Boolean(pendingFile || existingMetadata?.storagePath || legacyReceiptImage);
  const activeFileName =
    pendingFile?.name || existingMetadata?.fileName || (legacyReceiptImage ? 'Receipt image' : '');
  const activeSizeKb = pendingFile
    ? Math.max(1, Math.round(pendingFile.size / 1024))
    : existingMetadata?.sizeBytes
      ? Math.max(1, Math.round(existingMetadata.sizeBytes / 1024))
      : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Receipt photo (JPG, PNG, WEBP · max 5 MB)
        </label>
        {hasReceipt && (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${
            disabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <ImagePlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{hasReceipt ? 'Replace photo' : 'Upload receipt'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
          />
        </label>

        <label
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${
            disabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <Camera className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>Camera</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
          />
        </label>
      </div>

      {typeof uploadProgress === 'number' && uploadProgress > 0 && uploadProgress <= 100 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Uploading receipt to Firebase Storage...</span>
            <span className="font-mono-nums font-medium">{uploadProgress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {loadingExisting && (
        <div className="h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          Loading receipt preview...
        </div>
      )}

      {loadFailed && !pendingFile && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Existing receipt file could not be loaded. You can replace or remove it.</span>
        </div>
      )}

      {previewUrl && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 space-y-1.5">
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="max-h-44 w-full object-contain rounded"
          />
          {activeFileName && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate px-1">
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{activeFileName}</span>
              {activeSizeKb !== null && (
                <span className="font-mono-nums shrink-0">· {activeSizeKb} KB</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
