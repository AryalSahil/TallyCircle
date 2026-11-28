import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';

const FIRESTORE_DATABASE_ID = 'ai-studio-631d205c-cc67-42b0-bf7e-75e4c4c5ed5e';

const app = getApps().length > 0 ? getApps()[0] : initializeApp();
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type RuleStatus = 'active' | 'paused' | 'cancelled' | 'completed';

interface RecurringRuleDoc {
  groupId: string;
  title: string;
  description: string;
  amountPaise: number;
  currency?: string;
  originalAmountMinor?: number;
  exchangeRateToInr?: number;
  tags?: string[];
  category: string;
  splitMethod: string;
  payers: Array<{ uid: string; name: string; amountPaise: number }>;
  shares: Array<{ uid: string; name: string; sharePaise: number; rawValue: number }>;
  participantUids: string[];
  payerUids: string[];
  frequency: Frequency;
  intervalDays: number;
  anchorDayOfMonth: number;
  monthEndPolicy: 'clamp_last_day';
  startDate: string;
  endDate?: string;
  nextOccurrenceDate: string;
  status: RuleStatus;
  generatedCount: number;
  lastGeneratedDate?: string;
  createdBy: string;
}

function getDaysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function parseIsoParts(dateStr: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.slice(0, 10));
  if (!m) {
    const now = new Date();
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    };
  }
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function formatIsoParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function computeNextDate(
  currentIso: string,
  frequency: Frequency,
  intervalDays: number,
  anchorDayOfMonth: number
): string {
  const { year, month, day } = parseIsoParts(currentIso);
  const anchor = Math.min(31, Math.max(1, anchorDayOfMonth || day));

  if (frequency === 'daily') {
    return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  }
  if (frequency === 'weekly') {
    return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
  }
  if (frequency === 'custom') {
    const step = Math.max(1, Math.min(365, Math.round(intervalDays || 1)));
    return new Date(Date.UTC(year, month - 1, day + step)).toISOString().slice(0, 10);
  }
  if (frequency === 'monthly') {
    const totalMonths = year * 12 + (month - 1) + 1;
    const nextYear = Math.floor(totalMonths / 12);
    const nextMonth = (totalMonths % 12) + 1;
    return formatIsoParts(nextYear, nextMonth, Math.min(anchor, getDaysInMonth(nextYear, nextMonth)));
  }
  const nextYear = year + 1;
  return formatIsoParts(nextYear, month, Math.min(anchor, getDaysInMonth(nextYear, month)));
}

function calculateDueDates(rule: RecurringRuleDoc, todayIso: string) {
  if (rule.status !== 'active') {
    return {
      dueDates: [] as string[],
      nextOccurrenceDate: rule.nextOccurrenceDate,
      nextStatus: rule.status,
    };
  }
  const endBound = rule.endDate?.trim() ? rule.endDate.trim().slice(0, 10) : '';
  let cursor = (rule.nextOccurrenceDate || rule.startDate).slice(0, 10);
  const dueDates: string[] = [];

  if (endBound && cursor > endBound) {
    return { dueDates, nextOccurrenceDate: cursor, nextStatus: 'completed' as RuleStatus };
  }

  while (cursor <= todayIso && dueDates.length < 36) {
    if (endBound && cursor > endBound) {
      return { dueDates, nextOccurrenceDate: cursor, nextStatus: 'completed' as RuleStatus };
    }
    dueDates.push(cursor);
    cursor = computeNextDate(cursor, rule.frequency, rule.intervalDays, rule.anchorDayOfMonth);
  }

  const isCompleted = Boolean(endBound && cursor > endBound);
  return {
    dueDates,
    nextOccurrenceDate: cursor,
    nextStatus: (isCompleted ? 'completed' : 'active') as RuleStatus,
  };
}

