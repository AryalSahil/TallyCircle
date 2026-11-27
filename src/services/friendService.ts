import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, logFirestoreError, OperationType } from '../lib/firebase';
import type {
  FriendInvite,
  FriendRequest,
  Friendship,
  PublicProfile,
  UserPrivateProfile,
} from '../types';
import { deterministicFriendshipId, generateToken } from '../utils/helpers';
import { createNotification } from './notificationService';

export type SendFriendRequestResult =
  | 'created'
  | 'already_friends'
  | 'already_pending'
  | 'incoming_pending';

export function toFriendlyFriendError(
  err: unknown,
  fallback = 'Could not complete that friend action. Please try again.'
): string {
  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied') ||
    lower.includes('permission_denied')
  ) {
    return 'You do not have permission for this action. Please make sure your email is verified or sign in again.';
  }
  if (lower.includes('offline') || lower.includes('unavailable') || lower.includes('network')) {
    return 'Network unavailable. Please check your internet connection and try again.';
  }
  if (lower.includes('unauthenticated') || lower.includes('not signed in')) {
    return 'Please sign in again to continue.';
  }
  // Never surface serialized FirestoreErrorInfo JSON strings to end users
  if (raw.trim().startsWith('{')) {
    return fallback;
  }
  return raw || fallback;
}

function throwFriendlyFirestoreError(
  err: unknown,
  operationType: OperationType,
  path: string,
  fallback: string
): never {
  logFirestoreError(err, operationType, path);
  throw new Error(toFriendlyFriendError(err, fallback));
}

export function subscribeFriendships(
  uid: string,
  callback: (items: Friendship[]) => void,
  onError?: (err: Error) => void
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
      logFirestoreError(error, OperationType.LIST, 'friendships');
      if (onError) onError(new Error(toFriendlyFriendError(error, 'Could not sync friends list.')));
    }
  );
}

export function subscribeFriendRequests(
  uid: string,
  callback: (items: FriendRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'friendRequests'), where('users', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FriendRequest, 'id'>),
        }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => {
      logFirestoreError(error, OperationType.LIST, 'friendRequests');
      if (onError) onError(new Error(toFriendlyFriendError(error, 'Could not sync friend requests.')));
    }
  );
}

export async function sendFriendRequest(
  me: UserPrivateProfile,
  targetUid: string
): Promise<SendFriendRequestResult> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== me.uid) {
    throw new Error('Please sign in again before sending friend requests.');
  }
  const cleanTargetUid = targetUid.trim();
  if (!cleanTargetUid) {
    throw new Error('User not found.');
  }
  if (cleanTargetUid === me.uid) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  let targetSnap;
  try {
    targetSnap = await getDocFromServer(doc(db, 'publicProfiles', cleanTargetUid));
  } catch {
    try {
      targetSnap = await getDoc(doc(db, 'publicProfiles', cleanTargetUid));
    } catch (err) {
      throwFriendlyFirestoreError(
        err,
        OperationType.GET,
        `publicProfiles/${cleanTargetUid}`,
        'Could not verify that user account. Please try again.'
      );
    }
  }

  if (!targetSnap.exists()) {
    throw new Error('User not found.');
  }
  const targetProfile = targetSnap.data() as PublicProfile;

  const pairId = deterministicFriendshipId(me.uid, cleanTargetUid);
  const sortedUsers: [string, string] =
    me.uid < cleanTargetUid ? [me.uid, cleanTargetUid] : [cleanTargetUid, me.uid];
  const friendshipRef = doc(db, 'friendships', pairId);
  const requestRef = doc(db, 'friendRequests', pairId);

  let outcome: SendFriendRequestResult;
  try {
    outcome = await runTransaction(db, async (tx) => {
      const [fSnap, reqSnap] = await Promise.all([
        tx.get(friendshipRef),
        tx.get(requestRef),
      ]);

      if (fSnap.exists()) {
        const fData = fSnap.data() as Omit<Friendship, 'id'>;
        if (fData.status === 'accepted') {
          return 'already_friends' as const;
        }
        if (fData.status === 'pending') {
          return fData.requesterUid === me.uid
            ? ('already_pending' as const)
            : ('incoming_pending' as const);
        }
      }

      if (reqSnap.exists()) {
        const reqData = reqSnap.data() as Omit<FriendRequest, 'id'>;
        if (reqData.status === 'pending') {
          return reqData.senderId === me.uid
            ? ('already_pending' as const)
            : ('incoming_pending' as const);
        }

        tx.update(requestRef, {
          senderId: me.uid,
          recipientId: cleanTargetUid,
          senderUsername: me.handle,
          senderDisplayName: me.fullName.slice(0, 80),
          senderPhotoUrl: (me.photoUrl || '').slice(0, 250000),
          recipientUsername: targetProfile.handle,
          recipientDisplayName: targetProfile.displayName.slice(0, 80),
          recipientPhotoUrl: (targetProfile.photoUrl || '').slice(0, 250000),
          status: 'pending',
          updatedAt: serverTimestamp(),
        });
        return 'created' as const;
      }

      tx.set(requestRef, {
        users: sortedUsers,
        senderId: me.uid,
        recipientId: cleanTargetUid,
        senderUsername: me.handle,
        senderDisplayName: me.fullName.slice(0, 80),
        senderPhotoUrl: (me.photoUrl || '').slice(0, 250000),
        recipientUsername: targetProfile.handle,
        recipientDisplayName: targetProfile.displayName.slice(0, 80),
        recipientPhotoUrl: (targetProfile.photoUrl || '').slice(0, 250000),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return 'created' as const;
    });
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.WRITE,
      `friendRequests/${pairId}`,
      'Could not send friend request right now. Please try again.'
    );
  }

  if (outcome === 'created') {
    try {
      await createNotification({
        recipientUid: cleanTargetUid,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'friend_request',
        title: 'New friend request',
        body: `${me.fullName} (@${me.handle}) sent you a friend request.`,
        link: '/friends',
      });
    } catch {
      // Notification failure is non-fatal once the friend request itself succeeds
    }
  }

  return outcome;
}

