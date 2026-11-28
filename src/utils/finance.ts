import {
  CURRENCY_CODES,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type ExpensePayer,
  type ExpenseShare,
  type MemberBalance,
  type Settlement,
  type SimplifiedDebt,
  type SplitMethod,
} from '../types';

/**
 * Converts INR string/number to integer paise safely.
 */
export function inrToPaise(amount: number | string): number {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
}

/**
 * Converts any major currency amount string/number to integer minor units (e.g. cents/paise).
 */
export function amountToMinorUnits(amount: number | string): number {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
}

/**
 * Converts an amount entered in `currency` at `exchangeRateToInr` into canonical INR paise.
 */
export function foreignMinorToInrPaise(
  minorUnits: number,
  currency: CurrencyCode,
  exchangeRateToInr: number
): number {
  if (minorUnits <= 0) return 0;
  if (currency === 'INR') return Math.round(minorUnits);
  const safeRate = Number.isFinite(exchangeRateToInr) && exchangeRateToInr > 0
    ? exchangeRateToInr
    : SUPPORTED_CURRENCIES[currency].defaultRateToInr;
  return Math.round(minorUnits * safeRate);
}

/**
 * Converts canonical INR paise to display amount in `targetCurrency`.
 */
export function convertInrPaiseToCurrencyAmount(
  paise: number,
  targetCurrency: CurrencyCode
): number {
  const inr = paise / 100;
  if (targetCurrency === 'INR') return inr;
  const rateToInr = SUPPORTED_CURRENCIES[targetCurrency]?.defaultRateToInr || 1;
  return inr / rateToInr;
}

/**
 * Formats canonical INR paise into any supported base currency.
 */
export function formatCurrency(
  paiseInr: number,
  targetCurrency: CurrencyCode = 'INR',
  options?: { showSign?: boolean; compact?: boolean }
): string {
  const meta = SUPPORTED_CURRENCIES[targetCurrency] || SUPPORTED_CURRENCIES.INR;
  const converted = convertInrPaiseToCurrencyAmount(Math.abs(paiseInr), targetCurrency);
  const isWhole = targetCurrency === 'INR'
    ? Math.abs(paiseInr) % 100 === 0
    : Math.abs(Math.round(converted * 100)) % 100 === 0;

  const formatted = new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: meta.code,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
    notation: options?.compact && converted >= 100000 ? 'compact' : 'standard',
  }).format(converted);

  if (options?.showSign) {
    if (paiseInr > 0) return `+${formatted}`;
    if (paiseInr < 0) return `-${formatted}`;
  } else if (paiseInr < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

/**
 * Formats an exact original currency minor-unit amount (no conversion).
 */
export function formatOriginalCurrency(
  minorUnits: number,
  currency: CurrencyCode = 'INR'
): string {
  const meta = SUPPORTED_CURRENCIES[currency] || SUPPORTED_CURRENCIES.INR;
  const major = minorUnits / 100;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: meta.code,
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

export function isSupportedCurrency(val: string | undefined): val is CurrencyCode {
  return Boolean(val && (CURRENCY_CODES as readonly string[]).includes(val));
}

export function normalizeExpenseTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9\-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30);
}

/**
 * Formats integer paise to crisp INR currency string.
 */
export function formatINR(paise: number, options?: { showSign?: boolean; compact?: boolean }): string {
  return formatCurrency(paise, 'INR', options);
}

export function paiseToInputString(paise: number): string {
  if (paise <= 0) return '';
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}

export interface SplitParticipantInput {
  uid: string;
  name: string;
  rawValue: number; // paise for unequal, percent (0-100) for percentage, units for shares
}

export interface SplitComputationResult {
  shares: ExpenseShare[];
  isValid: boolean;
  error?: string;
  allocatedPaise: number;
  remainingPaise: number;
}

/**
 * Deterministic integer-paise splitting engine using Hamilton largest-remainder method.
 * Guarantees sum(shares.sharePaise) === totalPaise whenever valid.
 */
