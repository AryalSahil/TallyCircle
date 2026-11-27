import React, { useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Link2,
  Mail,
  Search,
  Check,
  X,
  Copy,
  Share2,
  RefreshCw,
  Ban,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useToast } from '../../contexts/ToastContext';
import type { Group, GroupEmailInvite, GroupInvite, PublicProfile } from '../../types';
import {
  addMembersToGroup,
  cancelEmailInvite,
  createEmailInvites,
  createGroupInvite,
  regenerateGroupInvite,
  revokeGroupInvite,
} from '../../services/groupService';
import {
  buildGroupInviteUrl,
  buildGroupWhatsAppInviteMessage,
  buildWhatsAppShareUrl,
  formatShortDate,
  isValidEmailAddress,
  shareInviteLink,
} from '../../utils/helpers';
import { Avatar, Button, InputField, Modal } from '../ui/Primitives';
import { ConfirmModal } from './ConfirmModal';

export type AddMembersTab = 'friends' | 'link' | 'email_whatsapp';

function getInviteState(inv: GroupInvite): {
  label: 'Active' | 'Revoked' | 'Expired' | 'Limit Reached';
  isActive: boolean;
  toneClass: string;
} {
  if (inv.status === 'revoked') {
    return {
      label: 'Revoked',
      isActive: false,
      toneClass: 'text-red-600 dark:text-red-400',
    };
  }
  const expiresMs = inv.expiresAt?.toDate?.()?.getTime?.() ?? Infinity;
  if (expiresMs < Date.now()) {
    return {
      label: 'Expired',
      isActive: false,
      toneClass: 'text-amber-600 dark:text-amber-400',
    };
  }
  if (inv.usesCount >= inv.maxUses) {
    return {
      label: 'Limit Reached',
      isActive: false,
      toneClass: 'text-slate-500 dark:text-slate-400',
    };
  }
  return {
    label: 'Active',
    isActive: true,
    toneClass: 'text-emerald-600 dark:text-emerald-400',
  };
}

