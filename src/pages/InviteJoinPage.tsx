import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  Layers,
  Plane,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  BackendInviteValidationResult,
  getGroupInvite,
  joinGroupByToken,
  validateGroupInviteBackend,
} from '../services/groupService';
import {
  BackendTripInviteValidationResult,
  getTripInvite,
  joinTripByToken,
  validateTripInviteBackend,
} from '../services/tripService';
import { getFriendInvite, redeemFriendInvite } from '../services/friendService';
import { formatShortDate } from '../utils/helpers';
import { Button, Card } from '../components/ui/Primitives';

interface SharedInviteMeta {
  targetId: string;
  targetName: string;
  destination?: string;
  createdByName?: string;
  expiresAtIso?: string;
  usesCount: number;
  maxUses: number;
}

export function InviteJoinPage({ kind }: { kind: 'group' | 'trip' | 'friend' }) {
  const { token } = useParams<{ token: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');
  const [networkError, setNetworkError] = useState(false);
  const [alreadyMemberTargetId, setAlreadyMemberTargetId] = useState<string | null>(null);
  const [inviteMeta, setInviteMeta] = useState<SharedInviteMeta | null>(null);
  const [accepting, setAccepting] = useState(false);

  const loadInvite = useCallback(async () => {
    if (!token) {
      setError('Invalid invitation link.');
      setNetworkError(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setNetworkError(false);
    setAlreadyMemberTargetId(null);
    setInviteMeta(null);

    try {
      if (kind === 'group') {
        let validation: BackendInviteValidationResult | null = null;
        try {
          validation = await validateGroupInviteBackend(token);
        } catch {
          validation = null;
        }

        if (validation) {
          if (validation.reason === 'already_member' && validation.invite) {
            setAlreadyMemberTargetId(validation.group?.id || validation.invite.groupId);
            setTitle(validation.group?.name || validation.invite.groupName);
            setSubtitle('You are already an active member of this expense group.');
            setInviteMeta({
              targetId: validation.invite.groupId,
              targetName: validation.group?.name || validation.invite.groupName,
              createdByName: validation.invite.createdByName,
              expiresAtIso: validation.invite.expiresAtIso,
              usesCount: validation.invite.usesCount,
              maxUses: validation.invite.maxUses,
            });
            return;
          }

          if (!validation.valid) {
            setError(validation.message || 'This group invitation is unavailable.');
            return;
          }

          if (validation.invite) {
            setTitle(`Join "${validation.invite.groupName}"`);
            setSubtitle(
              'You will have equal permissions with all members to view, add, edit expenses, and record settlements.'
            );
            setInviteMeta({
              targetId: validation.invite.groupId,
              targetName: validation.invite.groupName,
              createdByName: validation.invite.createdByName,
              expiresAtIso: validation.invite.expiresAtIso,
              usesCount: validation.invite.usesCount,
              maxUses: validation.invite.maxUses,
            });
            return;
          }
        }

        const inv = await getGroupInvite(token);
        if (!inv) {
          setError('This group invitation link does not exist or has been removed.');
        } else if (inv.status === 'revoked') {
          setError('This group invitation link was revoked by a group member.');
        } else if (inv.expiresAt.toDate().getTime() < Date.now()) {
          setError('This group invitation link has expired.');
        } else if (inv.usesCount >= inv.maxUses) {
          setError('This group invitation link has reached its maximum usage limit.');
        } else if (profile && inv.usedBy.includes(profile.uid)) {
          setError('You already redeemed this invitation link previously. Ask a group member for a fresh link.');
        } else {
          setTitle(`Join "${inv.groupName}"`);
          setSubtitle(
            'You will have equal permissions with all members to view, add, edit expenses, and record settlements.'
          );
          setInviteMeta({
            targetId: inv.groupId,
            targetName: inv.groupName,
            createdByName: inv.createdByName,
            expiresAtIso: inv.expiresAt.toDate().toISOString(),
            usesCount: inv.usesCount,
            maxUses: inv.maxUses,
          });
        }
      } else if (kind === 'trip') {
        let validation: BackendTripInviteValidationResult | null = null;
        try {
          validation = await validateTripInviteBackend(token);
        } catch {
          validation = null;
        }

        if (validation) {
          if (validation.reason === 'already_member' && validation.invite) {
            setAlreadyMemberTargetId(validation.trip?.id || validation.invite.tripId || '');
            setTitle(validation.trip?.name || validation.invite.tripName || 'Trip');
            setSubtitle('You are already a participant on this trip.');
            setInviteMeta({
              targetId: validation.invite.tripId || '',
              targetName: validation.trip?.name || validation.invite.tripName || 'Trip',
              destination: validation.trip?.destination || validation.invite.destination,
              createdByName: validation.invite.createdByName,
              expiresAtIso: validation.invite.expiresAtIso,
              usesCount: validation.invite.usesCount,
              maxUses: validation.invite.maxUses,
            });
            return;
          }

          if (!validation.valid) {
            setError(validation.message || 'This trip invitation is unavailable.');
            return;
          }

          if (validation.invite) {
            setTitle(`Join trip "${validation.invite.tripName || 'Trip'}"`);
            setSubtitle(
              'You will have equal permissions with all travelers to view budgets, log trip expenses, upload receipts, and settle up.'
            );
            setInviteMeta({
              targetId: validation.invite.tripId || '',
              targetName: validation.invite.tripName || 'Trip',
              destination: validation.invite.destination,
              createdByName: validation.invite.createdByName,
              expiresAtIso: validation.invite.expiresAtIso,
              usesCount: validation.invite.usesCount,
              maxUses: validation.invite.maxUses,
            });
            return;
          }
        }

        const inv = await getTripInvite(token);
        if (!inv) {
          setError('This trip invitation link does not exist or has been removed.');
        } else if (inv.status === 'revoked') {
          setError('This trip invitation link was revoked by a participant.');
        } else if (inv.expiresAt.toDate().getTime() < Date.now()) {
          setError('This trip invitation link has expired.');
        } else if (inv.usesCount >= inv.maxUses) {
          setError('This trip invitation link has reached its maximum usage limit.');
        } else if (profile && inv.usedBy.includes(profile.uid)) {
          setError('You already redeemed this trip invitation link previously.');
        } else {
          setTitle(`Join trip "${inv.tripName}"`);
          setSubtitle(
            'You will have equal permissions with all travelers to view budgets, log trip expenses, upload receipts, and settle up.'
          );
          setInviteMeta({
            targetId: inv.tripId,
            targetName: inv.tripName,
            destination: inv.destination,
            createdByName: inv.createdByName,
            expiresAtIso: inv.expiresAt.toDate().toISOString(),
            usesCount: inv.usesCount,
            maxUses: inv.maxUses,
          });
        }
      } else {
        const inv = await getFriendInvite(token);
        if (!inv) {
          setError('This friend invitation does not exist or was revoked.');
        } else if (inv.expiresAt.toDate().getTime() < Date.now()) {
          setError('This friend invitation has expired.');
        } else if (inv.usesCount >= inv.maxUses) {
          setError('This friend invitation has reached its maximum usage limit.');
        } else {
          setTitle(`Connect with ${inv.creatorName}`);
          setSubtitle('Send a friend connection request so you can add each other to groups and trips.');
        }
      }
    } catch (err: unknown) {
      setNetworkError(true);
      setError(
        err instanceof Error
          ? err.message
          : 'Network error while validating invitation. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [kind, token, profile]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const handleAccept = async () => {
    if (!profile || !token) return;
    setAccepting(true);
    try {
      if (kind === 'group') {
        const res = await joinGroupByToken(profile, token);
        showToast(
          res.alreadyMember ? `Already a member of ${res.groupName}` : `Joined ${res.groupName}`,
          { variant: 'success' }
        );
        navigate(`/app/groups/${res.groupId}`);
      } else if (kind === 'trip') {
        const res = await joinTripByToken(profile, token);
        showToast(
          res.alreadyMember ? `Already part of ${res.tripName}` : `Joined trip ${res.tripName}`,
          { variant: 'success' }
        );
        navigate(`/app/trips/${res.tripId}`);
      } else {
        const res = await redeemFriendInvite(profile, token);
        showToast(
          res.status === 'already_friends'
            ? `Already friends with ${res.creatorName}`
            : res.status === 'accepted'
              ? `You are now friends with ${res.creatorName}`
              : `Friend request sent to ${res.creatorName}`,
          { variant: 'success' }
        );
        navigate('/app/friends');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not join using this invitation.';
      setError(msg);
      showToast('Could not accept invite', { description: msg, variant: 'error' });
    } finally {
      setAccepting(false);
    }
  };

  const listRoute = kind === 'trip' ? '/app/trips' : '/app/groups';
  const detailRoute =
    kind === 'trip' ? `/app/trips/${alreadyMemberTargetId}` : `/app/groups/${alreadyMemberTargetId}`;

  return (
    <div className="max-w-md mx-auto py-8 sm:py-12 px-2">
      <Card className="p-6 space-y-5">
        <div className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            {error ? (
              <AlertCircle className="w-6 h-6 text-red-500" />
            ) : alreadyMemberTargetId ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            ) : kind === 'trip' ? (
              <Plane className="w-6 h-6" />
            ) : kind === 'group' ? (
              <Layers className="w-6 h-6" />
            ) : (
              <Users className="w-6 h-6" />
            )}
          </div>

          {loading ? (
            <div className="space-y-2 py-2">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Validating invitation securely...
              </p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {networkError ? 'Could Not Verify Invitation' : 'Invitation Unavailable'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {error}
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5 pt-1">
                <Button variant="outline" onClick={() => navigate(listRoute)} className="w-full sm:w-auto">
                  {kind === 'trip' ? 'Go to Trips' : 'Go to Groups'}
                </Button>
                {networkError && (
                  <Button onClick={loadInvite} className="w-full sm:w-auto">
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
          ) : alreadyMemberTargetId ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {title}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {subtitle}
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5 pt-1">
                <Button variant="outline" onClick={() => navigate(listRoute)} className="w-full sm:w-auto">
                  {kind === 'trip' ? 'All Trips' : 'All Groups'}
                </Button>
                <Button onClick={() => navigate(detailRoute)} className="w-full sm:w-auto">
                  {kind === 'trip' ? 'Open Trip' : 'Open Group'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white break-words">
                  {title}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {subtitle}
                </p>
              </div>

              {inviteMeta && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 text-left space-y-2 text-xs">
                  {inviteMeta.destination && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Destination</span>
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {inviteMeta.destination}
                      </span>
                    </div>
                  )}
                  {inviteMeta.createdByName && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Invited by</span>
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {inviteMeta.createdByName}
                      </span>
                    </div>
                  )}
                  {inviteMeta.expiresAtIso && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Valid until
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatShortDate(inviteMeta.expiresAtIso)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Remaining spots
                    </span>
                    <span className="font-mono-nums font-medium text-slate-900 dark:text-white">
                      {Math.max(0, inviteMeta.maxUses - inviteMeta.usesCount)} of {inviteMeta.maxUses}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5 pt-2">
                <Button variant="outline" onClick={() => navigate('/app')} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button loading={accepting} onClick={handleAccept} className="w-full sm:w-auto">
                  <CheckCircle2 className="w-4 h-4" />
                  {kind === 'trip' ? 'Join Trip' : kind === 'group' ? 'Join Group' : 'Accept Invite'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