export function computeSplits(
  totalPaise: number,
  method: SplitMethod,
  participants: SplitParticipantInput[]
): SplitComputationResult {
  if (totalPaise <= 0) {
    return {
      shares: [],
      isValid: false,
      error: 'Enter an expense amount greater than ₹0.',
      allocatedPaise: 0,
      remainingPaise: totalPaise,
    };
  }
  if (participants.length === 0) {
    return {
      shares: [],
      isValid: false,
      error: 'Select at least one participant.',
      allocatedPaise: 0,
      remainingPaise: totalPaise,
    };
  }

  if (method === 'equal') {
    const count = participants.length;
    const base = Math.floor(totalPaise / count);
    const remainder = totalPaise % count;
    const shares: ExpenseShare[] = participants.map((p, idx) => ({
      uid: p.uid,
      name: p.name,
      sharePaise: base + (idx < remainder ? 1 : 0),
      rawValue: 1,
    }));
    return { shares, isValid: true, allocatedPaise: totalPaise, remainingPaise: 0 };
  }

  if (method === 'unequal') {
    const shares: ExpenseShare[] = participants.map((p) => ({
      uid: p.uid,
      name: p.name,
      sharePaise: Math.max(0, Math.round(p.rawValue)),
      rawValue: Math.max(0, Math.round(p.rawValue)),
    }));
    const allocatedPaise = shares.reduce((sum, s) => sum + s.sharePaise, 0);
    const remainingPaise = totalPaise - allocatedPaise;
    const isValid = remainingPaise === 0 && shares.some((s) => s.sharePaise > 0);
    return {
      shares,
      isValid,
      error: isValid
        ? undefined
        : remainingPaise > 0
          ? `${formatINR(remainingPaise)} remaining to allocate.`
          : `${formatINR(Math.abs(remainingPaise))} over-allocated.`,
      allocatedPaise,
      remainingPaise,
    };
  }

  if (method === 'percentage') {
    const totalPctBps = participants.reduce((sum, p) => sum + Math.round(p.rawValue * 100), 0);
    if (Math.abs(totalPctBps - 10000) > 1) {
      const shares: ExpenseShare[] = participants.map((p) => ({
        uid: p.uid,
        name: p.name,
        sharePaise: Math.floor((totalPaise * Math.round(p.rawValue * 100)) / 10000),
        rawValue: p.rawValue,
      }));
      const allocated = shares.reduce((s, x) => s + x.sharePaise, 0);
      return {
        shares,
        isValid: false,
        error: `Percentages must total 100% (currently ${(totalPctBps / 100).toFixed(2)}%).`,
        allocatedPaise: allocated,
        remainingPaise: totalPaise - allocated,
      };
    }

    const exactList = participants.map((p, idx) => {
      const bps = Math.max(0, Math.round(p.rawValue * 100));
      const exact = (totalPaise * bps) / 10000;
      const floored = Math.floor(exact);
      return { idx, p, floored, rem: exact - floored };
    });

    const flooredSum = exactList.reduce((s, x) => s + x.floored, 0);
    let diff = totalPaise - flooredSum;
    const sortedForRem = [...exactList].sort((a, b) => b.rem - a.rem || a.idx - b.idx);
    const bonusSet = new Set<number>();
    for (let i = 0; i < diff && i < sortedForRem.length; i++) {
      bonusSet.add(sortedForRem[i].idx);
    }

    const shares: ExpenseShare[] = exactList.map((item) => ({
      uid: item.p.uid,
      name: item.p.name,
      sharePaise: item.floored + (bonusSet.has(item.idx) ? 1 : 0),
      rawValue: item.p.rawValue,
    }));

    return { shares, isValid: true, allocatedPaise: totalPaise, remainingPaise: 0 };
  }

  // method === 'shares' (exact units)
  const totalUnits = participants.reduce((sum, p) => sum + Math.max(0, p.rawValue), 0);
  if (totalUnits <= 0) {
    return {
      shares: participants.map((p) => ({
        uid: p.uid,
        name: p.name,
        sharePaise: 0,
        rawValue: p.rawValue,
      })),
      isValid: false,
      error: 'Assign at least 1 total share unit.',
      allocatedPaise: 0,
      remainingPaise: totalPaise,
    };
  }

  const exactList = participants.map((p, idx) => {
    const units = Math.max(0, p.rawValue);
    const exact = (totalPaise * units) / totalUnits;
    const floored = Math.floor(exact);
    return { idx, p, floored, rem: exact - floored };
  });

  const flooredSum = exactList.reduce((s, x) => s + x.floored, 0);
  const diff = totalPaise - flooredSum;
  const sortedForRem = [...exactList].sort((a, b) => b.rem - a.rem || a.idx - b.idx);
  const bonusSet = new Set<number>();
  for (let i = 0; i < diff && i < sortedForRem.length; i++) {
    bonusSet.add(sortedForRem[i].idx);
  }

  const shares: ExpenseShare[] = exactList.map((item) => ({
    uid: item.p.uid,
    name: item.p.name,
    sharePaise: item.floored + (bonusSet.has(item.idx) ? 1 : 0),
    rawValue: item.p.rawValue,
  }));

  return { shares, isValid: true, allocatedPaise: totalPaise, remainingPaise: 0 };
}

/**
 * Core Financial Calculation Engine (Phase 8).
 * Formula: Net Balance = (Expense Paid + Confirmed Settlements Paid) - (Expense Share + Confirmed Settlements Received)
 * Guarantees sum of all member net balances === 0.
 */