export function AddMembersModal({
  open,
  onClose,
  group,
  invites,
  emailInvites,
  initialTab = 'friends',
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
  invites: GroupInvite[];
  emailInvites: GroupEmailInvite[];
  initialTab?: AddMembersTab;
}) {
  const { profile } = useAuth();
  const { acceptedFriendUids, profilesMap } = useAppData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<AddMembersTab>(initialTab);

  // Tab 1: Existing Friends
  const [friendSearch, setFriendSearch] = useState('');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [confirmingFriends, setConfirmingFriends] = useState(false);
  const [addingFriends, setAddingFriends] = useState(false);

  // Tab 2: Link Invitations
  const [expiryDays, setExpiryDays] = useState('7');
  const [maxUses, setMaxUses] = useState('15');
  const [creatingLink, setCreatingLink] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<GroupInvite | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Tab 3: Email & WhatsApp
  const [emailsInput, setEmailsInput] = useState('');
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    checked: boolean;
    configured: boolean;
  }>({ checked: false, configured: false });
  const [lastEmailBatchResult, setLastEmailBatchResult] = useState<{
    inviteUrl: string;
    createdCount: number;
    skipped: Array<{ email: string; reason: string }>;
    emailDelivered: boolean;
    providerMessage: string;
  } | null>(null);
  const [cancelEmailTarget, setCancelEmailTarget] = useState<GroupEmailInvite | null>(null);
  const [cancellingEmail, setCancellingEmail] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setConfirmingFriends(false);
      setLastEmailBatchResult(null);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || tab !== 'email_whatsapp' || emailStatus.checked) return;
    let active = true;
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/invitations/email-status', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { configured?: boolean };
        if (active) {
          setEmailStatus({ checked: true, configured: Boolean(data.configured) });
        }
      } catch {
        if (active) {
          setEmailStatus({ checked: true, configured: false });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, tab, emailStatus.checked]);

  const friendsNotInGroup = useMemo(() => {
    return acceptedFriendUids
      .filter((uid) => !group.memberUids.includes(uid))
      .map((uid) => profilesMap[uid])
      .filter((p): p is PublicProfile => Boolean(p));
  }, [acceptedFriendUids, group.memberUids, profilesMap]);

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return friendsNotInGroup;
    return friendsNotInGroup.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.handle.toLowerCase().includes(q)
    );
  }, [friendsNotInGroup, friendSearch]);

  const selectedFriends = useMemo(
    () =>
      selectedUids
        .map((uid) => profilesMap[uid])
        .filter((p): p is PublicProfile => Boolean(p)),
    [selectedUids, profilesMap]
  );

  const activeInvites = useMemo(
    () => invites.filter((inv) => getInviteState(inv).isActive),
    [invites]
  );

  const parsedEmailTokens = useMemo(
    () =>
      Array.from(
        new Set(
          emailsInput
            .split(/[\s,;]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
    [emailsInput]
  );

  const validParsedEmails = useMemo(
    () => parsedEmailTokens.filter((e) => isValidEmailAddress(e)),
    [parsedEmailTokens]
  );

  const toggleFriendSelection = (uid: string) => {
    setConfirmingFriends(false);
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleConfirmAddFriends = async () => {
    if (!profile || selectedFriends.length === 0) return;
    setAddingFriends(true);
    try {
      const res = await addMembersToGroup(profile, group, selectedFriends);
      if (res.added.length > 0) {
        showToast(
          res.added.length === 1
            ? `${res.added[0].displayName} added to ${group.name}`
            : `Added ${res.added.length} members to ${group.name}`,
          { variant: 'success' }
        );
      } else {
        showToast('Selected friends are already in this group', { variant: 'info' });
      }
      setSelectedUids([]);
      setFriendSearch('');
      setConfirmingFriends(false);
      onClose();
    } catch (err: unknown) {
      showToast('Could not add members', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setAddingFriends(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!profile) return;
    setCreatingLink(true);
    try {
      await createGroupInvite(profile, group, {
        expiryDays: parseInt(expiryDays, 10) || 7,
        maxUses: parseInt(maxUses, 10) || 15,
      });
      showToast('Invitation link generated', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not generate link', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopyInvite = async (token: string) => {
    const url = buildGroupInviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invitation link copied', { variant: 'success' });
    } catch {
      showToast('Clipboard permission denied', {
        description: url,
        variant: 'error',
      });
    }
  };

  const handleNativeShare = async (token: string) => {
    const url = buildGroupInviteUrl(token);
    const message = buildGroupWhatsAppInviteMessage(group.name, url);
    try {
      const mode = await shareInviteLink({
        title: `Join "${group.name}" on TallyCircle`,
        text: message,
        url,
      });
      if (mode === 'copied') {
        showToast('Invite link copied to clipboard', { variant: 'success' });
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      showToast('Could not share link', {
        description: err instanceof Error ? err.message : 'Try copying the link instead.',
        variant: 'error',
      });
    }
  };

  const handleRegenerateInvite = async (oldToken: string) => {
    if (!profile) return;
    setRegeneratingToken(oldToken);
    try {
      await regenerateGroupInvite(profile, group, oldToken, {
        expiryDays: parseInt(expiryDays, 10) || 7,
        maxUses: parseInt(maxUses, 10) || 15,
      });
      showToast('Previous link revoked & new invite generated', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not regenerate link', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setRegeneratingToken(null);
    }
  };

  const handleSendEmails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSendingEmails(true);
    setLastEmailBatchResult(null);
    try {
      const res = await createEmailInvites(profile, group, parsedEmailTokens, emailInvites);
      const firstUrl = res.created[0]?.inviteUrl || '';
      setLastEmailBatchResult({
        inviteUrl: firstUrl,
        createdCount: res.created.length,
        skipped: res.skipped,
        emailDelivered: res.emailDelivered,
        providerMessage: res.providerMessage,
      });

      if (res.created.length > 0) {
        setEmailsInput('');
        showToast(
          res.emailDelivered
            ? `Sent ${res.created.length} email invitation(s)`
            : `Saved ${res.created.length} pending email invite(s)`,
          {
            description: res.emailDelivered
              ? 'Recipients can click the emailed link to join.'
              : 'Share the generated link directly or via WhatsApp.',
            variant: res.emailDelivered ? 'success' : 'info',
          }
        );
      } else {
        showToast('No new email invitations sent', {
          description: res.providerMessage,
          variant: 'info',
        });
      }
    } catch (err: unknown) {
      showToast('Email invite failed', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSendingEmails(false);
    }
  };

  const handleQuickWhatsAppShare = async () => {
    if (!profile) return;
    let targetInvite = activeInvites[0];
    if (!targetInvite) {
      setCreatingLink(true);
      try {
        targetInvite = await createGroupInvite(profile, group, {
          expiryDays: 7,
          maxUses: 15,
        });
      } catch (err: unknown) {
        showToast('Could not prepare invite link', {
          description: err instanceof Error ? err.message : 'Try again.',
          variant: 'error',
        });
        return;
      } finally {
        setCreatingLink(false);
      }
    }
    const url = buildGroupInviteUrl(targetInvite.token);
    const waHref = buildWhatsAppShareUrl(buildGroupWhatsAppInviteMessage(group.name, url));
    window.open(waHref, '_blank', 'noopener,noreferrer');
  };

  const pendingEmailInvites = useMemo(
    () => emailInvites.filter((i) => i.status === 'pending'),
    [emailInvites]
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Add Members to "${group.name}"`}
        subtitle="All members share equal permissions to manage expenses and settlements."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5">
          {/* 3-Tab Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTab('friends')}
              className={`flex items-center justify-center gap-1.5 min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tab === 'friends'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Add Friends</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('link')}
              className={`flex items-center justify-center gap-1.5 min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tab === 'link'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Invite Link</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('email_whatsapp')}
              className={`flex items-center justify-center gap-1.5 min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tab === 'email_whatsapp'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Email / WhatsApp</span>
            </button>
          </div>

          {/* TAB 1: ADD EXISTING FRIENDS */}
          {tab === 'friends' && (
            <div className="space-y-4">
              {friendsNotInGroup.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    No unadded friends available
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    All your connected friends are already in this group, or you haven&apos;t added friends yet. Share an invite link or invite by email instead.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setTab('link')}>
                      <Link2 className="w-3.5 h-3.5" />
                      Generate Invite Link
                    </Button>
                    <Button size="sm" onClick={() => setTab('email_whatsapp')}>
                      <Mail className="w-3.5 h-3.5" />
                      Invite by Email / WhatsApp
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      placeholder="Search friends by name or @handle..."
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>

                  {selectedFriends.length > 0 && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-emerald-900 dark:text-emerald-200">
                          Selected ({selectedFriends.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUids([]);
                            setConfirmingFriends(false);
                          }}
                          className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFriends.map((f) => (
                          <button
                            key={f.uid}
                            type="button"
                            onClick={() => toggleFriendSelection(f.uid)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                          >
                            <span>{f.displayName}</span>
                            <X className="w-3 h-3 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredFriends.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-500">
                        No friends matched &ldquo;{friendSearch}&rdquo;.
                      </p>
                    ) : (
                      filteredFriends.map((f) => {
                        const checked = selectedUids.includes(f.uid);
                        return (
                          <button
                            key={f.uid}
                            type="button"
                            onClick={() => toggleFriendSelection(f.uid)}
                            className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                              checked
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={f.displayName} photoUrl={f.photoUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                  {f.displayName}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  @{f.handle}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {confirmingFriends && selectedFriends.length > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Confirm adding {selectedFriends.length}{' '}
                        {selectedFriends.length === 1 ? 'friend' : 'friends'}?
                      </p>
                      <p>
                        {selectedFriends.map((f) => f.displayName).join(', ')} will immediately gain equal member access to &ldquo;{group.name}&rdquo;.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                    {!confirmingFriends ? (
                      <Button
                        type="button"
                        disabled={selectedFriends.length === 0}
                        onClick={() => setConfirmingFriends(true)}
                        className="w-full sm:w-auto"
                      >
                        Continue ({selectedFriends.length})
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        loading={addingFriends}
                        onClick={handleConfirmAddFriends}
                        className="w-full sm:w-auto"
                      >
                        <Check className="w-4 h-4" />
                        Confirm &amp; Add Members
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: INVITE LINK */}
          {tab === 'link' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    label="Expires in (days)"
                    type="number"
                    min="1"
                    max="90"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                  />
                  <InputField
                    label="Usage limit"
                    type="number"
                    min="1"
                    max="100"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                  />
                </div>
                <Button onClick={handleGenerateInvite} loading={creatingLink} className="w-full">
                  <Link2 className="w-4 h-4" />
                  Generate Secure Invite Link
                </Button>
              </div>

              {invites.length === 0 ? (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-3">
                  No invitation links generated for this group yet.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-0.5">
                  {invites.map((inv) => {
                    const state = getInviteState(inv);
                    const url = buildGroupInviteUrl(inv.token);
                    const waUrl = buildWhatsAppShareUrl(
                      buildGroupWhatsAppInviteMessage(group.name, url)
                    );
                    return (
                      <div
                        key={inv.token}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${state.toneClass}`}>
                                {state.label}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono-nums text-slate-600 dark:text-slate-300">
                                {inv.usesCount}/{inv.maxUses} used
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                Expires {formatShortDate(inv.expiresAt?.toDate?.()?.toISOString?.() || '')}
                              </span>
                            </div>
                            {inv.createdByName && (
                              <p className="text-[11px] text-slate-400">
                                Created by {inv.createdByName}
                              </p>
                            )}
                          </div>
                          {state.isActive && (
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
                                onClick={() => setRevokeTarget(inv)}
                                className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                              >
                                <Ban className="w-3 h-3" />
                                Revoke
                              </button>
                            </div>
                          )}
                        </div>

                        {state.isActive && (
                          <>
                            <p className="font-mono-nums text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 truncate">
                              {url}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopyInvite(inv.token)}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copy
                              </Button>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0 sm:h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                WhatsApp
                              </a>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleNativeShare(inv.token)}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                Share
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INVITE BY EMAIL OR WHATSAPP */}
          {tab === 'email_whatsapp' && (
            <div className="space-y-4">
              {emailStatus.checked && !emailStatus.configured && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Outbound email delivery is not configured yet (<code className="font-mono-nums">RESEND_API_KEY</code> unset). Submitting below still saves tracked pending invites, notifies existing TallyCircle users in-app, and generates a shareable link for WhatsApp or clipboard.
                  </p>
                </div>
              )}

              <form onSubmit={handleSendEmails} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email address(es)
                  </label>
                  <textarea
                    rows={2}
                    value={emailsInput}
                    onChange={(e) => setEmailsInput(e.target.value)}
                    placeholder="rohan@example.com, priya@example.com"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Separate multiple emails with commas or new lines. Duplicates and existing members are automatically filtered.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Button
                    type="submit"
                    loading={sendingEmails}
                    disabled={validParsedEmails.length === 0}
                    className="w-full"
                  >
                    <Mail className="w-4 h-4" />
                    Send Email Invite{validParsedEmails.length > 1 ? `s (${validParsedEmails.length})` : ''}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    loading={creatingLink}
                    onClick={handleQuickWhatsAppShare}
                    className="w-full text-emerald-700 dark:text-emerald-300"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Invite via WhatsApp
                  </Button>
                </div>
              </form>

              {lastEmailBatchResult && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {lastEmailBatchResult.createdCount > 0
                          ? `Created ${lastEmailBatchResult.createdCount} tracked invitation(s).`
                          : 'No new invitations created.'}
                      </p>
                      {lastEmailBatchResult.providerMessage && (
                        <p className="text-slate-500 dark:text-slate-400">
                          {lastEmailBatchResult.providerMessage}
                        </p>
                      )}
                      {lastEmailBatchResult.skipped.length > 0 && (
                        <ul className="text-amber-700 dark:text-amber-300 space-y-0.5 pt-1">
                          {lastEmailBatchResult.skipped.map((s) => (
                            <li key={s.email}>
                              Skipped {s.email}: {s.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  {lastEmailBatchResult.inviteUrl && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(lastEmailBatchResult.inviteUrl);
                          showToast('Invite link copied', { variant: 'success' });
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy Invite Link
                      </Button>
                      <a
                        href={buildWhatsAppShareUrl(
                          buildGroupWhatsAppInviteMessage(group.name, lastEmailBatchResult.inviteUrl)
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Share on WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              )}

              {pendingEmailInvites.length > 0 && (
                <div className="space-y-2 pt-1">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Pending Email Invitations ({pendingEmailInvites.length})
                  </h4>
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {pendingEmailInvites.map((ei) => (
                      <div key={ei.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                            {ei.email}
                            {ei.existingUserName ? ` (${ei.existingUserName})` : ''}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {ei.deliveryStatus === 'sent'
                              ? 'Email sent · Pending join'
                              : 'Link saved · Share link or WhatsApp'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCancelEmailTarget(ei)}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={async () => {
          if (!profile || !revokeTarget) return;
          setRevoking(true);
          try {
            await revokeGroupInvite(revokeTarget.token, profile, group.id);
            showToast('Invitation link revoked', { variant: 'info' });
            setRevokeTarget(null);
          } catch (err: unknown) {
            showToast('Could not revoke link', {
              description: err instanceof Error ? err.message : 'Try again.',
              variant: 'error',
            });
          } finally {
            setRevoking(false);
          }
        }}
        title="Revoke invitation link?"
        message="Anyone who opens this link afterwards will see that it has been revoked and cannot join."
        confirmLabel="Revoke Link"
        loading={revoking}
      />

      <ConfirmModal
        open={Boolean(cancelEmailTarget)}
        onClose={() => setCancelEmailTarget(null)}
        onConfirm={async () => {
          if (!profile || !cancelEmailTarget) return;
          setCancellingEmail(true);
          try {
            await cancelEmailInvite(profile, group, cancelEmailTarget);
            showToast(`Cancelled invite for ${cancelEmailTarget.email}`, { variant: 'info' });
            setCancelEmailTarget(null);
          } catch (err: unknown) {
            showToast('Could not cancel invitation', {
              description: err instanceof Error ? err.message : 'Try again.',
              variant: 'error',
            });
          } finally {
            setCancellingEmail(false);
          }
        }}
        title="Cancel pending email invitation?"
        message={`Withdraw the pending invitation record for ${cancelEmailTarget?.email}?`}
        confirmLabel="Cancel Invite"
        loading={cancellingEmail}
      />
    </>
  );
}
