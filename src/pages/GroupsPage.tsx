import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Layers, Link2, Archive, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import { computeGroupBalances } from '../utils/finance';
import { GROUP_COVER_PRESETS, isValidSafeUrl } from '../utils/helpers';
import { joinGroupByToken } from '../services/groupService';
import { Button, Card, EmptyState, InputField, Modal } from '../components/ui/Primitives';
import { GroupModal } from '../components/modals/GroupModal';

export function GroupsPage() {
  const { profile } = useAuth();
  const { activeGroups, archivedGroups, expensesByGroup, settlementsByGroup } = useAppData();
  const { formatAmount } = useCurrency();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [joining, setJoining] = useState(false);

  const list = tab === 'active' ? activeGroups : archivedGroups;

  const extractToken = (raw: string): string => {
    const trimmed = raw.trim();
    const match = trimmed.match(/\/join\/group\/([a-zA-Z0-9_%.\-]+)/);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return trimmed;
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const token = extractToken(inviteInput);
    if (!token) return;
    setJoining(true);
    try {
      const res = await joinGroupByToken(profile, token);
      showToast(
        res.alreadyMember ? `Already in ${res.groupName}` : `Joined ${res.groupName}`,
        { variant: 'success' }
      );
      setJoinOpen(false);
      setInviteInput('');
      navigate(`/app/groups/${res.groupId}`);
    } catch (err: unknown) {
      showToast('Could not join group', {
        description: err instanceof Error ? err.message : 'Invalid or expired invite link.',
        variant: 'error',
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'active'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Active ({activeGroups.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'archived'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Archived ({archivedGroups.length})
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)} className="w-full sm:w-auto">
            <Link2 className="w-4 h-4" />
            Join via Link
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Create Group
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === 'active' ? Layers : Archive}
          title={tab === 'active' ? 'No active expense groups' : 'No archived groups'}
          description={
            tab === 'active'
              ? 'Create a group for your trip, apartment, or weekend outing, or join with an invite link.'
              : 'Completed trips or settled groups you archive will appear here with full history intact.'
          }
          action={
            tab === 'active' ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Create Your First Group
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {list.map((g) => {
            const exps = expensesByGroup[g.id] || [];
            const sts = settlementsByGroup[g.id] || [];
            const { totalExpenditurePaise, memberBalances } = computeGroupBalances(
              g.memberNames,
              exps,
              sts
            );
            const myBal = memberBalances.find((m) => m.uid === profile?.uid)?.netBalancePaise ?? 0;
            const cover = isValidSafeUrl(g.coverImage) ? g.coverImage : GROUP_COVER_PRESETS[0].url;

            return (
              <Card
                key={g.id}
                className="overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/app/groups/${g.id}`)}
                  className="text-left flex-1 flex flex-col cursor-pointer"
                >
                  <div className="aspect-[16/9] w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                    <img
                      src={cover}
                      alt={g.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      <h3 className="font-display text-base font-semibold truncate">{g.name}</h3>
                      <p className="text-xs text-slate-200/90 mt-0.5">
                        {g.memberUids.length} members · {exps.length} expenses
                      </p>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3 w-full">
                    <div>
                      {g.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {g.description}
                        </p>
                      )}
                      {(g.startDate || g.endDate) && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {g.startDate || 'Start'} — {g.endDate || 'Ongoing'}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Total spent </span>
                        <span className="font-mono-nums font-semibold text-slate-900 dark:text-white">
                          {formatAmount(totalExpenditurePaise)}
                        </span>
                      </div>
                      <div
                        className={`font-mono-nums font-semibold ${
                          myBal > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : myBal < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {myBal > 0
                          ? `Owed ${formatAmount(myBal)}`
                          : myBal < 0
                            ? `Owe ${formatAmount(Math.abs(myBal))}`
                            : 'Settled'}
                      </div>
                    </div>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <GroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/app/groups/${id}`)}
      />

      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join Group via Invitation Link"
        subtitle="Paste a group invite URL or token shared by a friend."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleJoin} className="space-y-4">
          <InputField
            label="Invite link or token"
            placeholder="https://.../join/group/grp_..."
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={joining}>
              Join Group
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
