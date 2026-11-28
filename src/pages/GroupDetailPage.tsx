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
  RefreshCw,
  Mail,
  MessageCircle,
  Paperclip,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import {
  EXPENSE_CATEGORIES,
  Expense,
  GroupEmailInvite,
  GroupInvite,
  Settlement,
} from '../types';
import {
  computeGroupBalances,
  formatOriginalCurrency,
  isSupportedCurrency,
} from '../utils/finance';
import {
  buildGroupInviteUrl,
  buildGroupWhatsAppInviteMessage,
  buildUpiUri,
  buildWhatsAppShareUrl,
  formatRelativeTimestamp,
  formatShortDate,
  GROUP_COVER_PRESETS,
  isValidSafeUrl,
  shareInviteLink,
} from '../utils/helpers';
import {
  addMemberToGroup,
  cancelEmailInvite,
  createGroupInvite,
  deleteGroupWithData,
  regenerateGroupInvite,
  removeOrLeaveMember,
  revokeGroupInvite,
  subscribeGroupEmailInvites,
  subscribeGroupInvites,
  updateGroupDetails,
} from '../services/groupService';
import {
  confirmSettlement,
  deleteSettlement,
  disputeSettlement,
  markSettlementPaid,
} from '../services/settlementService';
import { sendPaymentReminder } from '../services/notificationService';
import { Avatar, Button, Card, EmptyState, InputField, Modal } from '../components/ui/Primitives';
import { GroupModal } from '../components/modals/GroupModal';
import { ExpenseFormModal } from '../components/modals/ExpenseFormModal';
import { ExpenseDetailModal } from '../components/modals/ExpenseDetailModal';
import { SettlementModal } from '../components/modals/SettlementModal';
import { ConfirmModal } from '../components/modals/ConfirmModal';
import { AddMembersModal, AddMembersTab } from '../components/modals/AddMembersModal';