function getIstDateIso(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Scheduled hourly Cloud Function that idempotently creates due expenses
 * for every active recurring rule in TallyCircle's named Firestore database.
 */
export const generateRecurringExpenses = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'Asia/Kolkata',
    retryCount: 2,
  },
  async () => {
    const todayIso = getIstDateIso();
    const dueRulesSnap = await db
      .collectionGroup('recurringExpenses')
      .where('status', '==', 'active')
      .where('nextOccurrenceDate', '<=', todayIso)
      .get();

    if (dueRulesSnap.empty) {
      logger.info('No active recurring expense rules due on or before', { todayIso });
      return;
    }

    let createdCount = 0;
    let processedRules = 0;

    for (const ruleDoc of dueRulesSnap.docs) {
      const ruleId = ruleDoc.id;
      const ruleData = ruleDoc.data() as RecurringRuleDoc;
      const groupId = ruleData.groupId;

      if (!groupId) continue;

      try {
        await db.runTransaction(async (tx) => {
          const freshRuleSnap = await tx.get(ruleDoc.ref);
          if (!freshRuleSnap.exists) return;
          const rule = freshRuleSnap.data() as RecurringRuleDoc;
          if (rule.status !== 'active') return;

          const { dueDates, nextOccurrenceDate, nextStatus } = calculateDueDates(rule, todayIso);
          if (dueDates.length === 0) {
            if (nextStatus !== rule.status) {
              tx.update(ruleDoc.ref, {
                nextOccurrenceDate,
                status: nextStatus,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
            return;
          }

          let generatedIncrement = 0;
          let latestDate = rule.lastGeneratedDate || '';

          for (const dueDate of dueDates) {
            const occurrenceKey = `rec_${ruleId}_${dueDate}`;
            const expRef = db.doc(`groups/${groupId}/expenses/${occurrenceKey}`);
            const existingExp = await tx.get(expRef);
            if (existingExp.exists) {
              // Deterministic idempotency guard: skip duplicates on retries or overlapping runs
              continue;
            }

            tx.set(expRef, {
              groupId,
              title: rule.title,
              description: rule.description || '',
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
              receiptImage: '',
              receiptMetadata: null,
              isRecurring: true,
              recurringFrequency: rule.frequency,
              recurringIntervalDays: rule.intervalDays || 0,
              nextOccurrenceDate,
              recurringRuleId: ruleId,
              occurrenceKey,
              createdBy: rule.createdBy,
              updatedBy: rule.createdBy,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            const actRef = db.collection(`groups/${groupId}/activities`).doc();
            tx.set(actRef, {
              groupId,
              actorUid: rule.createdBy,
              actorName: 'Recurring Schedule',
              type: 'expense_added',
              summary: `Auto-logged recurring expense "${rule.title.slice(0, 60)}" for ${dueDate}`,
              relatedId: occurrenceKey,
              createdAt: FieldValue.serverTimestamp(),
            });

            for (const uid of rule.participantUids || []) {
              const notifRef = db.collection('notifications').doc();
              tx.set(notifRef, {
                recipientUid: uid,
                senderUid: rule.createdBy,
                senderName: 'TallyCircle Schedule',
                type: 'expense_added',
                title: `Recurring expense logged · ${rule.title.slice(0, 60)}`,
                body: `"${rule.title}" for ${dueDate} was automatically logged in your group.`,
                link: `/groups/${groupId}`,
                groupId,
                isRead: false,
                createdAt: FieldValue.serverTimestamp(),
              });
            }

            generatedIncrement += 1;
            latestDate = dueDate;
            createdCount += 1;
          }

          tx.update(ruleDoc.ref, {
            nextOccurrenceDate,
            status: nextStatus,
            generatedCount: (rule.generatedCount || 0) + generatedIncrement,
            ...(latestDate ? { lastGeneratedDate: latestDate, lastGeneratedAt: FieldValue.serverTimestamp() } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        processedRules += 1;
      } catch (err) {
        logger.error('Failed processing recurring rule', { ruleId, groupId, err });
      }
    }

    logger.info('Recurring expense batch finished', {
      todayIso,
      processedRules,
      createdCount,
    });
  }
);