export async function acceptFriendRequest(
  me: UserPrivateProfile,
  request: FriendRequest
): Promise<void> {
  if (request.recipientId !== me.uid) {
    throw new Error('Only the recipient can accept this friend request.');
  }
  if (request.senderId === me.uid) {
    throw new Error('You cannot accept your own friend request.');
  }

  const pairId = deterministicFriendshipId(request.senderId, request.recipientId);
  const reqRef = doc(db, 'friendRequests', request.id);
  const friendshipRef = doc(db, 'friendships', pairId);

  try {
    await runTransaction(db, async (tx) => {
      const [reqSnap, fSnap] = await Promise.all([
        tx.get(reqRef),
        tx.get(friendshipRef),
      ]);

      if (!reqSnap.exists()) {
        throw new Error('This friend request is no longer available.');
      }
      const reqData = reqSnap.data() as Omit<FriendRequest, 'id'>;
      if (reqData.recipientId !== me.uid) {
        throw new Error('Only the recipient can accept this friend request.');
      }
      if (reqData.status === 'accepted') {
        if (!fSnap.exists()) {
          throw new Error('Friend request was already processed.');
        }
        return;
      }
      if (reqData.status !== 'pending') {
        throw new Error('This friend request is no longer pending.');
      }

      const sortedUsers: [string, string] =
        reqData.senderId < reqData.recipientId
          ? [reqData.senderId, reqData.recipientId]
          : [reqData.recipientId, reqData.senderId];

      tx.update(reqRef, {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });

      if (fSnap.exists()) {
        tx.update(friendshipRef, {
          requesterUid: reqData.senderId,
          recipientUid: reqData.recipientId,
          status: 'accepted',
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(friendshipRef, {
          users: sortedUsers,
          requesterUid: reqData.senderId,
          recipientUid: reqData.recipientId,
          status: 'accepted',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.UPDATE,
      `friendRequests/${request.id}`,
      'Could not accept friend request. Please try again.'
    );
  }

  try {
    await createNotification({
      recipientUid: request.senderId,
      senderUid: me.uid,
      senderName: me.fullName,
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: `${me.fullName} accepted your friend request.`,
      link: '/friends',
    });
  } catch {
    // Non-fatal
  }
}

export async function rejectFriendRequest(
  me: UserPrivateProfile,
  request: FriendRequest
): Promise<void> {
  if (request.recipientId !== me.uid) {
    throw new Error('Only the recipient can decline this friend request.');
  }
  try {
    await updateDoc(doc(db, 'friendRequests', request.id), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.UPDATE,
      `friendRequests/${request.id}`,
      'Could not decline friend request. Please try again.'
    );
  }
}

export async function cancelFriendRequest(
  me: UserPrivateProfile,
  request: FriendRequest
): Promise<void> {
  if (request.senderId !== me.uid) {
    throw new Error('Only the sender can cancel this friend request.');
  }
  try {
    await updateDoc(doc(db, 'friendRequests', request.id), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.UPDATE,
      `friendRequests/${request.id}`,
      'Could not cancel friend request. Please try again.'
    );
  }
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
    throwFriendlyFirestoreError(
      err,
      OperationType.UPDATE,
      `friendships/${friendship.id}`,
      'Could not update friend request. Please try again.'
    );
  }

  if (decision === 'accepted') {
    try {
      await createNotification({
        recipientUid: friendship.requesterUid,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'friend_accepted',
        title: 'Friend request accepted',
        body: `${me.fullName} accepted your friend request.`,
        link: '/friends',
      });
    } catch {
      // Non-fatal
    }
  }
}

export async function updateFriendDetails(
  me: UserPrivateProfile,
  friendship: Friendship,
  updates: { nickname?: string; note?: string }
): Promise<void> {
  if (friendship.status !== 'accepted') {
    throw new Error('Only accepted friends can be annotated.');
  }
  const nextNicknames = {
    ...(friendship.nicknames || {}),
    [me.uid]: (updates.nickname ?? '').trim().slice(0, 60),
  };
  const nextNotes = {
    ...(friendship.notes || {}),
    [me.uid]: (updates.note ?? '').trim().slice(0, 250),
  };

  try {
    await updateDoc(doc(db, 'friendships', friendship.id), {
      nicknames: nextNicknames,
      notes: nextNotes,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.UPDATE,
      `friendships/${friendship.id}`,
      'Could not save friend details. Please try again.'
    );
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.DELETE,
      `friendships/${friendshipId}`,
      'Could not remove friend. Please try again.'
    );
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
    throwFriendlyFirestoreError(
      err,
      OperationType.CREATE,
      `friendInvites/${token}`,
      'Could not create invite link. Please try again.'
    );
  }
}

export function subscribeMyFriendInvites(
  uid: string,
  callback: (items: FriendInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'friendInvites'),
    where('creatorUid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as FriendInvite)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => {
      logFirestoreError(error, OperationType.LIST, 'friendInvites');
      if (onError) onError(new Error(toFriendlyFriendError(error, 'Could not sync invite links.')));
    }
  );
}

export async function getFriendInvite(token: string): Promise<FriendInvite | null> {
  try {
    const snap = await getDoc(doc(db, 'friendInvites', token));
    return snap.exists() ? (snap.data() as FriendInvite) : null;
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.GET,
      `friendInvites/${token}`,
      'Could not verify this friend invitation link.'
    );
  }
}

export async function redeemFriendInvite(
  me: UserPrivateProfile,
  token: string
): Promise<{ creatorName: string; status: 'requested' | 'accepted' | 'already_friends' }> {
  const inviteRef = doc(db, 'friendInvites', token);

  let invite: FriendInvite;
  try {
    invite = await runTransaction(db, async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists()) {
        throw new Error('This friend invitation link is invalid or was revoked.');
      }

      const data = inviteSnap.data() as FriendInvite;
      if (data.creatorUid === me.uid) {
        throw new Error('You cannot redeem your own friend invitation link.');
      }
      if (data.expiresAt.toDate().getTime() < Date.now()) {
        throw new Error('This friend invitation link has expired.');
      }
      if (!data.usedBy.includes(me.uid)) {
        if (data.usesCount >= data.maxUses) {
          throw new Error('This friend invitation link has reached its usage limit.');
        }
        tx.update(inviteRef, {
          usesCount: data.usesCount + 1,
          usedBy: [...data.usedBy, me.uid],
          updatedAt: serverTimestamp(),
        });
      }
      return data;
    });
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('invalid') ||
      err.message.includes('expired') ||
      err.message.includes('usage limit') ||
      err.message.includes('own friend')
    )) {
      throw err;
    }
    throwFriendlyFirestoreError(
      err,
      OperationType.UPDATE,
      `friendInvites/${token}`,
      'Could not redeem this friend invitation link.'
    );
  }

  const pairId = deterministicFriendshipId(me.uid, invite.creatorUid);
  const [fSnap, reqSnap] = await Promise.all([
    getDoc(doc(db, 'friendships', pairId)),
    getDoc(doc(db, 'friendRequests', pairId)),
  ]);

  if (fSnap.exists()) {
    const existing = fSnap.data() as Omit<Friendship, 'id'>;
    if (existing.status === 'accepted') {
      return { creatorName: invite.creatorName, status: 'already_friends' };
    }
    if (existing.status === 'pending' && existing.recipientUid === me.uid) {
      await respondFriendRequest(me, { id: pairId, ...existing }, 'accepted');
      return { creatorName: invite.creatorName, status: 'accepted' };
    }
  }

  if (reqSnap.exists()) {
    const reqData = reqSnap.data() as Omit<FriendRequest, 'id'>;
    if (reqData.status === 'pending' && reqData.recipientId === me.uid) {
      await acceptFriendRequest(me, { id: pairId, ...reqData });
      return { creatorName: invite.creatorName, status: 'accepted' };
    }
  }

  const sendRes = await sendFriendRequest(me, invite.creatorUid);
  if (sendRes === 'already_friends') {
    return { creatorName: invite.creatorName, status: 'already_friends' };
  }
  return { creatorName: invite.creatorName, status: 'requested' };
}

export async function revokeFriendInvite(token: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendInvites', token));
  } catch (err) {
    throwFriendlyFirestoreError(
      err,
      OperationType.DELETE,
      `friendInvites/${token}`,
      'Could not revoke friend invite link.'
    );
  }
}
