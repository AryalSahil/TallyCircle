import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Unsubscribe } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import type {
  AppNotification,
  Expense,
  Friendship,
  Group,
  GroupActivity,
  PublicProfile,
  Settlement,
} from '../types';
import { subscribeGroups, subscribeGroupActivities } from '../services/groupService';
import { subscribeGroupExpenses } from '../services/expenseService';
import { subscribeGroupSettlements } from '../services/settlementService';
import { subscribeFriendships } from '../services/friendService';
import { subscribeNotifications } from '../services/notificationService';
import { getPublicProfiles } from '../services/userService';
import { computeGroupBalances } from '../utils/finance';

interface AppDataContextValue {
  groups: Group[];
  activeGroups: Group[];
  archivedGroups: Group[];
  expensesByGroup: Record<string, Expense[]>;
  settlementsByGroup: Record<string, Settlement[]>;
  activitiesByGroup: Record<string, GroupActivity[]>;
  friendships: Friendship[];
  acceptedFriendUids: string[];
  profilesMap: Record<string, PublicProfile>;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  loadingData: boolean;
  summary: {
    totalAccessibleExpensesPaise: number;
    totalPaidByMePaise: number;
    totalOwedToMePaise: number;
    totalIOwePaise: number;
    pendingSettlements: Array<Settlement & { groupName: string }>;
    recentExpenses: Array<Expense & { groupName: string }>;
    recentSettlements: Array<Settlement & { groupName: string }>;
    recentActivities: Array<GroupActivity & { groupName: string }>;
  };
  refreshProfiles: (uids: string[]) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [expensesByGroup, setExpensesByGroup] = useState<Record<string, Expense[]>>({});
  const [settlementsByGroup, setSettlementsByGroup] = useState<Record<string, Settlement[]>>({});
  const [activitiesByGroup, setActivitiesByGroup] = useState<Record<string, GroupActivity[]>>({});
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, PublicProfile>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Subscribe to groups, friendships, and notifications
  useEffect(() => {
    if (!profile?.uid) {
      setGroups([]);
      setFriendships([]);
      setNotifications([]);
      setExpensesByGroup({});
      setSettlementsByGroup({});
      setActivitiesByGroup({});
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    let groupsReady = false;
    const markReady = () => {
      if (groupsReady) setLoadingData(false);
    };

    const unsubGroups = subscribeGroups(profile.uid, (list) => {
      setGroups(list);
      groupsReady = true;
      markReady();
    });

    const unsubFriends = subscribeFriendships(profile.uid, (list) => {
      setFriendships(list);
    });

    const unsubNotifs = subscribeNotifications(profile.uid, (list) => {
      setNotifications(list);
    });

    return () => {
      unsubGroups();
      unsubFriends();
      unsubNotifs();
    };
  }, [profile?.uid]);

  // Subscribe to expenses, settlements, and activities for each accessible group
  useEffect(() => {
    if (!profile?.uid || groups.length === 0) {
      setExpensesByGroup({});
      setSettlementsByGroup({});
      setActivitiesByGroup({});
      return;
    }

    const unsubs: Unsubscribe[] = [];
    const currentIds = new Set(groups.map((g) => g.id));

    // Clean stale group keys
    setExpensesByGroup((prev) => {
      const next: Record<string, Expense[]> = {};
      for (const id of Object.keys(prev)) {
        if (currentIds.has(id)) next[id] = prev[id];
      }
      return next;
    });
    setSettlementsByGroup((prev) => {
      const next: Record<string, Settlement[]> = {};
      for (const id of Object.keys(prev)) {
        if (currentIds.has(id)) next[id] = prev[id];
      }
      return next;
    });
    setActivitiesByGroup((prev) => {
      const next: Record<string, GroupActivity[]> = {};
      for (const id of Object.keys(prev)) {
        if (currentIds.has(id)) next[id] = prev[id];
      }
      return next;
    });

    for (const g of groups) {
      unsubs.push(
        subscribeGroupExpenses(g.id, (items) => {
          setExpensesByGroup((prev) => ({ ...prev, [g.id]: items }));
        })
      );
      unsubs.push(
        subscribeGroupSettlements(g.id, (items) => {
          setSettlementsByGroup((prev) => ({ ...prev, [g.id]: items }));
        })
      );
      unsubs.push(
        subscribeGroupActivities(g.id, (items) => {
          setActivitiesByGroup((prev) => ({ ...prev, [g.id]: items }));
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [profile?.uid, groups.map((g) => g.id).join(',')]);

  // Load public profiles for all friends and group members
  useEffect(() => {
    if (!profile?.uid) return;
    const uids = new Set<string>([profile.uid]);
    for (const f of friendships) {
      f.users.forEach((u) => uids.add(u));
    }
    for (const g of groups) {
      g.memberUids.forEach((u) => uids.add(u));
    }
    const missing = Array.from(uids).filter((u) => !profilesMap[u]);
    if (missing.length === 0) return;

    getPublicProfiles(missing).then((loaded) => {
      if (Object.keys(loaded).length > 0) {
        setProfilesMap((prev) => ({ ...prev, ...loaded }));
      }
    });
  }, [profile?.uid, friendships, groups]);

  const refreshProfiles = async (uids: string[]) => {
    const loaded = await getPublicProfiles(uids);
    setProfilesMap((prev) => ({ ...prev, ...loaded }));
  };

  const activeGroups = useMemo(() => groups.filter((g) => !g.isArchived), [groups]);
  const archivedGroups = useMemo(() => groups.filter((g) => g.isArchived), [groups]);

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

    let totalAccessibleExpensesPaise = 0;
    let totalPaidByMePaise = 0;
    let totalOwedToMePaise = 0;
    let totalIOwePaise = 0;

    const allExpenses: Array<Expense & { groupName: string }> = [];
    const allSettlements: Array<Settlement & { groupName: string }> = [];
    const allActivities: Array<GroupActivity & { groupName: string }> = [];

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
        if (myBalance.netBalancePaise > 0) {
          totalOwedToMePaise += myBalance.netBalancePaise;
        } else if (myBalance.netBalancePaise < 0) {
          totalIOwePaise += Math.abs(myBalance.netBalancePaise);
        }
      }

      exps.forEach((e) => allExpenses.push({ ...e, groupName: g.name }));
      sts.forEach((s) => allSettlements.push({ ...s, groupName: g.name }));
      acts.forEach((a) => allActivities.push({ ...a, groupName: g.name }));
    }

    allExpenses.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
    allSettlements.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    allActivities.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });

    const pendingSettlements = allSettlements.filter(
      (s) =>
        (s.status === 'pending' || s.status === 'awaiting_confirmation' || s.status === 'disputed') &&
        (s.fromUid === uid || s.toUid === uid || groupMap.has(s.groupId))
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
  }, [groups, expensesByGroup, settlementsByGroup, activitiesByGroup, profile?.uid]);

  return (
    <AppDataContext.Provider
      value={{
        groups,
        activeGroups,
        archivedGroups,
        expensesByGroup,
        settlementsByGroup,
        activitiesByGroup,
        friendships,
        acceptedFriendUids,
        profilesMap,
        notifications,
        unreadNotificationsCount,
        loadingData,
        summary,
        refreshProfiles,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
