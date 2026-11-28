import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  commitBatchOfflineAware,
  db,
  handleFirestoreError,
  logFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseNote,
  ExpensePayer,
  ExpenseShare,
  GroupActivity,
  MemberBalance,
  PublicProfile,
  ReceiptMetadata,
  Settlement,
  SettlementMethod,
  SimplifiedDebt,
  SplitMethod,
  Trip,
  TripInvite,
  UserPrivateProfile,
} from '../types';
import {
  classifyBudgetStatus,
  computeGroupBalances,
  formatINR,
  formatOriginalCurrency,
  normalizeExpenseTag,
  verifyZeroSumBalance,
  type BudgetThresholdStatus,
} from '../utils/finance';
import { generateToken } from '../utils/helpers';
import { createNotification, notifyGroupMembers } from './notificationService';
import { deleteReceiptObject } from './storageService';

const VALID_TOKEN_RE = /^[a-zA-Z0-9_-]{1,128}$/;

async function getFreshDoc(ref: ReturnType<typeof doc>) {
  try {
    return await getDocFromServer(ref);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'permission-denied') throw err;
    return await getDoc(ref);
  }
}

export function subscribeTrips(
  uid: string,
  callback: (trips: Trip[]) => void,
  onError?: (err: Error) => void,
  onMetadata?: (hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(
    collection(db, 'trips'),
    where('participantUids', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (onMetadata) onMetadata(snap.metadata.hasPendingWrites);
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Trip, 'id'>),
        }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(list);
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, 'trips');
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeTrip(
  tripId: string,
  callback: (trip: Trip | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'trips', tripId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<Trip, 'id'>) });
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.GET, `trips/${tripId}`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeTripExpenses(
  tripId: string,
  callback: (expenses: Expense[]) => void,
  onError?: (err: Error) => void,
  onMetadata?: (hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(
    collection(db, 'trips', tripId, 'expenses'),
    orderBy('expenseDate', 'desc')
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (onMetadata) onMetadata(snap.metadata.hasPendingWrites);
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Expense, 'id'>),
        }))
      );
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, `trips/${tripId}/expenses`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeTripSettlements(
  tripId: string,
  callback: (items: Settlement[]) => void,
  onError?: (err: Error) => void,
  onMetadata?: (hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(
    collection(db, 'trips', tripId, 'settlements'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (onMetadata) onMetadata(snap.metadata.hasPendingWrites);
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Settlement, 'id'>),
        }))
      );
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, `trips/${tripId}/settlements`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeTripActivities(
  tripId: string,
  callback: (items: GroupActivity[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'trips', tripId, 'activities'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupActivity, 'id'>),
        }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, `trips/${tripId}/activities`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeTripExpenseNotes(
  tripId: string,
  expenseId: string,
  callback: (notes: ExpenseNote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'trips', tripId, 'expenses', expenseId, 'notes'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ExpenseNote, 'id'>),
        }))
      );
    },
    (error) => {
      const info = logFirestoreError(
        error,
        OperationType.LIST,
        `trips/${tripId}/expenses/${expenseId}/notes`
      );
      if (onError) onError(new Error(info.error));
    }
  );
}

export async function createTrip(
  me: UserPrivateProfile,
  payload: {
    name: string;
    destination: string;
    description: string;
    coverImage?: string;
    startDate: string;
    endDate: string;
    currency: CurrencyCode;
    exchangeRateToInr: number;
    budgetPaise: number;
    memberBudgetsPaise?: Record<string, number>;
    initialParticipants: PublicProfile[];
  }
): Promise<string> {
  const tripRef = doc(collection(db, 'trips'));
  const nowIso = new Date().toISOString();
  const participantNames: Record<string, string> = { [me.uid]: me.fullName };
  const participantEmails: Record<string, string> = { [me.uid]: me.email.toLowerCase() };
  const participantJoinedAt: Record<string, string> = { [me.uid]: nowIso };
  const participantUids = [me.uid];

  for (const m of payload.initialParticipants) {
    if (m.uid !== me.uid && !participantUids.includes(m.uid) && participantUids.length < 50) {
      participantUids.push(m.uid);
      participantNames[m.uid] = (m.displayName || m.handle || 'Traveler').slice(0, 80);
      participantJoinedAt[m.uid] = nowIso;
    }
  }

  const sanitizedMemberBudgets: Record<string, number> = {};
  if (payload.memberBudgetsPaise) {
    for (const [uid, val] of Object.entries(payload.memberBudgetsPaise)) {
      if (participantUids.includes(uid) && Number.isFinite(val) && val > 0) {
        sanitizedMemberBudgets[uid] = Math.round(val);
      }
    }
  }

  const batch = writeBatch(db);
  batch.set(tripRef, {
    name: payload.name.trim().slice(0, 80),
    destination: payload.destination.trim().slice(0, 100),
    description: payload.description.trim().slice(0, 500),
    coverImage: payload.coverImage || '',
    startDate: payload.startDate || '',
    endDate: payload.endDate || '',
    currency: payload.currency,
    exchangeRateToInr: Number(payload.exchangeRateToInr) || 1,
    exchangeRateUpdatedAt: nowIso,
    budgetPaise: Math.max(0, Math.round(payload.budgetPaise || 0)),
    memberBudgetsPaise: sanitizedMemberBudgets,
    isArchived: false,
    participantUids,
    participantNames,
    participantEmails,
    participantJoinedAt,
    createdBy: me.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'trips', tripRef.id, 'activities'));
  batch.set(actRef, {
    groupId: tripRef.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'trip_created',
    summary: `${me.fullName} created trip "${payload.name.trim().slice(0, 60)}" to ${payload.destination.trim().slice(0, 40)}`,
    relatedId: tripRef.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `trips/${tripRef.id}`);
  }

  try {
    await notifyGroupMembers({
      memberUids: participantUids,
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'trip_invite',
      title: `Added to trip · ${payload.name.trim()}`,
      body: `${me.fullName} added you to the trip "${payload.name.trim()}" (${payload.destination.trim()}).`,
      groupId: tripRef.id,
      link: `/app/trips/${tripRef.id}`,
    });
  } catch {
    // Non-fatal
  }

  return tripRef.id;
}

