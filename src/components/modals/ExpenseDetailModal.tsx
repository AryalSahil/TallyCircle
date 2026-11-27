import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, MessageSquare, Send, Repeat } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useToast } from '../../contexts/ToastContext';
import type { Expense, ExpenseNote, Group } from '../../types';
import {
  addExpenseNote,
  deleteExpense,
  deleteExpenseNote,
  subscribeExpenseNotes,
} from '../../services/expenseService';
import { formatINR, formatOriginalCurrency, isSupportedCurrency } from '../../utils/finance';
import { formatDateTime, formatRelativeTimestamp } from '../../utils/helpers';
import { Button, Modal } from '../ui/Primitives';
import { ConfirmModal } from './ConfirmModal';

export function ExpenseDetailModal({
  open,
  onClose,
  group,
  expense,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
  expense: Expense | null;
  onEdit: (expense: Expense) => void;
}) {
  const { profile } = useAuth();
  const { baseCurrency, formatAmount } = useCurrency();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<ExpenseNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !expense) {
      setNotes([]);
      return;
    }
    const unsub = subscribeExpenseNotes(group.id, expense.id, setNotes);
    return () => unsub();
  }, [open, group.id, expense?.id]);

  if (!expense) return null;

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !noteInput.trim()) return;
    setSendingNote(true);
    try {
      await addExpenseNote(profile, group, expense, noteInput);
      setNoteInput('');
    } catch (err: unknown) {
      showToast('Could not add note', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSendingNote(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!profile) return;
    setDeleting(true);
    try {
      await deleteExpense(profile, group, expense);
      showToast('Expense deleted', { variant: 'success' });
      setConfirmDeleteOpen(false);
      onClose();
    } catch (err: unknown) {
      showToast('Delete failed', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={expense.title}
        subtitle={`${expense.category} · ${formatDateTime(expense.expenseDate)}`}
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 sm:gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total expense</p>
              <p className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-white mt-0.5">
                {formatAmount(expense.amountPaise)}
              </p>
              {(() => {
                const origCurr = isSupportedCurrency(expense.currency) ? expense.currency : 'INR';
                const origMinor = expense.originalAmountMinor || expense.amountPaise;
                const rate = expense.exchangeRateToInr || 1;
                if (origCurr !== 'INR' || baseCurrency !== 'INR') {
                  return (
                    <p className="mt-1 text-xs font-mono-nums text-slate-500 dark:text-slate-400 break-words">
                      Original: {formatOriginalCurrency(origMinor, origCurr)}
                      {origCurr !== 'INR' ? ` · Rate at entry: 1 ${origCurr} = ₹${rate}` : ''}
                      {baseCurrency !== 'INR' ? ` · ${formatINR(expense.amountPaise)}` : ''}
                    </p>
                  );
                }
                return null;
              })()}
              {expense.tags && expense.tags.length > 0 && (
                <p className="mt-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 break-words">
                  {expense.tags.map((t) => `#${t}`).join(' · ')}
                </p>
              )}
              {expense.isRecurring && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <Repeat className="w-3.5 h-3.5" />
                  Recurring ({expense.recurringFrequency})
                  {expense.nextOccurrenceDate ? ` · Next: ${expense.nextOccurrenceDate}` : ''}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onEdit(expense);
                }}
                className="w-full sm:w-auto"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400 w-full sm:w-auto"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>
          </div>

          {expense.description && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {expense.description}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                Paid by
              </h4>
              <div className="space-y-1.5">
                {expense.payers.map((p) => (
                  <div key={p.uid} className="flex items-center justify-between text-sm">
                    <span className="text-slate-800 dark:text-slate-200 truncate">
                      {p.name} {p.uid === profile?.uid ? '(You)' : ''}
                    </span>
                    <span className="font-mono-nums font-medium text-emerald-600 dark:text-emerald-400">
                      {formatAmount(p.amountPaise)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                Split breakdown ({expense.splitMethod})
              </h4>
              <div className="space-y-1.5">
                {expense.shares.map((s) => (
                  <div key={s.uid} className="flex items-center justify-between text-sm">
                    <span className="text-slate-800 dark:text-slate-200 truncate">
                      {s.name} {s.uid === profile?.uid ? '(You)' : ''}
                    </span>
                    <span className="font-mono-nums text-slate-700 dark:text-slate-300">
                      {formatAmount(s.sharePaise)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {expense.receiptImage && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Attached bill receipt
              </h4>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                <img
                  src={expense.receiptImage}
                  alt="Expense receipt"
                  className="max-h-72 w-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Expense Discussion Notes */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Expense notes ({notes.length})
            </h4>

            {notes.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {n.authorName}{' '}
                        <span className="text-slate-400 font-normal">
                          · {formatRelativeTimestamp(n.createdAt?.toDate?.())}
                        </span>
                      </p>
                      <p className="text-sm text-slate-800 dark:text-slate-100 mt-0.5 break-words">
                        {n.text}
                      </p>
                    </div>
                    {n.authorUid === profile?.uid && (
                      <button
                        type="button"
                        onClick={() => deleteExpenseNote(group.id, expense.id, n.id)}
                        aria-label="Delete note"
                        className="text-slate-400 hover:text-red-500 p-1 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddNote} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                maxLength={500}
                placeholder="Add a note or question about this bill..."
                className="flex-1 min-w-0 h-10 sm:h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <Button type="submit" size="sm" loading={sendingNote} disabled={!noteInput.trim()} className="w-full sm:w-auto">
                <Send className="w-3.5 h-3.5" />
                Send
              </Button>
            </form>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDeleteExpense}
        title="Delete expense?"
        message={`Deleting "${expense.title}" (${formatAmount(expense.amountPaise)}) will immediately recalculate all balances in ${group.name}.`}
        confirmLabel="Delete Expense"
        loading={deleting}
      />
    </>
  );
}
