import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plane,
  Plus,
  Link2,
  Archive,
  MapPin,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import { computeTripAnalytics, joinTripByToken } from '../services/tripService';
import { SUPPORTED_CURRENCIES } from '../types';
import { GROUP_COVER_PRESETS, isValidSafeUrl } from '../utils/helpers';
import { Button, Card, EmptyState, InputField, Modal } from '../components/ui/Primitives';
import { TripModal } from '../components/modals/TripModal';

export function TripsPage() {
  const { profile } = useAuth();
  const { activeTrips, archivedTrips, expensesByTrip, settlementsByTrip } = useAppData();
  const { formatAmount } = useCurrency();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [joining, setJoining] = useState(false);

  const list = tab === 'active' ? activeTrips : archivedTrips;

  const extractToken = (raw: string): string => {
    const trimmed = raw.trim();
    const match = trimmed.match(/\/join\/trip\/([a-zA-Z0-9_%.\-]+)/);
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
      const res = await joinTripByToken(profile, token);
      showToast(
        res.alreadyMember ? `Already in ${res.tripName}` : `Joined ${res.tripName}`,
        { variant: 'success' }
      );
      setJoinOpen(false);
      setInviteInput('');
      navigate(`/app/trips/${res.tripId}`);
    } catch (err: unknown) {
      showToast('Could not join trip', {
        description: err instanceof Error ? err.message : 'Invalid or expired trip link.',
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
            Active ({activeTrips.length})
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
            Archived ({archivedTrips.length})
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJoinOpen(true)}
            className="w-full sm:w-auto"
          >
            <Link2 className="w-4 h-4" />
            Join Trip Link
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Create Trip
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === 'active' ? Plane : Archive}
          title={tab === 'active' ? 'No active trips yet' : 'No archived trips'}
          description={
            tab === 'active'
              ? 'Launch Trip Mode for vacations and group getaways with destination budgets, multi-currency conversion, and travel settlement plans.'
              : 'Completed trips you archive remain safely stored here with full expense logs and reports.'
          }
          action={
            tab === 'active' ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Plan Your First Trip
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {list.map((trip) => {
            const exps = expensesByTrip[trip.id] || [];
            const sts = settlementsByTrip[trip.id] || [];
            const analytics = computeTripAnalytics(trip, exps, sts);
            const myBal =
              analytics.memberSummaries.find((m) => m.uid === profile?.uid)?.netBalancePaise ?? 0;
            const cover = isValidSafeUrl(trip.coverImage)
              ? trip.coverImage
              : GROUP_COVER_PRESETS[0].url;
            const barWidth = Math.min(100, analytics.budgetPercentUsed);

            return (
              <Card
                key={trip.id}
                className="overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/app/trips/${trip.id}`)}
                  className="text-left flex-1 flex flex-col cursor-pointer"
                >
                  <div className="aspect-[16/9] w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                    <img
                      src={cover}
                      alt={trip.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 text-white text-[11px] font-medium">
                      <span className="inline-flex items-center gap-1 bg-slate-950/65 px-2 py-1 rounded-md backdrop-blur-xs truncate">
                        <MapPin className="w-3 h-3 shrink-0 text-emerald-400" />
                        <span className="truncate">{trip.destination}</span>
                      </span>
                      <span className="bg-slate-950/65 px-2 py-1 rounded-md backdrop-blur-xs font-mono-nums shrink-0">
                        {trip.currency} ({SUPPORTED_CURRENCIES[trip.currency]?.symbol || trip.currency})
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      <h3 className="font-display text-base font-semibold truncate">{trip.name}</h3>
                      <p className="text-xs text-slate-200/90 mt-0.5 flex items-center gap-1.5 truncate">
                        <span>
                          {trip.participantUids.length} travelers · {exps.length} expenses
                        </span>
                        {(trip.startDate || trip.endDate) && (
                          <span className="inline-flex items-center gap-1 font-mono-nums">
                            · <Calendar className="w-3 h-3" />
                            {trip.startDate || 'TBD'}
                            {trip.endDate ? ` → ${trip.endDate}` : ''}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    {analytics.budgetPaise > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            Budget ({analytics.budgetPercentUsed}%)
                            {(analytics.budgetStatus === 'approaching' ||
                              analytics.budgetStatus === 'exceeded') && (
                              <AlertTriangle
                                className={`w-3.5 h-3.5 ${
                                  analytics.budgetStatus === 'exceeded'
                                    ? 'text-red-500'
                                    : 'text-amber-500'
                                }`}
                              />
                            )}
                          </span>
                          <span className="font-mono-nums font-medium text-slate-700 dark:text-slate-300">
                            {formatAmount(analytics.budgetPaise)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              analytics.budgetStatus === 'exceeded'
                                ? 'bg-red-500'
                                : analytics.budgetStatus === 'approaching'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-600'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {trip.description || 'No trip budget set'}
                      </p>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Trip spent</p>
                        <p className="font-mono-nums text-sm font-semibold text-slate-900 dark:text-white">
                          {formatAmount(analytics.totalSpentPaise)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Your net</p>
                        <p
                          className={`font-mono-nums text-sm font-semibold ${
                            myBal > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : myBal < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {myBal === 0 ? 'Settled' : formatAmount(myBal, { showSign: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <TripModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/app/trips/${id}`)}
      />

      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join Trip via Invite Link"
        subtitle="Paste the trip invitation URL or token shared by a travel companion"
      >
        <form onSubmit={handleJoin} className="space-y-4">
          <InputField
            label="Invitation URL or token"
            placeholder="https://.../join/trip/trp_..."
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            required
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setJoinOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" loading={joining} className="w-full sm:w-auto">
              Join Trip
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