export async function updateTripDetails(
  me: UserPrivateProfile,
  trip: Trip,
  updates: {
    name?: string;
    destination?: string;
    description?: string;
    coverImage?: string;
    startDate?: string;
    endDate?: string;
    currency?: CurrencyCode;
    exchangeRateToInr?: number;
    budgetPaise?: number;
    memberBudgetsPaise?: Record<string, number>;
    isArchived?: boolean;
  }
): Promise<void> {
  const nextName = (updates.name ?? trip.name).trim().slice(0, 80);
  const nextDest = (updates.destination ?? trip.destination).trim().slice(0, 100);
  const nextDesc = (updates.description ?? trip.description).trim().slice(0, 500);
  const nextArchived = updates.isArchived ?? trip.isArchived;
  const rateChanged =
    updates.exchangeRateToInr !== undefined &&
    updates.exchangeRateToInr !== trip.exchangeRateToInr;

  const sanitizedMemberBudgets: Record<string, number> = {};
  const rawBudgets = updates.memberBudgetsPaise ?? trip.memberBudgetsPaise ?? {};
  for (const [uid, val] of Object.entries(rawBudgets)) {
    if (Number.isFinite(val) && val > 0) {
      sanitizedMemberBudgets[uid] = Math.round(val);
    }
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'trips', trip.id), {
    name: nextName,
    destination: nextDest,
    description: nextDesc,
    coverImage: updates.coverImage ?? trip.coverImage ?? '',
    startDate: updates.startDate ?? trip.startDate ?? '',
    endDate: updates.endDate ?? trip.endDate ?? '',
    currency: updates.currency ?? trip.currency ?? 'INR',
    exchangeRateToInr: Number(updates.exchangeRateToInr ?? trip.exchangeRateToInr) || 1,
    exchangeRateUpdatedAt: rateChanged
      ? new Date().toISOString()
      : trip.exchangeRateUpdatedAt || new Date().toISOString(),
    budgetPaise: Math.max(0, Math.round(updates.budgetPaise ?? trip.budgetPaise ?? 0)),
    memberBudgetsPaise: sanitizedMemberBudgets,
    isArchived: nextArchived,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));
  let actType = 'trip_updated';
  let summary = `${me.fullName} updated trip details`;
  if (updates.isArchived !== undefined && updates.isArchived !== trip.isArchived) {
    actType = updates.isArchived ? 'trip_archived' : 'trip_restored';
    summary = updates.isArchived
      ? `${me.fullName} archived trip "${nextName}"`
      : `${me.fullName} restored trip "${nextName}"`;
  }

  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: actType,
    summary,
    relatedId: trip.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}`);
  }
}

export async function addParticipantsToTrip(
  me: UserPrivateProfile,
  trip: Trip,
  members: PublicProfile[]
): Promise<{ added: PublicProfile[]; skippedCount: number }> {
  if (!trip.participantUids.includes(me.uid)) {
    throw new Error('Only trip participants can add members.');
  }

  const seen = new Set<string>(trip.participantUids);
  const toAdd: PublicProfile[] = [];
  for (const m of members) {
    if (m?.uid && !seen.has(m.uid)) {
      seen.add(m.uid);
      toAdd.push(m);
    }
  }

  if (toAdd.length === 0) {
    return { added: [], skippedCount: members.length };
  }

  if (trip.participantUids.length + toAdd.length > 50) {
    throw new Error(
      `Trips support up to 50 participants (${50 - trip.participantUids.length} slots remaining).`
    );
  }

  const nowIso = new Date().toISOString();
  const nextParticipantUids = [...trip.participantUids, ...toAdd.map((m) => m.uid)];
  const nextParticipantNames = { ...trip.participantNames };
  const nextParticipantJoinedAt = { ...(trip.participantJoinedAt || {}) };

  for (const m of toAdd) {
    nextParticipantNames[m.uid] = (m.displayName || m.handle || 'Traveler').slice(0, 80);
    nextParticipantJoinedAt[m.uid] = nowIso;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'trips', trip.id), {
    participantUids: nextParticipantUids,
    participantNames: nextParticipantNames,
    participantJoinedAt: nextParticipantJoinedAt,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'member_joined',
    summary:
      toAdd.length === 1
        ? `${me.fullName} added ${toAdd[0].displayName} to the trip`
        : `${me.fullName} added ${toAdd.length} participants to the trip`,
    relatedId: toAdd[0].uid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}`);
  }

  try {
    await notifyGroupMembers({
      memberUids: toAdd.map((m) => m.uid),
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'trip_invite',
      title: `Added to trip · ${trip.name}`,
      body: `${me.fullName} added you to trip "${trip.name}" (${trip.destination}).`,
      groupId: trip.id,
      link: `/app/trips/${trip.id}`,
    });
  } catch {
    // Non-fatal
  }

  return { added: toAdd, skippedCount: members.length - toAdd.length };
}

