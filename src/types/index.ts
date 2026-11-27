import { Timestamp } from 'firebase/firestore';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Restaurant',
  'Travel',
  'Hotel',
  'Clubbing',
  'Shopping',
  'Entertainment',
  'Transport',
  'Fuel',
  'Tickets',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CURRENCY_CODES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  defaultRateToInr: number;
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', defaultRateToInr: 1 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', defaultRateToInr: 84.5 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'en-IE', defaultRateToInr: 91.2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', defaultRateToInr: 107.4 },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', locale: 'en-AE', defaultRateToInr: 23.0 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', defaultRateToInr: 63.1 },
  THB: { code: 'THB', symbol: '฿', name: 'Thai Baht', locale: 'th-TH', defaultRateToInr: 2.48 },
};

export const PRESET_EXPENSE_TAGS = ['vacation', 'work', 'essential', 'weekend', 'reimbursable'] as const;

export type SplitMethod = 'equal' | 'unequal' | 'percentage' | 'shares';
export type SettlementMethod = 'cash' | 'upi';
export type SettlementStatus = 'pending' | 'awaiting_confirmation' | 'confirmed' | 'disputed';
export type RecurringFrequency = 'none' | 'weekly' | 'monthly' | 'custom';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserPrivateProfile {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  upiId?: string;
  photoUrl?: string;
  handle: string;
  theme?: ThemePreference;
  preferredCurrency?: CurrencyCode;
  customTags?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  handle: string;
  photoUrl?: string;
  upiId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Friendship {
  id: string;
  users: [string, string];
  requesterUid: string;
  recipientUid: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FriendInvite {
  token: string;
  creatorUid: string;
  creatorName: string;
  expiresAt: Timestamp;
  maxUses: number;
  usesCount: number;
  usedBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  currency: 'INR';
  isArchived: boolean;
  startDate?: string;
  endDate?: string;
  memberUids: string[];
  memberNames: Record<string, string>;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupInvite {
  token: string;
  groupId: string;
  groupName: string;
  createdBy: string;
  expiresAt: Timestamp;
  maxUses: number;
  usesCount: number;
  usedBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpensePayer {
  uid: string;
  name: string;
  amountPaise: number;
}

export interface ExpenseShare {
  uid: string;
  name: string;
  sharePaise: number;
  rawValue: number;
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  description: string;
  amountPaise: number;
  currency?: CurrencyCode;
  originalAmountMinor?: number;
  exchangeRateToInr?: number;
  tags?: string[];
  category: ExpenseCategory;
  expenseDate: string;
  splitMethod: SplitMethod;
  payers: ExpensePayer[];
  shares: ExpenseShare[];
  participantUids: string[];
  payerUids: string[];
  receiptImage?: string;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency;
  recurringIntervalDays?: number;
  nextOccurrenceDate?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpenseNote {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt: Timestamp;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amountPaise: number;
  method: SettlementMethod;
  upiTransactionRef?: string;
  note?: string;
  status: SettlementStatus;
  createdBy: string;
  confirmedBy?: string;
  disputeReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupActivity {
  id: string;
  groupId: string;
  actorUid: string;
  actorName: string;
  type: string;
  summary: string;
  relatedId?: string;
  createdAt: Timestamp;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  senderUid: string;
  senderName: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  groupId?: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface MemberBalance {
  uid: string;
  name: string;
  expensePaidPaise: number;
  expenseSharePaise: number;
  settlementPaidPaise: number;
  settlementReceivedPaise: number;
  netBalancePaise: number;
}

export interface SimplifiedDebt {
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amountPaise: number;
}
