import type { RecurringRuleFrequency, RecurringRuleStatus } from '../types';

export function getDaysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

export function parseIsoDateParts(dateStr: string): { year: number; month: number; day: number } {
  const clean = dateStr.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) {
    const now = new Date();
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    };
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatIsoDateParts(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function extractAnchorDayOfMonth(startDate: string): number {
  return parseIsoDateParts(startDate).day;
}

/**
 * Deterministic calendar recurrence calculation with accurate month-end and leap-year clamping.
 * Example: Jan 31 with anchorDayOfMonth=31 -> Feb 28 (or 29 on leap year) -> Mar 31 -> Apr 30.
 */
export function computeNextOccurrenceDate(
  currentDateIso: string,
  frequency: RecurringRuleFrequency,
  intervalDays = 30,
  anchorDayOfMonth?: number
): string {
  const clean = currentDateIso.slice(0, 10);
  const { year, month, day } = parseIsoDateParts(clean);
  const anchorDay = Math.min(31, Math.max(1, anchorDayOfMonth ?? day));

  if (frequency === 'daily') {
    const dt = new Date(Date.UTC(year, month - 1, day + 1));
    return dt.toISOString().slice(0, 10);
  }

  if (frequency === 'weekly') {
    const dt = new Date(Date.UTC(year, month - 1, day + 7));
    return dt.toISOString().slice(0, 10);
  }

  if (frequency === 'custom') {
    const step = Math.max(1, Math.min(365, Math.round(intervalDays || 1)));
    const dt = new Date(Date.UTC(year, month - 1, day + step));
    return dt.toISOString().slice(0, 10);
  }

  if (frequency === 'monthly') {
    const totalMonths = year * 12 + (month - 1) + 1;
    const nextYear = Math.floor(totalMonths / 12);
    const nextMonth = (totalMonths % 12) + 1;
    const maxDay = getDaysInMonth(nextYear, nextMonth);
    return formatIsoDateParts(nextYear, nextMonth, Math.min(anchorDay, maxDay));
  }

  // yearly (clamps Feb 29 on non-leap years to Feb 28, restores Feb 29 on next leap year)
  const nextYear = year + 1;
  const maxDay = getDaysInMonth(nextYear, month);
  return formatIsoDateParts(nextYear, month, Math.min(anchorDay, maxDay));
}

export function buildOccurrenceIdempotencyKey(ruleId: string, occurrenceDate: string): string {
  const safeRule = ruleId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeDate = occurrenceDate.slice(0, 10).replace(/[^0-9-]/g, '');
  return `rec_${safeRule}_${safeDate}`;
}

export interface DueScheduleInput {
  id: string;
  frequency: RecurringRuleFrequency;
  intervalDays: number;
  anchorDayOfMonth: number;
  startDate: string;
  endDate?: string;
  nextOccurrenceDate: string;
  status: RecurringRuleStatus;
}

/**
 * Returns all due YYYY-MM-DD occurrence dates <= upToDateIso (respecting endDate),
 * plus the resulting nextOccurrenceDate and whether the schedule is completed.
 */
export function calculateDueOccurrences(
  rule: DueScheduleInput,
  upToDateIso: string,
  maxBatchOccurrences = 36
): {
  dueDates: string[];
  nextOccurrenceDate: string;
  nextStatus: RecurringRuleStatus;
} {
  if (rule.status !== 'active') {
    return {
      dueDates: [],
      nextOccurrenceDate: rule.nextOccurrenceDate,
      nextStatus: rule.status,
    };
  }

  const ceiling = upToDateIso.slice(0, 10);
  const endBound = rule.endDate?.trim() ? rule.endDate.trim().slice(0, 10) : '';
  let cursor = (rule.nextOccurrenceDate || rule.startDate).slice(0, 10);
  const anchor = rule.anchorDayOfMonth || extractAnchorDayOfMonth(rule.startDate || cursor);
  const dueDates: string[] = [];

  if (endBound && cursor > endBound) {
    return {
      dueDates: [],
      nextOccurrenceDate: cursor,
      nextStatus: 'completed',
    };
  }

  while (cursor <= ceiling && dueDates.length < maxBatchOccurrences) {
    if (endBound && cursor > endBound) {
      return {
        dueDates,
        nextOccurrenceDate: cursor,
        nextStatus: 'completed',
      };
    }
    dueDates.push(cursor);
    cursor = computeNextOccurrenceDate(cursor, rule.frequency, rule.intervalDays, anchor);
  }

  const isCompleted = Boolean(endBound && cursor > endBound);
  return {
    dueDates,
    nextOccurrenceDate: cursor,
    nextStatus: isCompleted ? 'completed' : 'active',
  };
}

export function formatFrequencyLabel(frequency: RecurringRuleFrequency, intervalDays?: number): string {
  switch (frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'custom':
      return `Every ${Math.max(1, intervalDays || 1)} day${(intervalDays || 1) === 1 ? '' : 's'}`;
  }
}

export function getTodayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