export async function removeOrLeaveTripParticipant(
  me: UserPrivateProfile,
  trip: Trip,
  targetUid: string
): Promise<void> {
  const remaining = trip.participantUids.filter((u) => u !== targetUid);
  if (remaining.length === 0) {
    throw new Error('At least one participant must remain in the trip. Archive or delete the trip instead.');
  }

  const targetName = trip.participantNames[targetUid] || 'Traveler';
  const isSelf = targetUid === me.uid;

  const batch = writeBatch(db);
  batch.update(doc(db, 'trips', trip.id), {
    participantUids: remaining,
    participantNames: trip.participantNames,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: isSelf ? 'member_left' : 'member_removed',
    summary: isSelf
      ? `${me.fullName} left the trip`
      : `${me.fullName} removed ${targetName} from the trip`,
    relatedId: targetUid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}`);
  }
}

export async function deleteTripWithData(
  me: UserPrivateProfile,
  trip: Trip
): Promise<void> {
  if (!trip.participantUids.includes(me.uid)) {
    throw new Error('Only trip participants can delete this trip.');
  }

  const [expensesSnap, settlementsSnap, activitiesSnap, invitesSnap, myInvitesSnap] =
    await Promise.all([
      getDocs(collection(db, 'trips', trip.id, 'expenses')),
      getDocs(collection(db, 'trips', trip.id, 'settlements')),
      getDocs(collection(db, 'trips', trip.id, 'activities')),
      getDocs(collection(db, 'trips', trip.id, 'invites')),
      getDocs(query(collection(db, 'tripInvites'), where('createdBy', '==', me.uid))),
    ]);

  // Delete attached receipt objects from Storage safely
  await Promise.all(
    expensesSnap.docs.map(async (expDoc) => {
      const data = expDoc.data() as Expense;
      if (data.receiptMetadata?.storagePath) {
        await deleteReceiptObject(data.receiptMetadata.storagePath);
      }
    })
  );

  const [noteSnaps, topInviteSnaps] = await Promise.all([
    Promise.all(
      expensesSnap.docs.map((expDoc) =>
        getDocs(collection(db, 'trips', trip.id, 'expenses', expDoc.id, 'notes'))
      )
    ),
    Promise.all(
      invitesSnap.docs.map((invDoc) =>
        getDoc(doc(db, 'tripInvites', invDoc.id)).catch(() => null)
      )
    ),
  ]);

  const topInviteRefs = new Map<string, ReturnType<typeof doc>>();
  for (const snap of topInviteSnaps) {
    if (snap && snap.exists()) {
      topInviteRefs.set(snap.id, snap.ref);
    }
  }
  for (const d of myInvitesSnap.docs) {
    if ((d.data() as TripInvite).tripId === trip.id) {
      topInviteRefs.set(d.id, d.ref);
    }
  }

  const refsToDelete = [
    ...noteSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
    ...expensesSnap.docs.map((d) => d.ref),
    ...settlementsSnap.docs.map((d) => d.ref),
    ...activitiesSnap.docs.map((d) => d.ref),
    ...invitesSnap.docs.map((d) => d.ref),
    ...Array.from(topInviteRefs.values()),
  ];

  if (refsToDelete.length <= 450) {
    const batch = writeBatch(db);
    for (const ref of refsToDelete) batch.delete(ref);
    batch.delete(doc(db, 'trips', trip.id));
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `trips/${trip.id}`);
    }
    return;
  }

  const head = refsToDelete.slice(0, refsToDelete.length - 450);
  const tail = refsToDelete.slice(refsToDelete.length - 450);
  for (let i = 0; i < head.length; i += 450) {
    const chunkBatch = writeBatch(db);
    for (const ref of head.slice(i, i + 450)) chunkBatch.delete(ref);
    await chunkBatch.commit().catch(() => {});
  }
  const finalBatch = writeBatch(db);
  for (const ref of tail) finalBatch.delete(ref);
  finalBatch.delete(doc(db, 'trips', trip.id));
  try {
    await finalBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `trips/${trip.id}`);
  }
}

export async function createTripInvite(
  me: UserPrivateProfile,
  trip: Trip,
  options: { maxUses?: number; expiryDays?: number } = {}
): Promise<TripInvite> {
  if (!trip.participantUids.includes(me.uid)) {
    throw new Error('Only trip participants can generate invitation links.');
  }

  const token = generateToken('trp');
  const rawMax = Number(options.maxUses ?? 15);
  const rawDays = Number(options.expiryDays ?? 14);
  const maxUses = Math.min(100, Math.max(1, Number.isFinite(rawMax) ? Math.round(rawMax) : 15));
  const expiryDays = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? Math.round(rawDays) : 14));
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + expiryDays * 86400 * 1000));
  const safeTripName = trip.name.trim().slice(0, 80) || 'Trip';

  const basePayload = {
    token,
    tripId: trip.id,
    tripName: safeTripName,
    destination: trip.destination.trim().slice(0, 100),
    createdBy: me.uid,
    createdByName: me.fullName.slice(0, 80),
    status: 'active' as const,
    expiresAt,
    maxUses,
    usesCount: 0,
    usedBy: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'tripInvites', token), basePayload);
  batch.set(doc(db, 'trips', trip.id, 'invites', token), basePayload);
  batch.set(doc(collection(db, 'trips', trip.id, 'activities')), {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'trip_invite_created',
    summary: `${me.fullName} created a trip invitation link (${maxUses} uses, ${expiryDays}d)`,
    relatedId: token,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `tripInvites/${token}`);
  }

  const nowTs = Timestamp.now();
  return {
    token,
    tripId: trip.id,
    tripName: safeTripName,
    destination: trip.destination.trim().slice(0, 100),
    createdBy: me.uid,
    createdByName: me.fullName.slice(0, 80),
    status: 'active',
    expiresAt,
    maxUses,
    usesCount: 0,
    usedBy: [],
    createdAt: nowTs,
    updatedAt: nowTs,
  };
}

export async function revokeTripInvite(
  token: string,
  me?: UserPrivateProfile,
  tripId?: string
): Promise<void> {
  if (!VALID_TOKEN_RE.test(token)) {
    throw new Error('Invalid trip invitation token.');
  }

  const topRef = doc(db, 'tripInvites', token);
  let targetTripId = tripId;
  if (!targetTripId) {
    try {
      const snap = await getDoc(topRef);
      if (snap.exists()) targetTripId = (snap.data() as TripInvite).tripId;
    } catch {
      // ignore
    }
  }

  const actorUid = me?.uid || auth.currentUser?.uid || '';
  const actorName = me?.fullName || auth.currentUser?.displayName || 'Traveler';
  const batch = writeBatch(db);

  batch.update(topRef, {
    status: 'revoked',
    revokedBy: actorUid,
    revokedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (targetTripId) {
    const mirrorRef = doc(db, 'trips', targetTripId, 'invites', token);
    try {
      const mirrorSnap = await getDoc(mirrorRef);
      if (mirrorSnap.exists()) {
        batch.update(mirrorRef, {
          status: 'revoked',
          revokedBy: actorUid,
          revokedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // ignore
    }

    if (actorUid) {
      batch.set(doc(collection(db, 'trips', targetTripId, 'activities')), {
        groupId: targetTripId,
        actorUid,
        actorName: actorName.slice(0, 80),
        type: 'trip_invite_revoked',
        summary: `${actorName} revoked a trip invitation link`,
        relatedId: token,
        createdAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tripInvites/${token}`);
  }
}

