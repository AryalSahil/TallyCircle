import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onSnapshotsInSync, Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type {
  AppNotification,
  Expense,
  FriendRequest,
  Friendship,
  Group,
  GroupActivity,
  PublicProfile,
  RecurringExpenseRule,
  Settlement,
  Trip,
} from '../types';
import { subscribeGroups, subscribeGroupActivities } from '../services/groupService';
import { subscribeGroupExpenses } from '../services/expenseService';
import { subscribeGroupSettlements } from '../services/settlementService';
import { subscribeGroupRecurringRules } from '../services/recurringService';
import {
  subscribeTripActivities,
  subscribeTripExpenses,
  subscribeTrips,
  subscribeTripSettlements,
} from '../services/tripService';
import { subscribeFriendRequests, subscribeFriendships } from '../services/friendService';
import { subscribeNotifications } from '../services/notificationService';
import { getPublicProfiles } from '../services/userService';
import { computeGroupBalances } from '../utils/finance';

export type SyncStatus = 'online' | 'syncing' | 'offline' | 'error';

interface AppDataContextValue {
  groups: Group[];
  activeGroups: Group[];
  archivedGroups: Group[];
  expensesByGroup: Record<string, Expense[]>;
  settlementsByGroup: Record<string, Settlement[]>;
  activitiesByGroup: Record<string, GroupActivity[]>;
  recurringByGroup: Record<string, RecurringExpenseRule[]>;
  trips: Trip[];
  activeTrips: Trip[];
  archivedTrips: Trip[];
  expensesByTrip: Record<string, Expense[]>;
  settlementsByTrip: Record<string, Settlement[]>;
  activitiesByTrip: Record<string, GroupActivity[]>;
  friendships: Friendship[];
  friendRequests: FriendRequest[];
  acceptedFriendUids: string[];
  profilesMap: Record<string, PublicProfile>;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  loadingData: boolean;
  syncStatus: SyncStatus;
  hasPendingWrites: boolean;
  lastSyncError: string | null;
  retrySync: () => void;
  summary: {
    totalAccessibleExpensesPaise: number;
    totalPaidByMePaise: number;
    totalOwedToMePaise: number;
    totalIOwePaise: number;
    pendingSettlements: Array<Settlement & { groupName: string; kind?: 'group' | 'trip' }>;
    recentExpenses: Array<Expense & { groupName: string; kind?: 'group' | 'trip' }>;
    recentSettlements: Array<Settlement & { groupName: string; kind?: 'group' | 'trip' }>;
    recentActivities: Array<GroupActivity & { groupName: string; kind?: 'group' | 'trip' }>;
  };
  refreshProfiles: (uids: string[], forceRefresh?: boolean) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [expensesByGroup, setExpensesByGroup] = useState<Record<string, Expense[]>>({});
  const [settlementsByGroup, setSettlementsByGroup] = useState<Record<string, Settlement[]>>({});
  const [activitiesByGroup, setActivitiesByGroup] = useState<Record<string, GroupActivity[]>>({});
  const [recurringByGroup, setRecurringByGroup] = useState<Record<string, RecurringExpenseRule[]>>({});

  const [trips, setTrips] = useState<Trip[]>([]);
  const [expensesByTrip, setExpensesByTrip] = useState<Record<string, Expense[]>>({});
  const [settlementsByTrip, setSettlementsByTrip] = useState<Record<string, Settlement[]>>({});
  const [activitiesByTrip, setActivitiesByTrip] = useState<Record<string, GroupActivity[]>>({});

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, PublicProfile>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [snapshotsSynced, setSnapshotsSynced] = useState(true);
  const [pendingWritesMap, setPendingWritesMap] = useState<Record<string, boolean>>({});
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [syncEpoch, setSyncEpoch] = useState(0);

