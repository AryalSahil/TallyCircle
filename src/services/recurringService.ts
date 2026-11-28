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
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../lib/firebase';
import type {
  CurrencyCode,
  ExpenseCategory,
  ExpensePayer,
  ExpenseShare,
  Group,
  RecurringExpenseRule,
  RecurringRuleFrequency,
  RecurringRuleStatus,
  SplitMethod,
  UserPrivateProfile,
} from '../types';
import { formatINR, formatOriginalCurrency, normalizeExpenseTag } from '../utils/finance';
import {
  computeNextOccurrenceDate,
  extractAnchorDayOfMonth,
  formatFrequencyLabel,
  getTodayIsoDate,
} from '../utils/recurrence';

export function subscribeGroupRecurringRules(
  groupId: string,
  callback: (rules: RecurringExpenseRule[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'groups', groupId, 'recurringExpenses'),
    orderBy('nextOccurrenceDate', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RecurringExpenseRule, 'id'>),
        }))
      );
    },
    (error) => {
      const info = logFirestoreError(
        error,
        OperationType.LIST,
        `groups/${groupId}/recurringExpenses`
      );
      if (onError) onError(new Error(info.error));
    }
  );
}

export interface RecurringRuleUpsertPayload {
  title: string;
  description: string;
  amountPaise: number;
  currency: CurrencyCode;
  originalAmountMinor: number;
  exchangeRateToInr: number;
  tags: string[];
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  payers: ExpensePayer[];
  shares: ExpenseShare[];
  frequency: RecurringRuleFrequency;
  intervalDays?: number;
  startDate: string;
  endDate?: string;
  /**
   * When an initial expense was already logged alongside creating the rule on startDate,
   * set nextOccurrenceDate to the following cycle rather than duplicating today.
   */
  skipInitialOccurrence?: boolean;
}

export async function createRecurringRule(
  me: UserPrivateProfile,
  group: Group,
  payload: RecurringRuleUpsertPayload
): Promise<string> {
  const ruleRef = doc(collection(db, 'groups', group.id, 'recurringExpenses'));
  const payerUids = Array.from(new Set(payload.payers.map((p) => p.uid)));
  const participantUids = Array.from(new Set(payload.shares.map((s) => s.uid)));
  const cleanTags = Array.from(
    new Set((payload.tags || []).map(normalizeExpenseTag).filter(Boolean))
  ).slice(0, 10);

  const safeInterval =
    payload.frequency === 'custom'
      ? Math.max(1, Math.min(365, Math.round(payload.intervalDays || 14)))
      : 0;
  const anchorDayOfMonth = extractAnchorDayOfMonth(payload.startDate);

  let nextOccurrenceDate = payload.startDate;
  if (payload.skipInitialOccurrence) {
    nextOccurrenceDate = computeNextOccurrenceDate(
      payload.startDate,
      payload.frequency,
      safeInterval,
      anchorDayOfMonth
    );
  }

  let initialStatus: RecurringRuleStatus = 'active';
  if (payload.endDate && nextOccurrenceDate > payload.endDate) {
    // Firestore create requires status == 'active'; if caller skipped initial past endDate,
    // anchor on startDate unless caller already logged up to endDate
    nextOccurrenceDate = payload.startDate;
    initialStatus = 'active';
  }

  const displayAmount =
    payload.currency !== 'INR'
      ? `${formatOriginalCurrency(payload.originalAmountMinor, payload.currency)} · ${formatINR(payload.amountPaise)}`
      : formatINR(payload.amountPaise);

  const batch = writeBatch(db);
  batch.set(ruleRef, {
    groupId: group.id,
    title: payload.title.trim().slice(0, 120),
    description: payload.description.trim().slice(0, 500),
    amountPaise: Math.round(payload.amountPaise),
    currency: payload.currency,
    originalAmountMinor: Math.round(payload.originalAmountMinor),
    exchangeRateToInr: Number(payload.exchangeRateToInr) || 1,
    tags: cleanTags,
    category: payload.category,
    splitMethod: payload.splitMethod,
    payers: payload.payers,
    shares: payload.shares,
    participantUids,
    payerUids,
    frequency: payload.frequency,
    intervalDays: safeInterval,
    anchorDayOfMonth,
    monthEndPolicy: 'clamp_last_day',
    startDate: payload.startDate,
    endDate: payload.endDate || '',
    nextOccurrenceDate,
    status: initialStatus,
    generatedCount: 0,
    createdBy: me.uid,
    updatedBy: me.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'recurring_rule_created',
    summary: `${me.fullName} set up recurring expense "${payload.title.trim().slice(0, 50)}" (${displayAmount} · ${formatFrequencyLabel(payload.frequency, safeInterval)})`,
    relatedId: ruleRef.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `groups/${group.id}/recurringExpenses/${ruleRef.id}`
    );
  }

  return ruleRef.id;
}