export function subscribeTripInvites(
  tripId: string,
  uid: string,
  callback: (invites: TripInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let tripDocs: TripInvite[] = [];
  let myLegacyDocs: TripInvite[] = [];
  let active = true;

  const emitMerged = async () => {
    const byToken = new Map<string, TripInvite>();
    for (const inv of myLegacyDocs) {
      if (inv.tripId === tripId) byToken.set(inv.token, inv);
    }
    for (const inv of tripDocs) {
      byToken.set(inv.token, inv);
    }

    const hydrated = await Promise.all(
      Array.from(byToken.values()).map(async (inv) => {
        try {
          const topSnap = await getDoc(doc(db, 'tripInvites', inv.token));
          if (topSnap.exists()) return topSnap.data() as TripInvite;
        } catch {
          // offline fallback
        }
        return inv;
      })
    );
    if (!active) return;
    hydrated.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    callback(hydrated);
  };

  const unsubTrip = onSnapshot(
    collection(db, 'trips', tripId, 'invites'),
    (snap) => {
      tripDocs = snap.docs.map((d) => d.data() as TripInvite);
      void emitMerged();
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, `trips/${tripId}/invites`);
      if (onError) onError(new Error(info.error));
    }
  );

  const unsubMine = onSnapshot(
    query(collection(db, 'tripInvites'), where('createdBy', '==', uid)),
    (snap) => {
      myLegacyDocs = snap.docs.map((d) => d.data() as TripInvite);
      void emitMerged();
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, 'tripInvites');
      if (onError) onError(new Error(info.error));
    }
  );

  return () => {
    active = false;
    unsubTrip();
    unsubMine();
  };
}

export async function getTripInvite(token: string): Promise<TripInvite | null> {
  if (!VALID_TOKEN_RE.test(token)) return null;
  try {
    const snap = await getFreshDoc(doc(db, 'tripInvites', token));
    return snap.exists() ? (snap.data() as TripInvite) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `tripInvites/${token}`);
  }
}

export interface BackendTripInviteValidationResult {
  valid: boolean;
  reason?: 'invalid' | 'revoked' | 'expired' | 'limit_reached' | 'group_deleted' | 'already_used' | 'already_member';
  message?: string;
  invite?: {
    token: string;
    tripId?: string;
    tripName?: string;
    destination?: string;
    createdByName?: string;
    expiresAtIso: string;
    maxUses: number;
    usesCount: number;
    status: string;
  };
  trip?: {
    id: string;
    name: string;
    destination: string;
    memberCount: number;
    isArchived: boolean;
  };
}

