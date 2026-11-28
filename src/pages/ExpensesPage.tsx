import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Repeat,
  ReceiptIndianRupee,
  Plus,
  Search,
  Pause,
  Play,
  XCircle,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import {
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  Group,
  RecurringExpenseRule,
  RecurringRuleFrequency,
  RecurringRuleStatus,
  Trip,
} from '../types';
import {
  deleteRecurringRule,
  setRecurringRuleStatus,
  updateRecurringRule,
} from '../services/recurringService';
import {
  formatOriginalCurrency,
  inrToPaise,
  isSupportedCurrency,
  paiseToInputString,
} from '../utils/finance';
import { formatFrequencyLabel } from '../utils/recurrence';
import { formatShortDate } from '../utils/helpers';
import { Button, Card, EmptyState, InputField, Modal } from '../components/ui/Primitives';
import { ExpenseFormModal } from '../components/modals/ExpenseFormModal';
import { ExpenseDetailModal } from '../components/modals/ExpenseDetailModal';
import { ConfirmModal } from '../components/modals/ConfirmModal';

type ExpensesTab = 'recurring' | 'all';

const RULE_STATUS_STYLES: Record<RecurringRuleStatus, string> = {
  active: 'text-emerald-700 dark:text-emerald-400',
  paused: 'text-amber-700 dark:text-amber-400',
  cancelled: 'text-red-700 dark:text-red-400',
  completed: 'text-slate-600 dark:text-slate-400',
};