export function computeGroupBalances(
  memberNames: Record<string, string>,
  expenses: Array<{
    amountPaise: number;
    payers: Array<Pick<ExpensePayer, 'uid' | 'name' | 'amountPaise'>>;
    shares: Array<Pick<ExpenseShare, 'uid' | 'name' | 'sharePaise'>>;
  }>,
  settlements: Pick<Settlement, 'fromUid' | 'fromName' | 'toUid' | 'toName' | 'amountPaise' | 'status'>[]
): {
  totalExpenditurePaise: number;
  memberBalances: MemberBalance[];
  simplifiedDebts: SimplifiedDebt[];
  zeroSumCheckPaise: number;
} {
  const map = new Map<string, MemberBalance>();

  const ensureMember = (uid: string, fallbackName?: string) => {
    if (!map.has(uid)) {
      map.set(uid, {
        uid,
        name: memberNames[uid] || fallbackName || 'Member',
        expensePaidPaise: 0,
        expenseSharePaise: 0,
        settlementPaidPaise: 0,
        settlementReceivedPaise: 0,
        netBalancePaise: 0,
      });
    }
    return map.get(uid)!;
  };

  Object.entries(memberNames).forEach(([uid, name]) => ensureMember(uid, name));

  let totalExpenditurePaise = 0;

  for (const exp of expenses) {
    totalExpenditurePaise += Math.round(exp.amountPaise || 0);

    for (const payer of exp.payers) {
      const m = ensureMember(payer.uid, payer.name);
      m.expensePaidPaise += Math.round(payer.amountPaise || 0);
    }

    for (const share of exp.shares) {
      const m = ensureMember(share.uid, share.name);
      m.expenseSharePaise += Math.round(share.sharePaise || 0);
    }
  }

  // Only CONFIRMED settlements affect balances
  for (const st of settlements) {
    if (st.status !== 'confirmed') continue;
    const payer = ensureMember(st.fromUid, st.fromName);
    const receiver = ensureMember(st.toUid, st.toName);
    const amt = Math.round(st.amountPaise || 0);
    payer.settlementPaidPaise += amt;
    receiver.settlementReceivedPaise += amt;
  }

  const memberBalances: MemberBalance[] = [];
  let zeroSumCheckPaise = 0;
  for (const m of map.values()) {
    const totalPaid = m.expensePaidPaise + m.settlementPaidPaise;
    const totalObligation = m.expenseSharePaise + m.settlementReceivedPaise;
    m.netBalancePaise = totalPaid - totalObligation;
    zeroSumCheckPaise += m.netBalancePaise;
    memberBalances.push(m);
  }

  memberBalances.sort((a, b) => b.netBalancePaise - a.netBalancePaise);
  const simplifiedDebts = simplifyDebts(memberBalances);

  return {
    totalExpenditurePaise,
    memberBalances,
    simplifiedDebts,
    zeroSumCheckPaise,
  };
}

/**
 * Verifies the double-entry zero-sum invariant across all member balances.
 */
export function verifyZeroSumBalance(balances: MemberBalance[]): boolean {
  const sum = balances.reduce((acc, b) => acc + b.netBalancePaise, 0);
  return sum === 0;
}

/**
 * Greedy min-cash-flow debt simplification.
 */
export function simplifyDebts(balances: MemberBalance[]): SimplifiedDebt[] {
  const creditors = balances
    .filter((b) => b.netBalancePaise > 0)
    .map((b) => ({ uid: b.uid, name: b.name, amount: b.netBalancePaise }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter((b) => b.netBalancePaise < 0)
    .map((b) => ({ uid: b.uid, name: b.name, amount: Math.abs(b.netBalancePaise) }))
    .sort((a, b) => b.amount - a.amount);

  const debts: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transfer = Math.min(debtor.amount, creditor.amount);

    if (transfer > 0) {
      debts.push({
        fromUid: debtor.uid,
        fromName: debtor.name,
        toUid: creditor.uid,
        toName: creditor.name,
        amountPaise: transfer,
      });
    }

    debtor.amount -= transfer;
    creditor.amount -= transfer;

    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }

  return debts;
}

export type BudgetThresholdStatus = 'unset' | 'ok' | 'approaching' | 'exceeded';

export function classifyBudgetStatus(spentPaise: number, budgetPaise: number): {
  percentUsed: number;
  status: BudgetThresholdStatus;
} {
  if (!budgetPaise || budgetPaise <= 0) {
    return { percentUsed: 0, status: 'unset' };
  }
  const percentUsed = Math.round((spentPaise / budgetPaise) * 100);
  if (spentPaise > budgetPaise) {
    return { percentUsed, status: 'exceeded' };
  }
  if (spentPaise >= Math.round(budgetPaise * 0.8)) {
    return { percentUsed, status: 'approaching' };
  }
  return { percentUsed, status: 'ok' };
}

