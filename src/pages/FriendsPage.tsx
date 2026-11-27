import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  UserPlus,
  Check,
  X,
  UserMinus,
  Copy,
  Share2,
  Users,
  Link2,
  Pencil,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useToast } from '../contexts/ToastContext';
import type { FriendInvite, Friendship, PublicProfile } from '../types';
import { findUserByEmailOrHandle } from '../services/userService';
import {
  createFriendInvite,
  removeFriend,
  respondFriendRequest,
  revokeFriendInvite,
  sendFriendRequest,
  subscribeMyFriendInvites,
  updateFriendDetails,
} from '../services/friendService';
import { buildWhatsAppShareUrl } from '../utils/helpers';
import { Avatar, Button, Card, EmptyState, InputField, Modal } from '../components/ui/Primitives';
import { ConfirmModal } from '../components/modals/ConfirmModal';

export function FriendsPage() {
  const { profile } = useAuth();
  const { friendships, profilesMap, refreshProfiles } = useAppData();
  const { showToast } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    uid: string;
    displayName: string;
    handle: string;
    photoUrl?: string;
  } | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);

  const [myInvites, setMyInvites] = useState<FriendInvite[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<{
    publicProfile: PublicProfile;
    friendship: Friendship;
  } | null>(null);
  const [editingFriend, setEditingFriend] = useState<{
    friendship: Friendship;
    displayName: string;
  } | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingFriend, setSavingFriend] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ friendshipId: string; name: string } | null>(
    null
  );
  const [revokeInviteToken, setRevokeInviteToken] = useState<string | null>(null);
  const [cancelReqTarget, setCancelReqTarget] = useState<{ friendshipId: string; name: string } | null>(
    null
  );

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeMyFriendInvites(profile.uid, setMyInvites);
    return () => unsub();
  }, [profile?.uid]);

  const incomingRequests = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === 'pending' && f.recipientUid === profile?.uid
      ),
    [friendships, profile?.uid]
  );

  const outgoingRequests = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === 'pending' && f.requesterUid === profile?.uid
      ),
    [friendships, profile?.uid]
  );

  const acceptedFriends = useMemo(
    () => friendships.filter((f) => f.status === 'accepted'),
    [friendships]
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setSearching(true);
    setSearchAttempted(true);
    try {
      const found = await findUserByEmailOrHandle(searchInput);
      setSearchResult(found);
      if (found) await refreshProfiles([found.uid]);
    } catch (err: unknown) {
      showToast('Search failed', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetUid: string) => {
    if (!profile) return;
    try {
      const status = await sendFriendRequest(profile, targetUid);
      if (status === 'already_friends') {
        showToast('You are already friends', { variant: 'info' });
      } else if (status === 'already_pending') {
        showToast('Friend request is already pending', { variant: 'info' });
      } else {
        showToast('Friend request sent', { variant: 'success' });
      }
    } catch (err: unknown) {
      showToast('Could not send request', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    }
  };

  const handleCreateInvite = async () => {
    if (!profile) return;
    setCreatingInvite(true);
    try {
      await createFriendInvite(profile, { maxUses: 10, expiryDays: 7 });
      showToast('Friend invite link created', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Could not create invite', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/join/friend/${token}`;
    await navigator.clipboard.writeText(url);
    showToast('Friend invite link copied', { variant: 'success' });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search & Add Friends + Invites */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Find a registered friend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Search by exact email address or @handle. Becoming friends does not share group data.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="friend@email.com or @handle"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <Button type="submit" loading={searching}>
                Find
              </Button>
            </form>

            {searchAttempted && (
              <div className="pt-2">
                {searchResult ? (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={searchResult.displayName}
                        photoUrl={searchResult.photoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {searchResult.displayName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">@{searchResult.handle}</p>
                      </div>
                    </div>
                    {searchResult.uid !== profile?.uid ? (
                      <Button size="sm" onClick={() => handleSendRequest(searchResult.uid)}>
                        <UserPlus className="w-3.5 h-3.5" />
                        Add
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">You</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No registered user matched that email or handle. Send them an invite link below.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Shareable friend invite links
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Copy a personal invite link or send directly on WhatsApp.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              loading={creatingInvite}
              onClick={handleCreateInvite}
            >
              <Link2 className="w-4 h-4" />
              Create Invite Link
            </Button>

            {myInvites.length > 0 && (
              <div className="space-y-2.5 pt-2">
                {myInvites.map((inv) => {
                  const url = `${window.location.origin}/join/friend/${inv.token}`;
                  const waUrl = buildWhatsAppShareUrl(
                    `Connect with me on TallyCircle to split expenses easily: ${url}`
                  );
                  return (
                    <div
                      key={inv.token}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Used {inv.usesCount}/{inv.maxUses} · Expires{' '}
                          {inv.expiresAt.toDate().toLocaleDateString('en-IN')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRevokeInviteToken(inv.token)}
                          className="text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => copyLink(inv.token)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Link
                        </Button>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Requests & Friends List */}
        <div className="lg:col-span-2 space-y-6">
          {incomingRequests.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Incoming friend requests ({incomingRequests.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {incomingRequests.map((req) => {
                  const sender = profilesMap[req.requesterUid];
                  return (
                    <div key={req.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={sender?.displayName || 'User'}
                          photoUrl={sender?.photoUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {sender?.displayName || req.requesterUid}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            @{sender?.handle || 'member'}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!profile) return;
                            await respondFriendRequest(profile, req, 'accepted');
                            showToast('Friend request accepted', { variant: 'success' });
                          }}
                          className="w-full sm:w-auto"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!profile) return;
                            await respondFriendRequest(profile, req, 'rejected');
                            showToast('Request declined', { variant: 'info' });
                          }}
                          className="w-full sm:w-auto"
                        >
                          <X className="w-3.5 h-3.5" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {outgoingRequests.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Sent requests ({outgoingRequests.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {outgoingRequests.map((req) => {
                  const recipient = profilesMap[req.recipientUid];
                  return (
                    <div key={req.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={recipient?.displayName || 'User'}
                          photoUrl={recipient?.photoUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {recipient?.displayName || req.recipientUid}
                          </p>
                          <p className="text-xs text-slate-500">Pending acceptance</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setCancelReqTarget({
                            friendshipId: req.id,
                            name: recipient?.displayName || 'this request',
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Friends ({acceptedFriends.length})
              </h3>
            </div>
            {acceptedFriends.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Users}
                  title="No friends connected yet"
                  description="Search by email or @handle, or share your invite link to add friends."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {acceptedFriends.map((fr) => {
                  const otherUid = fr.users.find((u) => u !== profile?.uid) || '';
                  const friend = profilesMap[otherUid];
                  const baseName = friend?.displayName || otherUid;
                  const nickname = profile?.uid ? fr.nicknames?.[profile.uid]?.trim() : '';
                  const personalNote = profile?.uid ? fr.notes?.[profile.uid]?.trim() : '';
                  const displayName = nickname || baseName;
                  return (
                    <div
                      key={fr.id}
                      className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => friend && setViewingProfile({ publicProfile: friend, friendship: fr })}
                        className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                      >
                        <Avatar name={displayName} photoUrl={friend?.photoUrl} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {displayName}
                            {nickname && (
                              <span className="ml-1.5 text-xs font-normal text-slate-400">
                                ({baseName})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            @{friend?.handle || 'member'}
                            {friend?.upiId ? ` · UPI: ${friend.upiId}` : ''}
                            {personalNote ? ` · ${personalNote}` : ''}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center justify-end gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit details for ${displayName}`}
                          onClick={() => {
                            setEditingFriend({ friendship: fr, displayName: baseName });
                            setEditNickname(nickname || '');
                            setEditNote(personalNote || '');
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {friend && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewingProfile({ publicProfile: friend, friendship: fr })}
                          >
                            Profile
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${displayName}`}
                          className="text-red-600 dark:text-red-400"
                          onClick={() => setRemoveTarget({ friendshipId: fr.id, name: displayName })}
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Edit Friend Details Modal */}
      <Modal
        open={Boolean(editingFriend)}
        onClose={() => setEditingFriend(null)}
        title={`Edit ${editingFriend?.displayName || 'Friend'}`}
        subtitle="Add a private nickname or note visible only to you."
        maxWidth="max-w-md"
      >
        {editingFriend && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!profile) return;
              setSavingFriend(true);
              try {
                await updateFriendDetails(profile, editingFriend.friendship, {
                  nickname: editNickname,
                  note: editNote,
                });
                showToast('Friend details updated', { variant: 'success' });
                setEditingFriend(null);
              } catch (err: unknown) {
                showToast('Could not save details', {
                  description: err instanceof Error ? err.message : 'Try again.',
                  variant: 'error',
                });
              } finally {
                setSavingFriend(false);
              }
            }}
            className="space-y-4"
          >
            <InputField
              label="Personal nickname (optional)"
              placeholder="e.g., College Roomie"
              value={editNickname}
              onChange={(e) => setEditNickname(e.target.value)}
              maxLength={60}
            />
            <InputField
              label="Private note (optional)"
              placeholder="e.g., Prefers GPay / settles monthly"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              maxLength={250}
            />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingFriend(null)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" loading={savingFriend} className="w-full sm:w-auto">
                Save Details
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Friend Profile Modal (Public info only — no private PII) */}
      <Modal
        open={Boolean(viewingProfile)}
        onClose={() => setViewingProfile(null)}
        title="Friend Profile"
        maxWidth="max-w-sm"
      >
        {viewingProfile && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <Avatar
                name={viewingProfile.publicProfile.displayName}
                photoUrl={viewingProfile.publicProfile.photoUrl}
                size="lg"
              />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {viewingProfile.publicProfile.displayName}
              </h3>
              <p className="text-xs text-slate-500">@{viewingProfile.publicProfile.handle}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-left text-xs space-y-1.5">
              {profile?.uid && viewingProfile.friendship.nicknames?.[profile.uid] && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Your nickname</span>
                  <span className="text-slate-900 dark:text-white font-medium">
                    {viewingProfile.friendship.nicknames[profile.uid]}
                  </span>
                </div>
              )}
              {profile?.uid && viewingProfile.friendship.notes?.[profile.uid] && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Your note</span>
                  <span className="text-slate-900 dark:text-white text-right">
                    {viewingProfile.friendship.notes[profile.uid]}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">UPI ID</span>
                <span className="font-mono-nums text-slate-900 dark:text-white">
                  {viewingProfile.publicProfile.upiId || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Member since</span>
                <span className="text-slate-900 dark:text-white">
                  {viewingProfile.publicProfile.createdAt?.toDate?.().toLocaleDateString('en-IN') || '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          await removeFriend(removeTarget.friendshipId);
          showToast(`Removed ${removeTarget.name}`, { variant: 'info' });
          setRemoveTarget(null);
        }}
        title={`Remove ${removeTarget?.name}?`}
        message="Removing a friend does not delete shared historical expenses in groups."
        confirmLabel="Remove Friend"
      />

      <ConfirmModal
        open={Boolean(cancelReqTarget)}
        onClose={() => setCancelReqTarget(null)}
        onConfirm={async () => {
          if (!cancelReqTarget) return;
          await removeFriend(cancelReqTarget.friendshipId);
          showToast('Friend request cancelled', { variant: 'info' });
          setCancelReqTarget(null);
        }}
        title="Cancel friend request?"
        message={`Withdraw your pending friend request to ${cancelReqTarget?.name}?`}
        confirmLabel="Cancel Request"
      />

      <ConfirmModal
        open={Boolean(revokeInviteToken)}
        onClose={() => setRevokeInviteToken(null)}
        onConfirm={async () => {
          if (!revokeInviteToken) return;
          await revokeFriendInvite(revokeInviteToken);
          showToast('Invite link revoked', { variant: 'info' });
          setRevokeInviteToken(null);
        }}
        title="Revoke friend invite link?"
        message="Anyone with this link will no longer be able to send you a friend request using it."
        confirmLabel="Revoke Link"
      />
    </div>
  );
}
