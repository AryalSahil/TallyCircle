import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Group, Settlement, SettlementMethod, UserPrivateProfile } from '../types';
import { formatINR } from '../utils/finance';
import { createNotification } from './notificationService';

export function subscribeGroupSettlements(
  groupId: string,
  callback: (items: Settlement[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups', groupId, 'settlements'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Settlement, 'id'>),
        }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${groupId}/settlements`);
    }
  );
}

export async function recordSettlement(
  me: UserPrivateProfile,
  group: Group,
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
): Promise<string> {
  if (payload.fromUid === payload.toUid) {
    throw new Error('Payer and receiver cannot be the same member.');
  }
  if (payload.amountPaise <= 0) {
    throw new Error('Settlement amount must be greater than ₹0.');
  }

  // Prevent duplicate open settlements between the same pair for the exact same amount
  const duplicate = payload.existingSettlements.find(
    (s) =>
      s.fromUid === payload.fromUid &&
      s.toUid === payload.toUid &&
      s.amountPaise === payload.amountPaise &&
      (s.status === 'pending' || s.status === 'awaiting_confirmation')
  );
  if (duplicate) {
    throw new Error('An active settlement for this exact amount already exists between these members.');
  }

  const initialStatus =
    me.uid === payload.fromUid ? 'awaiting_confirmation' : 'pending';

  const stRef = doc(collection(db, 'groups', group.id, 'settlements'));
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  const batch = writeBatch(db);
  batch.set(stRef, {
    groupId: group.id,
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
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'settlement_recorded',
    summary: `${payload.fromName} recorded a ${payload.method.toUpperCase()} payment of ${formatINR(payload.amountPaise)} to ${payload.toName}`,
    relatedId: stRef.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `groups/${group.id}/settlements/${stRef.id}`);
  }

  const recipientUid = me.uid === payload.fromUid ? payload.toUid : payload.fromUid;
  await createNotification({
    recipientUid,
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'settlement_recorded',
    title: `${group.name} · Payment recorded`,
    body:
      me.uid === payload.fromUid
        ? `${payload.fromName} marked ${formatINR(payload.amountPaise)} paid via ${payload.method.toUpperCase()}. Please confirm receipt.`
        : `${me.fullName} requested ${formatINR(payload.amountPaise)} settlement in ${group.name}.`,
    groupId: group.id,
    link: `/groups/${group.id}`,
  });

  return stRef.id;
}

export async function markSettlementPaid(
  me: UserPrivateProfile,
  group: Group,
  settlement: Settlement,
  updates: {
    method: SettlementMethod;
    upiTransactionRef?: string;
    note?: string;
  }
): Promise<void> {
  const stRef = doc(db, 'groups', group.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    status: 'awaiting_confirmation',
    method: updates.method,
    upiTransactionRef: (updates.upiTransactionRef || '').trim().slice(0, 120),
    note: (updates.note || '').trim().slice(0, 250),
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'settlement_recorded',
    summary: `${me.fullName} sent ${formatINR(settlement.amountPaise)} via ${updates.method.toUpperCase()} to ${settlement.toName}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}/settlements/${settlement.id}`);
  }

  await createNotification({
    recipientUid: settlement.toUid,
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'settlement_recorded',
    title: `${group.name} · Confirm payment`,
    body: `${me.fullName} sent ${formatINR(settlement.amountPaise)} (${updates.method.toUpperCase()}). Confirm once received.`,
    groupId: group.id,
    link: `/groups/${group.id}`,
  });
}

export async function confirmSettlement(
  me: UserPrivateProfile,
  group: Group,
  settlement: Settlement
): Promise<void> {
  const stRef = doc(db, 'groups', group.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    status: 'confirmed',
    confirmedBy: me.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'settlement_confirmed',
    summary: `${me.fullName} confirmed receiving ${formatINR(settlement.amountPaise)} from ${settlement.fromName}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}/settlements/${settlement.id}`);
  }

  await createNotification({
    recipientUid: settlement.fromUid,
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'settlement_confirmed',
    title: `${group.name} · Payment confirmed`,
    body: `${me.fullName} confirmed your ${formatINR(settlement.amountPaise)} payment.`,
    groupId: group.id,
    link: `/groups/${group.id}`,
  });
}

export async function disputeSettlement(
  me: UserPrivateProfile,
  group: Group,
  settlement: Settlement,
  reason: string
): Promise<void> {
  const stRef = doc(db, 'groups', group.id, 'settlements', settlement.id);
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  const batch = writeBatch(db);
  batch.update(stRef, {
    status: 'disputed',
    disputeReason: reason.trim().slice(0, 250) || 'Payment not received yet',
    updatedAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'settlement_disputed',
    summary: `${me.fullName} disputed ${formatINR(settlement.amountPaise)} payment from ${settlement.fromName}`,
    relatedId: settlement.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `groups/${group.id}/settlements/${settlement.id}`);
  }

  await createNotification({
    recipientUid: settlement.fromUid,
    senderUid: me.uid,
    senderName: me.fullName,
    type: 'settlement_disputed',
    title: `${group.name} · Payment disputed`,
    body: `${me.fullName} flagged the ${formatINR(settlement.amountPaise)} settlement: ${reason.trim() || 'Not received'}`,
    groupId: group.id,
    link: `/groups/${group.id}`,
  });
}

export async function deleteSettlement(groupId: string, settlementId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'groups', groupId, 'settlements', settlementId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `groups/${groupId}/settlements/${settlementId}`);
  }
}
