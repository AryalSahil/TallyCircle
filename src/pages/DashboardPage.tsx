import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  ReceiptIndianRupee,
  Handshake,
  Layers,
  Plane,
  Paperclip,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import { formatOriginalCurrency, isSupportedCurrency } from '../utils/finance';
import { formatRelativeTimestamp, formatShortDate } from '../utils/helpers';
import { confirmSettlement } from '../services/settlementService';
import { confirmTripSettlement } from '../services/tripService';
import { Button, Card, EmptyState, SkeletonRows } from '../components/ui/Primitives';
import { GroupModal } from '../components/modals/GroupModal';
import { TripModal } from '../components/modals/TripModal';
import { SettlementModal } from '../components/modals/SettlementModal';

export function DashboardPage({ onAddExpense }: { onAddExpense: (groupId?: string) => void }) {
  const { profile } = useAuth();
  const {
    activeGroups,
    groups,
    activeTrips,
    trips,
    expensesByGroup,
    expensesByTrip,
    settlementsByGroup,
    settlementsByTrip,
    summary,
    loadingData,
  } = useAppData();
  const { formatAmount } = useCurrency();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const [settleModalGroupId, setSettleModalGroupId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const settleTargetGroup = useMemo(
    () => groups.find((g) => g.id === settleModalGroupId) || activeGroups[0] || null,
    [groups, activeGroups, settleModalGroupId]
  );

  const handleQuickConfirm = async (
    settlementId: string,
    parentId: string,
    kind: 'group' | 'trip' = 'group'
  ) => {
    if (!profile) return;
    setConfirmingId(settlementId);
    try {
      if (kind === 'trip') {
        const trp = trips.find((t) => t.id === parentId);
        const st = (settlementsByTrip[parentId] || []).find((s) => s.id === settlementId);
        if (!trp || !st) return;
        await confirmTripSettlement(profile, trp, st);
      } else {
        const grp = groups.find((g) => g.id === parentId);
        const st = (settlementsByGroup[parentId] || []).find((s) => s.id === settlementId);
        if (!grp || !st) return;
        await confirmSettlement(profile, grp, st);
      }
      showToast('Payment confirmed', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not confirm', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Quick Actions & Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Hello, {profile?.fullName?.split(' ')[0]}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {activeGroups.length} active {activeGroups.length === 1 ? 'group' : 'groups'} ·{' '}
            {activeTrips.length} active {activeTrips.length === 1 ? 'trip' : 'trips'}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateGroupOpen(true)} className="w-full sm:w-auto">
            <Layers className="w-4 h-4" />
            Create Group
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCreateTripOpen(true)} className="w-full sm:w-auto">
            <Plane className="w-4 h-4" />
            Plan Trip
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={activeGroups.length === 0}
            onClick={() => setSettleModalGroupId(activeGroups[0]?.id || null)}
            className="w-full sm:w-auto"
          >
            <Handshake className="w-4 h-4" />
            Settle Up
          </Button>
          <Button size="sm" onClick={() => onAddExpense()} className="w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* 4 Key Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            Total group spending
          </p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(summary.totalAccessibleExpensesPaise)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </p>
        </Card>

        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            Total paid by you
          </p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(summary.totalPaidByMePaise)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            Direct contributions
          </p>
        </Card>

        <Card className="p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              You are owed
            </p>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono-nums text-emerald-600 dark:text-emerald-400 truncate">
            {formatAmount(summary.totalOwedToMePaise)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            Receivables
          </p>
        </Card>

        <Card className="p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              You owe
            </p>
            <ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-mono-nums text-red-600 dark:text-red-400 truncate">
            {formatAmount(summary.totalIOwePaise)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            Payables
          </p>
        </Card>
      </div>

      {/* Pending Settlements Section */}
      {summary.pendingSettlements.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Pending & awaiting confirmation ({summary.pendingSettlements.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {summary.pendingSettlements.slice(0, 5).map((st) => {
              const canConfirm =
                st.toUid === profile?.uid &&
                (st.status === 'pending' || st.status === 'awaiting_confirmation' || st.status === 'disputed');
              return (
                <div
                  key={st.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {st.fromName} → {st.toName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {st.groupName} · {st.method.toUpperCase()} ·{' '}
                      <span className="capitalize">{st.status.replace('_', ' ')}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white">
                      {formatAmount(st.amountPaise)}
                    </span>
                    {canConfirm ? (
                      <Button
                        size="sm"
                        loading={confirmingId === st.id}
                        onClick={() => handleQuickConfirm(st.id, st.groupId, st.kind || 'group')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(st.kind === 'trip' ? `/app/trips/${st.groupId}` : `/app/groups/${st.groupId}`)
                        }
                      >
                        View
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Main Grid: Active Groups + Recent Expenses + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Recent Expenses + Group Summaries */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Recent expenses
              </h3>
              <button
                type="button"
                onClick={() => navigate('/app/groups')}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                All groups
              </button>
            </div>
            {loadingData ? (
              <SkeletonRows count={4} />
            ) : summary.recentExpenses.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={ReceiptIndianRupee}
                  title="No expenses logged yet"
                  description="Create a group with friends and log your first shared expense."
                  action={
                    <Button
                      size="sm"
                      onClick={() =>
                        activeGroups.length > 0 ? onAddExpense() : setCreateGroupOpen(true)
                      }
                    >
                      <Plus className="w-4 h-4" />
                      {activeGroups.length > 0 ? 'Add First Expense' : 'Create First Group'}
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {summary.recentExpenses.slice(0, 8).map((exp) => {
                  const origCurr = isSupportedCurrency(exp.currency) ? exp.currency : 'INR';
                  const origMinor = exp.originalAmountMinor || exp.amountPaise;
                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          exp.kind === 'trip' || exp.tripId
                            ? `/app/trips/${exp.tripId || exp.groupId}`
                            : `/app/groups/${exp.groupId}`
                        )
                      }
                      className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate max-w-full">
                            {exp.title}
                          </p>
                          {(exp.receiptMetadata?.storagePath || exp.receiptImage) && (
                            <Paperclip className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          {exp.tags && exp.tags.length > 0 && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate max-w-full">
                              {exp.tags.map((t) => `#${t}`).join(' · ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {exp.groupName} · {exp.category} · Paid by{' '}
                          {exp.payers.map((p) => p.name).join(', ')} · {formatShortDate(exp.expenseDate)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white block">
                          {formatAmount(exp.amountPaise)}
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
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Active group summaries
              </h3>
              <button
                type="button"
                onClick={() => setCreateGroupOpen(true)}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                + New group
              </button>
            </div>
            {activeGroups.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No active groups yet. Start one for your next trip, dinner, or house expenses.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeGroups.map((g) => {
                  const exps = expensesByGroup[g.id] || [];
                  const total = exps.reduce((s, e) => s + e.amountPaise, 0);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => navigate(`/app/groups/${g.id}`)}
                      className="w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {g.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {g.memberUids.length} members · {exps.length} expenses
                        </p>
                      </div>
                      <span className="font-mono-nums text-sm font-medium text-slate-700 dark:text-slate-300 shrink-0">
                        {formatAmount(total)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {activeTrips.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Active trips
                </h3>
                <button
                  type="button"
                  onClick={() => navigate('/app/trips')}
                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  All trips
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeTrips.map((t) => {
                  const exps = expensesByTrip[t.id] || [];
                  const total = exps.reduce((s, e) => s + e.amountPaise, 0);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(`/app/trips/${t.id}`)}
                      className="w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {t.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {t.destination} · {t.participantUids.length} travelers · {exps.length} expenses
                        </p>
                      </div>
                      <span className="font-mono-nums text-sm font-medium text-slate-700 dark:text-slate-300 shrink-0">
                        {formatAmount(total)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Recent Activity Feed */}
        <Card className="overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Recent activity
            </h3>
          </div>
          {summary.recentActivities.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Group and trip updates will appear here in real time.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {summary.recentActivities.slice(0, 10).map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() =>
                    navigate(act.kind === 'trip' ? `/app/trips/${act.groupId}` : `/app/groups/${act.groupId}`)
                  }
                  className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">
                    {act.summary}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {act.groupName} · {formatRelativeTimestamp(act.createdAt?.toDate?.())}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <GroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={(id) => navigate(`/app/groups/${id}`)}
      />

      <TripModal
        open={createTripOpen}
        onClose={() => setCreateTripOpen(false)}
        onCreated={(id) => navigate(`/app/trips/${id}`)}
      />

      {settleTargetGroup && (
        <SettlementModal
          open={Boolean(settleModalGroupId)}
          onClose={() => setSettleModalGroupId(null)}
          group={settleTargetGroup}
          existingSettlements={settlementsByGroup[settleTargetGroup.id] || []}
        />
      )}
    </div>
  );
}