export async function validateTripInviteBackend(
  token: string
): Promise<BackendTripInviteValidationResult> {
  if (!VALID_TOKEN_RE.test(token)) {
    return {
      valid: false,
      reason: 'invalid',
      message: 'This trip invitation link is malformed or invalid.',
    };
  }
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Authentication required to validate this trip invitation.');
  }
  const res = await fetch('/api/invitations/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token, kind: 'trip' }),
  });
  if (!res.ok) {
    const errPayload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errPayload.error || 'Could not validate trip invitation.');
  }
  return (await res.json()) as BackendTripInviteValidationResult;
}

export async function joinTripByToken(
  me: UserPrivateProfile,
  token: string
): Promise<{ tripId: string; tripName: string; alreadyMember: boolean }> {
  if (!VALID_TOKEN_RE.test(token)) {
    throw new Error('This trip invitation link is invalid.');
  }

  const inviteRef = doc(db, 'tripInvites', token);
  const initialSnap = await getFreshDoc(inviteRef);
  if (!initialSnap.exists()) {
    throw new Error('This trip invitation link is invalid or does not exist.');
  }
  const initialInvite = initialSnap.data() as TripInvite;
  if (initialInvite.status === 'revoked') {
    throw new Error('This trip invitation link has been revoked.');
  }
  if (initialInvite.expiresAt.toDate().getTime() < Date.now()) {
    throw new Error('This trip invitation link has expired.');
  }

  try {
    const existingTripSnap = await getFreshDoc(doc(db, 'trips', initialInvite.tripId));
    if (existingTripSnap.exists()) {
      const trp = existingTripSnap.data() as Omit<Trip, 'id'>;
      if (trp.participantUids.includes(me.uid)) {
        return {
          tripId: initialInvite.tripId,
          tripName: trp.name || initialInvite.tripName,
          alreadyMember: true,
        };
      }
    }
  } catch {
    // proceed with transaction
  }

  if (initialInvite.usesCount >= initialInvite.maxUses) {
    throw new Error('This trip invitation link has reached its maximum usage limit.');
  }
  if (initialInvite.usedBy.includes(me.uid)) {
    throw new Error('You already redeemed this trip invitation link previously.');
  }

  const safeName = me.fullName.trim().slice(0, 80) || me.email.split('@')[0] || 'Traveler';
  const joinedIso = new Date().toISOString();

  const result = await runTransaction(db, async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists()) {
      throw new Error('This trip invitation link is invalid or does not exist.');
    }
    const invite = inviteSnap.data() as TripInvite;
    if (invite.status === 'revoked') throw new Error('This trip invitation link has been revoked.');
    if (invite.expiresAt.toDate().getTime() < Date.now()) {
      throw new Error('This trip invitation link has expired.');
    }
    if (invite.usesCount >= invite.maxUses) {
      throw new Error('This trip invitation link has reached its maximum usage limit.');
    }
    if (invite.usedBy.includes(me.uid)) {
      throw new Error('You already redeemed this trip invitation link previously.');
    }

    tx.update(inviteRef, {
      usesCount: invite.usesCount + 1,
      usedBy: [...invite.usedBy, me.uid],
      updatedAt: serverTimestamp(),
    });

    tx.update(doc(db, 'trips', invite.tripId), {
      participantUids: arrayUnion(me.uid),
      [`participantNames.${me.uid}`]: safeName,
      [`participantEmails.${me.uid}`]: me.email.toLowerCase().slice(0, 120),
      [`participantJoinedAt.${me.uid}`]: joinedIso,
      lastJoinToken: token,
      updatedAt: serverTimestamp(),
    });

    const actRef = doc(collection(db, 'trips', invite.tripId, 'activities'));
    tx.set(actRef, {
      groupId: invite.tripId,
      actorUid: me.uid,
      actorName: safeName,
      type: 'member_joined',
      summary: `${safeName} joined the trip via invitation link`,
      relatedId: me.uid,
      createdAt: serverTimestamp(),
    });

    return { tripId: invite.tripId, tripName: invite.tripName, alreadyMember: false };
  });

  try {
    const tripSnap = await getDoc(doc(db, 'trips', result.tripId));
    if (tripSnap.exists()) {
      const trp = tripSnap.data() as Omit<Trip, 'id'>;
      await notifyGroupMembers({
        memberUids: trp.participantUids,
        senderUid: me.uid,
        senderName: safeName,
        type: 'member_joined',
        title: `${safeName} joined ${result.tripName}`,
        body: `${safeName} joined the trip "${result.tripName}" via invitation link.`,
        groupId: result.tripId,
        link: `/app/trips/${result.tripId}`,
      });
    }
  } catch {
    // Non-fatal
  }

  return result;
}

export interface TripExpenseUpsertPayload {
  expenseId?: string;
  title: string;
  description: string;
  amountPaise: number;
  currency: CurrencyCode;
  originalAmountMinor: number;
  exchangeRateToInr: number;
  tags: string[];
  category: ExpenseCategory;
  expenseDate: string;
  splitMethod: SplitMethod;
  payers: ExpensePayer[];
  shares: ExpenseShare[];
  receiptImage?: string;
  receiptMetadata?: ReceiptMetadata | null;
}

