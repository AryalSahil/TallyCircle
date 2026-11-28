import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, Smartphone, Banknote } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useToast } from '../../contexts/ToastContext';
import type { Group, Settlement, SettlementMethod, Trip } from '../../types';
import { recordSettlement, updatePendingSettlement } from '../../services/settlementService';
import { recordTripSettlement, updatePendingTripSettlement } from '../../services/tripService';
import { formatINR, inrToPaise, paiseToInputString } from '../../utils/finance';
import { buildUpiUri } from '../../utils/helpers';
import { Button, InputField, Modal } from '../ui/Primitives';

export function SettlementModal({
  open,
  onClose,
  group,
  trip,
  existingSettlements,
  editingSettlement,
  initialFromUid,
  initialToUid,
  initialAmountPaise,
}: {
  open: boolean;
  onClose: () => void;
  group?: Group | null;
  trip?: Trip | null;
  existingSettlements: Settlement[];
  editingSettlement?: Settlement | null;
  initialFromUid?: string;
  initialToUid?: string;
  initialAmountPaise?: number;
}) {
  const { profile } = useAuth();
  const { profilesMap } = useAppData();
  const { showToast } = useToast();

  const participantUids = trip ? trip.participantUids : group?.memberUids || [];
  const participantNames = trip ? trip.participantNames : group?.memberNames || {};
  const scopeTitle = trip ? trip.name : group?.name || 'Ledger';

  const members = useMemo(
    () =>
      participantUids.map((uid) => ({
        uid,
        name: participantNames[uid] || 'Member',
      })),
    [participantUids, participantNames]
  );

  const [fromUid, setFromUid] = useState('');
  const [toUid, setToUid] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<SettlementMethod>('upi');
  const [upiRef, setUpiRef] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingSettlement) {
      setFromUid(editingSettlement.fromUid);
      setToUid(editingSettlement.toUid);
      setAmountInput(paiseToInputString(editingSettlement.amountPaise));
      setMethod(editingSettlement.method);
      setUpiRef(editingSettlement.upiTransactionRef || '');
      setNote(editingSettlement.note || '');
      return;
    }
    const defaultFrom = initialFromUid || profile?.uid || members[0]?.uid || '';
    const defaultTo =
      initialToUid ||
      members.find((m) => m.uid !== defaultFrom)?.uid ||
      '';
    setFromUid(defaultFrom);
    setToUid(defaultTo);
    setAmountInput(initialAmountPaise ? paiseToInputString(initialAmountPaise) : '');
    setMethod('upi');
    setUpiRef('');
    setNote('');
  }, [open, editingSettlement, initialFromUid, initialToUid, initialAmountPaise, profile?.uid]);

  const receiverProfile = profilesMap[toUid];
  const receiverUpiId = receiverProfile?.upiId?.trim() || '';
  const amountPaise = inrToPaise(amountInput);

  const upiUri = useMemo(() => {
    if (!receiverUpiId || amountPaise <= 0) return '';
    return buildUpiUri({
      upiId: receiverUpiId,
      payeeName: participantNames[toUid] || receiverProfile?.displayName || 'Friend',
      amountInr: amountPaise / 100,
      note: `${scopeTitle} settlement`,
    });
  }, [receiverUpiId, amountPaise, participantNames, scopeTitle, toUid, receiverProfile?.displayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || (!group && !trip)) return;
    if (!fromUid || !toUid || fromUid === toUid) {
      showToast('Select two different members', { variant: 'error' });
      return;
    }
    if (amountPaise <= 0) {
      showToast('Enter a valid settlement amount', { variant: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingSettlement) {
        const { queuedOffline } = trip
          ? await updatePendingTripSettlement(profile, trip, editingSettlement, {
              amountPaise,
              method,
              upiTransactionRef: upiRef,
              note,
            })
          : await updatePendingSettlement(profile, group!, editingSettlement, {
              amountPaise,
              method,
              upiTransactionRef: upiRef,
              note,
            });
        if (queuedOffline) {
          showToast('Saved offline — queued for sync', {
            description: 'Changes are stored locally and will sync automatically when you reconnect.',
            variant: 'info',
          });
        } else {
          showToast('Pending settlement updated', { variant: 'success' });
        }
      } else {
        const payload = {
          fromUid,
          fromName: participantNames[fromUid] || 'Member',
          toUid,
          toName: participantNames[toUid] || 'Member',
          amountPaise,
          method,
          upiTransactionRef: upiRef,
          note,
          existingSettlements,
        };
        const { queuedOffline } = trip
          ? await recordTripSettlement(profile, trip, payload)
          : await recordSettlement(profile, group!, payload);
        if (queuedOffline) {
          showToast('Saved offline — queued for sync', {
            description: 'Settlement is stored locally and will sync automatically when you reconnect.',
            variant: 'info',
          });
        } else {
          showToast('Settlement recorded', {
            description:
              profile.uid === fromUid
                ? 'Sent for receiver confirmation.'
                : 'Added to pending settlements.',
            variant: 'success',
          });
        }
      }
      onClose();
    } catch (err: unknown) {
      showToast(editingSettlement ? 'Could not update settlement' : 'Could not record settlement', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingSettlement ? 'Edit Pending Settlement' : 'Record Settlement'}
      subtitle="Only confirmed payments reduce group balances. External UPI/cash happens outside the app."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Paid by (sender)
            </label>
            <select
              value={fromUid}
              disabled={Boolean(editingSettlement)}
              onChange={(e) => setFromUid(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-60"
            >
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Paid to (receiver)
            </label>
            <select
              value={toUid}
              disabled={Boolean(editingSettlement)}
              onChange={(e) => setToUid(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-60"
            >
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <InputField
          label="Amount (₹)"
          type="number"
          step="0.01"
          min="0.01"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder="500"
          className="font-mono-nums"
          required
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Payment method
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`h-10 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                method === 'upi'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              UPI Transfer
            </button>
            <button
              type="button"
              onClick={() => setMethod('cash')}
              className={`h-10 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                method === 'cash'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Banknote className="w-4 h-4" />
              Cash
            </button>
          </div>
        </div>

        {method === 'upi' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
            {receiverUpiId ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {upiUri && (
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 shrink-0">
                    <QRCodeSVG value={upiUri} size={112} level="M" />
                  </div>
                )}
                <div className="space-y-1.5 text-center sm:text-left min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Receiver UPI ID
                  </p>
                  <p className="text-sm font-mono-nums font-semibold text-slate-900 dark:text-white break-all">
                    {receiverUpiId}
                  </p>
                  {upiUri && (
                    <a
                      href={upiUri}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
                    >
                      Pay {formatINR(amountPaise)} in UPI app
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {participantNames[toUid] || 'This member'} has not added a UPI ID to their profile yet. You can still record the transfer below.
              </p>
            )}

            <InputField
              label="UPI transaction reference ID (optional)"
              placeholder="e.g., 432198765432"
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              maxLength={120}
            />
          </div>
        )}

        <InputField
          label="Note (optional)"
          placeholder="Settled after Goa dinner"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={250}
        />

        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="w-full sm:w-auto">
            {editingSettlement
              ? 'Save Changes'
              : profile?.uid === fromUid
                ? 'Submit for Confirmation'
                : 'Create Payment Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
