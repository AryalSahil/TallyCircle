import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getGroupInvite, joinGroupByToken } from '../services/groupService';
import { getFriendInvite, redeemFriendInvite } from '../services/friendService';
import { Button, Card } from '../components/ui/Primitives';

export function InviteJoinPage({ kind }: { kind: 'group' | 'friend' }) {
  const { token } = useParams<{ token: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation token.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        if (kind === 'group') {
          const inv = await getGroupInvite(token);
          if (!inv) {
            setError('This group invitation does not exist or was revoked.');
          } else if (inv.expiresAt.toDate().getTime() < Date.now()) {
            setError('This group invitation has expired.');
          } else if (inv.usesCount >= inv.maxUses) {
            setError('This group invitation has reached its maximum usage limit.');
          } else {
            setTitle(`Join "${inv.groupName}"`);
            setSubtitle('You will have equal permissions with all other members in this group.');
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
            setSubtitle('Send a friend connection request so you can add each other to expense groups.');
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not load invitation.');
      } finally {
        setLoading(false);
      }
    })();
  }, [kind, token]);

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
        navigate(`/groups/${res.groupId}`);
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
        navigate('/friends');
      }
    } catch (err: unknown) {
      showToast('Could not accept invite', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10">
      <Card className="p-6 text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          {error ? (
            <AlertCircle className="w-6 h-6 text-red-500" />
          ) : kind === 'group' ? (
            <Layers className="w-6 h-6" />
          ) : (
            <Users className="w-6 h-6" />
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Checking invitation...</p>
        ) : error ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Invitation Unavailable
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            <Button variant="outline" onClick={() => navigate('/')}>
              Return to Overview
            </Button>
          </>
        ) : (
          <>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {title}
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {subtitle}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button loading={accepting} onClick={handleAccept}>
                <CheckCircle2 className="w-4 h-4" />
                {kind === 'group' ? 'Join Group' : 'Accept Invite'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