export async function addTripExpense(
  me: UserPrivateProfile,
  trip: Trip,
  payload: TripExpenseUpsertPayload
): Promise<{ id: string; queuedOffline: boolean }> {
  const expRef = payload.expenseId
    ? doc(db, 'trips', trip.id, 'expenses', payload.expenseId)
    : doc(collection(db, 'trips', trip.id, 'expenses'));

  const payerUids = Array.from(new Set(payload.payers.map((p) => p.uid)));
  const participantUids = Array.from(new Set(payload.shares.map((s) => s.uid)));
  const cleanTags = Array.from(
    new Set((payload.tags || []).map(normalizeExpenseTag).filter(Boolean))
  ).slice(0, 10);

  const displayOriginal =
    payload.currency !== 'INR'
      ? `${formatOriginalCurrency(payload.originalAmountMinor, payload.currency)} · ${formatINR(payload.amountPaise)}`
      : formatINR(payload.amountPaise);

  const batch = writeBatch(db);
  batch.set(expRef, {
    groupId: trip.id,
    tripId: trip.id,
    title: payload.title.trim().slice(0, 120),
    description: payload.description.trim().slice(0, 500),
    amountPaise: Math.round(payload.amountPaise),
    currency: payload.currency,
    originalAmountMinor: Math.round(payload.originalAmountMinor),
    exchangeRateToInr: Number(payload.exchangeRateToInr) || 1,
    tags: cleanTags,
    category: payload.category,
    expenseDate: payload.expenseDate,
    splitMethod: payload.splitMethod,
    payers: payload.payers,
    shares: payload.shares,
    participantUids,
    payerUids,
    receiptImage: payload.receiptImage || '',
    receiptMetadata: payload.receiptMetadata ?? null,
    isRecurring: false,
    recurringFrequency: 'none',
    recurringIntervalDays: 0,
    nextOccurrenceDate: '',
    createdBy: me.uid,
    updatedBy: me.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(collection(db, 'trips', trip.id, 'activities')), {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'expense_added',
    summary: `${me.fullName} logged "${payload.title.trim().slice(0, 60)}" (${displayOriginal})`,
    relatedId: expRef.id,
    createdAt: serverTimestamp(),
  });

  const { queuedOffline } = await commitBatchOfflineAware(
    batch,
    OperationType.CREATE,
    `trips/${trip.id}/expenses/${expRef.id}`,
    () =>
      notifyGroupMembers({
        memberUids: trip.participantUids,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'expense_added',
        title: `${trip.name} · New trip expense`,
        body: `${me.fullName} added "${payload.title.trim()}" for ${displayOriginal}.`,
        groupId: trip.id,
        link: `/app/trips/${trip.id}`,
      })
  );

  return { id: expRef.id, queuedOffline };
}

export async function updateTripExpense(
  me: UserPrivateProfile,
  trip: Trip,
  expenseId: string,
  payload: TripExpenseUpsertPayload,
  previousReceiptStoragePath?: string
): Promise<{ queuedOffline: boolean }> {
  const expRef = doc(db, 'trips', trip.id, 'expenses', expenseId);
  const payerUids = Array.from(new Set(payload.payers.map((p) => p.uid)));
  const participantUids = Array.from(new Set(payload.shares.map((s) => s.uid)));
  const cleanTags = Array.from(
    new Set((payload.tags || []).map(normalizeExpenseTag).filter(Boolean))
  ).slice(0, 10);

  const displayOriginal =
    payload.currency !== 'INR'
      ? `${formatOriginalCurrency(payload.originalAmountMinor, payload.currency)} · ${formatINR(payload.amountPaise)}`
      : formatINR(payload.amountPaise);

  const batch = writeBatch(db);
  batch.update(expRef, {
    title: payload.title.trim().slice(0, 120),
    description: payload.description.trim().slice(0, 500),
    amountPaise: Math.round(payload.amountPaise),
    currency: payload.currency,
    originalAmountMinor: Math.round(payload.originalAmountMinor),
    exchangeRateToInr: Number(payload.exchangeRateToInr) || 1,
    tags: cleanTags,
    category: payload.category,
    expenseDate: payload.expenseDate,
    splitMethod: payload.splitMethod,
    payers: payload.payers,
    shares: payload.shares,
    participantUids,
    payerUids,
    receiptImage: payload.receiptImage ?? '',
    receiptMetadata: payload.receiptMetadata !== undefined ? payload.receiptMetadata : null,
    updatedBy: me.uid,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(collection(db, 'trips', trip.id, 'activities')), {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'expense_updated',
    summary: `${me.fullName} updated "${payload.title.trim().slice(0, 60)}" (${displayOriginal})`,
    relatedId: expenseId,
    createdAt: serverTimestamp(),
  });

  const { queuedOffline } = await commitBatchOfflineAware(
    batch,
    OperationType.UPDATE,
    `trips/${trip.id}/expenses/${expenseId}`,
    async () => {
      if (
        previousReceiptStoragePath &&
        previousReceiptStoragePath !== payload.receiptMetadata?.storagePath
      ) {
        await deleteReceiptObject(previousReceiptStoragePath);
      }
      await notifyGroupMembers({
        memberUids: trip.participantUids,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'expense_updated',
        title: `${trip.name} · Expense updated`,
        body: `${me.fullName} updated "${payload.title.trim()}" (${displayOriginal}).`,
        groupId: trip.id,
        link: `/app/trips/${trip.id}`,
      });
    }
  );

  return { queuedOffline };
}

export async function deleteTripExpense(
  me: UserPrivateProfile,
  trip: Trip,
  expense: Expense
): Promise<void> {
  const notesSnap = await getDocs(
    collection(db, 'trips', trip.id, 'expenses', expense.id, 'notes')
  );

  const batch = writeBatch(db);
  for (const n of notesSnap.docs) batch.delete(n.ref);
  batch.delete(doc(db, 'trips', trip.id, 'expenses', expense.id));
  batch.set(doc(collection(db, 'trips', trip.id, 'activities')), {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'expense_deleted',
    summary: `${me.fullName} deleted "${expense.title.slice(0, 60)}" (${formatINR(expense.amountPaise)})`,
    relatedId: expense.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `trips/${trip.id}/expenses/${expense.id}`);
  }

  if (expense.receiptMetadata?.storagePath) {
    await deleteReceiptObject(expense.receiptMetadata.storagePath);
  }
}

export async function addTripExpenseNote(
  me: UserPrivateProfile,
  trip: Trip,
  expense: Expense,
  text: string
): Promise<void> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;

  const noteRef = doc(collection(db, 'trips', trip.id, 'expenses', expense.id, 'notes'));
  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));

  const batch = writeBatch(db);
  batch.set(noteRef, {
    authorUid: me.uid,
    authorName: me.fullName.slice(0, 80),
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'note_added',
    summary: `${me.fullName} commented on "${expense.title.slice(0, 50)}"`,
    relatedId: expense.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `trips/${trip.id}/expenses/${expense.id}/notes/${noteRef.id}`
    );
  }
}

