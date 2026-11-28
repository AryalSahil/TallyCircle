import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, logFirestoreError, OperationType } from '../lib/firebase';
import type {
  Group,
  GroupActivity,
  GroupEmailInvite,
  GroupInvite,
  PublicProfile,
  UserPrivateProfile,
} from '../types';
import {
  buildGroupInviteUrl,
  generateToken,
  isValidEmailAddress,
} from '../utils/helpers';
import { notifyGroupMembers } from './notificationService';
import { findUserByEmailOrHandle } from './userService';

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

export function subscribeGroups(
  uid: string,
  callback: (groups: Group[]) => void,
  onError?: (err: Error) => void,
  onMetadata?: (hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups'),
    where('memberUids', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (onMetadata) onMetadata(snap.metadata.hasPendingWrites);
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Group, 'id'>),
        }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(list);
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, 'groups');
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeGroup(
  groupId: string,
  callback: (group: Group | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'groups', groupId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<Group, 'id'>) });
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.GET, `groups/${groupId}`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeGroupActivities(
  groupId: string,
  callback: (items: GroupActivity[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'groups', groupId, 'activities'));
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
      const info = logFirestoreError(error, OperationType.LIST, `groups/${groupId}/activities`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export async function createGroup(
  me: UserPrivateProfile,
  payload: {
    name: string;
    description: string;
    coverImage?: string;
    startDate?: string;
    endDate?: string;
    initialMembers: PublicProfile[];
  }
): Promise<string> {
  const groupRef = doc(collection(db, 'groups'));
  const nowIso = new Date().toISOString();
  const memberMap: Record<string, string> = { [me.uid]: me.fullName };
  const memberEmails: Record<string, string> = { [me.uid]: me.email.toLowerCase() };
  const memberJoinedAt: Record<string, string> = { [me.uid]: nowIso };
  const memberUids = [me.uid];

  for (const m of payload.initialMembers) {
    if (m.uid !== me.uid && !memberUids.includes(m.uid) && memberUids.length < 50) {
      memberUids.push(m.uid);
      memberMap[m.uid] = m.displayName;
      memberJoinedAt[m.uid] = nowIso;
    }
  }

  const batch = writeBatch(db);
  batch.set(groupRef, {
    name: payload.name.trim().slice(0, 80),
    description: payload.description.trim().slice(0, 500),
    coverImage: payload.coverImage || '',
    currency: 'INR',
    isArchived: false,
    startDate: payload.startDate || '',
    endDate: payload.endDate || '',
    memberUids,
    memberNames: memberMap,
    memberEmails,
    memberJoinedAt,
    createdBy: me.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', groupRef.id, 'activities'));
  batch.set(actRef, {
    groupId: groupRef.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'group_updated',
    summary: `${me.fullName} created "${payload.name.trim().slice(0, 80)}"`,
    relatedId: groupRef.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `groups/${groupRef.id}`);
  }

  try {
    await notifyGroupMembers({
      memberUids,
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'group_invite',
      title: `Added to ${payload.name.trim()}`,
      body: `${me.fullName} added you to the expense group "${payload.name.trim()}".`,
      groupId: groupRef.id,
    });
  } catch {
    // Notification delivery failure must not fail an already-created group
  }

  return groupRef.id;
}

export async function updateGroupDetails(
  me: UserPrivateProfile,
  group: Group,
  updates: {
    name?: string;
    description?: string;
    coverImage?: string;
    startDate?: string;
    endDate?: string;
    isArchived?: boolean;
  }
): Promise<void> {
  const batch = writeBatch(db);
  const nextName = (updates.name ?? group.name).trim().slice(0, 80);
  const nextDesc = (updates.description ?? group.description).trim().slice(0, 500);
  const nextArchived = updates.isArchived ?? group.isArchived;

  batch.update(doc(db, 'groups', group.id), {
    name: nextName,
    description: nextDesc,
    coverImage: updates.coverImage ?? group.coverImage ?? '',
    startDate: updates.startDate ?? group.startDate ?? '',
    endDate: updates.endDate ?? group.endDate ?? '',
    isArchived: nextArchived,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  let actType = 'group_updated';
  let summary = `${me.fullName} updated group details`;
  if (updates.isArchived !== undefined && updates.isArchived !== group.isArchived) {
    actType = updates.isArchived ? 'group_archived' : 'group_restored';
    summary = updates.isArchived
      ? `${me.fullName} archived "${nextName}"`
      : `${me.fullName} restored "${nextName}"`;
  }

  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: actType,
    summary,
    relatedId: group.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function addMembersToGroup(
  me: UserPrivateProfile,
  group: Group,
  members: PublicProfile[]
): Promise<{ added: PublicProfile[]; skippedCount: number }> {
  if (!group.memberUids.includes(me.uid)) {
    throw new Error('Only authorized group members can add new members.');
  }

  const seen = new Set<string>(group.memberUids);
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

  if (group.memberUids.length + toAdd.length > 50) {
    throw new Error(
      `Groups support up to 50 active members (${50 - group.memberUids.length} slots remaining).`
    );
  }

  const nowIso = new Date().toISOString();
  const nextMemberUids = [...group.memberUids, ...toAdd.map((m) => m.uid)];
  const nextMemberNames = { ...group.memberNames };
  const nextMemberJoinedAt = { ...(group.memberJoinedAt || {}) };

  for (const m of toAdd) {
    nextMemberNames[m.uid] = (m.displayName || m.handle || 'Member').slice(0, 80);
    nextMemberJoinedAt[m.uid] = nowIso;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'groups', group.id), {
    memberUids: nextMemberUids,
    memberNames: nextMemberNames,
    memberJoinedAt: nextMemberJoinedAt,
    updatedAt: serverTimestamp(),
  });

  const namesList = toAdd.map((m) => m.displayName).join(', ');
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'member_joined',
    summary:
      toAdd.length === 1
        ? `${me.fullName} added ${toAdd[0].displayName} to the group`
        : `${me.fullName} added ${toAdd.length} members (${namesList.slice(0, 120)})`,
    relatedId: toAdd[0].uid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}`);
  }

  try {
    await notifyGroupMembers({
      memberUids: toAdd.map((m) => m.uid),
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'group_invite',
      title: `Added to ${group.name}`,
      body: `${me.fullName} added you to "${group.name}".`,
      groupId: group.id,
    });
  } catch {
    // Notification delivery failure should not roll back a committed membership write
  }

  return { added: toAdd, skippedCount: members.length - toAdd.length };
}

export async function addMemberToGroup(
  me: UserPrivateProfile,
  group: Group,
  member: PublicProfile
): Promise<void> {
  await addMembersToGroup(me, group, [member]);
}

export async function removeOrLeaveMember(
  me: UserPrivateProfile,
  group: Group,
  targetUid: string
): Promise<void> {
  const remaining = group.memberUids.filter((u) => u !== targetUid);
  if (remaining.length === 0) {
    throw new Error('At least one member must remain in the group. Archive or delete the group instead.');
  }

  const targetName = group.memberNames[targetUid] || 'Member';
  const isSelf = targetUid === me.uid;

  const batch = writeBatch(db);
  // Note: memberNames is preserved intentionally so historical expense records stay readable
  batch.update(doc(db, 'groups', group.id), {
    memberUids: remaining,
    memberNames: group.memberNames,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: isSelf ? 'member_left' : 'member_removed',
    summary: isSelf
      ? `${me.fullName} left the group (historical records preserved)`
      : `${me.fullName} removed ${targetName} from the group`,
    relatedId: targetUid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function deleteGroupWithData(
  me: UserPrivateProfile,
  group: Group
): Promise<void> {
  if (!group.memberUids.includes(me.uid)) {
    throw new Error('Only group members can delete this group.');
  }

  const [expensesSnap, settlementsSnap, activitiesSnap, invitesSnap, emailInvitesSnap, myInvitesSnap] =
    await Promise.all([
      getDocs(collection(db, 'groups', group.id, 'expenses')),
      getDocs(collection(db, 'groups', group.id, 'settlements')),
      getDocs(collection(db, 'groups', group.id, 'activities')),
      getDocs(collection(db, 'groups', group.id, 'invites')),
      getDocs(collection(db, 'groups', group.id, 'emailInvites')),
      getDocs(query(collection(db, 'groupInvites'), where('createdBy', '==', me.uid))),
    ]);

  const [noteSnaps, topInviteSnaps] = await Promise.all([
    Promise.all(
      expensesSnap.docs.map((expDoc) =>
        getDocs(collection(db, 'groups', group.id, 'expenses', expDoc.id, 'notes'))
      )
    ),
    Promise.all(
      invitesSnap.docs.map((invDoc) =>
        getDoc(doc(db, 'groupInvites', invDoc.id)).catch(() => null)
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
    if ((d.data() as GroupInvite).groupId === group.id) {
      topInviteRefs.set(d.id, d.ref);
    }
  }

  const refsToDelete = [
    ...noteSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
    ...expensesSnap.docs.map((d) => d.ref),
    ...settlementsSnap.docs.map((d) => d.ref),
    ...activitiesSnap.docs.map((d) => d.ref),
    ...invitesSnap.docs.map((d) => d.ref),
    ...emailInvitesSnap.docs.map((d) => d.ref),
    ...Array.from(topInviteRefs.values()),
  ];

  if (refsToDelete.length <= 450) {
    const batch = writeBatch(db);
    for (const ref of refsToDelete) {
      batch.delete(ref);
    }
    batch.delete(doc(db, 'groups', group.id));
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${group.id}`);
    }
    return;
  }

  const head = refsToDelete.slice(0, refsToDelete.length - 450);
  const tail = refsToDelete.slice(refsToDelete.length - 450);
  for (let i = 0; i < head.length; i += 450) {
    const chunkBatch = writeBatch(db);
    for (const ref of head.slice(i, i + 450)) {
      chunkBatch.delete(ref);
    }
    try {
      await chunkBatch.commit();
    } catch {
      // Tail deletes remaining documents atomically with the parent group
    }
  }

  const finalBatch = writeBatch(db);
  for (const ref of tail) {
    finalBatch.delete(ref);
  }
  finalBatch.delete(doc(db, 'groups', group.id));
  try {
    await finalBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `groups/${group.id}`);
  }
}

export async function createGroupInvite(
  me: UserPrivateProfile,
  group: Group,
  options: { maxUses?: number; expiryDays?: number } = {}
): Promise<GroupInvite> {
  if (!group.memberUids.includes(me.uid)) {
    throw new Error('Only group members can generate invitation links.');
  }

  const token = generateToken('grp');
  const rawMax = Number(options.maxUses ?? 15);
  const rawDays = Number(options.expiryDays ?? 7);
  const maxUses = Math.min(100, Math.max(1, Number.isFinite(rawMax) ? Math.round(rawMax) : 15));
  const expiryDays = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? Math.round(rawDays) : 7));
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + expiryDays * 86400 * 1000));
  const safeGroupName = group.name.trim().slice(0, 80) || 'Expense Group';

  const basePayload = {
    token,
    groupId: group.id,
    groupName: safeGroupName,
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
  const topRef = doc(db, 'groupInvites', token);
  const mirrorRef = doc(db, 'groups', group.id, 'invites', token);
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  batch.set(topRef, basePayload);
  batch.set(mirrorRef, basePayload);
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'group_invite_created',
    summary: `${me.fullName} created a group invitation link (${maxUses} uses, ${expiryDays}d)`,
    relatedId: token,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `groupInvites/${token}`);
  }

  try {
    const snap = await getDoc(topRef);
    if (snap.exists()) return snap.data() as GroupInvite;
  } catch {
    // Return optimistic timestamped object if read immediately after offline write
  }

  const nowTs = Timestamp.now();
  return {
    token,
    groupId: group.id,
    groupName: safeGroupName,
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

export async function revokeGroupInvite(
  token: string,
  me?: UserPrivateProfile,
  groupId?: string
): Promise<void> {
  if (!VALID_TOKEN_RE.test(token)) {
    throw new Error('Invalid invitation token.');
  }

  const topRef = doc(db, 'groupInvites', token);
  let targetGroupId = groupId;
  if (!targetGroupId) {
    try {
      const snap = await getDoc(topRef);
      if (snap.exists()) {
        targetGroupId = (snap.data() as GroupInvite).groupId;
      }
    } catch {
      // Proceed with top-level revocation
    }
  }

  const actorUid = me?.uid || auth.currentUser?.uid || '';
  const actorName = me?.fullName || auth.currentUser?.displayName || 'Member';
  const batch = writeBatch(db);

  batch.update(topRef, {
    status: 'revoked',
    revokedBy: actorUid,
    revokedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (targetGroupId) {
    const mirrorRef = doc(db, 'groups', targetGroupId, 'invites', token);
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
      // Mirror may not exist for legacy invites
    }

    if (actorUid) {
      const actRef = doc(collection(db, 'groups', targetGroupId, 'activities'));
      batch.set(actRef, {
        groupId: targetGroupId,
        actorUid,
        actorName: actorName.slice(0, 80),
        type: 'group_invite_revoked',
        summary: `${actorName} revoked an invitation link`,
        relatedId: token,
        createdAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groupInvites/${token}`);
  }
}

export async function regenerateGroupInvite(
  me: UserPrivateProfile,
  group: Group,
  oldToken: string,
  options: { maxUses?: number; expiryDays?: number } = {}
): Promise<GroupInvite> {
  if (!group.memberUids.includes(me.uid)) {
    throw new Error('Only group members can regenerate invitation links.');
  }

  const newToken = generateToken('grp');
  const rawMax = Number(options.maxUses ?? 15);
  const rawDays = Number(options.expiryDays ?? 7);
  const maxUses = Math.min(100, Math.max(1, Number.isFinite(rawMax) ? Math.round(rawMax) : 15));
  const expiryDays = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? Math.round(rawDays) : 7));
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + expiryDays * 86400 * 1000));
  const safeGroupName = group.name.trim().slice(0, 80) || 'Expense Group';

  const batch = writeBatch(db);

  if (oldToken && VALID_TOKEN_RE.test(oldToken)) {
    const oldTopRef = doc(db, 'groupInvites', oldToken);
    const oldMirrorRef = doc(db, 'groups', group.id, 'invites', oldToken);
    try {
      const oldTopSnap = await getDoc(oldTopRef);
      if (oldTopSnap.exists() && (oldTopSnap.data() as GroupInvite).status !== 'revoked') {
        batch.update(oldTopRef, {
          status: 'revoked',
          revokedBy: me.uid,
          revokedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      const oldMirrorSnap = await getDoc(oldMirrorRef);
      if (oldMirrorSnap.exists() && (oldMirrorSnap.data() as GroupInvite).status !== 'revoked') {
        batch.update(oldMirrorRef, {
          status: 'revoked',
          revokedBy: me.uid,
          revokedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Ignore if legacy invite missing
    }
  }

  const newPayload = {
    token: newToken,
    groupId: group.id,
    groupName: safeGroupName,
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

  const newTopRef = doc(db, 'groupInvites', newToken);
  const newMirrorRef = doc(db, 'groups', group.id, 'invites', newToken);
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  batch.set(newTopRef, newPayload);
  batch.set(newMirrorRef, newPayload);
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'group_invite_created',
    summary: `${me.fullName} regenerated the group invitation link`,
    relatedId: newToken,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `groupInvites/${newToken}`);
  }

  const nowTs = Timestamp.now();
  return {
    token: newToken,
    groupId: group.id,
    groupName: safeGroupName,
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

export function subscribeMyGroupInvites(
  uid: string,
  callback: (invites: GroupInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groupInvites'),
    where('createdBy', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as GroupInvite)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, 'groupInvites');
      if (onError) onError(new Error(info.error));
    }
  );
}

/**
 * Subscribes to all invites for a group (both group-scoped mirror docs visible to all members
 * and the current user's legacy top-level invites), hydrating live usage counts from /groupInvites/{token}.
 */
export function subscribeGroupInvites(
  groupId: string,
  uid: string,
  callback: (invites: GroupInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let groupDocs: GroupInvite[] = [];
  let myLegacyDocs: GroupInvite[] = [];
  let active = true;

  const emitMerged = async () => {
    const byToken = new Map<string, GroupInvite>();
    for (const inv of myLegacyDocs) {
      if (inv.groupId === groupId) byToken.set(inv.token, inv);
    }
    for (const inv of groupDocs) {
      byToken.set(inv.token, inv);
    }

    // Hydrate authoritative live usesCount/usedBy/status from /groupInvites/{token}
    const hydrated = await Promise.all(
      Array.from(byToken.values()).map(async (inv) => {
        try {
          const topSnap = await getDoc(doc(db, 'groupInvites', inv.token));
          if (topSnap.exists()) {
            return topSnap.data() as GroupInvite;
          }
        } catch {
          // Keep subcollection copy if offline
        }
        return inv;
      })
    );

    if (!active) return;
    hydrated.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    callback(hydrated);
  };

  const unsubGroup = onSnapshot(
    collection(db, 'groups', groupId, 'invites'),
    (snap) => {
      groupDocs = snap.docs.map((d) => d.data() as GroupInvite);
      void emitMerged();
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, `groups/${groupId}/invites`);
      if (onError) onError(new Error(info.error));
    }
  );

  const unsubMine = onSnapshot(
    query(collection(db, 'groupInvites'), where('createdBy', '==', uid)),
    (snap) => {
      myLegacyDocs = snap.docs.map((d) => d.data() as GroupInvite);
      void emitMerged();
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, 'groupInvites');
      if (onError) onError(new Error(info.error));
    }
  );

  return () => {
    active = false;
    unsubGroup();
    unsubMine();
  };
}

export function subscribeGroupEmailInvites(
  groupId: string,
  callback: (items: GroupEmailInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'groups', groupId, 'emailInvites'),
    (snap) => {
      const items = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupEmailInvite, 'id'>),
        }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, `groups/${groupId}/emailInvites`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export async function createEmailInvites(
  me: UserPrivateProfile,
  group: Group,
  rawEmails: string[],
  existingEmailInvites: GroupEmailInvite[]
): Promise<{
  created: GroupEmailInvite[];
  skipped: Array<{ email: string; reason: string }>;
  emailDelivered: boolean;
  providerMessage: string;
}> {
  if (!group.memberUids.includes(me.uid)) {
    throw new Error('Only group members can send email invitations.');
  }

  const normalized = Array.from(
    new Set(
      rawEmails
        .map((e) => e.trim())
        .filter(Boolean)
    )
  );

  if (normalized.length === 0) {
    throw new Error('Enter at least one email address.');
  }
  if (normalized.length > 20) {
    throw new Error('You can invite up to 20 email addresses at a time.');
  }

  const skipped: Array<{ email: string; reason: string }> = [];
  const candidates: Array<{ email: string; emailLower: string }> = [];
  const pendingSet = new Set(
    existingEmailInvites
      .filter((i) => i.status === 'pending')
      .map((i) => i.emailLower)
  );
  const memberEmailSet = new Set(
    Object.values(group.memberEmails || {}).map((e) => e.toLowerCase())
  );

  for (const email of normalized) {
    const lower = email.toLowerCase();
    if (!isValidEmailAddress(email)) {
      skipped.push({ email, reason: 'Invalid email format' });
      continue;
    }
    if (lower === me.email.toLowerCase() || memberEmailSet.has(lower)) {
      skipped.push({ email, reason: 'Already a member of this group' });
      continue;
    }
    if (pendingSet.has(lower)) {
      skipped.push({ email, reason: 'Pending invitation already exists' });
      continue;
    }
    pendingSet.add(lower);
    candidates.push({ email, emailLower: lower });
  }

  if (candidates.length === 0) {
    return {
      created: [],
      skipped,
      emailDelivered: false,
      providerMessage: skipped[0]?.reason || 'No new email invitations to create.',
    };
  }

  // Check if accounts already exist via exact SHA-256 email lookup
  const lookedUp = await Promise.all(
    candidates.map(async (c) => {
      try {
        const hit = await findUserByEmailOrHandle(c.emailLower);
        return { ...c, existingUser: hit };
      } catch {
        return { ...c, existingUser: null };
      }
    })
  );

  const actionable: typeof lookedUp = [];
  for (const item of lookedUp) {
    if (item.existingUser && group.memberUids.includes(item.existingUser.uid)) {
      skipped.push({ email: item.email, reason: `${item.existingUser.displayName} is already in the group` });
    } else {
      actionable.push(item);
    }
  }

  if (actionable.length === 0) {
    return {
      created: [],
      skipped,
      emailDelivered: false,
      providerMessage: skipped[0]?.reason || 'All recipients are already group members.',
    };
  }

  // Generate a dedicated group invite link for this email batch
  const invite = await createGroupInvite(me, group, {
    maxUses: Math.min(100, Math.max(5, actionable.length * 2)),
    expiryDays: 14,
  });
  const inviteUrl = buildGroupInviteUrl(invite.token);

  // Attempt real email delivery on the backend
  let emailDelivered = false;
  let providerMessage = '';
  let perEmailResult: Record<string, { status: 'sent' | 'provider_unconfigured' | 'failed'; note?: string }> = {};

  try {
    const idToken = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/invitations/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        groupId: group.id,
        groupName: group.name,
        inviteUrl,
        inviterName: me.fullName,
        recipients: actionable.map((a) => ({
          email: a.email,
          existingAccountName: a.existingUser?.displayName || '',
        })),
      }),
    });

    const data = (await res.json()) as {
      delivered?: boolean;
      emailConfigured?: boolean;
      message?: string;
      results?: Array<{ email: string; status: 'sent' | 'provider_unconfigured' | 'failed'; note?: string }>;
    };

    emailDelivered = Boolean(data.delivered);
    providerMessage = data.message || '';
    if (Array.isArray(data.results)) {
      for (const r of data.results) {
        perEmailResult[r.email.toLowerCase()] = { status: r.status, note: r.note };
      }
    }
  } catch (err) {
    emailDelivered = false;
    providerMessage =
      err instanceof Error
        ? `Email server request failed: ${err.message}`
        : 'Email server could not be reached.';
  }

  // Persist tracked email invitation records in Firestore
  const batch = writeBatch(db);
  const createdRecords: GroupEmailInvite[] = [];
  const nowTs = Timestamp.now();

  for (const item of actionable) {
    const docRef = doc(collection(db, 'groups', group.id, 'emailInvites'));
    const delivery = perEmailResult[item.emailLower] || {
      status: emailDelivered ? ('sent' as const) : ('provider_unconfigured' as const),
      note: providerMessage,
    };

    const payload = {
      groupId: group.id,
      groupName: group.name.trim().slice(0, 80),
      email: item.email.slice(0, 120),
      emailLower: item.emailLower.slice(0, 120),
      inviteToken: invite.token,
      inviteUrl: inviteUrl.slice(0, 300),
      existingUserUid: item.existingUser?.uid || '',
      existingUserName: item.existingUser?.displayName || '',
      status: 'pending' as const,
      deliveryStatus: delivery.status,
      deliveryNote: (delivery.note || providerMessage || '').slice(0, 240),
      invitedByUid: me.uid,
      invitedByName: me.fullName.slice(0, 80),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(docRef, payload);
    createdRecords.push({
      id: docRef.id,
      ...payload,
      createdAt: nowTs,
      updatedAt: nowTs,
    });
  }

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'email_invite_created',
    summary: `${me.fullName} created email invitation(s) for ${actionable.map((a) => a.email).join(', ').slice(0, 140)}`,
    relatedId: invite.token,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `groups/${group.id}/emailInvites`);
  }

  // Send in-app notifications to recipients who already have a TallyCircle account
  const existingUids = actionable
    .map((a) => a.existingUser?.uid)
    .filter((u): u is string => Boolean(u));
  if (existingUids.length > 0) {
    try {
      await notifyGroupMembers({
        memberUids: existingUids,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'group_invite',
        title: `Invited to ${group.name}`,
        body: `${me.fullName} invited you to join "${group.name}". Tap to review and join.`,
        groupId: group.id,
        link: `/join/group/${invite.token}`,
      });
    } catch {
      // Non-fatal
    }
  }

  return {
    created: createdRecords,
    skipped,
    emailDelivered,
    providerMessage,
  };
}

export async function cancelEmailInvite(
  me: UserPrivateProfile,
  group: Group,
  emailInvite: GroupEmailInvite
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'groups', group.id, 'emailInvites', emailInvite.id), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'email_invite_cancelled',
    summary: `${me.fullName} cancelled the pending email invitation for ${emailInvite.email}`,
    relatedId: emailInvite.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}/emailInvites/${emailInvite.id}`);
  }
}

export async function getGroupInvite(token: string): Promise<GroupInvite | null> {
  if (!VALID_TOKEN_RE.test(token)) {
    return null;
  }
  try {
    const snap = await getFreshDoc(doc(db, 'groupInvites', token));
    return snap.exists() ? (snap.data() as GroupInvite) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `groupInvites/${token}`);
  }
}

export interface BackendInviteValidationResult {
  valid: boolean;
  reason?: 'invalid' | 'revoked' | 'expired' | 'limit_reached' | 'group_deleted' | 'already_used' | 'already_member';
  message?: string;
  invite?: {
    token: string;
    groupId: string;
    groupName: string;
    createdByName?: string;
    expiresAtIso: string;
    maxUses: number;
    usesCount: number;
    status: string;
  };
  group?: {
    id: string;
    name: string;
    description: string;
    memberCount: number;
    isArchived: boolean;
  };
}

export async function validateGroupInviteBackend(token: string): Promise<BackendInviteValidationResult> {
  if (!VALID_TOKEN_RE.test(token)) {
    return {
      valid: false,
      reason: 'invalid',
      message: 'This invitation link is malformed or invalid.',
    };
  }

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Authentication required to validate this invitation.');
  }

  const res = await fetch('/api/invitations/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const errPayload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errPayload.error || 'Could not validate invitation on server.');
  }

  return (await res.json()) as BackendInviteValidationResult;
}

export async function joinGroupByToken(
  me: UserPrivateProfile,
  token: string
): Promise<{ groupId: string; groupName: string; alreadyMember: boolean }> {
  if (!VALID_TOKEN_RE.test(token)) {
    throw new Error('This group invitation link is invalid.');
  }

  const inviteRef = doc(db, 'groupInvites', token);
  const initialInviteSnap = await getFreshDoc(inviteRef);
  if (!initialInviteSnap.exists()) {
    throw new Error('This group invitation link is invalid or does not exist.');
  }
  const initialInvite = initialInviteSnap.data() as GroupInvite;

  if (initialInvite.status === 'revoked') {
    throw new Error('This group invitation link has been revoked.');
  }
  if (initialInvite.expiresAt.toDate().getTime() < Date.now()) {
    throw new Error('This group invitation link has expired.');
  }

  // Check if user is ALREADY an active member of the target group
  try {
    const existingGroupSnap = await getFreshDoc(doc(db, 'groups', initialInvite.groupId));
    if (existingGroupSnap.exists()) {
      const grp = existingGroupSnap.data() as Omit<Group, 'id'>;
      if (grp.memberUids.includes(me.uid)) {
        return {
          groupId: initialInvite.groupId,
          groupName: grp.name || initialInvite.groupName,
          alreadyMember: true,
        };
      }
    }
  } catch {
    // Expected permission-denied if user is not yet a member; proceed with atomic join transaction
  }

  if (initialInvite.usesCount >= initialInvite.maxUses) {
    throw new Error('This group invitation link has reached its maximum usage limit.');
  }
  if (initialInvite.usedBy.includes(me.uid)) {
    throw new Error(
      'You already redeemed this invitation link previously. Ask a group member for a new link or direct add.'
    );
  }

  const safeName = me.fullName.trim().slice(0, 80) || me.email.split('@')[0] || 'Member';
  const joinedIso = new Date().toISOString();

  try {
    const result = await runTransaction(db, async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists()) {
        throw new Error('This group invitation link is invalid or does not exist.');
      }

      const invite = inviteSnap.data() as GroupInvite;
      if (invite.status === 'revoked') {
        throw new Error('This group invitation link has been revoked.');
      }
      if (invite.expiresAt.toDate().getTime() < Date.now()) {
        throw new Error('This group invitation link has expired.');
      }
      if (invite.usesCount >= invite.maxUses) {
        throw new Error('This group invitation link has reached its maximum usage limit.');
      }
      if (invite.usedBy.includes(me.uid)) {
        throw new Error(
          'You already redeemed this invitation link previously. Ask a group member for a new link or direct add.'
        );
      }

      tx.update(inviteRef, {
        usesCount: invite.usesCount + 1,
        usedBy: [...invite.usedBy, me.uid],
        updatedAt: serverTimestamp(),
      });

      tx.update(doc(db, 'groups', invite.groupId), {
        memberUids: arrayUnion(me.uid),
        [`memberNames.${me.uid}`]: safeName,
        [`memberEmails.${me.uid}`]: me.email.toLowerCase().slice(0, 120),
        [`memberJoinedAt.${me.uid}`]: joinedIso,
        lastJoinToken: token,
        updatedAt: serverTimestamp(),
      });

      const actRef = doc(collection(db, 'groups', invite.groupId, 'activities'));
      tx.set(actRef, {
        groupId: invite.groupId,
        actorUid: me.uid,
        actorName: safeName,
        type: 'member_joined',
        summary: `${safeName} joined via invitation link`,
        relatedId: me.uid,
        createdAt: serverTimestamp(),
      });

      return { groupId: invite.groupId, groupName: invite.groupName, alreadyMember: false };
    });

    // Best-effort: mark any matching pending email invites for this user's email as accepted & notify group
    try {
      const [groupSnap, emailInvitesSnap] = await Promise.all([
        getDoc(doc(db, 'groups', result.groupId)),
        getDocs(collection(db, 'groups', result.groupId, 'emailInvites')),
      ]);

      const pendingMatching = emailInvitesSnap.docs.filter((d) => {
        const data = d.data() as GroupEmailInvite;
        return data.status === 'pending' && data.emailLower === me.email.toLowerCase();
      });

      if (pendingMatching.length > 0) {
        const acceptBatch = writeBatch(db);
        for (const d of pendingMatching) {
          acceptBatch.update(d.ref, { status: 'accepted', updatedAt: serverTimestamp() });
        }
        await acceptBatch.commit();
      }

      if (groupSnap.exists()) {
        const grp = groupSnap.data() as Omit<Group, 'id'>;
        await notifyGroupMembers({
          memberUids: grp.memberUids,
          senderUid: me.uid,
          senderName: safeName,
          type: 'member_joined',
          title: `${safeName} joined ${result.groupName}`,
          body: `${safeName} joined "${result.groupName}" via invitation link.`,
          groupId: result.groupId,
        });
      }
    } catch {
      // Non-fatal post-join updates
    }

    return result;
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : '';
    if (code === 'not-found' || msg.includes('No document to update')) {
      throw new Error('This group has been deleted and is no longer available.');
    }
    if (
      msg.includes('invalid') ||
      msg.includes('revoked') ||
      msg.includes('expired') ||
      msg.includes('maximum usage limit') ||
      msg.includes('already redeemed')
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `groups/${initialInvite.groupId}`);
  }
}
