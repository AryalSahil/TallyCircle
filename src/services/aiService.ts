import { auth } from '../lib/firebase';
import type { CurrencyCode, ExpenseCategory } from '../types';

export interface ParsedExpenseResult {
  title: string;
  amount: number;
  currency: CurrencyCode;
  category: ExpenseCategory;
  expenseDate: string;
  description: string;
  matchedMembers: string[];
  suggestedTags: string[];
}

async function getBearerHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in first.');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function parseExpenseWithAI(payload: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  memberNames?: string[];
}): Promise<ParsedExpenseResult> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/ai/parse-expense', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not analyze expense.');
  }
  return data as ParsedExpenseResult;
}

export async function generateSpendingBrief(payload: {
  scopeLabel: string;
  totalInr: number;
  expenseCount: number;
  topCategories: Array<{ category: string; amountInr: number }>;
  pendingSettlementsCount: number;
}): Promise<string> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/ai/spending-brief', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not generate spending brief.');
  }
  return data.brief as string;
}
