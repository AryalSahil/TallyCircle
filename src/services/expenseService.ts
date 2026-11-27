import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
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
  Group,
  RecurringFrequency,
  SplitMethod,
  UserPrivateProfile,
} from '../types';
import { formatINR, formatOriginalCurrency, normalizeExpenseTag } from '../utils/finance';
import { notifyGroupMembers } from './notificationService';

export function subscribeGroupExpenses(
  groupId: string,
  callback: (expenses: Expense[]) => void,
  onError?: (err: Error) => void,
  onMetadata?: (hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups', groupId, 'expenses'),
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
      const info = logFirestoreError(error, OperationType.LIST, `groups/${groupId}/expenses`);
      if (onError) onError(new Error(info.error));
    }
  );
}

export function subscribeExpenseNotes(
  groupId: string,
  expenseId: string,
  callback: (notes: ExpenseNote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups', groupId, 'expenses', expenseId, 'notes'),
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
        `groups/${groupId}/expenses/${expenseId}/notes`
      );
      if (onError) onError(new Error(info.error));
    }
  );
}

export interface ExpenseUpsertPayload {
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
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency;
  recurringIntervalDays?: number;
  nextOccurrenceDate?: string;
}

export async function addExpense(
  me: UserPrivateProfile,
  group: Group,
  payload: ExpenseUpsertPayload
): Promise<{ id: string; queuedOffline: boolean }> {
  const expRef = doc(collection(db, 'groups', group.id, 'expenses'));
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
    groupId: group.id,
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
    isRecurring: payload.isRecurring,
    recurringFrequency: payload.recurringFrequency,
    recurringIntervalDays: payload.recurringIntervalDays ?? 0,
    nextOccurrenceDate: payload.nextOccurrenceDate || '',
    createdBy: me.uid,
    updatedBy: me.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'expense_added',
    summary: `${me.fullName} added "${payload.title.trim().slice(0, 60)}" (${displayOriginal})`,
    relatedId: expRef.id,
    createdAt: serverTimestamp(),
  });

  const { queuedOffline } = await commitBatchOfflineAware(
    batch,
    OperationType.CREATE,
    `groups/${group.id}/expenses/${expRef.id}`,
    () =>
      notifyGroupMembers({
        memberUids: group.memberUids,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'expense_added',
        title: `${group.name} · New expense`,
        body: `${me.fullName} added "${payload.title.trim()}" for ${displayOriginal}.`,
        groupId: group.id,
      })
  );

  return { id: expRef.id, queuedOffline };
}

export async function updateExpense(
  me: UserPrivateProfile,
  group: Group,
  expenseId: string,
  payload: ExpenseUpsertPayload
): Promise<{ queuedOffline: boolean }> {
  const expRef = doc(db, 'groups', group.id, 'expenses', expenseId);
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
    isRecurring: payload.isRecurring,
    recurringFrequency: payload.recurringFrequency,
    recurringIntervalDays: payload.recurringIntervalDays ?? 0,
    nextOccurrenceDate: payload.nextOccurrenceDate || '',
    updatedBy: me.uid,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'expense_updated',
    summary: `${me.fullName} updated "${payload.title.trim().slice(0, 60)}" (${displayOriginal})`,
    relatedId: expenseId,
    createdAt: serverTimestamp(),
  });

  const { queuedOffline } = await commitBatchOfflineAware(
    batch,
    OperationType.UPDATE,
    `groups/${group.id}/expenses/${expenseId}`,
    () =>
      notifyGroupMembers({
        memberUids: group.memberUids,
        senderUid: me.uid,
        senderName: me.fullName,
        type: 'expense_updated',
        title: `${group.name} · Expense updated`,
        body: `${me.fullName} updated "${payload.title.trim()}" (${displayOriginal}).`,
        groupId: group.id,
      })
  );

  return { queuedOffline };
}

export async function deleteExpense(
  me: UserPrivateProfile,
  group: Group,
  expense: Expense
): Promise<void> {
  const notesSnap = await getDocs(
    collection(db, 'groups', group.id, 'expenses', expense.id, 'notes')
  );

  const batch = writeBatch(db);
  for (const n of notesSnap.docs) {
    batch.delete(n.ref);
  }
  batch.delete(doc(db, 'groups', group.id, 'expenses', expense.id));

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
    type: 'expense_deleted',
    summary: `${me.fullName} deleted "${expense.title.slice(0, 60)}" (${formatINR(expense.amountPaise)})`,
    relatedId: expense.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `groups/${group.id}/expenses/${expense.id}`);
  }
}

export async function addExpenseNote(
  me: UserPrivateProfile,
  group: Group,
  expense: Expense,
  text: string
): Promise<void> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;

  const noteRef = doc(collection(db, 'groups', group.id, 'expenses', expense.id, 'notes'));
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));

  const batch = writeBatch(db);
  batch.set(noteRef, {
    authorUid: me.uid,
    authorName: me.fullName,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName,
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
      `groups/${group.id}/expenses/${expense.id}/notes/${noteRef.id}`
    );
  }
}

export async function deleteExpenseNote(
  groupId: string,
  expenseId: string,
  noteId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'groups', groupId, 'expenses', expenseId, 'notes', noteId));
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `groups/${groupId}/expenses/${expenseId}/notes/${noteId}`
    );
  }
}