export async function deleteTripExpenseNote(
  tripId: string,
  expenseId: string,
  noteId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId, 'notes', noteId));
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `trips/${tripId}/expenses/${expenseId}/notes/${noteId}`
    );
  }
}

export async function recordTripSettlement(
  me: UserPrivateProfile,
  trip: Trip,
  payload: {
    fromUid: string;
    fromName: string;
    toUid: string;
    toName: string;
    amountPaise: number;
    method: SettlementMethod;
    upiTransactionRef?: string;
    note?: string;
    existingSettlements: Settlement[];
  }
): Promise<{ id: string; queuedOffline: boolean }> {
  if (payload.fromUid === payload.toUid) {
    throw new Error('Payer and receiver cannot be the same participant.');
  }
  if (payload.amountPaise <= 0) {
    throw new Error('Settlement amount must be greater than ₹0.');
  }
  const duplicate = payload.existingSettlements.find(
    (s) =>
      s.fromUid === payload.fromUid &&
      s.toUid === payload.toUid &&
      s.amountPaise === payload.amountPaise &&
      (s.status === 'pending' || s.status === 'awaiting_confirmation')
  );
  if (duplicate) {
    throw new Error('An active settlement for this exact amount already exists between these participants.');
  }

  const initialStatus = me.uid === payload.fromUid ? 'awaiting_confirmation' : 'pending';
  const stRef = doc(collection(db, 'trips', trip.id, 'settlements'));
  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));

  const batch = writeBatch(db);
  batch.set(stRef, {
    groupId: trip.id,
    fromUid: payload.fromUid,
    fromName: payload.fromName.slice(0, 80),
    toUid: payload.toUid,
    toName: payload.toName.slice(0, 80),
    amountPaise: Math.round(payload.amountPaise),
    method: payload.method,
    upiTransactionRef: (payload.upiTransactionRef || '').trim().slice(0, 120),
    note: (payload.note || '').trim().slice(0, 250),
    status: initialStatus,
    createdBy: me.uid,
    confirmedBy: '',
    disputeReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'settlement_recorded',
    summary: `${payload.fromName} recorded a ${payload.method.toUpperCase()} payment of ${formatINR(payload.amountPaise)} to ${payload.toName}`,
    relatedId: stRef.id,
    createdAt: serverTimestamp(),
  });

  const recipientUid = me.uid === payload.fromUid ? payload.toUid : payload.fromUid;
  const { queuedOffline } = await commitBatchOfflineAware(
    batch,
    OperationType.CREATE,
    `trips/${trip.id}/settlements/${stRef.id}`,
    () =>
      createNotification({
        recipientUid,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'settlement_recorded',
        title: `${trip.name} · Trip payment recorded`,
        body:
          me.uid === payload.fromUid
            ? `${payload.fromName} marked ${formatINR(payload.amountPaise)} paid via ${payload.method.toUpperCase()}. Please confirm receipt.`
            : `${me.fullName} requested ${formatINR(payload.amountPaise)} settlement for ${trip.name}.`,
        groupId: trip.id,
        link: `/app/trips/${trip.id}`,
      })
  );

  return { id: stRef.id, queuedOffline };
}