export function ExpensesPage() {
  const { profile } = useAuth();
  const {
    groups,
    trips,
    expensesByGroup,
    expensesByTrip,
    recurringByGroup,
  } = useAppData();
  const { formatAmount } = useCurrency();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<ExpensesTab>('recurring');

  // All Expenses Filters
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [receiptOnly, setReceiptOnly] = useState(false);

  // Recurring Rules Filters & Expansion
  const [ruleGroupFilter, setRuleGroupFilter] = useState('ALL');
  const [ruleStatusFilter, setRuleStatusFilter] = useState<'ALL' | RecurringRuleStatus>('ALL');
  const [expandedRuleIds, setExpandedRuleIds] = useState<Record<string, boolean>>({});
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  // Edit / Delete Rule Modals
  const [editingRule, setEditingRule] = useState<{
    rule: RecurringExpenseRule;
    group: Group;
  } | null>(null);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleAmountInput, setRuleAmountInput] = useState('');
  const [ruleFrequency, setRuleFrequency] = useState<RecurringRuleFrequency>('monthly');
  const [ruleIntervalDays, setRuleIntervalDays] = useState('30');
  const [ruleNextDate, setRuleNextDate] = useState('');
  const [ruleEndDate, setRuleEndDate] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  const [deleteRuleTarget, setDeleteRuleTarget] = useState<{
    rule: RecurringExpenseRule;
    group: Group;
  } | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);

  // Expense Form & Detail Modals
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [detailTarget, setDetailTarget] = useState<{
    expense: Expense;
    group?: Group;
    trip?: Trip;
  } | null>(null);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const tripMap = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  const allRules = useMemo(() => {
    const items: Array<{ rule: RecurringExpenseRule; group: Group }> = [];
    for (const g of groups) {
      for (const r of recurringByGroup[g.id] || []) {
        items.push({ rule: r, group: g });
      }
    }
    return items.sort((a, b) =>
      a.rule.nextOccurrenceDate.localeCompare(b.rule.nextOccurrenceDate)
    );
  }, [groups, recurringByGroup]);

  const filteredRules = useMemo(() => {
    return allRules.filter(({ rule, group }) => {
      if (ruleGroupFilter !== 'ALL' && group.id !== ruleGroupFilter) return false;
      if (ruleStatusFilter !== 'ALL' && rule.status !== ruleStatusFilter) return false;
      return true;
    });
  }, [allRules, ruleGroupFilter, ruleStatusFilter]);

  const ruleCounts = useMemo(() => {
    let active = 0;
    let paused = 0;
    let closed = 0;
    for (const { rule } of allRules) {
      if (rule.status === 'active') active++;
      else if (rule.status === 'paused') paused++;
      else closed++;
    }
    return { active, paused, closed };
  }, [allRules]);

  const allExpenses = useMemo(() => {
    const list: Array<{
      expense: Expense;
      parentName: string;
      kind: 'group' | 'trip';
      group?: Group;
      trip?: Trip;
    }> = [];
    for (const g of groups) {
      for (const e of expensesByGroup[g.id] || []) {
        list.push({ expense: e, parentName: g.name, kind: 'group', group: g });
      }
    }
    for (const t of trips) {
      for (const e of expensesByTrip[t.id] || []) {
        list.push({ expense: e, parentName: t.name, kind: 'trip', trip: t });
      }
    }
    return list.sort((a, b) => b.expense.expenseDate.localeCompare(a.expense.expenseDate));
  }, [groups, trips, expensesByGroup, expensesByTrip]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const item of allExpenses) set.add(item.expense.category);
    return Array.from(set);
  }, [allExpenses]);

  const filteredAllExpenses = useMemo(() => {
    return allExpenses.filter(({ expense, kind }) => {
      if (scopeFilter === 'GROUPS' && kind !== 'group') return false;
      if (scopeFilter === 'TRIPS' && kind !== 'trip') return false;
      if (scopeFilter.startsWith('group:') && (kind !== 'group' || expense.groupId !== scopeFilter.slice(6))) {
        return false;
      }
      if (scopeFilter.startsWith('trip:') && (kind !== 'trip' || (expense.tripId || expense.groupId) !== scopeFilter.slice(5))) {
        return false;
      }
      if (categoryFilter !== 'ALL' && expense.category !== categoryFilter) return false;
      if (receiptOnly && !expense.receiptMetadata?.storagePath && !expense.receiptImage) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hit =
          expense.title.toLowerCase().includes(q) ||
          (expense.description || '').toLowerCase().includes(q) ||
          expense.category.toLowerCase().includes(q) ||
          (expense.tags || []).some((t) => t.toLowerCase().includes(q) || `#${t}`.includes(q)) ||
          expense.payers.some((p) => p.name.toLowerCase().includes(q)) ||
          expense.shares.some((s) => s.name.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [allExpenses, scopeFilter, categoryFilter, receiptOnly, search]);

  const openEditRule = (rule: RecurringExpenseRule, group: Group) => {
    setEditingRule({ rule, group });
    setRuleTitle(rule.title);
    setRuleAmountInput(paiseToInputString(rule.amountPaise));
    setRuleFrequency(rule.frequency);
    setRuleIntervalDays(String(rule.intervalDays || 30));
    setRuleNextDate(rule.nextOccurrenceDate);
    setRuleEndDate(rule.endDate || '');
  };

  const handleSaveRuleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingRule) return;
    const nextPaise = inrToPaise(ruleAmountInput);
    if (!ruleTitle.trim() || nextPaise <= 0) {
      showToast('Enter a valid title and INR amount', { variant: 'error' });
      return;
    }
    if (ruleEndDate && ruleNextDate && ruleEndDate < ruleNextDate) {
      showToast('End date must be on or after the next occurrence date', { variant: 'error' });
      return;
    }

    setSavingRule(true);
    try {
      const { rule, group } = editingRule;
      // Proportionally adjust payer and share totals if the rule amount changed
      let nextPayers = rule.payers;
      let nextShares = rule.shares;
      if (nextPaise !== rule.amountPaise && rule.amountPaise > 0) {
        const ratio = nextPaise / rule.amountPaise;
        let payerSum = 0;
        nextPayers = rule.payers.map((p, idx) => {
          if (idx === rule.payers.length - 1) {
            return { ...p, amountPaise: Math.max(0, nextPaise - payerSum) };
          }
          const amt = Math.round(p.amountPaise * ratio);
          payerSum += amt;
          return { ...p, amountPaise: amt };
        });

        let shareSum = 0;
        nextShares = rule.shares.map((s, idx) => {
          if (idx === rule.shares.length - 1) {
            return { ...s, sharePaise: Math.max(0, nextPaise - shareSum) };
          }
          const amt = Math.round(s.sharePaise * ratio);
          shareSum += amt;
          return { ...s, sharePaise: amt };
        });
      }

      await updateRecurringRule(profile, group, rule, {
        title: ruleTitle.trim(),
        amountPaise: nextPaise,
        currency: 'INR',
        originalAmountMinor: nextPaise,
        exchangeRateToInr: 1,
        payers: nextPayers,
        shares: nextShares,
        frequency: ruleFrequency,
        intervalDays: ruleFrequency === 'custom' ? Math.max(1, parseInt(ruleIntervalDays, 10) || 30) : 0,
        nextOccurrenceDate: ruleNextDate,
        endDate: ruleEndDate,
      });

      showToast('Recurring rule updated', { variant: 'success' });
      setEditingRule(null);
    } catch (err: unknown) {
      showToast('Could not update rule', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRuleStatus = async (
    rule: RecurringExpenseRule,
    group: Group,
    nextStatus: 'active' | 'paused' | 'cancelled'
  ) => {
    if (!profile) return;
    setTogglingRuleId(rule.id);
    try {
      await setRecurringRuleStatus(profile, group, rule, nextStatus);
      showToast(
        nextStatus === 'active'
          ? 'Recurring schedule resumed'
          : nextStatus === 'paused'
            ? 'Recurring schedule paused'
            : 'Recurring schedule cancelled',
        { variant: 'success' }
      );
    } catch (err: unknown) {
      showToast('Could not update schedule status', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleDeleteRule = async () => {
    if (!profile || !deleteRuleTarget) return;
    setDeletingRule(true);
    try {
      await deleteRecurringRule(profile, deleteRuleTarget.group, deleteRuleTarget.rule);
      showToast('Recurring schedule deleted', { variant: 'info' });
      setDeleteRuleTarget(null);
    } catch (err: unknown) {
      showToast('Could not delete rule', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setDeletingRule(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setTab('recurring')}
            className={`flex items-center justify-center gap-1.5 px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'recurring'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            Recurring ({allRules.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`flex items-center justify-center gap-1.5 px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ReceiptIndianRupee className="w-3.5 h-3.5" />
            All Expenses ({allExpenses.length})
          </button>
        </div>

        <Button
          size="sm"
          onClick={() => {
            setEditingExpense(null);
            setExpenseFormOpen(true);
          }}
          className="w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          New Expense / Schedule
        </Button>
      </div>

      {tab === 'recurring' && (
        <div className="space-y-5">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Card className="p-3.5 sm:p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Active schedules</p>
              <p className="mt-1 text-xl font-bold font-mono-nums text-emerald-600 dark:text-emerald-400">
                {ruleCounts.active}
              </p>
            </Card>
            <Card className="p-3.5 sm:p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Paused</p>
              <p className="mt-1 text-xl font-bold font-mono-nums text-amber-600 dark:text-amber-400">
                {ruleCounts.paused}
              </p>
            </Card>
            <Card className="p-3.5 sm:p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Completed / Cancelled</p>
              <p className="mt-1 text-xl font-bold font-mono-nums text-slate-700 dark:text-slate-300">
                {ruleCounts.closed}
              </p>
            </Card>
          </div>

          {/* Rule Filters */}
          <Card className="p-3.5 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={ruleGroupFilter}
                onChange={(e) => setRuleGroupFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              <select
                value={ruleStatusFilter}
                onChange={(e) =>
                  setRuleStatusFilter(e.target.value as 'ALL' | RecurringRuleStatus)
                }
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </Card>

          {filteredRules.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No recurring expense schedules"
              description="Enable 'Make this a recurring group expense' when adding rent, Wi-Fi, utilities, or subscriptions to automate future bills."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingExpense(null);
                    setExpenseFormOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Create Recurring Expense
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredRules.map(({ rule, group }) => {
                const expanded = Boolean(expandedRuleIds[rule.id]);
                const generatedHistory = (expensesByGroup[group.id] || []).filter(
                  (e) => e.recurringRuleId === rule.id
                );
                const busy = togglingRuleId === rule.id;

                return (
                  <Card key={rule.id} className="overflow-hidden">
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                              {rule.title}
                            </h3>
                            <span
                              className={`text-xs font-semibold capitalize ${RULE_STATUS_STYLES[rule.status]}`}
                            >
                              {rule.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            <button
                              type="button"
                              onClick={() => navigate(`/groups/${group.id}`)}
                              className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {group.name}
                            </button>{' '}
                            · {rule.category} · {formatFrequencyLabel(rule.frequency, rule.intervalDays)} ·{' '}
                            {rule.shares.length} participant(s)
                          </p>
                        </div>

                        <div className="sm:text-right shrink-0">
                          <p className="font-mono-nums text-base font-bold text-slate-900 dark:text-white">
                            {formatAmount(rule.amountPaise)}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                            {rule.status === 'active'
                              ? `Next: ${rule.nextOccurrenceDate}`
                              : rule.status === 'paused'
                                ? `Scheduled: ${rule.nextOccurrenceDate}`
                                : rule.endDate
                                  ? `Ended: ${rule.endDate}`
                                  : 'Schedule stopped'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Start: <span className="font-mono-nums">{rule.startDate}</span>
                          </span>
                          {rule.endDate && (
                            <span>
                              End: <span className="font-mono-nums">{rule.endDate}</span>
                            </span>
                          )}
                          <span className="font-mono-nums">
                            Generated: {generatedHistory.length || rule.generatedCount || 0} time(s)
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditRule(rule, group)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </Button>

                          {rule.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy}
                              onClick={() => handleToggleRuleStatus(rule, group, 'paused')}
                            >
                              <Pause className="w-3.5 h-3.5" />
                              Pause
                            </Button>
                          )}

                          {rule.status === 'paused' && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy}
                              onClick={() => handleToggleRuleStatus(rule, group, 'active')}
                            >
                              <Play className="w-3.5 h-3.5" />
                              Resume
                            </Button>
                          )}

                          {(rule.status === 'active' || rule.status === 'paused') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy}
                              onClick={() => handleToggleRuleStatus(rule, group, 'cancelled')}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 dark:text-red-400"
                            onClick={() => setDeleteRuleTarget({ rule, group })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRuleIds((prev) => ({ ...prev, [rule.id]: !prev[rule.id] }))
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          {expanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              Hide generated history ({generatedHistory.length})
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              View generated history ({generatedHistory.length})
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="bg-slate-50/70 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                        {generatedHistory.length === 0 ? (
                          <p className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                            No automated occurrences logged for this rule yet. Next run is scheduled
                            for <span className="font-mono-nums">{rule.nextOccurrenceDate}</span>.
                          </p>
                        ) : (
                          generatedHistory.map((exp) => (
                            <button
                              key={exp.id}
                              type="button"
                              onClick={() => setDetailTarget({ expense: exp, group })}
                              className="w-full text-left px-5 py-2.5 hover:bg-slate-100/80 dark:hover:bg-slate-900/60 flex items-center justify-between gap-3 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {exp.title}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                                  {formatShortDate(exp.expenseDate)}
                                  {exp.occurrenceKey ? ` · Key ${exp.occurrenceKey}` : ''}
                                </p>
                              </div>
                              <span className="font-mono-nums text-xs font-semibold text-slate-900 dark:text-white shrink-0">
                                {formatAmount(exp.amountPaise)}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'all' && (
        <div className="space-y-4">
          <Card className="p-3.5 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, #tag, payer..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                <option value="ALL">All Groups & Trips</option>
                <option value="GROUPS">All Groups</option>
                <option value="TRIPS">All Trips</option>
                {groups.map((g) => (
                  <option key={`g-${g.id}`} value={`group:${g.id}`}>
                    Group: {g.name}
                  </option>
                ))}
                {trips.map((t) => (
                  <option key={`t-${t.id}`} value={`trip:${t.id}`}>
                    Trip: {t.name}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                <option value="ALL">All categories</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={receiptOnly}
                  onChange={(e) => setReceiptOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Has receipt attached
              </label>
            </div>
          </Card>

          {filteredAllExpenses.length === 0 ? (
            <EmptyState
              icon={ReceiptIndianRupee}
              title="No expenses match your filters"
              description="Adjust your search filters or log a new expense across any Group or Trip."
            />
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {filteredAllExpenses.map(({ expense, parentName, kind, group, trip }) => {
                const origCurr = isSupportedCurrency(expense.currency) ? expense.currency : 'INR';
                const origMinor = expense.originalAmountMinor || expense.amountPaise;
                const hasReceipt = Boolean(
                  expense.receiptMetadata?.storagePath || expense.receiptImage
                );
                return (
                  <button
                    key={`${kind}-${expense.id}`}
                    type="button"
                    onClick={() => setDetailTarget({ expense, group, trip })}
                    className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {expense.title}
                        </p>
                        {hasReceipt && (
                          <Paperclip
                            className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                            aria-label="Receipt attached"
                          />
                        )}
                        {expense.recurringRuleId && (
                          <Repeat
                            className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0"
                            aria-label="Recurring expense"
                          />
                        )}
                        {expense.tags && expense.tags.length > 0 && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
                            {expense.tags.map((t) => `#${t}`).join(' · ')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {kind === 'trip' ? 'Trip' : 'Group'}: {parentName} · {expense.category} ·{' '}
                        {formatShortDate(expense.expenseDate)} · Paid by{' '}
                        {expense.payers.map((p) => p.name).join(', ')}
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span className="font-mono-nums text-sm font-bold text-slate-900 dark:text-white block">
                        {formatAmount(expense.amountPaise)}
                      </span>
                      {origCurr !== 'INR' && (
                        <span className="font-mono-nums text-[11px] text-slate-400 block">
                          {formatOriginalCurrency(origMinor, origCurr)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* Edit Recurring Rule Modal */}
      <Modal
        open={Boolean(editingRule)}
        onClose={() => setEditingRule(null)}
        title="Edit Recurring Schedule"
        subtitle={editingRule ? editingRule.group.name : ''}
      >
        {editingRule && (
          <form onSubmit={handleSaveRuleEdit} className="space-y-4">
            <InputField
              label="Title"
              value={ruleTitle}
              onChange={(e) => setRuleTitle(e.target.value)}
              maxLength={120}
              required
            />
            <InputField
              label="Amount (₹ INR)"
              type="number"
              step="0.01"
              min="0.01"
              value={ruleAmountInput}
              onChange={(e) => setRuleAmountInput(e.target.value)}
              className="font-mono-nums"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Frequency
                </label>
                <select
                  value={ruleFrequency}
                  onChange={(e) => setRuleFrequency(e.target.value as RecurringRuleFrequency)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom interval (days)</option>
                </select>
              </div>
              {ruleFrequency === 'custom' && (
                <InputField
                  label="Interval (days)"
                  type="number"
                  min="1"
                  max="365"
                  value={ruleIntervalDays}
                  onChange={(e) => setRuleIntervalDays(e.target.value)}
                  className="font-mono-nums"
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label="Next scheduled date"
                type="date"
                value={ruleNextDate}
                onChange={(e) => setRuleNextDate(e.target.value)}
                required
              />
              <InputField
                label="End date (optional)"
                type="date"
                value={ruleEndDate}
                onChange={(e) => setRuleEndDate(e.target.value)}
              />
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingRule(null)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" loading={savingRule} className="w-full sm:w-auto">
                Save Schedule
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteRuleTarget)}
        onClose={() => setDeleteRuleTarget(null)}
        onConfirm={handleDeleteRule}
        title="Delete recurring schedule?"
        message={`Deleting "${deleteRuleTarget?.rule.title}" stops all future automatic bills. Previously logged expenses remain untouched in the group ledger.`}
        confirmLabel="Delete Schedule"
        loading={deletingRule}
      />

      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => {
          setExpenseFormOpen(false);
          setEditingExpense(null);
        }}
        editingExpense={editingExpense}
      />

      <ExpenseDetailModal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        group={
          detailTarget?.group ||
          (detailTarget?.expense && !detailTarget.expense.tripId
            ? groupMap.get(detailTarget.expense.groupId)
            : undefined)
        }
        trip={
          detailTarget?.trip ||
          (detailTarget?.expense?.tripId
            ? tripMap.get(detailTarget.expense.tripId)
            : undefined)
        }
        expense={detailTarget?.expense || null}
        onEdit={(exp) => {
          setDetailTarget(null);
          setEditingExpense(exp);
          setExpenseFormOpen(true);
        }}
      />
    </div>
  );
}