export async function updateRecurringRule(
  me: UserPrivateProfile,
  group: Group,
  rule: RecurringExpenseRule,
  updates: Partial<RecurringRuleUpsertPayload> & {
    nextOccurrenceDate?: string;
    status?: RecurringRuleStatus;
  }
): Promise<void> {
  const nextFrequency = updates.frequency ?? rule.frequency;
  const nextInterval =
    nextFrequency === 'custom'
      ? Math.max(1, Math.min(365, Math.round(updates.intervalDays ?? rule.intervalDays ?? 14)))
      : 0;
  const nextStartDate = updates.startDate ?? rule.startDate;
  const nextAnchor = extractAnchorDayOfMonth(nextStartDate);
  const nextEndDate = updates.endDate !== undefined ? updates.endDate : (rule.endDate || '');
  const nextDueDate = updates.nextOccurrenceDate ?? rule.nextOccurrenceDate;

  const payers = updates.payers ?? rule.payers;
  const shares = updates.shares ?? rule.shares;
  const payerUids = Array.from(new Set(payers.map((p) => p.uid)));
  const participantUids = Array.from(new Set(shares.map((s) => s.uid)));
  const cleanTags = Array.from(
    new Set((updates.tags ?? rule.tags ?? []).map(normalizeExpenseTag).filter(Boolean))
  ).slice(0, 10);

  const batch = writeBatch(db);
  batch.update(doc(db, 'groups', group.id, 'recurringExpenses', rule.id), {
    title: (updates.title ?? rule.title).trim().slice(0, 120),
    description: (updates.description ?? rule.description).trim().slice(0, 500),
    amountPaise: Math.round(updates.amountPaise ?? rule.amountPaise),
    currency: updates.currency ?? rule.currency ?? 'INR',
    originalAmountMinor: Math.round(
      updates.originalAmountMinor ?? rule.originalAmountMinor ?? rule.amountPaise
    ),
    exchangeRateToInr: Number(updates.exchangeRateToInr ?? rule.exchangeRateToInr) || 1,
    tags: cleanTags,
    category: updates.category ?? rule.category,
    splitMethod: updates.splitMethod ?? rule.splitMethod,
    payers,
    shares,
    participantUids,
    payerUids,
    frequency: nextFrequency,
    intervalDays: nextInterval,
    anchorDayOfMonth: nextAnchor,
    monthEndPolicy: 'clamp_last_day',
    startDate: nextStartDate,
    endDate: nextEndDate,
    nextOccurrenceDate: nextDueDate,
    status: updates.status ?? rule.status,
    updatedBy: me.uid,
    updatedAt: serverTimestamp(),
  });

  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: 'recurring_rule_updated',
    summary: `${me.fullName} updated recurring rule "${(updates.title ?? rule.title).slice(0, 50)}"`,
    relatedId: rule.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `groups/${group.id}/recurringExpenses/${rule.id}`
    );
  }
}

export async function setRecurringRuleStatus(
  me: UserPrivateProfile,
  group: Group,
  rule: RecurringExpenseRule,
  nextStatus: 'active' | 'paused' | 'cancelled'
): Promise<void> {
  const todayIso = getTodayIsoDate();
  let nextOccurrenceDate = rule.nextOccurrenceDate;

  // When resuming a stale rule whose scheduled date fell into the past while paused,
  // advance forward to the next upcoming cycle >= today so resuming doesn't surprise with old backfills.
  if (nextStatus === 'active' && nextOccurrenceDate < todayIso) {
    let candidate = nextOccurrenceDate;
    let guard = 0;
    while (candidate < todayIso && guard < 120) {
      candidate = computeNextOccurrenceDate(
        candidate,
        rule.frequency,
        rule.intervalDays,
        rule.anchorDayOfMonth
      );
      guard++;
    }
    nextOccurrenceDate = candidate;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'groups', group.id, 'recurringExpenses', rule.id), {
    status: nextStatus,
    nextOccurrenceDate,
    updatedBy: me.uid,
    updatedAt: serverTimestamp(),
  });

  const label =
    nextStatus === 'active' ? 'resumed' : nextStatus === 'paused' ? 'paused' : 'cancelled';
  const actRef = doc(collection(db, 'groups', group.id, 'activities'));
  batch.set(actRef, {
    groupId: group.id,
    actorUid: me.uid,
    actorName: me.fullName.slice(0, 80),
    type: `recurring_rule_${label}`,
    summary: `${me.fullName} ${label} recurring expense "${rule.title.slice(0, 50)}"`,
    relatedId: rule.id,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `groups/${group.id}/recurringExpenses/${rule.id}`
    );
  }
}

export async function deleteRecurringRule(
  me: UserPrivateProfile,
  group: Group,
  rule: RecurringExpenseRule
): Promise<void> {
  const ruleRef = doc(db, 'groups', group.id, 'recurringExpenses', rule.id);
  try {
    await deleteDoc(ruleRef);
    const actBatch = writeBatch(db);
    actBatch.set(doc(collection(db, 'groups', group.id, 'activities')), {
      groupId: group.id,
      actorUid: me.uid,
      actorName: me.fullName.slice(0, 80),
      type: 'recurring_rule_deleted',
      summary: `${me.fullName} deleted recurring rule "${rule.title.slice(0, 50)}"`,
      relatedId: rule.id,
      createdAt: serverTimestamp(),
    });
    await actBatch.commit().catch(() => {});
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `groups/${group.id}/recurringExpenses/${rule.id}`
    );
  }
}
