import type { RecurringExpenseRule } from '../types';
import {
  buildOccurrenceIdempotencyKey,
  calculateDueOccurrences,
} from './recurrence';

export interface SimulatedExpenseRecord {
  id: string;
  groupId: string;
  title: string;
  description: string;
  amountPaise: number;
  currency: string;
  originalAmountMinor: number;
  exchangeRateToInr: number;
  tags: string[];
  category: string;
  expenseDate: string;
  splitMethod: string;
  payers: RecurringExpenseRule['payers'];
  shares: RecurringExpenseRule['shares'];
  participantUids: string[];
  payerUids: string[];
  isRecurring: true;
  recurringFrequency: RecurringExpenseRule['frequency'];
  recurringIntervalDays: number;
  nextOccurrenceDate: string;
  recurringRuleId: string;
  occurrenceKey: string;
  createdBy: string;
  updatedBy: string;
}

export interface RecurringBatchAdapter {
  hasExpense(groupId: string, expenseDocId: string): boolean;
  insertExpense(groupId: string, expenseDocId: string, doc: SimulatedExpenseRecord): void;
  updateRule(
    groupId: string,
    ruleId: string,
    patch: {
      nextOccurrenceDate: string;
      status: RecurringExpenseRule['status'];
      generatedCount: number;
      lastGeneratedDate: string;
    }
  ): void;
  appendActivity(groupId: string, summary: string, relatedId: string): void;
}

/**
 * Pure deterministic recurrence processor matching the Cloud Function transaction behavior.
 * Safe to call repeatedly: deterministic docId rec_${ruleId}_${dueDate} guarantees idempotency.
 */
export function processRecurringRuleSynchronously(
  rule: Pick<
    RecurringExpenseRule,
    | 'id'
    | 'groupId'
    | 'title'
    | 'description'
    | 'amountPaise'
    | 'currency'
    | 'originalAmountMinor'
    | 'exchangeRateToInr'
    | 'tags'
    | 'category'
    | 'splitMethod'
    | 'payers'
    | 'shares'
    | 'participantUids'
    | 'payerUids'
    | 'frequency'
    | 'intervalDays'
    | 'anchorDayOfMonth'
    | 'startDate'
    | 'endDate'
    | 'nextOccurrenceDate'
    | 'status'
    | 'generatedCount'
    | 'lastGeneratedDate'
    | 'createdBy'
  >,
  upToDateIso: string,
  adapter: RecurringBatchAdapter
): { createdIds: string[]; nextOccurrenceDate: string; nextStatus: RecurringExpenseRule['status'] } {
  const { dueDates, nextOccurrenceDate, nextStatus } = calculateDueOccurrences(rule, upToDateIso);
  const createdIds: string[] = [];

  if (dueDates.length === 0) {
    if (nextStatus !== rule.status) {
      adapter.updateRule(rule.groupId, rule.id, {
        nextOccurrenceDate,
        status: nextStatus,
        generatedCount: rule.generatedCount,
        lastGeneratedDate: rule.lastGeneratedDate || '',
      });
    }
    return { createdIds, nextOccurrenceDate, nextStatus };
  }

  let generatedCount = rule.generatedCount || 0;
  let lastGeneratedDate = rule.lastGeneratedDate || '';

  for (const dueDate of dueDates) {
    const occurrenceKey = buildOccurrenceIdempotencyKey(rule.id, dueDate);
    if (!adapter.hasExpense(rule.groupId, occurrenceKey)) {
      adapter.insertExpense(rule.groupId, occurrenceKey, {
        id: occurrenceKey,
        groupId: rule.groupId,
        title: rule.title,
        description: rule.description,
        amountPaise: rule.amountPaise,
        currency: rule.currency || 'INR',
        originalAmountMinor: rule.originalAmountMinor || rule.amountPaise,
        exchangeRateToInr: rule.exchangeRateToInr || 1,
        tags: rule.tags || [],
        category: rule.category,
        expenseDate: dueDate,
        splitMethod: rule.splitMethod,
        payers: rule.payers,
        shares: rule.shares,
        participantUids: rule.participantUids,
        payerUids: rule.payerUids,
        isRecurring: true,
        recurringFrequency: rule.frequency,
        recurringIntervalDays: rule.intervalDays || 0,
        nextOccurrenceDate,
        recurringRuleId: rule.id,
        occurrenceKey,
        createdBy: rule.createdBy,
        updatedBy: rule.createdBy,
      });
      adapter.appendActivity(
        rule.groupId,
        `Recurring expense "${rule.title}" logged automatically for ${dueDate}`,
        occurrenceKey
      );
      createdIds.push(occurrenceKey);
      generatedCount += 1;
      lastGeneratedDate = dueDate;
    }
  }

  adapter.updateRule(rule.groupId, rule.id, {
    nextOccurrenceDate,
    status: nextStatus,
    generatedCount,
    lastGeneratedDate,
  });

  return { createdIds, nextOccurrenceDate, nextStatus };
}
