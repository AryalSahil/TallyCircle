import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../lib/firebase';
import type { Group, GroupActivity, GroupInvite, PublicProfile, UserPrivateProfile } from '../types';
import { generateToken } from '../utils/helpers';
import { notifyGroupMembers } from './notificationService';

export function subscribeGroups(
  uid: string,
  callback: (groups: Group[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups'),
    where('memberUids', 'array-contains', uid),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Group, 'id'>),
      }));
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
  const q = query(
    collection(db, 'groups', groupId, 'activities'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupActivity, 'id'>),
        }))
      );
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
  const memberMap: Record<string, string> = { [me.uid]: me.fullName };
  const memberUids = [me.uid];

  for (const m of payload.initialMembers) {
    if (m.uid !== me.uid && !memberUids.includes(m.uid) && memberUids.length < 50) {
      memberUids.push(m.uid);
      memberMap[m.uid] = m.displayName;
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

  await notifyGroupMembers({
    memberUids,
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'group_invite',
    title: `Added to ${payload.name.trim()}`,
    body: `${me.fullName} added you to the expense group "${payload.name.trim()}".`,
    groupId: groupRef.id,
  });

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

export async function addMemberToGroup(
  me: UserPrivateProfile,
  group: Group,
  member: PublicProfile
): Promise<void> {
  if (group.memberUids.includes(member.uid)) return;
  if (group.memberUids.length >= 50) {
    throw new Error('Groups support up to 50 active members.');
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'groups', group.id), {
    memberUids: [...group.memberUids, member.uid],
    memberNames: { ...group.memberNames, [member.uid]: member.displayName },
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'member_joined',
    summary: `${me.fullName} added ${member.displayName} to the group`,
    relatedId: member.uid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}`);
  }

  await notifyGroupMembers({
    memberUids: [member.uid],
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'group_invite',
    title: `Joined ${group.name}`,
    body: `${me.fullName} added you to "${group.name}".`,
    groupId: group.id,
  });
}

export async function removeOrLeaveMember(
  me: UserPrivateProfile,
  group: Group,
  targetUid: string
): Promise<void> {
  const remaining = group.memberUids.filter((u) => u !== targetUid);
  if (remaining.length === 0) {
    throw new Error('At least one member must remain in the group. Archive the group instead.');
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

  const [expensesSnap, settlementsSnap, activitiesSnap, myInvitesSnap] = await Promise.all([
    getDocs(collection(db, 'groups', group.id, 'expenses')),
    getDocs(collection(db, 'groups', group.id, 'settlements')),
    getDocs(collection(db, 'groups', group.id, 'activities')),
    getDocs(query(collection(db, 'groupInvites'), where('createdBy', '==', me.uid))),
  ]);

  const noteSnaps = await Promise.all(
    expensesSnap.docs.map((expDoc) =>
      getDocs(collection(db, 'groups', group.id, 'expenses', expDoc.id, 'notes'))
    )
  );

  const refsToDelete = [
    ...noteSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
    ...expensesSnap.docs.map((d) => d.ref),
    ...settlementsSnap.docs.map((d) => d.ref),
    ...activitiesSnap.docs.map((d) => d.ref),
    ...myInvitesSnap.docs
      .filter((d) => (d.data() as GroupInvite).groupId === group.id)
      .map((d) => d.ref),
  ];

  // Delete excess sub-documents in chunks first if large, keeping final <= 450 ops atomic with group deletion
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

  // Fallback for very large groups: delete deletable expenses first in chunks, then atomic final batch
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
      // Some activity/confirmed settlement docs require atomic deletion with parent group; tail handles remaining
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
  const token = generateToken('grp');
  const maxUses = Math.min(100, Math.max(1, options.maxUses ?? 15));
  const expiryDays = Math.min(90, Math.max(1, options.expiryDays ?? 7));
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + expiryDays * 86400 * 1000));

  const ref = doc(db, 'groupInvites', token);
  try {
    await setDoc(ref, {
      token,
      groupId: group.id,
      groupName: group.name.slice(0, 80),
      createdBy: me.uid,
      expiresAt,
      maxUses,
      usesCount: 0,
      usedBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return snap.data() as GroupInvite;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `groupInvites/${token}`);
  }
}

export function subscribeMyGroupInvites(
  uid: string,
  callback: (invites: GroupInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groupInvites'),
    where('createdBy', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.data() as GroupInvite));
    },
    (error) => {
      const info = logFirestoreError(error, OperationType.LIST, 'groupInvites');
      if (onError) onError(new Error(info.error));
    }
  );
}

export async function getGroupInvite(token: string): Promise<GroupInvite | null> {
  try {
    const snap = await getDoc(doc(db, 'groupInvites', token));
    return snap.exists() ? (snap.data() as GroupInvite) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `groupInvites/${token}`);
  }
}

export async function revokeGroupInvite(token: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'groupInvites', token));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `groupInvites/${token}`);
  }
}

export async function joinGroupByToken(
  me: UserPrivateProfile,
  token: string
): Promise<{ groupId: string; groupName: string; alreadyMember: boolean }> {
  const inviteRef = doc(db, 'groupInvites', token);
  const initialInviteSnap = await getDoc(inviteRef);
  if (!initialInviteSnap.exists()) {
    throw new Error('This group invitation link is invalid or has been revoked.');
  }
  const initialInvite = initialInviteSnap.data() as GroupInvite;

  // Check if already a member (if getDoc succeeds, they are already in memberUids)
  try {
    const existingGroupSnap = await getDoc(doc(db, 'groups', initialInvite.groupId));
    if (existingGroupSnap.exists()) {
      return {
        groupId: initialInvite.groupId,
        groupName: initialInvite.groupName,
        alreadyMember: true,
      };
    }
  } catch {
    // Expected permission-denied if user is not yet a member; proceed with atomic join transaction
  }

  try {
    const result = await runTransaction(db, async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists()) {
        throw new Error('This group invitation link is invalid or has been revoked.');
      }

      const invite = inviteSnap.data() as GroupInvite;
      if (invite.expiresAt.toDate().getTime() < Date.now()) {
        throw new Error('This group invitation link has expired.');
      }
      if (invite.usesCount >= invite.maxUses) {
        throw new Error('This group invitation link has reached its maximum usage limit.');
      }
      if (invite.usedBy.includes(me.uid)) {
        return { groupId: invite.groupId, groupName: invite.groupName, alreadyMember: true };
      }

      tx.update(inviteRef, {
        usesCount: invite.usesCount + 1,
        usedBy: [...invite.usedBy, me.uid],
        updatedAt: serverTimestamp(),
      });

      tx.update(doc(db, 'groups', invite.groupId), {
        memberUids: arrayUnion(me.uid),
        [`memberNames.${me.uid}`]: me.fullName,
        lastJoinToken: token,
        updatedAt: serverTimestamp(),
      });

      const actRef = doc(collection(db, 'groups', invite.groupId, 'activities'));
      tx.set(actRef, {
        groupId: invite.groupId,
        actorUid: me.uid,
        actorName: me.fullName,
        type: 'member_joined',
        summary: `${me.fullName} joined via invitation link`,
        relatedId: me.uid,
        createdAt: serverTimestamp(),
      });

      return { groupId: invite.groupId, groupName: invite.groupName, alreadyMember: false };
    });

    return result;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('invalid') ||
        err.message.includes('expired') ||
        err.message.includes('maximum usage limit'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `groups/${initialInvite.groupId}`);
  }
}
