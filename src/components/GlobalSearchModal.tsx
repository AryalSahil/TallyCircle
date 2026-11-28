import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ArrowRight, Tag, Plane, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { Expense, Group, Trip } from '../types';
import { formatOriginalCurrency, isSupportedCurrency, normalizeExpenseTag } from '../utils/finance';
import { formatShortDate } from '../utils/helpers';
import { ExpenseDetailModal } from './modals/ExpenseDetailModal';
import { ExpenseFormModal } from './modals/ExpenseFormModal';

interface EnrichedExpense {
  expense: Expense;
  group?: Group;
  trip?: Trip;
  scopeLabel: string;
}

export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { groups, expensesByGroup, trips, expensesByTrip } = useAppData();
  const { formatAmount } = useCurrency();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [detailTarget, setDetailTarget] = useState<EnrichedExpense | null>(null);
  const [editingTarget, setEditingTarget] = useState<EnrichedExpense | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
      setSelectedTag('');
    }
  }, [open]);

  const allExpenses = useMemo<EnrichedExpense[]>(() => {
    const items: EnrichedExpense[] = [];
    for (const group of groups) {
      for (const expense of expensesByGroup[group.id] || []) {
        items.push({ expense, group, scopeLabel: group.name });
      }
    }
    for (const trip of trips) {
      for (const expense of expensesByTrip[trip.id] || []) {
        items.push({ expense, trip, scopeLabel: `${trip.name} (${trip.destination})` });
      }
    }
    return items.sort((a, b) => b.expense.expenseDate.localeCompare(a.expense.expenseDate));
  }, [groups, expensesByGroup, trips, expensesByTrip]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allExpenses) {
      for (const t of item.expense.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 12);
  }, [allExpenses]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cleanTagQuery = normalizeExpenseTag(q);

    return allExpenses.filter(({ expense, scopeLabel }) => {
      if (selectedTag && !(expense.tags || []).includes(selectedTag)) {
        return false;
      }
      if (!q) return true;

      const titleMatch =
        expense.title.toLowerCase().includes(q) ||
        (expense.description || '').toLowerCase().includes(q) ||
        scopeLabel.toLowerCase().includes(q) ||
        expense.category.toLowerCase().includes(q);

      const tagMatch = (expense.tags || []).some(
        (t) => t.toLowerCase().includes(q) || (cleanTagQuery && t.includes(cleanTagQuery))
      );

      const participantMatch =
        expense.payers.some((p) => p.name.toLowerCase().includes(q)) ||
        expense.shares.some((s) => s.name.toLowerCase().includes(q));

      return titleMatch || tagMatch || participantMatch;
    });
  }, [allExpenses, query, selectedTag]);

  if (!open && !detailTarget && !editingTarget) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 backdrop-blur-xs p-2.5 sm:p-4 pt-6 sm:pt-20 overflow-y-auto"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Global expense search"
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 sm:gap-3 px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across groups & trips by title, #tag, or friend..."
                className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {(query || selectedTag) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSelectedTag('');
                  }}
                  className="text-xs px-2 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close global search"
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {allTags.length > 0 && (
              <div className="px-3.5 sm:px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1 shrink-0">
                  <Tag className="w-3 h-3" />
                  Tags:
                </span>
                {allTags.map((tag) => {
                  const active = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(active ? '' : tag)}
                      className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="max-h-[65dvh] sm:max-h-[60dvh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {results.length === 0 ? (
                <div className="py-12 px-6 text-center space-y-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    No matching expenses found
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Try searching by expense title, a tag like vacation, or a friend&apos;s name.
                  </p>
                </div>
              ) : (
                results.slice(0, 30).map((item) => {
                  const { expense, group, trip, scopeLabel } = item;
                  const origCurr = isSupportedCurrency(expense.currency)
                    ? expense.currency
                    : 'INR';
                  const origMinor = expense.originalAmountMinor || expense.amountPaise;
                  const targetPath = trip ? `/app/trips/${trip.id}` : `/app/groups/${group!.id}`;
                  return (
                    <div
                      key={`${trip ? `trip_${trip.id}` : `grp_${group?.id}`}_${expense.id}`}
                      className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDetailTarget(item);
                          onClose();
                        }}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {trip ? (
                            <Plane className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          ) : (
                            <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {expense.title}
                          </span>
                          {expense.tags && expense.tags.length > 0 && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate shrink-0">
                              {expense.tags.map((t) => `#${t}`).join(' · ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {scopeLabel} · {expense.category} · {formatShortDate(expense.expenseDate)} ·{' '}
                          Paid by {expense.payers.map((p) => p.name).join(', ')}
                        </p>
                      </button>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="font-mono-nums text-sm font-bold text-slate-900 dark:text-white">
                            {formatAmount(expense.amountPaise)}
                          </p>
                          {origCurr !== 'INR' && (
                            <p className="font-mono-nums text-[11px] text-slate-400">
                              {formatOriginalCurrency(origMinor, origCurr)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            navigate(targetPath);
                          }}
                          title={`Open ${scopeLabel}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {results.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Showing {Math.min(results.length, 30)} of {results.length} matching expenses
                </span>
                <span>Click an expense to view details</span>
              </div>
            )}
          </div>
        </div>
      )}

      {detailTarget && (
        <ExpenseDetailModal
          open={Boolean(detailTarget)}
          onClose={() => setDetailTarget(null)}
          group={detailTarget.group}
          trip={detailTarget.trip}
          expense={detailTarget.expense}
          onEdit={() => {
            const target = detailTarget;
            setDetailTarget(null);
            setEditingTarget(target);
          }}
        />
      )}

      <ExpenseFormModal
        open={Boolean(editingTarget)}
        onClose={() => setEditingTarget(null)}
        defaultGroupId={editingTarget?.group?.id}
        defaultTripId={editingTarget?.trip?.id}
        editingExpense={editingTarget?.expense}
      />
    </>
  );
}
