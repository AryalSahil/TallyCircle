import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plane, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useToast } from '../../contexts/ToastContext';
import {
  CURRENCY_CODES,
  CurrencyCode,
  PublicProfile,
  SUPPORTED_CURRENCIES,
  Trip,
} from '../../types';
import { createTrip, updateTripDetails } from '../../services/tripService';
import { inrToPaise, paiseToInputString } from '../../utils/finance';
import { Button, InputField, Modal } from '../ui/Primitives';
import { GROUP_COVER_PRESETS } from '../../utils/helpers';

export function TripModal({
  open,
  onClose,
  editingTrip,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editingTrip?: Trip | null;
  onCreated?: (tripId: string) => void;
}) {
  const { profile } = useAuth();
  const { acceptedFriendUids, profilesMap, groups } = useAppData();
  const { baseCurrency } = useCurrency();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState(GROUP_COVER_PRESETS[0].url);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [exchangeRateInput, setExchangeRateInput] = useState('1');
  const [budgetInput, setBudgetInput] = useState('');
  const [memberBudgetsInputs, setMemberBudgetsInputs] = useState<Record<string, string>>({});
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [importGroupId, setImportGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const friendsList = useMemo(
    () =>
      acceptedFriendUids
        .map((uid) => profilesMap[uid])
        .filter((p): p is PublicProfile => Boolean(p)),
    [acceptedFriendUids, profilesMap]
  );

  // Merge available known profiles from friends + groups so imported group members show up cleanly
  const candidatePool = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const f of friendsList) {
      map.set(f.uid, f);
    }
    for (const g of groups) {
      for (const uid of g.memberUids) {
        if (uid === profile?.uid || map.has(uid)) continue;
        if (profilesMap[uid]) {
          map.set(uid, profilesMap[uid]);
        }
      }
    }
    return Array.from(map.values());
  }, [friendsList, groups, profilesMap, profile?.uid]);

  useEffect(() => {
    if (!open) return;
    if (editingTrip) {
      setName(editingTrip.name);
      setDestination(editingTrip.destination);
      setDescription(editingTrip.description || '');
      setCoverImage(editingTrip.coverImage || GROUP_COVER_PRESETS[0].url);
      setStartDate(editingTrip.startDate || '');
      setEndDate(editingTrip.endDate || '');
      setCurrency(editingTrip.currency || 'INR');
      setExchangeRateInput(String(editingTrip.exchangeRateToInr || 1));
      setBudgetInput(editingTrip.budgetPaise > 0 ? paiseToInputString(editingTrip.budgetPaise) : '');
      const mb: Record<string, string> = {};
      if (editingTrip.memberBudgetsPaise) {
        for (const [uid, val] of Object.entries(editingTrip.memberBudgetsPaise)) {
          if (val > 0) mb[uid] = paiseToInputString(val);
        }
      }
      setMemberBudgetsInputs(mb);
      setSelectedFriends([]);
      setImportGroupId('');
    } else {
      const curr = baseCurrency || 'INR';
      setName('');
      setDestination('');
      setDescription('');
      setCoverImage(GROUP_COVER_PRESETS[0].url);
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate('');
      setCurrency(curr);
      setExchangeRateInput(String(SUPPORTED_CURRENCIES[curr].defaultRateToInr));
      setBudgetInput('');
      setMemberBudgetsInputs({});
      setSelectedFriends([]);
      setImportGroupId('');
    }
  }, [open, editingTrip, baseCurrency]);

  const toggleFriend = (uid: string) => {
    setSelectedFriends((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const handleImportGroup = (grpId: string) => {
    setImportGroupId(grpId);
    if (!grpId) return;
    const grp = groups.find((g) => g.id === grpId);
    if (!grp) return;
    const toSelect = grp.memberUids.filter((uid) => uid !== profile?.uid);
    setSelectedFriends((prev) => Array.from(new Set([...prev, ...toSelect])));
    showToast(`Imported ${toSelect.length} participant(s) from ${grp.name}`, { variant: 'info' });
  };

  const handleCurrencyChange = (next: CurrencyCode) => {
    setCurrency(next);
    setExchangeRateInput(String(SUPPORTED_CURRENCIES[next].defaultRateToInr));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!name.trim() || !destination.trim()) {
      showToast('Enter a trip name and destination', { variant: 'error' });
      return;
    }

    const rate =
      currency === 'INR'
        ? 1
        : parseFloat(exchangeRateInput) > 0
          ? parseFloat(exchangeRateInput)
          : SUPPORTED_CURRENCIES[currency].defaultRateToInr;

    const budgetPaise = budgetInput.trim() ? inrToPaise(budgetInput) : 0;

    const memberBudgetsPaise: Record<string, number> = {};
    for (const [uid, val] of Object.entries(memberBudgetsInputs)) {
      const p = inrToPaise(val);
      if (p > 0) memberBudgetsPaise[uid] = p;
    }

    setSubmitting(true);
    try {
      if (editingTrip) {
        await updateTripDetails(profile, editingTrip, {
          name,
          destination,
          description,
          coverImage,
          startDate,
          endDate,
          currency,
          exchangeRateToInr: rate,
          budgetPaise,
          memberBudgetsPaise,
        });
        showToast('Trip updated', { variant: 'success' });
        onClose();
      } else {
        const selectedGroup = groups.find((g) => g.id === importGroupId);
        const initialParticipants: PublicProfile[] = selectedFriends.map((uid) => {
          const fromMap = profilesMap[uid];
          if (fromMap) return fromMap;
          const fallbackName = selectedGroup?.memberNames[uid] || 'Traveler';
          return {
            uid,
            displayName: fallbackName,
            handle: fallbackName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user',
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          };
        });

        const id = await createTrip(profile, {
          name,
          destination,
          description,
          coverImage,
          startDate,
          endDate,
          currency,
          exchangeRateToInr: rate,
          budgetPaise,
          memberBudgetsPaise,
          initialParticipants,
        });
        showToast('Trip created', { variant: 'success' });
        onClose();
        if (onCreated) onCreated(id);
      }
    } catch (err: unknown) {
      showToast('Could not save trip', {
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const budgetParticipants = editingTrip
    ? editingTrip.participantUids.map((uid) => ({
        uid,
        name: editingTrip.participantNames[uid] || 'Traveler',
      }))
    : [
        ...(profile ? [{ uid: profile.uid, name: `${profile.fullName} (You)` }] : []),
        ...selectedFriends.map((uid) => ({
          uid,
          name:
            profilesMap[uid]?.displayName ||
            groups.find((g) => g.id === importGroupId)?.memberNames[uid] ||
            'Traveler',
        })),
      ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingTrip ? 'Edit Trip Settings' : 'Create Trip'}
      subtitle="Shared travel ledger with budgets, multi-currency conversion & equal permissions"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <InputField
            label="Trip name"
            placeholder="e.g., Goa Beach Week"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
          <InputField
            label="Destination"
            placeholder="e.g., North Goa, India"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <InputField
          label="Description (optional)"
          placeholder="Flights, villa stay, scooters, beach shacks..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <InputField
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <InputField
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-slate-950/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Trip currency
              </label>
              <select
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} ({SUPPORTED_CURRENCIES[code].symbol})
                  </option>
                ))}
              </select>
            </div>

            {currency !== 'INR' && (
              <InputField
                label={`Rate (1 ${currency} → ₹ INR)`}
                type="number"
                step="0.01"
                min="0.01"
                value={exchangeRateInput}
                onChange={(e) => setExchangeRateInput(e.target.value)}
                className="font-mono-nums"
              />
            )}

            <InputField
              label="Overall trip budget (₹ INR)"
              type="number"
              step="1"
              min="0"
              placeholder="e.g. 50000"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="font-mono-nums"
            />
          </div>
          {currency !== 'INR' && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Trip exchange rate (1 {currency} = ₹{exchangeRateInput}) is stored with an explicit update timestamp.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Trip banner theme
          </label>
          <div className="grid grid-cols-4 gap-2">
            {GROUP_COVER_PRESETS.map((preset) => {
              const selected = coverImage === preset.url;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setCoverImage(preset.url)}
                  className={`relative h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    selected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                      : 'border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-950/60 text-[10px] text-white font-medium py-0.5 text-center truncate px-1">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!editingTrip && (
          <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Add participants
              </label>
              {groups.length > 0 && (
                <select
                  value={importGroupId}
                  onChange={(e) => handleImportGroup(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="">Import from an existing group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberUids.length} members)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {candidatePool.length === 0 && !importGroupId ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No friends connected yet. You can create the trip now and invite travelers via shareable link.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {candidatePool.map((person) => {
                  const selected = selectedFriends.includes(person.uid);
                  return (
                    <button
                      key={person.uid}
                      type="button"
                      onClick={() => toggleFriend(person.uid)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {person.displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          @{person.handle}
                        </p>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          selected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {budgetParticipants.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Individual participant budgets (optional, ₹ INR)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
              {budgetParticipants.map((p) => (
                <div
                  key={p.uid}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
                >
                  <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                    {p.name}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="None"
                    value={memberBudgetsInputs[p.uid] || ''}
                    onChange={(e) =>
                      setMemberBudgetsInputs((prev) => ({ ...prev, [p.uid]: e.target.value }))
                    }
                    className="w-24 h-8 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-right text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="w-full sm:w-auto">
            <Plane className="w-4 h-4" />
            {editingTrip ? 'Save Trip' : 'Create Trip'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
