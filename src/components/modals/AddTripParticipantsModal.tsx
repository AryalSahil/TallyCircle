import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Layers,
  Link2,
  MessageCircle,
  RefreshCw,
  Share2,
  UserPlus,
  Users,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useToast } from '../../contexts/ToastContext';
import type { PublicProfile, Trip, TripInvite } from '../../types';
import {
  addParticipantsToTrip,
  createTripInvite,
  revokeTripInvite,
} from '../../services/tripService';
import {
  buildTripInviteUrl,
  buildTripWhatsAppInviteMessage,
  buildWhatsAppShareUrl,
  formatShortDate,
  shareInviteLink,
} from '../../utils/helpers';
import { Avatar, Button, Modal } from '../ui/Primitives';

export function AddTripParticipantsModal({
  open,
  onClose,
  trip,
  invites,
}: {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  invites: TripInvite[];
}) {
  const { profile } = useAuth();
  const { acceptedFriendUids, profilesMap, groups } = useAppData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'friends' | 'group' | 'link'>('friends');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [adding, setAdding] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  const availableFriends = useMemo(
    () =>
      acceptedFriendUids
        .filter((uid) => !trip.participantUids.includes(uid))
        .map((uid) => profilesMap[uid])
        .filter((p): p is PublicProfile => Boolean(p)),
    [acceptedFriendUids, trip.participantUids, profilesMap]
  );

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  const importableGroupMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.memberUids
      .filter((uid) => !trip.participantUids.includes(uid))
      .map((uid) => {
        if (profilesMap[uid]) return profilesMap[uid];
        const fallbackName = selectedGroup.memberNames[uid] || 'Member';
        return {
          uid,
          displayName: fallbackName,
          handle: fallbackName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user',
          createdAt: trip.createdAt,
          updatedAt: trip.updatedAt,
        } satisfies PublicProfile;
      });
  }, [selectedGroup, trip.participantUids, profilesMap, trip.createdAt, trip.updatedAt]);

  const activeInvite = useMemo(
    () =>
      invites.find(
        (inv) =>
          inv.status !== 'revoked' &&
          inv.expiresAt.toDate().getTime() > Date.now() &&
          inv.usesCount < inv.maxUses
      ) || null,
    [invites]
  );

  const handleAddSelectedFriends = async () => {
    if (!profile || selectedFriends.length === 0) return;
    const toAdd = availableFriends.filter((f) => selectedFriends.includes(f.uid));
    setAdding(true);
    try {
      const res = await addParticipantsToTrip(profile, trip, toAdd);
      showToast(
        res.added.length === 1
          ? `${res.added[0].displayName} added to trip`
          : `${res.added.length} friends added to trip`,
        { variant: 'success' }
      );
      setSelectedFriends([]);
      onClose();
    } catch (err: unknown) {
      showToast('Could not add participants', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleImportGroupMembers = async () => {
    if (!profile || importableGroupMembers.length === 0) return;
    setAdding(true);
    try {
      const res = await addParticipantsToTrip(profile, trip, importableGroupMembers);
      showToast(`Imported ${res.added.length} participant(s) from ${selectedGroup?.name}`, {
        variant: 'success',
      });
      setSelectedGroupId('');
      onClose();
    } catch (err: unknown) {
      showToast('Could not import group members', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!profile) return;
    setCreatingLink(true);
    try {
      await createTripInvite(profile, trip, { maxUses: 15, expiryDays: 14 });
      showToast('Trip invite link created', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not generate link', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setCreatingLink(false);
    }
  };

  const activeUrl = activeInvite ? buildTripInviteUrl(activeInvite.token) : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite to ${trip.name}`}
      subtitle="Every trip participant gets equal permissions to log expenses and settle up"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          {(
            [
              { id: 'friends', label: 'Friends', icon: Users },
              { id: 'group', label: 'From Group', icon: Layers },
              { id: 'link', label: 'Invite Link', icon: Link2 },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center justify-center gap-1.5 px-2.5 min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {tab === 'friends' && (
          <div className="space-y-3">
            {availableFriends.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                All your connected friends are already in this trip.
              </p>
            ) : (
              <>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {availableFriends.map((f) => {
                    const checked = selectedFriends.includes(f.uid);
                    return (
                      <button
                        key={f.uid}
                        type="button"
                        onClick={() =>
                          setSelectedFriends((prev) =>
                            prev.includes(f.uid) ? prev.filter((x) => x !== f.uid) : [...prev, f.uid]
                          )
                        }
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={f.displayName} photoUrl={f.photoUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                              {f.displayName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              @{f.handle}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                            checked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Button
                  className="w-full"
                  loading={adding}
                  disabled={selectedFriends.length === 0}
                  onClick={handleAddSelectedFriends}
                >
                  <UserPlus className="w-4 h-4" />
                  Add Selected ({selectedFriends.length})
                </Button>
              </>
            )}
          </div>
        )}

        {tab === 'group' && (
          <div className="space-y-3">
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                No existing groups found to import participants from.
              </p>
            ) : (
              <>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="">Select an existing group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberUids.length} members)
                    </option>
                  ))}
                </select>
                {selectedGroup && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {importableGroupMembers.length === 0
                      ? 'Everyone in this group is already part of this trip.'
                      : `${importableGroupMembers.length} member(s) ready to import: ${importableGroupMembers
                          .map((m) => m.displayName)
                          .join(', ')}`}
                  </p>
                )}
                <Button
                  className="w-full"
                  loading={adding}
                  disabled={importableGroupMembers.length === 0}
                  onClick={handleImportGroupMembers}
                >
                  <Layers className="w-4 h-4" />
                  Import {importableGroupMembers.length} Participant(s)
                </Button>
              </>
            )}
          </div>
        )}

        {tab === 'link' && (
          <div className="space-y-3">
            {!activeInvite ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generate a secure cryptographically random invite link valid for 14 days (up to 15 uses).
                </p>
                <Button loading={creatingLink} onClick={handleGenerateInvite} className="w-full">
                  <Link2 className="w-4 h-4" />
                  Generate Trip Invite Link
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
                  <p className="font-mono-nums text-xs text-slate-700 dark:text-slate-300 break-all select-all">
                    {activeUrl}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeInvite.usesCount}/{activeInvite.maxUses} used · Expires{' '}
                    {formatShortDate(activeInvite.expiresAt.toDate().toISOString())}
                  </p>
                </div>

                <div className="flex justify-center p-3 bg-white rounded-xl border border-slate-200 w-fit mx-auto">
                  <QRCodeSVG value={activeUrl} size={136} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(activeUrl);
                      showToast('Trip invite link copied', { variant: 'success' });
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
                        activeUrl
                      );
                      window.open(buildWhatsAppShareUrl(msg), '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="col-span-2 sm:col-span-1"
                    onClick={async () => {
                      const shared = await shareInviteLink({
                        title: `Join trip ${trip.name} on TallyCircle`,
                        text: `Join "${trip.name}" (${trip.destination}) on TallyCircle:`,
                        url: activeUrl,
                      });
                      if (shared === 'copied') showToast('Copied to clipboard', { variant: 'success' });
                    }}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </Button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      profile && revokeTripInvite(activeInvite.token, profile, trip.id)
                    }
                    className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Revoke link
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateInvite}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Generate another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