type GroupTab = 'expenses' | 'balances' | 'settlements' | 'timeline' | 'members' | 'activity';

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { profile } = useAuth();
  const {
    groups,
    expensesByGroup,
    settlementsByGroup,
    activitiesByGroup,
    acceptedFriendUids,
    profilesMap,
  } = useAppData();
  const { baseCurrency, formatAmount } = useCurrency();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const group = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId]);
  const expenses = group ? expensesByGroup[group.id] || [] : [];
  const settlements = group ? settlementsByGroup[group.id] || [] : [];
  const activities = group ? activitiesByGroup[group.id] || [] : [];

  const [tab, setTab] = useState<GroupTab>('expenses');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterTag, setFilterTag] = useState('ALL');
  const [filterMember, setFilterMember] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Modals
  const [editGroupOpen, setEditGroupOpen] = useState(false);
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
  const [confirmDeleteGroupOpen, setConfirmDeleteGroupOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ uid: string; name: string } | null>(null);
  const [cancelSettlementTarget, setCancelSettlementTarget] = useState<Settlement | null>(null);
  const [revokeInviteToken, setRevokeInviteToken] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Invites & Add Members Modal
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMembersTab, setAddMembersTab] = useState<AddMembersTab>('friends');
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [emailInvites, setEmailInvites] = useState<GroupEmailInvite[]>([]);
  const [inviteMaxUses, setInviteMaxUses] = useState('15');
  const [inviteExpiryDays, setInviteExpiryDays] = useState('7');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState<string | null>(null);
  const [cancelEmailTarget, setCancelEmailTarget] = useState<GroupEmailInvite | null>(null);
  const [selectedFriendToAdd, setSelectedFriendToAdd] = useState('');
  const [addingQuickFriend, setAddingQuickFriend] = useState(false);

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
    if (!profile?.uid || !group?.id) return;
    const unsubInvites = subscribeGroupInvites(
      group.id,
      profile.uid,
      setGroupInvites,
      (err) => {
        showToast('Could not sync group invites', { description: err.message, variant: 'error' });
      }
    );
    const unsubEmailInvites = subscribeGroupEmailInvites(
      group.id,
      setEmailInvites,
      (err) => {
        showToast('Could not sync email invitations', { description: err.message, variant: 'error' });
      }
    );
    return () => {
      unsubInvites();
      unsubEmailInvites();
    };
  }, [profile?.uid, group?.id, showToast]);

  const { totalExpenditurePaise, memberBalances, simplifiedDebts } = useMemo(() => {
    if (!group) return { totalExpenditurePaise: 0, memberBalances: [], simplifiedDebts: [] };
    return computeGroupBalances(group.memberNames, expenses, settlements);
  }, [group, expenses, settlements]);

  const groupTags = useMemo(() => {
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
      const dateStr = e.expenseDate.slice(0, 10);
      if (filterDateFrom && dateStr < filterDateFrom) return false;
      if (filterDateTo && dateStr > filterDateTo) return false;
      return true;
    });
  }, [expenses, searchQuery, filterCategory, filterTag, filterMember, filterDateFrom, filterDateTo]);

  // Trip Timeline grouped by YYYY-MM-DD
  const timelineDays = useMemo(() => {
    const byDay = new Map<string, { date: string; totalPaise: number; items: Expense[] }>();
    for (const exp of expenses) {
      const day = exp.expenseDate.slice(0, 10) || 'Unknown';
      if (!byDay.has(day)) {
        byDay.set(day, { date: day, totalPaise: 0, items: [] });
      }
      const bucket = byDay.get(day)!;
      bucket.totalPaise += exp.amountPaise;
      bucket.items.push(exp);
    }
    return Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses]);

  const friendsNotInGroup = useMemo(() => {
    if (!group) return [];
    return acceptedFriendUids
      .filter((uid) => !group.memberUids.includes(uid))
      .map((uid) => profilesMap[uid])
      .filter(Boolean);
  }, [group, acceptedFriendUids, profilesMap]);

  if (!group) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Group not found or you do not have access to it.
        </p>
        <Button variant="outline" onClick={() => navigate('/groups')}>
          <ArrowLeft className="w-4 h-4" />
          Back to Groups
        </Button>
      </Card>
    );
  }

  const cover = isValidSafeUrl(group.coverImage)
    ? group.coverImage
    : GROUP_COVER_PRESETS[0].url;
  const myNet = memberBalances.find((m) => m.uid === profile?.uid)?.netBalancePaise ?? 0;

  const handleToggleArchive = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await updateGroupDetails(profile, group, { isArchived: !group.isArchived });
      showToast(group.isArchived ? 'Group restored' : 'Group archived', { variant: 'success' });
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

  const handleLeaveGroup = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await removeOrLeaveMember(profile, group, profile.uid);
      showToast('You left the group', {
        description: 'Historical expense records remain intact for remaining members.',
        variant: 'info',
      });
      setConfirmLeaveOpen(false);
      navigate('/groups');
    } catch (err: unknown) {
      showToast('Cannot leave group', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!profile || !removeMemberTarget) return;
    setActionLoading(true);
    try {
      await removeOrLeaveMember(profile, group, removeMemberTarget.uid);
      showToast(`Removed ${removeMemberTarget.name}`, { variant: 'success' });
      setRemoveMemberTarget(null);
    } catch (err: unknown) {
      showToast('Could not remove member', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await deleteGroupWithData(profile, group);
      showToast(`Deleted "${group.name}"`, { variant: 'info' });
      setConfirmDeleteGroupOpen(false);
      navigate('/groups');
    } catch (err: unknown) {
      showToast('Could not delete group', {
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
      await deleteSettlement(group.id, cancelSettlementTarget.id);
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

  const handleRevokeInvite = async () => {
    if (!revokeInviteToken || !profile) return;
    setActionLoading(true);
    try {
      await revokeGroupInvite(revokeInviteToken, profile, group.id);
      showToast('Invite link revoked', { variant: 'info' });
      setRevokeInviteToken(null);
    } catch (err: unknown) {
      showToast('Could not revoke invite', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateInvite = async (oldToken: string) => {
    if (!profile) return;
    setRegeneratingToken(oldToken);
    try {
      await regenerateGroupInvite(profile, group, oldToken, {
        maxUses: parseInt(inviteMaxUses, 10) || 15,
        expiryDays: parseInt(inviteExpiryDays, 10) || 7,
      });
      showToast('Old link revoked & new invite generated', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not regenerate invite', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setRegeneratingToken(null);
    }
  };

  const handleCancelEmailInvite = async () => {
    if (!profile || !cancelEmailTarget) return;
    setActionLoading(true);
    try {
      await cancelEmailInvite(profile, group, cancelEmailTarget);
      showToast(`Cancelled email invite for ${cancelEmailTarget.email}`, { variant: 'info' });
      setCancelEmailTarget(null);
    } catch (err: unknown) {
      showToast('Could not cancel email invite', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!profile || !selectedFriendToAdd || addingQuickFriend) return;
    const friend = profilesMap[selectedFriendToAdd];
    if (!friend) return;
    setAddingQuickFriend(true);
    try {
      await addMemberToGroup(profile, group, friend);
      setSelectedFriendToAdd('');
      showToast(`${friend.displayName} added to ${group.name}`, { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not add member', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setAddingQuickFriend(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!profile) return;
    setCreatingInvite(true);
    try {
      await createGroupInvite(profile, group, {
        maxUses: parseInt(inviteMaxUses, 10) || 15,
        expiryDays: parseInt(inviteExpiryDays, 10) || 7,
      });
      showToast('Group invite link created', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not create invite', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInviteUrl = async (token: string) => {
    const url = buildGroupInviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied', { variant: 'success' });
    } catch {
      showToast('Clipboard access failed', {
        description: 'Copy the invitation link manually or use Share.',
        variant: 'error',
      });
    }
  };

  const handleShareInvite = async (token: string) => {
    const url = buildGroupInviteUrl(token);
    const msg = buildGroupWhatsAppInviteMessage(group.name, url);
    try {
      const mode = await shareInviteLink({
        title: `Join "${group.name}" on TallyCircle`,
        text: msg,
        url,
      });
      if (mode === 'copied') {
        showToast('Invite link copied to clipboard', { variant: 'success' });
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      showToast('Could not share link', {
        description: err instanceof Error ? err.message : 'Try copying the link.',
        variant: 'error',
      });
    }
  };

  const openAddMembers = (initial: AddMembersTab = 'friends') => {
    setAddMembersTab(initial);
    setAddMembersOpen(true);
  };

  const handleRemind = async (debtFromUid: string, amountPaise: number) => {
    if (!profile) return;
    try {
      await sendPaymentReminder({
        senderUid: profile.uid,
        senderName: profile.fullName,
        recipientUid: debtFromUid,
        groupId: group.id,
        groupName: group.name,
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
      {/* Group Banner Header */}
      <Card className="overflow-hidden">
        <div className="relative min-h-[168px] sm:h-48 bg-slate-900 flex flex-col justify-between p-4 sm:p-5">
          <img
            src={cover}
            alt={group.name}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/25" />
          <div className="relative z-10">
            <button
              type="button"
              onClick={() => navigate('/groups')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/65 hover:bg-slate-950/85 text-white px-3 min-h-[36px] py-1.5 text-xs font-medium backdrop-blur-xs cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Groups
            </button>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3 text-white pt-4">
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold break-words line-clamp-2">
                {group.name}
                {group.isArchived ? ' (Archived)' : ''}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200/90 mt-0.5 line-clamp-2">
                {group.description || `${group.memberUids.length} members · Equal permissions`}
              </p>
            </div>
            <div className="flex items-center gap-5 shrink-0 sm:text-right">
              <div>
                <p className="text-[11px] text-slate-300">Total spent</p>
                <p className="font-mono-nums text-sm sm:text-base font-bold">
                  {formatAmount(totalExpenditurePaise)}
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

        <div className="px-3.5 sm:px-5 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 lg:pb-0">
            {(
              [
                { id: 'expenses', label: `Expenses (${expenses.length})` },
                { id: 'balances', label: 'Balances' },
                { id: 'settlements', label: `Settlements (${settlements.length})` },
                { id: 'timeline', label: 'Trip Timeline' },
                { id: 'members', label: `Members (${group.memberUids.length})` },
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
            <Button size="sm" variant="outline" onClick={() => openAddMembers('friends')} className="w-full sm:w-auto">
              <UserPlus className="w-3.5 h-3.5" />
              Add Members
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditGroupOpen(true)} className="w-full sm:w-auto">
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmArchiveOpen(true)} className="w-full sm:w-auto">
              {group.isArchived ? (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </>
              )}
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
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete group"
              title="Delete group"
              className="text-red-600 dark:text-red-400 col-span-2 sm:col-span-1 w-full sm:w-auto"
              onClick={() => setConfirmDeleteGroupOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </Card>

      {/* TAB 1: EXPENSES */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <Card className="p-3.5 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 sm:gap-3">
              <div className="relative sm:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, #tag, or member..."
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
                {groupTags.map((t) => (
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
                <option value="ALL">All members</option>
                {Object.entries(group.memberNames).map(([uid, name]) => (
                  <option key={uid} value={uid}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  aria-label="From date"
                  className="w-full min-w-0 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  aria-label="To date"
                  className="w-full min-w-0 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
                />
              </div>
            </div>
            {(searchQuery ||
              filterCategory !== 'ALL' ||
              filterTag !== 'ALL' ||
              filterMember !== 'ALL' ||
              filterDateFrom ||
              filterDateTo) && (
              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Showing {filteredExpenses.length} of {expenses.length} expense(s)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterCategory('ALL');
                    setFilterTag('ALL');
                    setFilterMember('ALL');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                  className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            )}
          </Card>

          {filteredExpenses.length === 0 ? (
            <EmptyState
              icon={ReceiptIndianRupee}
              title="No matching expenses"
              description="Add a shared bill or clear your active search filters."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingExpense(null);
                    setExpenseFormOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add Expense
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
                        {(exp.receiptMetadata?.storagePath || exp.receiptImage) && (
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

      {/* TAB 2: BALANCES & DEBT SIMPLIFICATION */}
      {tab === 'balances' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Member ledger summary
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Net Balance = Total Paid − Total Expense Share (reconciles to {formatAmount(0)})
              </p>
            </div>

            {/* Mobile Stacked Member Balance Cards */}
            <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {memberBalances.map((m) => (
                <div key={m.uid} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                    </span>
                    <span
                      className={`font-mono-nums text-sm font-bold shrink-0 ${
                        m.netBalancePaise > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : m.netBalancePaise < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {formatAmount(m.netBalancePaise, { showSign: true })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Paid:{' '}
                      <span className="font-mono-nums font-medium text-slate-700 dark:text-slate-200">
                        {formatAmount(m.expensePaidPaise + m.settlementPaidPaise)}
                      </span>
                    </span>
                    <span>
                      Share:{' '}
                      <span className="font-mono-nums font-medium text-slate-700 dark:text-slate-200">
                        {formatAmount(m.expenseSharePaise + m.settlementReceivedPaise)}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet & Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Member</th>
                    <th className="text-right font-medium px-4 py-2.5">Paid</th>
                    <th className="text-right font-medium px-4 py-2.5">Share</th>
                    <th className="text-right font-medium px-4 py-2.5">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {memberBalances.map((m) => (
                    <tr key={m.uid}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {m.name} {m.uid === profile?.uid ? '(You)' : ''}
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
                Minimum transfers required to settle all group balances
              </p>
            </div>
            {simplifiedDebts.length === 0 ? (
              <div className="p-8 text-center text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                All balances in this group are settled ({baseCurrency} 0).
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {simplifiedDebts.map((debt, idx) => (
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
              title="No settlements recorded yet"
              description="Record UPI or cash transfers here. Only confirmed settlements reduce outstanding balances."
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
                      note: `${group.name} settlement`,
                    })
                  : '';

                return (
                  <div key={st.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {st.fromName} → {st.toName}
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
                            disabled={Boolean(confirmingSettlementId && confirmingSettlementId !== st.id)}
                            onClick={async () => {
                              if (!profile || confirmingSettlementId) return;
                              setConfirmingSettlementId(st.id);
                              try {
                                await confirmSettlement(profile, group, st);
                                showToast('Settlement confirmed', { variant: 'success' });
                              } catch (err: unknown) {
                                showToast('Could not confirm settlement', {
                                  description: err instanceof Error ? err.message : 'Try again.',
                                  variant: 'error',
                                });
                              } finally {
                                setConfirmingSettlementId(null);
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm
                          </Button>
                          {st.status !== 'disputed' && (
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

                      {st.status !== 'confirmed' &&
                        (st.createdBy === profile?.uid || isPayer || isReceiver) && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Edit pending settlement"
                              title="Edit pending settlement"
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
                              aria-label="Cancel pending settlement"
                              title="Cancel pending settlement"
                              className="text-red-600 dark:text-red-400"
                              onClick={() => setCancelSettlementTarget(st)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                    </div>

                    {isPayer && st.status === 'pending' && upiLink && (
                      <div className="p-2 bg-white rounded-lg border border-slate-200 w-fit shrink-0">
                        <QRCodeSVG value={upiLink} size={88} />
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: TRIP TIMELINE */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {(group.startDate || group.endDate) && (
            <Card className="p-4 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                Trip window: <strong>{group.startDate || 'Flexible'}</strong> to{' '}
                <strong>{group.endDate || 'Ongoing'}</strong>
              </span>
            </Card>
          )}

          {timelineDays.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No timeline entries yet"
              description="Expenses will organize automatically into daily spending totals here."
            />
          ) : (
            <div className="space-y-4">
              {timelineDays.map((day) => (
                <Card key={day.date} className="overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {formatShortDate(day.date)}
                    </span>
                    <span className="font-mono-nums text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Daily total: {formatAmount(day.totalPaise)}
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
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.category} · Paid by {item.payers.map((p) => p.name).join(', ')}
                            {item.tags && item.tags.length > 0
                              ? ` · ${item.tags.map((t) => `#${t}`).join(' ')}`
                              : ''}
                          </p>
                        </div>
                        <span className="font-mono-nums text-sm font-medium text-slate-900 dark:text-white">
                          {formatAmount(item.amountPaise)}
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: MEMBERS & INVITES */}
      {tab === 'members' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden h-fit">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Group members ({group.memberUids.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Every member has equal permissions. Historical expenses are preserved if someone leaves.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => openAddMembers('friends')}>
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Members
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 dark:text-red-400"
                  onClick={() => setConfirmLeaveOpen(true)}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Leave
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirmDeleteGroupOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
              </div>
            </div>

            {friendsNotInGroup.length > 0 && (
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  value={selectedFriendToAdd}
                  onChange={(e) => setSelectedFriendToAdd(e.target.value)}
                  className="flex-1 min-w-0 h-10 sm:h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                >
                  <option value="">Quick-add a connected friend...</option>
                  {friendsNotInGroup.map((f) => (
                    <option key={f.uid} value={f.uid}>
                      {f.displayName} (@{f.handle})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddFriend}
                    loading={addingQuickFriend}
                    disabled={!selectedFriendToAdd}
                    className="flex-1 sm:flex-initial"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openAddMembers('friends')}>
                    Multi-Select
                  </Button>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {group.memberUids.map((uid) => {
                const name = group.memberNames[uid] || profilesMap[uid]?.displayName || 'Member';
                const pub = profilesMap[uid];
                const memberEmail =
                  group.memberEmails?.[uid] || (uid === profile?.uid ? profile.email : '');
                const joinedDateRaw =
                  group.memberJoinedAt?.[uid] ||
                  group.createdAt?.toDate?.()?.toISOString?.() ||
                  '';
                const joinedDateLabel = joinedDateRaw ? formatShortDate(joinedDateRaw) : 'Active';

                return (
                  <div key={uid} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={name} photoUrl={pub?.photoUrl} size="sm" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {name} {uid === profile?.uid ? '(You)' : ''}
                          </p>
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {memberEmail || (pub?.handle ? `@${pub.handle}` : 'Member')} · Joined {joinedDateLabel}
                        </p>
                        {pub?.upiId && (
                          <p className="text-[11px] font-mono-nums text-slate-400 truncate">
                            UPI: {pub.upiId}
                          </p>
                        )}
                      </div>
                    </div>
                    {uid !== profile?.uid && group.memberUids.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 dark:text-red-400 shrink-0"
                        onClick={() => setRemoveMemberTarget({ uid, name })}
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

          <div className="space-y-6">
            <Card className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Shareable group invitation links
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Cryptographically random tokens with expiration and usage limits.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openAddMembers('email_whatsapp')}>
                  <Mail className="w-3.5 h-3.5" />
                  Email / WA
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="Expires in (days)"
                  type="number"
                  min="1"
                  max="90"
                  value={inviteExpiryDays}
                  onChange={(e) => setInviteExpiryDays(e.target.value)}
                />
                <InputField
                  label="Max uses"
                  type="number"
                  min="1"
                  max="100"
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(e.target.value)}
                />
              </div>

              <Button onClick={handleGenerateInvite} loading={creatingInvite} className="w-full">
                Generate Group Invite Link
              </Button>

              {groupInvites.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  {groupInvites.map((inv) => {
                    const isRevoked = inv.status === 'revoked';
                    const isExpired = (inv.expiresAt?.toDate?.()?.getTime?.() ?? Infinity) < Date.now();
                    const isExhausted = inv.usesCount >= inv.maxUses;
                    const isActive = !isRevoked && !isExpired && !isExhausted;
                    const statusLabel = isRevoked
                      ? 'Revoked'
                      : isExpired
                        ? 'Expired'
                        : isExhausted
                          ? 'Limit Reached'
                          : 'Active';
                    const statusClass = isRevoked
                      ? 'text-red-600 dark:text-red-400'
                      : isExpired
                        ? 'text-amber-600 dark:text-amber-400'
                        : isExhausted
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-emerald-600 dark:text-emerald-400';

                    const url = buildGroupInviteUrl(inv.token);
                    const waUrl = buildWhatsAppShareUrl(
                      buildGroupWhatsAppInviteMessage(group.name, url)
                    );

                    return (
                      <div
                        key={inv.token}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <div>
                            <span className={`font-semibold ${statusClass}`}>{statusLabel}</span>
                            {' · '}
                            <span className="font-mono-nums">
                              Used {inv.usesCount}/{inv.maxUses}
                            </span>
                            {' · '}
                            <span>
                              Expires {inv.expiresAt?.toDate?.()?.toLocaleDateString('en-IN') || '—'}
                            </span>
                          </div>
                          {isActive && (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                disabled={regeneratingToken === inv.token}
                                onClick={() => handleRegenerateInvite(inv.token)}
                                className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${
                                    regeneratingToken === inv.token ? 'animate-spin' : ''
                                  }`}
                                />
                                Regenerate
                              </button>
                              <button
                                type="button"
                                onClick={() => setRevokeInviteToken(inv.token)}
                                className="text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyInviteUrl(inv.token)}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </Button>
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0 sm:h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleShareInvite(inv.token)}
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
            </Card>

            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Email invitations ({emailInvites.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pending, accepted, and cancelled invitations sent by email.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openAddMembers('email_whatsapp')}>
                  <Mail className="w-3.5 h-3.5" />
                  Invite by Email
                </Button>
              </div>
              {emailInvites.length === 0 ? (
                <p className="p-5 text-xs text-slate-500 dark:text-slate-400 text-center">
                  No email invitations recorded for this group yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {emailInvites.map((ei) => (
                    <div
                      key={ei.id}
                      className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {ei.email}
                          {ei.existingUserName ? ` · ${ei.existingUserName}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className={`font-semibold capitalize ${
                              ei.status === 'accepted'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : ei.status === 'cancelled'
                                  ? 'text-slate-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {ei.status}
                          </span>
                          {' · '}
                          {ei.deliveryStatus === 'sent'
                            ? 'Email delivered'
                            : ei.deliveryStatus === 'failed'
                              ? 'Email failed — use link'
                              : 'Link saved'}
                          {ei.invitedByName ? ` · By ${ei.invitedByName}` : ''}
                        </p>
                      </div>
                      {ei.status === 'pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(ei.inviteUrl);
                                showToast('Invitation link copied', { variant: 'success' });
                              } catch {
                                showToast('Clipboard access failed', {
                                  description: 'Unable to copy invitation link automatically.',
                                  variant: 'error',
                                });
                              }
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Link
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 dark:text-red-400"
                            onClick={() => setCancelEmailTarget(ei)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 6: ACTIVITY */}
      {tab === 'activity' && (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {activities.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No group activity recorded yet.
            </div>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <p className="text-sm text-slate-800 dark:text-slate-200">{a.summary}</p>
                <span className="text-xs text-slate-400 shrink-0">
                  {formatRelativeTimestamp(a.createdAt?.toDate?.())}
                </span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Modals */}
      <GroupModal
        open={editGroupOpen}
        onClose={() => setEditGroupOpen(false)}
        editingGroup={group}
      />

      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => {
          setExpenseFormOpen(false);
          setEditingExpense(null);
        }}
        defaultGroupId={group.id}
        editingExpense={editingExpense}
      />

      <ExpenseDetailModal
        open={Boolean(detailExpense)}
        onClose={() => setDetailExpense(null)}
        group={group}
        expense={detailExpense}
        onEdit={(exp) => {
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
        group={group}
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
        title="Submit Payment for Confirmation"
        subtitle={
          payDialogSt
            ? `${formatAmount(payDialogSt.amountPaise)} to ${payDialogSt.toName}`
            : ''
        }
        maxWidth="max-w-md"
      >
        {payDialogSt && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile || payingSettlement) return;
              setPayingSettlement(true);
              try {
                await markSettlementPaid(profile, group, payDialogSt, {
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
              <Button type="button" variant="outline" onClick={() => setPayDialogSt(null)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" loading={payingSettlement} className="w-full sm:w-auto">Submit Payment</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Dispute Dialog */}
      <Modal
        open={Boolean(disputeDialogSt)}
        onClose={() => setDisputeDialogSt(null)}
        title="Dispute Settlement"
        maxWidth="max-w-md"
      >
        {disputeDialogSt && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile || disputingSettlement) return;
              setDisputingSettlement(true);
              try {
                await disputeSettlement(profile, group, disputeDialogSt, disputeReason);
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
              placeholder="Payment not reflected in bank statement yet"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              required
            />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDisputeDialogSt(null)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={disputingSettlement} className="w-full sm:w-auto">
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
        title={group.isArchived ? 'Restore group?' : 'Archive group?'}
        message={
          group.isArchived
            ? `Restoring "${group.name}" returns it to your active groups list.`
            : `Archiving "${group.name}" moves it to Archived Groups while preserving all expenses, receipts, and settlement history.`
        }
        confirmLabel={group.isArchived ? 'Restore' : 'Archive'}
        danger={false}
        loading={actionLoading}
      />

      <ConfirmModal
        open={confirmLeaveOpen}
        onClose={() => setConfirmLeaveOpen(false)}
        onConfirm={handleLeaveGroup}
        title="Leave group?"
        message={`You will lose access to "${group.name}" unless re-invited. Historical expense records will be preserved for remaining members.`}
        confirmLabel="Leave Group"
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(removeMemberTarget)}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={handleRemoveMember}
        title={`Remove ${removeMemberTarget?.name}?`}
        message={`Removing ${removeMemberTarget?.name} revokes their access to "${group.name}". Historical expense records will remain preserved.`}
        confirmLabel="Remove Member"
        loading={actionLoading}
      />

      <ConfirmModal
        open={confirmDeleteGroupOpen}
        onClose={() => setConfirmDeleteGroupOpen(false)}
        onConfirm={handleDeleteGroup}
        title={`Delete "${group.name}" permanently?`}
        message={`This permanently deletes "${group.name}", along with all ${expenses.length} expense(s), notes, settlements, and activity logs. This action cannot be undone.`}
        confirmLabel="Delete Group"
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(cancelSettlementTarget)}
        onClose={() => setCancelSettlementTarget(null)}
        onConfirm={handleCancelSettlement}
        title="Cancel pending settlement?"
        message={
          cancelSettlementTarget
            ? `Cancel and remove the ${formatAmount(cancelSettlementTarget.amountPaise)} settlement (${cancelSettlementTarget.fromName} → ${cancelSettlementTarget.toName})?`
            : ''
        }
        confirmLabel="Cancel Settlement"
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(revokeInviteToken)}
        onClose={() => setRevokeInviteToken(null)}
        onConfirm={handleRevokeInvite}
        title="Revoke group invite link?"
        message="Anyone who opens this link afterwards will see that it has been revoked and cannot join."
        confirmLabel="Revoke Invite"
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(cancelEmailTarget)}
        onClose={() => setCancelEmailTarget(null)}
        onConfirm={handleCancelEmailInvite}
        title="Cancel pending email invitation?"
        message={`Withdraw the pending email invitation for ${cancelEmailTarget?.email}?`}
        confirmLabel="Cancel Invite"
        loading={actionLoading}
      />

      <AddMembersModal
        open={addMembersOpen}
        onClose={() => setAddMembersOpen(false)}
        group={group}
        invites={groupInvites}
        emailInvites={emailInvites}
        initialTab={addMembersTab}
      />
    </div>
  );
}
