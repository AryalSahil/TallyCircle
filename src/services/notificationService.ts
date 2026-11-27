import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppNotification } from '../types';
import { formatINR } from '../utils/finance';

export function subscribeNotifications(
  uid: string,
  callback: (items: AppNotification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AppNotification, 'id'>),
      }));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    }
  );
}

export async function createNotification(params: {
  recipientUid: string;
  senderUid: string;
  senderName: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  groupId?: string;
}): Promise<void> {
  if (!params.recipientUid || params.recipientUid === params.senderUid) return;
  const ref = doc(collection(db, 'notifications'));
  try {
    await setDoc(ref, {
      recipientUid: params.recipientUid,
      senderUid: params.senderUid,
      senderName: params.senderName.slice(0, 80),
      type: params.type.slice(0, 50),
      title: params.title.slice(0, 120),
      body: params.body.slice(0, 300),
      link: (params.link || '').slice(0, 200),
      groupId: (params.groupId || '').slice(0, 128),
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${ref.id}`);
  }
}

export async function notifyGroupMembers(params: {
  memberUids: string[];
  senderUid: string;
  senderName: string;
  type: string;
  title: string;
  body: string;
  groupId: string;
  link?: string;
}): Promise<void> {
  const targets = params.memberUids.filter((u) => u !== params.senderUid);
  if (targets.length === 0) return;

  const batch = writeBatch(db);
  for (const uid of targets) {
    const ref = doc(collection(db, 'notifications'));
    batch.set(ref, {
      recipientUid: uid,
      senderUid: params.senderUid,
      senderName: params.senderName.slice(0, 80),
      type: params.type.slice(0, 50),
      title: params.title.slice(0, 120),
      body: params.body.slice(0, 300),
      link: (params.link || `/groups/${params.groupId}`).slice(0, 200),
      groupId: params.groupId,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'notifications');
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(notifications: AppNotification[]): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  for (const n of unread) {
    batch.update(doc(db, 'notifications', n.id), { isRead: true });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function sendPaymentReminder(params: {
  senderUid: string;
  senderName: string;
  recipientUid: string;
  groupId: string;
  groupName: string;
  amountPaise: number;
}): Promise<void> {
  await createNotification({
    recipientUid: params.recipientUid,
    senderUid: params.senderUid,
    senderName: params.senderName,
    type: 'payment_reminder',
    title: `Payment reminder · ${params.groupName}`,
    body: `${params.senderName} reminded you about your pending balance of ${formatINR(params.amountPaise)} in ${params.groupName}.`,
    groupId: params.groupId,
    link: `/groups/${params.groupId}`,
  });
}
