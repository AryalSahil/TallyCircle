import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus,
  Handshake,
  Pencil,
  Archive,
  ArchiveRestore,
  LogOut,
  Search,
  Copy,
  Share2,
  UserPlus,
  UserMinus,
  CheckCircle2,
  XCircle,
  Trash2,
  BellRing,
  Calendar,
  ArrowLeft,
  Clock,
  ReceiptIndianRupee,
  MapPin,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  Paperclip,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import {
  EXPENSE_CATEGORIES,
  Expense,
  SUPPORTED_CURRENCIES,
  Settlement,
  TripInvite,
} from '../types';
import { formatOriginalCurrency, isSupportedCurrency } from '../utils/finance';
import {
  buildTripInviteUrl,
  buildTripWhatsAppInviteMessage,
  buildUpiUri,
  buildWhatsAppShareUrl,
  formatRelativeTimestamp,
  formatShortDate,
  GROUP_COVER_PRESETS,
  isValidSafeUrl,
  shareInviteLink,
} from '../utils/helpers';
import {
  computeTripAnalytics,
  confirmTripSettlement,
  createTripInvite,
  deleteTripSettlement,
  deleteTripWithData,
  disputeTripSettlement,
  markTripSettlementPaid,
  removeOrLeaveTripParticipant,
  revokeTripInvite,
  subscribeTripInvites,
  updateTripDetails,
} from '../services/tripService';
import { sendPaymentReminder } from '../services/notificationService';
import { exportReportToExcel, exportReportToPDF } from '../utils/exportReports';
import { Avatar, Button, Card, EmptyState, InputField, Modal } from '../components/ui/Primitives';
import { TripModal } from '../components/modals/TripModal';
import { ExpenseFormModal } from '../components/modals/ExpenseFormModal';
import { ExpenseDetailModal } from '../components/modals/ExpenseDetailModal';
import { SettlementModal } from '../components/modals/SettlementModal';
import { ConfirmModal } from '../components/modals/ConfirmModal';
import { AddTripParticipantsModal } from '../components/modals/AddTripParticipantsModal';

