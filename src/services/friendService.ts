import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { FriendInvite, Friendship, UserPrivateProfile } from '../types';
import { deterministicFriendshipId, generateToken } from '../utils/helpers';
import { createNotification } from './notificationService';

export function subscribeFriendships(
  uid: string,
  callback: (items: Friendship[]) => void
): Unsubscribe {
  const q = query(collection(db, 'friendships'), where('users', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Friendship, 'id'>),
      }));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'friendships');
    }
  );
}

export async function sendFriendRequest(
  me: UserPrivateProfile,
  targetUid: string
): Promise<'created' | 'already_friends' | 'already_pending'> {
  if (targetUid === me.uid) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const friendshipId = deterministicFriendshipId(me.uid, targetUid);
  const ref = doc(db, 'friendships', friendshipId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `friendships/${friendshipId}`);
  }

  const sortedUsers: [string, string] = me.uid < targetUid ? [me.uid, targetUid] : [targetUid, me.uid];

  if (snap.exists()) {
    const existing = snap.data() as Omit<Friendship, 'id'>;
    if (existing.status === 'accepted') return 'already_friends';
    if (existing.status === 'pending') return 'already_pending';

    // Re-send after rejection
    try {
      await updateDoc(ref, {
        status: 'pending',
        requesterUid: me.uid,
        recipientUid: targetUid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `friendships/${friendshipId}`);
    }
  } else {
    try {
      await setDoc(ref, {
        users: sortedUsers,
        requesterUid: me.uid,
        recipientUid: targetUid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `friendships/${friendshipId}`);
    }
  }

  await createNotification({
    recipientUid: targetUid,
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'friend_request',
    title: 'New friend request',
    body: `${me.fullName} (@${me.handle}) sent you a friend request.`,
    link: '/friends',
  });

  return 'created';
}

export async function respondFriendRequest(
  me: UserPrivateProfile,
  friendship: Friendship,
  decision: 'accepted' | 'rejected'
): Promise<void> {
  const ref = doc(db, 'friendships', friendship.id);
  try {
    await updateDoc(ref, {
      status: decision,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `friendships/${friendship.id}`);
  }

  if (decision === 'accepted') {
    await createNotification({
      recipientUid: friendship.requesterUid,
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: `${me.fullName} accepted your friend request.`,
      link: '/friends',
    });
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `friendships/${friendshipId}`);
  }
}

export async function createFriendInvite(
  me: UserPrivateProfile,
  options: { maxUses?: number; expiryDays?: number } = {}
): Promise<FriendInvite> {
  const token = generateToken('fr');
  const maxUses = Math.min(100, Math.max(1, options.maxUses ?? 10));
  const expiryDays = Math.min(90, Math.max(1, options.expiryDays ?? 7));
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + expiryDays * 86400 * 1000));

  const ref = doc(db, 'friendInvites', token);
  try {
    await setDoc(ref, {
      token,
      creatorUid: me.uid,
      creatorName: me.fullName,
      expiresAt,
      maxUses,
      usesCount: 0,
      usedBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return snap.data() as FriendInvite;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `friendInvites/${token}`);
  }
}

export function subscribeMyFriendInvites(
  uid: string,
  callback: (items: FriendInvite[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'friendInvites'),
    where('creatorUid', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.data() as FriendInvite));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'friendInvites');
    }
  );
}

export async function getFriendInvite(token: string): Promise<FriendInvite | null> {
  try {
    const snap = await getDoc(doc(db, 'friendInvites', token));
    return snap.exists() ? (snap.data() as FriendInvite) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `friendInvites/${token}`);
  }
}

export async function redeemFriendInvite(
  me: UserPrivateProfile,
  token: string
): Promise<{ creatorName: string; status: 'requested' | 'accepted' | 'already_friends' }> {
  const inviteRef = doc(db, 'friendInvites', token);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) {
    throw new Error('This friend invitation link is invalid or was revoked.');
  }

  const invite = inviteSnap.data() as FriendInvite;
  if (invite.creatorUid === me.uid) {
    throw new Error('You cannot redeem your own friend invitation link.');
  }
  if (invite.expiresAt.toDate().getTime() < Date.now()) {
    throw new Error('This friend invitation link has expired.');
  }
  if (invite.usesCount >= invite.maxUses) {
    throw new Error('This friend invitation link has reached its usage limit.');
  }

  const friendshipId = deterministicFriendshipId(me.uid, invite.creatorUid);
  const fSnap = await getDoc(doc(db, 'friendships', friendshipId));
  if (fSnap.exists()) {
    const existing = fSnap.data() as Omit<Friendship, 'id'>;
    if (existing.status === 'accepted') {
      return { creatorName: invite.creatorName, status: 'already_friends' };
    }
    if (existing.status === 'pending' && existing.recipientUid === me.uid) {
      await respondFriendRequest(me, { id: friendshipId, ...existing }, 'accepted');
      return { creatorName: invite.creatorName, status: 'accepted' };
    }
  }

  if (!invite.usedBy.includes(me.uid)) {
    const batch = writeBatch(db);
    batch.update(inviteRef, {
      usesCount: invite.usesCount + 1,
      usedBy: [...invite.usedBy, me.uid],
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `friendInvites/${token}`);
    }
  }

  await sendFriendRequest(me, invite.creatorUid);
  return { creatorName: invite.creatorName, status: 'requested' };
}

export async function revokeFriendInvite(token: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendInvites', token));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `friendInvites/${token}`);
  }
}
