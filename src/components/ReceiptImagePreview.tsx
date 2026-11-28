import React, { useEffect, useState } from 'react';
import { AlertCircle, Maximize2, X, Receipt } from 'lucide-react';
import type { ReceiptMetadata } from '../types';
import { fetchAuthorizedReceiptUrl } from '../services/storageService';

export function ReceiptImagePreview({
  receiptMetadata,
  legacyReceiptImage,
}: {
  receiptMetadata?: ReceiptMetadata | null;
  legacyReceiptImage?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const storagePath = receiptMetadata?.storagePath || '';

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;
    setError(false);

    if (storagePath) {
      setLoading(true);
      fetchAuthorizedReceiptUrl(storagePath)
        .then((url) => {
          if (!active) {
            URL.revokeObjectURL(url);
            return;
          }
          urlToRevoke = url;
          setImageUrl(url);
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setImageUrl('');
            setLoading(false);
            setError(true);
          }
        });
    } else if (legacyReceiptImage) {
      setImageUrl(legacyReceiptImage);
      setLoading(false);
    } else {
      setImageUrl('');
      setLoading(false);
    }

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [storagePath, legacyReceiptImage]);

  if (!storagePath && !legacyReceiptImage) return null;

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" />
            Attached bill receipt
            {receiptMetadata?.fileName && (
              <span className="text-slate-400 font-normal truncate max-w-[180px]">
                · {receiptMetadata.fileName}
              </span>
            )}
          </h4>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              View full size
            </button>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Loading receipt image securely...
            </div>
          ) : error ? (
            <div className="py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Receipt file unavailable in storage or access expired.</span>
            </div>
          ) : imageUrl ? (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="block w-full cursor-zoom-in"
              aria-label="Enlarge receipt image"
            >
              <img
                src={imageUrl}
                alt="Expense receipt"
                className="max-h-72 w-full object-contain"
              />
            </button>
          ) : null}
        </div>
      </div>

      {zoomed && imageUrl && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Receipt full-size viewer"
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Close receipt viewer"
            className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={imageUrl}
            alt="Full size receipt"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] max-w-[94vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