type TripTab = 'expenses' | 'balances' | 'settlements' | 'timeline' | 'participants' | 'activity';

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { profile } = useAuth();
  const {
    trips,
    expensesByTrip,
    settlementsByTrip,
    activitiesByTrip,
    profilesMap,
  } = useAppData();
  const { baseCurrency, formatAmount } = useCurrency();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const trip = useMemo(() => trips.find((t) => t.id === tripId) || null, [trips, tripId]);
  const expenses = trip ? expensesByTrip[trip.id] || [] : [];
  const settlements = trip ? settlementsByTrip[trip.id] || [] : [];
  const activities = trip ? activitiesByTrip[trip.id] || [] : [];

  const [tab, setTab] = useState<TripTab>('expenses');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterTag, setFilterTag] = useState('ALL');
  const [filterMember, setFilterMember] = useState('ALL');

  // Modals
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [addParticipantsOpen, setAddParticipantsOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [settlementPrefill, setSettlementPrefill] = useState<{
    fromUid?: string;
    toUid?: string;
    amountPaise?: number;
  }>({});

  // Confirmations
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [confirmDeleteTripOpen, setConfirmDeleteTripOpen] = useState(false);
  const [removeParticipantTarget, setRemoveParticipantTarget] = useState<{
    uid: string;
    name: string;
  } | null>(null);
  const [cancelSettlementTarget, setCancelSettlementTarget] = useState<Settlement | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Invites
  const [tripInvites, setTripInvites] = useState<TripInvite[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Settlement Pay / Dispute / Confirm Dialog
  const [confirmingSettlementId, setConfirmingSettlementId] = useState<string | null>(null);
  const [payDialogSt, setPayDialogSt] = useState<Settlement | null>(null);
  const [payMethod, setPayMethod] = useState<'upi' | 'cash'>('upi');
  const [payRef, setPayRef] = useState('');
  const [payingSettlement, setPayingSettlement] = useState(false);
  const [disputeDialogSt, setDisputeDialogSt] = useState<Settlement | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputingSettlement, setDisputingSettlement] = useState(false);

  useEffect(() => {
    if (!profile?.uid || !trip?.id) return;
    const unsub = subscribeTripInvites(trip.id, profile.uid, setTripInvites, (err) => {
      showToast('Could not sync trip invites', { description: err.message, variant: 'error' });
    });
    return () => unsub();
  }, [profile?.uid, trip?.id, showToast]);

  const analytics = useMemo(() => {
    if (!trip) return null;
    return computeTripAnalytics(trip, expenses, settlements);
  }, [trip, expenses, settlements]);

  const tripTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) {
      (e.tags || []).forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [expenses]);

  const categoryFilterOptions = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const e of expenses) set.add(e.category);
    return Array.from(set);
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          e.title.toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.tags || []).some((t) => t.toLowerCase().includes(q) || `#${t}`.toLowerCase().includes(q)) ||
          e.payers.some((p) => p.name.toLowerCase().includes(q)) ||
          e.shares.some((s) => s.name.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filterCategory !== 'ALL' && e.category !== filterCategory) return false;
      if (filterTag !== 'ALL' && !(e.tags || []).includes(filterTag)) return false;
      if (
        filterMember !== 'ALL' &&
        !e.payerUids.includes(filterMember) &&
        !e.participantUids.includes(filterMember)
      ) {
        return false;
      }
      return true;
    });
  }, [expenses, searchQuery, filterCategory, filterTag, filterMember]);

  const timelineDays = useMemo(() => {
    const byDay = new Map<string, { date: string; totalPaise: number; items: Expense[] }>();
    for (const exp of expenses) {
      const day = exp.expenseDate.slice(0, 10) || 'Unknown';
      if (!byDay.has(day)) byDay.set(day, { date: day, totalPaise: 0, items: [] });
      const bucket = byDay.get(day)!;
      bucket.totalPaise += exp.amountPaise;
      bucket.items.push(exp);
    }
    return Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses]);

  if (!trip || !analytics) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Trip not found or you do not have access to it.
        </p>
        <Button variant="outline" onClick={() => navigate('/trips')}>
          <ArrowLeft className="w-4 h-4" />
          Back to Trips
        </Button>
      </Card>
    );
  }

  const cover = isValidSafeUrl(trip.coverImage)
    ? trip.coverImage
    : GROUP_COVER_PRESETS[0].url;
  const mySummary = analytics.memberSummaries.find((m) => m.uid === profile?.uid);
  const myNet = mySummary?.netBalancePaise ?? 0;
  const tripDatesLabel =
    trip.startDate || trip.endDate
      ? `${trip.startDate || 'TBD'} to ${trip.endDate || 'TBD'}`
      : 'Flexible Dates';

  const handleToggleArchive = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await updateTripDetails(profile, trip, { isArchived: !trip.isArchived });
      showToast(trip.isArchived ? 'Trip restored' : 'Trip archived', { variant: 'success' });
      setConfirmArchiveOpen(false);
    } catch (err: unknown) {
      showToast('Update failed', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveTrip = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await removeOrLeaveTripParticipant(profile, trip, profile.uid);
      showToast('You left the trip', { variant: 'info' });
      setConfirmLeaveOpen(false);
      navigate('/trips');
    } catch (err: unknown) {
      showToast('Cannot leave trip', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveParticipant = async () => {
    if (!profile || !removeParticipantTarget) return;
    setActionLoading(true);
    try {
      await removeOrLeaveTripParticipant(profile, trip, removeParticipantTarget.uid);
      showToast(`Removed ${removeParticipantTarget.name}`, { variant: 'success' });
      setRemoveParticipantTarget(null);
    } catch (err: unknown) {
      showToast('Could not remove participant', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTrip = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await deleteTripWithData(profile, trip);
      showToast(`Deleted "${trip.name}"`, { variant: 'info' });
      setConfirmDeleteTripOpen(false);
      navigate('/trips');
    } catch (err: unknown) {
      showToast('Could not delete trip', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSettlement = async () => {
    if (!cancelSettlementTarget) return;
    setActionLoading(true);
    try {
      await deleteTripSettlement(trip.id, cancelSettlementTarget.id);
      showToast('Settlement cancelled and removed', { variant: 'info' });
      setCancelSettlementTarget(null);
    } catch (err: unknown) {
      showToast('Could not cancel settlement', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    const payload = {
      title: `${trip.name} (${trip.destination})`,
      dateRangeLabel: tripDatesLabel,
      expenses: expenses.map((e) => ({ ...e, groupName: trip.name })),
      settlements: settlements.map((s) => ({ ...s, groupName: trip.name })),
      totalSpentPaise: analytics.totalSpentPaise,
      currentUserUid: profile?.uid,
      reportMeta: {
        destination: trip.destination,
        dates: tripDatesLabel,
        budgetPaise: trip.budgetPaise,
      },
    };
    if (format === 'pdf') {
      exportReportToPDF(payload);
      showToast('Trip PDF report downloaded', { variant: 'success' });
    } else {
      exportReportToExcel(payload);
      showToast('Trip Excel report downloaded', { variant: 'success' });
    }
  };

  const handleRemind = async (debtFromUid: string, amountPaise: number) => {
    if (!profile) return;
    try {
      await sendPaymentReminder({
        senderUid: profile.uid,
        senderName: profile.fullName,
        recipientUid: debtFromUid,
        groupId: trip.id,
        groupName: trip.name,
        amountPaise,
      });
      showToast('Payment reminder sent', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not send reminder', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <Card className="overflow-hidden">
        <div className="relative min-h-[176px] sm:h-52 bg-slate-900 flex flex-col justify-between p-4 sm:p-5">
          <img
            src={cover}
            alt={trip.name}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/25" />

          <div className="relative z-10 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => navigate('/trips')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/65 hover:bg-slate-950/85 text-white px-3 min-h-[36px] py-1.5 text-xs font-medium backdrop-blur-xs cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Trips
            </button>
            <div className="flex items-center gap-2 text-xs text-white font-mono-nums bg-slate-950/65 px-2.5 py-1.5 rounded-lg backdrop-blur-xs">
              <span>{trip.currency}</span>
              {trip.currency !== 'INR' && (
                <span className="text-slate-300">
                  · 1 {trip.currency} = ₹{trip.exchangeRateToInr}
                </span>
              )}
            </div>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3 text-white pt-4">
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold break-words line-clamp-2">
                {trip.name}
                {trip.isArchived ? ' (Archived)' : ''}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200/90 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  {trip.destination}
                </span>
                <span className="inline-flex items-center gap-1 font-mono-nums">
                  <Calendar className="w-3.5 h-3.5 text-slate-300" />
                  {tripDatesLabel}
                </span>
                <span>{trip.participantUids.length} travelers · Equal permissions</span>
              </p>
            </div>
            <div className="flex items-center gap-5 shrink-0 sm:text-right">
              <div>
                <p className="text-[11px] text-slate-300">Total spent</p>
                <p className="font-mono-nums text-sm sm:text-base font-bold">
                  {formatAmount(analytics.totalSpentPaise)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-300">Your net</p>
                <p
                  className={`font-mono-nums text-sm sm:text-base font-bold ${
                    myNet > 0 ? 'text-emerald-400' : myNet < 0 ? 'text-red-400' : 'text-slate-200'
                  }`}
                >
                  {formatAmount(myNet, { showSign: true })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation & Actions Bar */}
        <div className="px-3.5 sm:px-5 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 xl:pb-0">
            {(
              [
                { id: 'expenses', label: `Expenses (${expenses.length})` },
                { id: 'balances', label: 'Balances & Budget' },
                { id: 'settlements', label: `Settlements (${settlements.length})` },
                { id: 'timeline', label: 'Day Timeline' },
                { id: 'participants', label: `Travelers (${trip.participantUids.length})` },
                { id: 'activity', label: 'Activity' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 min-h-[38px] py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  tab === t.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddParticipantsOpen(true)}
              className="w-full sm:w-auto"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Travelers
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditTripOpen(true)}
              className="w-full sm:w-auto"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('pdf')}
              className="w-full sm:w-auto"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('excel')}
              className="w-full sm:w-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingSettlement(null);
                setSettlementPrefill({});
                setSettlementModalOpen(true);
              }}
              className="w-full sm:w-auto"
            >
              <Handshake className="w-3.5 h-3.5" />
              Settle Up
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingExpense(null);
                setExpenseFormOpen(true);
              }}
              className="w-full sm:w-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </Button>
          </div>
        </div>
      </Card>

      {/* Budget Progress Alert Strip */}
      {analytics.budgetPaise > 0 && (
        <Card className="p-4 sm:p-5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                Trip Budget Tracker
                {analytics.budgetStatus === 'exceeded' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Over budget
                  </span>
                )}
                {analytics.budgetStatus === 'approaching' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Approaching limit ({analytics.budgetPercentUsed}%)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {analytics.remainingBudgetPaise >= 0
                  ? `${formatAmount(analytics.remainingBudgetPaise)} remaining of ${formatAmount(analytics.budgetPaise)}`
                  : `${formatAmount(Math.abs(analytics.remainingBudgetPaise))} over your ${formatAmount(analytics.budgetPaise)} trip budget`}
              </p>
            </div>
            <div className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white">
              {formatAmount(analytics.totalSpentPaise)} / {formatAmount(analytics.budgetPaise)} (
              {analytics.budgetPercentUsed}%)
            </div>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                analytics.budgetStatus === 'exceeded'
                  ? 'bg-red-500'
                  : analytics.budgetStatus === 'approaching'
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
              }`}
              style={{ width: `${Math.min(100, analytics.budgetPercentUsed)}%` }}
            />
          </div>
          {trip.currency !== 'INR' && trip.exchangeRateUpdatedAt && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Stored FX reference: 1 {trip.currency} = ₹{trip.exchangeRateToInr} (updated{' '}
              {formatShortDate(trip.exchangeRateUpdatedAt)})
            </p>
          )}
        </Card>
      )}

      {/* TAB 1: EXPENSES */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <Card className="p-3.5 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, #tag, or traveler..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm min-w-0"
              >
                <option value="ALL">All categories</option>
                {categoryFilterOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm min-w-0"
              >
                <option value="ALL">All tags</option>
                {tripTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
              <select
                value={filterMember}
                onChange={(e) => setFilterMember(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm min-w-0"
              >
                <option value="ALL">All travelers</option>
                {Object.entries(trip.participantNames).map(([uid, name]) => (
                  <option key={uid} value={uid}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {filteredExpenses.length === 0 ? (
            <EmptyState
              icon={ReceiptIndianRupee}
              title="No trip expenses yet"
              description="Log shared flights, hotels, meals, or local transport for this trip."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingExpense(null);
                    setExpenseFormOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add Trip Expense
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {filteredExpenses.map((exp) => {
                const myShare = exp.shares.find((s) => s.uid === profile?.uid)?.sharePaise ?? 0;
                const myPaid = exp.payers.find((p) => p.uid === profile?.uid)?.amountPaise ?? 0;
                const myDelta = myPaid - myShare;
                const origCurr = isSupportedCurrency(exp.currency) ? exp.currency : 'INR';
                const origMinor = exp.originalAmountMinor || exp.amountPaise;
                const hasReceipt = Boolean(exp.receiptMetadata?.storagePath || exp.receiptImage);
                return (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => setDetailExpense(exp)}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {exp.title}
                        </p>
                        {hasReceipt && (
                          <Paperclip
                            className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                            aria-label="Receipt attached"
                          />
                        )}
                        {exp.tags && exp.tags.length > 0 && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate shrink-0">
                            {exp.tags.map((t) => `#${t}`).join(' · ')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {exp.category} · {formatShortDate(exp.expenseDate)} · Paid by{' '}
                        {exp.payers.map((p) => `${p.name} (${formatAmount(p.amountPaise)})`).join(', ')}
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                      <div className="text-right">
                        <span className="font-mono-nums text-sm font-bold text-slate-900 dark:text-white">
                          {formatAmount(exp.amountPaise)}
                        </span>
                        {origCurr !== 'INR' && (
                          <span className="ml-1.5 font-mono-nums text-[11px] text-slate-400">
                            ({formatOriginalCurrency(origMinor, origCurr)})
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-mono-nums text-xs ${
                          myDelta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : myDelta < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-400'
                        }`}
                      >
                        {myDelta > 0
                          ? `You lent ${formatAmount(myDelta)}`
                          : myDelta < 0
                            ? `Your share ${formatAmount(Math.abs(myDelta))}`
                            : 'Even'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: BALANCES & MEMBER BUDGETS */}
      {tab === 'balances' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Traveler ledger & personal budgets
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Zero-sum check: {analytics.zeroSumValid ? `Balanced (${formatAmount(0)})` : 'Pending'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Traveler</th>
                    <th className="text-right font-medium px-4 py-2.5">Paid</th>
                    <th className="text-right font-medium px-4 py-2.5">Share</th>
                    <th className="text-right font-medium px-4 py-2.5">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analytics.memberSummaries.map((m) => (
                    <tr key={m.uid}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                        </p>
                        {m.personalBudgetPaise > 0 && (
                          <p
                            className={`text-[11px] font-mono-nums ${
                              m.personalBudgetStatus === 'exceeded'
                                ? 'text-red-600 dark:text-red-400'
                                : m.personalBudgetStatus === 'approaching'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            Budget: {formatAmount(m.personalBudgetPaise)} ({m.personalBudgetPercent}%
                            used)
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-nums text-slate-600 dark:text-slate-300">
                        {formatAmount(m.expensePaidPaise + m.settlementPaidPaise)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-nums text-slate-600 dark:text-slate-300">
                        {formatAmount(m.expenseSharePaise + m.settlementReceivedPaise)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono-nums font-semibold ${
                          m.netBalancePaise > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : m.netBalancePaise < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {formatAmount(m.netBalancePaise, { showSign: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Simplified settlement plan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Minimum transfers to settle all trip balances
              </p>
            </div>
            {analytics.simplifiedDebts.length === 0 ? (
              <div className="p-8 text-center text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                All balances in this trip are settled ({baseCurrency} 0).
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.simplifiedDebts.map((debt, idx) => (
                  <div
                    key={`${debt.fromUid}_${debt.toUid}_${idx}`}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {debt.fromName} owes {debt.toName}
                      </p>
                      <p className="font-mono-nums text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {formatAmount(debt.amountPaise)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {debt.toUid === profile?.uid && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemind(debt.fromUid, debt.amountPaise)}
                        >
                          <BellRing className="w-3.5 h-3.5" />
                          Remind
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditingSettlement(null);
                          setSettlementPrefill({
                            fromUid: debt.fromUid,
                            toUid: debt.toUid,
                            amountPaise: debt.amountPaise,
                          });
                          setSettlementModalOpen(true);
                        }}
                      >
                        Settle Now
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: SETTLEMENTS */}
      {tab === 'settlements' && (
        <div className="space-y-4">
          {settlements.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="No trip settlements yet"
              description="Record UPI or cash transfers among travelers here."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingSettlement(null);
                    setSettlementPrefill({});
                    setSettlementModalOpen(true);
                  }}
                >
                  <Handshake className="w-4 h-4" />
                  Record Settlement
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {settlements.map((st) => {
                const isPayer = st.fromUid === profile?.uid;
                const isReceiver = st.toUid === profile?.uid;
                const receiverUpi = profilesMap[st.toUid]?.upiId;
                const upiLink = receiverUpi
                  ? buildUpiUri({
                      upiId: receiverUpi,
                      payeeName: st.toName,
                      amountInr: st.amountPaise / 100,
                      note: `${trip.name} settlement`,
                    })
                  : '';

                return (
                  <div
                    key={st.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {st.fromName} &rarr; {st.toName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {st.method.toUpperCase()} · Status:{' '}
                        <span
                          className={`font-semibold capitalize ${
                            st.status === 'confirmed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : st.status === 'disputed'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {st.status.replace('_', ' ')}
                        </span>
                        {st.upiTransactionRef ? ` · Ref: ${st.upiTransactionRef}` : ''}
                      </p>
                      {st.note && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{st.note}</p>
                      )}
                      {st.status === 'disputed' && st.disputeReason && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Dispute reason: {st.disputeReason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <span className="font-mono-nums text-base font-bold text-slate-900 dark:text-white mr-2">
                        {formatAmount(st.amountPaise)}
                      </span>

                      {isPayer && (st.status === 'pending' || st.status === 'disputed') && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setPayDialogSt(st);
                            setPayMethod(st.method);
                            setPayRef(st.upiTransactionRef || '');
                          }}
                        >
                          Pay / Mark Sent
                        </Button>
                      )}

                      {isReceiver && st.status !== 'confirmed' && (
                        <>
                          <Button
                            size="sm"
                            loading={confirmingSettlementId === st.id}
                            onClick={async () => {
                              if (!profile) return;
                              setConfirmingSettlementId(st.id);
                              try {
                                await confirmTripSettlement(profile, trip, st);
                                showToast('Payment confirmed', { variant: 'success' });
                              } catch (err: unknown) {
                                showToast('Could not confirm payment', {
                                  description: err instanceof Error ? err.message : 'Try again.',
                                  variant: 'error',
                                });
                              } finally {
                                setConfirmingSettlementId(null);
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm Receipt
                          </Button>
                          {st.status === 'awaiting_confirmation' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDisputeDialogSt(st);
                                setDisputeReason('');
                              }}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Dispute
                            </Button>
                          )}
                        </>
                      )}

                      {upiLink && isPayer && st.status !== 'confirmed' && (
                        <a
                          href={upiLink}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          UPI App
                        </a>
                      )}

                      {st.status !== 'confirmed' &&
                        (st.createdBy === profile?.uid || isPayer || isReceiver) && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingSettlement(st);
                                setSettlementModalOpen(true);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 dark:text-red-400"
                              onClick={() => setCancelSettlementTarget(st)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: DAY-BY-DAY TIMELINE */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {timelineDays.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No trip timeline entries yet"
              description="Expenses you log appear grouped by travel day here."
            />
          ) : (
            timelineDays.map((day) => (
              <Card key={day.date} className="overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono-nums">
                    {formatShortDate(day.date)}
                  </span>
                  <span className="font-mono-nums text-xs font-semibold text-slate-900 dark:text-white">
                    {formatAmount(day.totalPaise)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {day.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDetailExpense(item)}
                      className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.category} · Paid by {item.payers.map((p) => p.name).join(', ')}
                        </p>
                      </div>
                      <span className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white shrink-0">
                        {formatAmount(item.amountPaise)}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB 5: PARTICIPANTS & INVITES */}
      {tab === 'participants' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Participants ({trip.participantUids.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Equal permissions for all travelers — no admin or owner locks
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAddParticipantsOpen(true)}>
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {trip.participantUids.map((uid) => {
                const name = trip.participantNames[uid] || 'Traveler';
                const prof = profilesMap[uid];
                const isSelf = uid === profile?.uid;
                return (
                  <div key={uid} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={name} photoUrl={prof?.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {name} {isSelf ? '(You)' : ''}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {prof?.handle ? `@${prof.handle}` : 'Trip participant'}
                        </p>
                      </div>
                    </div>
                    {isSelf ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 dark:text-red-400"
                        onClick={() => setConfirmLeaveOpen(true)}
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Leave
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemoveParticipantTarget({ uid, name })}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Trip Invite Links
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Shareable cryptographic tokens for quick joining
                </p>
              </div>
              <Button
                size="sm"
                loading={creatingInvite}
                onClick={async () => {
                  if (!profile) return;
                  setCreatingInvite(true);
                  try {
                    await createTripInvite(profile, trip, { maxUses: 15, expiryDays: 14 });
                    showToast('Trip invite link created', { variant: 'success' });
                  } catch (err: unknown) {
                    showToast('Could not create invite', {
                      description: err instanceof Error ? err.message : 'Try again.',
                      variant: 'error',
                    });
                  } finally {
                    setCreatingInvite(false);
                  }
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                New Link
              </Button>
            </div>

            {tripInvites.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                No invite links generated yet. Create a link or add travelers from your Friends or
                Groups.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                {tripInvites.slice(0, 5).map((inv) => {
                  const url = buildTripInviteUrl(inv.token);
                  const expired = inv.expiresAt.toDate().getTime() < Date.now();
                  const isRevoked = inv.status === 'revoked';
                  const active = !expired && !isRevoked && inv.usesCount < inv.maxUses;
                  return (
                    <div key={inv.token} className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span
                          className={`font-medium ${
                            active
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isRevoked ? 'Revoked' : expired ? 'Expired' : 'Active'} ·{' '}
                          {inv.usesCount}/{inv.maxUses} used
                        </span>
                        {active && (
                          <button
                            type="button"
                            onClick={() =>
                              profile && revokeTripInvite(inv.token, profile, trip.id)
                            }
                            className="text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                      <p className="font-mono-nums text-[11px] text-slate-500 truncate">{url}</p>
                      {active && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await navigator.clipboard.writeText(url);
                              showToast('Trip link copied', { variant: 'success' });
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const msg = buildTripWhatsAppInviteMessage(
                                trip.name,
                                trip.destination,
                                url
                              );
                              window.open(
                                buildWhatsAppShareUrl(msg),
                                '_blank',
                                'noopener,noreferrer'
                              );
                            }}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              shareInviteLink({
                                title: `Join ${trip.name}`,
                                text: `Join "${trip.name}" on TallyCircle:`,
                                url,
                              })
                            }
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            Share
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmArchiveOpen(true)}>
                {trip.isArchived ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    Restore Trip
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" />
                    Archive Trip
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400"
                onClick={() => setConfirmDeleteTripOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Trip
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 6: ACTIVITY */}
      {tab === 'activity' && (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {activities.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Trip updates, expenses, and settlements appear here in real time.
            </div>
          ) : (
            activities.map((act) => (
              <div key={act.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                <p className="text-sm text-slate-800 dark:text-slate-200">{act.summary}</p>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTimestamp(act.createdAt?.toDate?.())}
                </span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Modals */}
      <TripModal open={editTripOpen} onClose={() => setEditTripOpen(false)} editingTrip={trip} />

      <AddTripParticipantsModal
        open={addParticipantsOpen}
        onClose={() => setAddParticipantsOpen(false)}
        trip={trip}
        invites={tripInvites}
      />

      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => {
          setExpenseFormOpen(false);
          setEditingExpense(null);
        }}
        defaultTripId={trip.id}
        editingExpense={editingExpense}
      />

      <ExpenseDetailModal
        open={Boolean(detailExpense)}
        onClose={() => setDetailExpense(null)}
        trip={trip}
        expense={detailExpense}
        onEdit={(exp) => {
          setDetailExpense(null);
          setEditingExpense(exp);
          setExpenseFormOpen(true);
        }}
      />

      <SettlementModal
        open={settlementModalOpen}
        onClose={() => {
          setSettlementModalOpen(false);
          setEditingSettlement(null);
        }}
        trip={trip}
        existingSettlements={settlements}
        editingSettlement={editingSettlement}
        initialFromUid={settlementPrefill.fromUid}
        initialToUid={settlementPrefill.toUid}
        initialAmountPaise={settlementPrefill.amountPaise}
      />

      {/* Mark Paid Dialog */}
      <Modal
        open={Boolean(payDialogSt)}
        onClose={() => setPayDialogSt(null)}
        title="Submit Trip Payment for Confirmation"
        subtitle={payDialogSt ? `${formatAmount(payDialogSt.amountPaise)} to ${payDialogSt.toName}` : ''}
        maxWidth="max-w-md"
      >
        {payDialogSt && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile || payingSettlement) return;
              setPayingSettlement(true);
              try {
                await markTripSettlementPaid(profile, trip, payDialogSt, {
                  method: payMethod,
                  upiTransactionRef: payRef,
                });
                showToast('Marked as paid — awaiting confirmation', { variant: 'success' });
                setPayDialogSt(null);
              } catch (err: unknown) {
                showToast('Could not submit payment', {
                  description: err instanceof Error ? err.message : 'Try again.',
                  variant: 'error',
                });
              } finally {
                setPayingSettlement(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {(['upi', 'cash'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`h-10 rounded-lg border text-sm font-medium uppercase cursor-pointer ${
                    payMethod === m
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {payMethod === 'upi' && (
              <InputField
                label="UPI transaction reference (optional)"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="UTR / Transaction ID"
              />
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayDialogSt(null)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" loading={payingSettlement} className="w-full sm:w-auto">
                Submit Payment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Dispute Dialog */}
      <Modal
        open={Boolean(disputeDialogSt)}
        onClose={() => setDisputeDialogSt(null)}
        title="Dispute Trip Settlement"
        maxWidth="max-w-md"
      >
        {disputeDialogSt && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile || disputingSettlement) return;
              setDisputingSettlement(true);
              try {
                await disputeTripSettlement(profile, trip, disputeDialogSt, disputeReason);
                showToast('Settlement flagged as disputed', { variant: 'info' });
                setDisputeDialogSt(null);
              } catch (err: unknown) {
                showToast('Could not dispute settlement', {
                  description: err instanceof Error ? err.message : 'Try again.',
                  variant: 'error',
                });
              } finally {
                setDisputingSettlement(false);
              }
            }}
            className="space-y-4"
          >
            <InputField
              label="Reason"
              placeholder="Payment not reflected yet"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              required
            />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisputeDialogSt(null)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={disputingSettlement}
                className="w-full sm:w-auto"
              >
                Confirm Dispute
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={confirmArchiveOpen}
        onClose={() => setConfirmArchiveOpen(false)}
        onConfirm={handleToggleArchive}
        title={trip.isArchived ? 'Restore trip?' : 'Archive trip?'}
        message={
          trip.isArchived
            ? `Restoring "${trip.name}" returns it to Active Trips.`
            : `Archiving "${trip.name}" moves it to Archived Trips while preserving all expenses and settlements.`
        }
        confirmLabel={trip.isArchived ? 'Restore' : 'Archive'}
        danger={false}
        loading={actionLoading}
      />

      <ConfirmModal
        open={confirmLeaveOpen}
        onClose={() => setConfirmLeaveOpen(false)}
        onConfirm={handleLeaveTrip}
        title="Leave trip?"
        message={`You will lose access to "${trip.name}" unless re-invited.`}
        confirmLabel="Leave Trip"
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(removeParticipantTarget)}
        onClose={() => setRemoveParticipantTarget(null)}
        onConfirm={handleRemoveParticipant}
        title={`Remove ${removeParticipantTarget?.name}?`}
        message={`Removing ${removeParticipantTarget?.name} revokes their access to "${trip.name}". Existing expense records stay preserved.`}
        confirmLabel="Remove"
        loading={actionLoading}
      />

      <ConfirmModal
        open={confirmDeleteTripOpen}
        onClose={() => setConfirmDeleteTripOpen(false)}
        onConfirm={handleDeleteTrip}
        title={`Delete "${trip.name}" permanently?`}
        message={`This permanently deletes "${trip.name}" along with all ${expenses.length} trip expense(s), receipts, settlements, and activity logs.`}
        confirmLabel="Delete Trip"
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(cancelSettlementTarget)}
        onClose={() => setCancelSettlementTarget(null)}
        onConfirm={handleCancelSettlement}
        title="Cancel pending settlement?"
        message={
          cancelSettlementTarget
            ? `Cancel ${formatAmount(cancelSettlementTarget.amountPaise)} (${cancelSettlementTarget.fromName} → ${cancelSettlementTarget.toName})?`
            : ''
        }
        confirmLabel="Cancel Settlement"
        loading={actionLoading}
      />
    </div>
  );
}