export async function markTripSettlementPaid(
  me: UserPrivateProfile,
  trip: Trip,
  settlement: Settlement,
  updates: { method: SettlementMethod; upiTransactionRef?: string; note?: string }
): Promise<void> {
  const stRef = doc(db, 'trips', trip.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    status: 'awaiting_confirmation',
    method: updates.method,
    upiTransactionRef: (updates.upiTransactionRef || '').trim().slice(0, 120),
    note: (updates.note || '').trim().slice(0, 250),
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'settlement_recorded',
    summary: `${me.fullName} sent ${formatINR(settlement.amountPaise)} via ${updates.method.toUpperCase()} to ${settlement.toName}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}/settlements/${settlement.id}`);
  }

  try {
    await createNotification({
      recipientUid: settlement.toUid,
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'settlement_recorded',
      title: `${trip.name} · Confirm trip payment`,
      body: `${me.fullName} sent ${formatINR(settlement.amountPaise)} (${updates.method.toUpperCase()}). Confirm once received.`,
      groupId: trip.id,
      link: `/app/trips/${trip.id}`,
    });
  } catch {
    // Non-fatal
  }
}

export async function confirmTripSettlement(
  me: UserPrivateProfile,
  trip: Trip,
  settlement: Settlement
): Promise<void> {
  const stRef = doc(db, 'trips', trip.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    status: 'confirmed',
    confirmedBy: me.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'settlement_confirmed',
    summary: `${me.fullName} confirmed receiving ${formatINR(settlement.amountPaise)} from ${settlement.fromName}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}/settlements/${settlement.id}`);
  }

  try {
    await createNotification({
      recipientUid: settlement.fromUid,
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'settlement_confirmed',
      title: `${trip.name} · Trip payment confirmed`,
      body: `${me.fullName} confirmed your ${formatINR(settlement.amountPaise)} payment.`,
      groupId: trip.id,
      link: `/app/trips/${trip.id}`,
    });
  } catch {
    // Non-fatal
  }
}

export async function disputeTripSettlement(
  me: UserPrivateProfile,
  trip: Trip,
  settlement: Settlement,
  reason: string
): Promise<void> {
  const stRef = doc(db, 'trips', trip.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    status: 'disputed',
    disputeReason: reason.trim().slice(0, 250) || 'Payment not received yet',
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'settlement_disputed',
    summary: `${me.fullName} disputed ${formatINR(settlement.amountPaise)} payment from ${settlement.fromName}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}/settlements/${settlement.id}`);
  }
}

export async function updatePendingTripSettlement(
  me: UserPrivateProfile,
  trip: Trip,
  settlement: Settlement,
  updates: {
    amountPaise: number;
    method: SettlementMethod;
    upiTransactionRef?: string;
    note?: string;
  }
): Promise<{ queuedOffline: boolean }> {
  if (settlement.status === 'confirmed') {
    throw new Error('Confirmed settlements are locked and cannot be edited.');
  }
  const stRef = doc(db, 'trips', trip.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'trips', trip.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    amountPaise: Math.round(updates.amountPaise),
    method: updates.method,
    upiTransactionRef: (updates.upiTransactionRef || '').trim().slice(0, 120),
    note: (updates.note || '').trim().slice(0, 250),
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: trip.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'settlement_updated',
    summary: `${me.fullName} updated settlement to ${formatINR(updates.amountPaise)}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  return await commitBatchOfflineAware(
    batch,
    OperationType.UPDATE,
    `trips/${trip.id}/settlements/${settlement.id}`
  );
}

export async function deleteTripSettlement(tripId: string, settlementId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'settlements', settlementId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `trips/${tripId}/settlements/${settlementId}`);
  }
}

export { classifyBudgetStatus, type BudgetThresholdStatus };

export interface TripMemberSummary extends MemberBalance {
  personalBudgetPaise: number;
  personalBudgetPercent: number;
  personalBudgetStatus: BudgetThresholdStatus;
}

export interface TripAnalyticsSummary {
  totalSpentPaise: number;
  budgetPaise: number;
  remainingBudgetPaise: number;
  budgetPercentUsed: number;
  budgetStatus: BudgetThresholdStatus;
  memberSummaries: TripMemberSummary[];
  simplifiedDebts: SimplifiedDebt[];
  zeroSumValid: boolean;
}

export function computeTripAnalytics(
  trip: Trip,
  expenses: Expense[],
  settlements: Settlement[]
): TripAnalyticsSummary {
  const { totalExpenditurePaise, memberBalances, simplifiedDebts } = computeGroupBalances(
    trip.participantNames,
    expenses,
    settlements
  );

  const budgetPaise = Math.max(0, Math.round(trip.budgetPaise || 0));
  const { percentUsed, status } = classifyBudgetStatus(totalExpenditurePaise, budgetPaise);
  const memberBudgets = trip.memberBudgetsPaise || {};

  const memberSummaries: TripMemberSummary[] = memberBalances.map((mb) => {
    const personalBudgetPaise = Math.max(0, Math.round(memberBudgets[mb.uid] || 0));
    const personal = classifyBudgetStatus(mb.expenseSharePaise, personalBudgetPaise);
    return {
      ...mb,
      personalBudgetPaise,
      personalBudgetPercent: personal.percentUsed,
      personalBudgetStatus: personal.status,
    };
  });

  return {
    totalSpentPaise: totalExpenditurePaise,
    budgetPaise,
    remainingBudgetPaise: budgetPaise > 0 ? budgetPaise - totalExpenditurePaise : 0,
    budgetPercentUsed: percentUsed,
    budgetStatus: status,
    memberSummaries,
    simplifiedDebts,
    zeroSumValid: verifyZeroSumBalance(memberBalances),
  };
}