  const setPendingKey = useCallback((key: string, pending: boolean) => {
    setPendingWritesMap((prev) => {
      if (Boolean(prev[key]) === pending) return prev;
      if (!pending) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  }, []);

  const retrySync = useCallback(() => {
    setLastSyncError(null);
    setSnapshotsSynced(false);
    setSyncEpoch((e) => e + 1);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      setLastSyncError(null);
      setSyncEpoch((e) => e + 1);
    };
    const onOffline = () => setIsOnline(false);
    const onSyncError = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) setLastSyncError(detail.message);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('tallycircle:sync-error', onSyncError);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('tallycircle:sync-error', onSyncError);
    };
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    setSnapshotsSynced(false);
    const unsub = onSnapshotsInSync(db, () => setSnapshotsSynced(true));
    return () => unsub();
  }, [profile?.uid, syncEpoch]);

  useEffect(() => {
    if (!profile?.uid) {
      setGroups([]);
      setTrips([]);
      setFriendships([]);
      setFriendRequests([]);
      setNotifications([]);
      setExpensesByGroup({});
      setSettlementsByGroup({});
      setActivitiesByGroup({});
      setRecurringByGroup({});
      setExpensesByTrip({});
      setSettlementsByTrip({});
      setActivitiesByTrip({});
      setLastSyncError(null);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setLastSyncError(null);
    let groupsReady = false;
    let tripsReady = false;
    const markReady = () => {
      if (groupsReady && tripsReady) setLoadingData(false);
    };
    const onListenerError = (err: Error) => {
      setLastSyncError(err.message || 'Real-time sync interrupted.');
      setLoadingData(false);
    };

    const unsubGroups = subscribeGroups(
      profile.uid,
      (list) => {
        setGroups(list);
        groupsReady = true;
        markReady();
      },
      onListenerError,
      (pending) => setPendingKey('groups', pending)
    );

    const unsubTrips = subscribeTrips(
      profile.uid,
      (list) => {
        setTrips(list);
        tripsReady = true;
        markReady();
      },
      onListenerError,
      (pending) => setPendingKey('trips', pending)
    );

    const unsubFriends = subscribeFriendships(profile.uid, setFriendships, onListenerError);
    const unsubFriendRequests = subscribeFriendRequests(profile.uid, setFriendRequests, onListenerError);
    const unsubNotifs = subscribeNotifications(
      profile.uid,
      setNotifications,
      onListenerError,
      (pending) => setPendingKey('notifications', pending)
    );

    return () => {
      unsubGroups();
      unsubTrips();
      unsubFriends();
      unsubFriendRequests();
      unsubNotifs();
    };
  }, [profile?.uid, syncEpoch, setPendingKey]);

  const groupIdsKey = useMemo(() => groups.map((g) => g.id).join(','), [groups]);

  useEffect(() => {
    if (!profile?.uid || groups.length === 0) {
      setExpensesByGroup({});
      setSettlementsByGroup({});
      setActivitiesByGroup({});
      setRecurringByGroup({});
      return;
    }

    const unsubs: Unsubscribe[] = [];
    const currentIds = new Set(groups.map((g) => g.id));

    const filterMap = <T,>(prev: Record<string, T[]>) => {
      const next: Record<string, T[]> = {};
      for (const id of Object.keys(prev)) {
        if (currentIds.has(id)) next[id] = prev[id];
      }
      return next;
    };

    setExpensesByGroup(filterMap);
    setSettlementsByGroup(filterMap);
    setActivitiesByGroup(filterMap);
    setRecurringByGroup(filterMap);

    const onGroupError = (err: Error) => {
      setLastSyncError(err.message || 'Group ledger sync interrupted.');
    };

    for (const g of groups) {
      unsubs.push(
        subscribeGroupExpenses(
          g.id,
          (items) => setExpensesByGroup((prev) => ({ ...prev, [g.id]: items })),
          onGroupError,
          (pending) => setPendingKey(`expenses:${g.id}`, pending)
        )
      );
      unsubs.push(
        subscribeGroupSettlements(
          g.id,
          (items) => setSettlementsByGroup((prev) => ({ ...prev, [g.id]: items })),
          onGroupError,
          (pending) => setPendingKey(`settlements:${g.id}`, pending)
        )
      );
      unsubs.push(
        subscribeGroupActivities(
          g.id,
          (items) => setActivitiesByGroup((prev) => ({ ...prev, [g.id]: items })),
          onGroupError
        )
      );
      unsubs.push(
        subscribeGroupRecurringRules(
          g.id,
          (items) => setRecurringByGroup((prev) => ({ ...prev, [g.id]: items })),
          onGroupError
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [profile?.uid, groupIdsKey, syncEpoch, setPendingKey]);

  const tripIdsKey = useMemo(() => trips.map((t) => t.id).join(','), [trips]);

  useEffect(() => {
    if (!profile?.uid || trips.length === 0) {
      setExpensesByTrip({});
      setSettlementsByTrip({});
      setActivitiesByTrip({});
      return;
    }

    const unsubs: Unsubscribe[] = [];
    const currentIds = new Set(trips.map((t) => t.id));

    const filterMap = <T,>(prev: Record<string, T[]>) => {
      const next: Record<string, T[]> = {};
      for (const id of Object.keys(prev)) {
        if (currentIds.has(id)) next[id] = prev[id];
      }
      return next;
    };

    setExpensesByTrip(filterMap);
    setSettlementsByTrip(filterMap);
    setActivitiesByTrip(filterMap);

    const onTripError = (err: Error) => {
      setLastSyncError(err.message || 'Trip sync interrupted.');
    };

    for (const t of trips) {
      unsubs.push(
        subscribeTripExpenses(
          t.id,
          (items) => setExpensesByTrip((prev) => ({ ...prev, [t.id]: items })),
          onTripError,
          (pending) => setPendingKey(`tripExpenses:${t.id}`, pending)
        )
      );
      unsubs.push(
        subscribeTripSettlements(
          t.id,
          (items) => setSettlementsByTrip((prev) => ({ ...prev, [t.id]: items })),
          onTripError,
          (pending) => setPendingKey(`tripSettlements:${t.id}`, pending)
        )
      );
      unsubs.push(
        subscribeTripActivities(
          t.id,
          (items) => setActivitiesByTrip((prev) => ({ ...prev, [t.id]: items })),
          onTripError
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [profile?.uid, tripIdsKey, syncEpoch, setPendingKey]);

  useEffect(() => {
    if (!profile?.uid) return;
    const uids = new Set<string>([profile.uid]);
    for (const f of friendships) f.users.forEach((u) => uids.add(u));
    for (const r of friendRequests) r.users.forEach((u) => uids.add(u));
    for (const g of groups) g.memberUids.forEach((u) => uids.add(u));
    for (const t of trips) t.participantUids.forEach((u) => uids.add(u));

    const missing = Array.from(uids).filter((u) => !profilesMap[u]);
    if (missing.length === 0) return;

    getPublicProfiles(missing).then((loaded) => {
      if (Object.keys(loaded).length > 0) {
        setProfilesMap((prev) => ({ ...prev, ...loaded }));
      }
    });
  }, [profile?.uid, friendships, friendRequests, groups, trips]);

  const refreshProfiles = useCallback(async (uids: string[], forceRefresh = false) => {
    if (forceRefresh) {
      const { getPublicProfile } = await import('../services/userService');
      const entries = await Promise.all(
        uids.map(async (uid) => [uid, await getPublicProfile(uid, true)] as const)
      );
      const updated: Record<string, PublicProfile> = {};
      for (const [uid, prof] of entries) {
        if (prof) updated[uid] = prof;
      }
      if (Object.keys(updated).length > 0) {
        setProfilesMap((prev) => ({ ...prev, ...updated }));
      }
      return;
    }
    const loaded = await getPublicProfiles(uids);
    setProfilesMap((prev) => ({ ...prev, ...loaded }));
  }, []);

  const hasPendingWrites = useMemo(
    () => Object.values(pendingWritesMap).some(Boolean),
    [pendingWritesMap]
  );

  const syncStatus: SyncStatus = useMemo(() => {
    if (!isOnline) return 'offline';
    if (lastSyncError) return 'error';
    if (!snapshotsSynced || loadingData || hasPendingWrites) return 'syncing';
    return 'online';
  }, [isOnline, lastSyncError, snapshotsSynced, loadingData, hasPendingWrites]);

  const activeGroups = useMemo(() => groups.filter((g) => !g.isArchived), [groups]);
  const archivedGroups = useMemo(() => groups.filter((g) => g.isArchived), [groups]);

  const activeTrips = useMemo(() => trips.filter((t) => !t.isArchived), [trips]);
  const archivedTrips = useMemo(() => trips.filter((t) => t.isArchived), [trips]);

  const acceptedFriendUids = useMemo(() => {
    if (!profile?.uid) return [];
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => f.users.find((u) => u !== profile.uid)!)
      .filter(Boolean);
  }, [friendships, profile?.uid]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const summary = useMemo(() => {
    const uid = profile?.uid || '';
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const tripMap = new Map(trips.map((t) => [t.id, t]));

    let totalAccessibleExpensesPaise = 0;
    let totalPaidByMePaise = 0;
    let totalOwedToMePaise = 0;
    let totalIOwePaise = 0;

    const allExpenses: Array<Expense & { groupName: string; kind?: 'group' | 'trip' }> = [];
    const allSettlements: Array<Settlement & { groupName: string; kind?: 'group' | 'trip' }> = [];
    const allActivities: Array<GroupActivity & { groupName: string; kind?: 'group' | 'trip' }> = [];

    for (const g of groups) {
      const exps = expensesByGroup[g.id] || [];
      const sts = settlementsByGroup[g.id] || [];
      const acts = activitiesByGroup[g.id] || [];

      const { totalExpenditurePaise, memberBalances } = computeGroupBalances(
        g.memberNames,
        exps,
        sts
      );

      totalAccessibleExpensesPaise += totalExpenditurePaise;
      const myBalance = memberBalances.find((m) => m.uid === uid);
      if (myBalance) {
        totalPaidByMePaise += myBalance.expensePaidPaise;
        if (myBalance.netBalancePaise > 0) totalOwedToMePaise += myBalance.netBalancePaise;
        else if (myBalance.netBalancePaise < 0) totalIOwePaise += Math.abs(myBalance.netBalancePaise);
      }

      exps.forEach((e) => allExpenses.push({ ...e, groupName: g.name, kind: 'group' }));
      sts.forEach((s) => allSettlements.push({ ...s, groupName: g.name, kind: 'group' }));
      acts.forEach((a) => allActivities.push({ ...a, groupName: g.name, kind: 'group' }));
    }

    for (const t of trips) {
      const exps = expensesByTrip[t.id] || [];
      const sts = settlementsByTrip[t.id] || [];
      const acts = activitiesByTrip[t.id] || [];

      const { totalExpenditurePaise, memberBalances } = computeGroupBalances(
        t.participantNames,
        exps,
        sts
      );

      totalAccessibleExpensesPaise += totalExpenditurePaise;
      const myBalance = memberBalances.find((m) => m.uid === uid);
      if (myBalance) {
        totalPaidByMePaise += myBalance.expensePaidPaise;
        if (myBalance.netBalancePaise > 0) totalOwedToMePaise += myBalance.netBalancePaise;
        else if (myBalance.netBalancePaise < 0) totalIOwePaise += Math.abs(myBalance.netBalancePaise);
      }

      exps.forEach((e) => allExpenses.push({ ...e, groupName: t.name, kind: 'trip' }));
      sts.forEach((s) => allSettlements.push({ ...s, groupName: t.name, kind: 'trip' }));
      acts.forEach((a) => allActivities.push({ ...a, groupName: t.name, kind: 'trip' }));
    }

    allExpenses.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
    allSettlements.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    allActivities.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    const pendingSettlements = allSettlements.filter(
      (s) =>
        (s.status === 'pending' || s.status === 'awaiting_confirmation' || s.status === 'disputed') &&
        (s.fromUid === uid || s.toUid === uid || groupMap.has(s.groupId) || tripMap.has(s.groupId))
    );

    return {
      totalAccessibleExpensesPaise,
      totalPaidByMePaise,
      totalOwedToMePaise,
      totalIOwePaise,
      pendingSettlements,
      recentExpenses: allExpenses.slice(0, 12),
      recentSettlements: allSettlements.slice(0, 10),
      recentActivities: allActivities.slice(0, 20),
    };
  }, [
    groups,
    expensesByGroup,
    settlementsByGroup,
    activitiesByGroup,
    trips,
    expensesByTrip,
    settlementsByTrip,
    activitiesByTrip,
    profile?.uid,
  ]);

  const contextValue = useMemo<AppDataContextValue>(
    () => ({
      groups,
      activeGroups,
      archivedGroups,
      expensesByGroup,
      settlementsByGroup,
      activitiesByGroup,
      recurringByGroup,
      trips,
      activeTrips,
      archivedTrips,
      expensesByTrip,
      settlementsByTrip,
      activitiesByTrip,
      friendships,
      friendRequests,
      acceptedFriendUids,
      profilesMap,
      notifications,
      unreadNotificationsCount,
      loadingData,
      syncStatus,
      hasPendingWrites,
      lastSyncError,
      retrySync,
      summary,
      refreshProfiles,
    }),
    [
      groups,
      activeGroups,
      archivedGroups,
      expensesByGroup,
      settlementsByGroup,
      activitiesByGroup,
      recurringByGroup,
      trips,
      activeTrips,
      archivedTrips,
      expensesByTrip,
      settlementsByTrip,
      activitiesByTrip,
      friendships,
      friendRequests,
      acceptedFriendUids,
      profilesMap,
      notifications,
      unreadNotificationsCount,
      loadingData,
      syncStatus,
      hasPendingWrites,
      lastSyncError,
      retrySync,
      summary,
      refreshProfiles,
    ]
  );

  return <AppDataContext.Provider value={contextValue}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
