import type { Timestamp } from 'firebase/firestore';

export const EXPENSE_CATEGORIES = [
  'Food & Drinks',
  'Transport',
  'Accommodation',
  'Shopping',
  'Entertainment',
  'Groceries',
  'Bills',
  'Travel',
  'Other',
] as const;

export const LEGACY_EXPENSE_CATEGORIES = [
  'Food',
  'Restaurant',
  'Hotel',
  'Clubbing',
  'Fuel',
  'Tickets',
] as const;

export const ALL_VALID_EXPENSE_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...LEGACY_EXPENSE_CATEGORIES,
] as const;

export type ExpenseCategory = (typeof ALL_VALID_EXPENSE_CATEGORIES)[number];

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
export type RecurringFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type RecurringRuleFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type RecurringRuleStatus = 'active' | 'paused' | 'cancelled' | 'completed';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface ReceiptMetadata {
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUid: string;
  uploadedAt: string;
}

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
  nicknames?: Record<string, string>;
  notes?: Record<string, string>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendRequest {
  id: string;
  users: [string, string];
  senderId: string;
  recipientId: string;
  senderUsername: string;
  senderDisplayName?: string;
  senderPhotoUrl?: string;
  recipientUsername: string;
  recipientDisplayName?: string;
  recipientPhotoUrl?: string;
  status: FriendRequestStatus;
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
  memberEmails?: Record<string, string>;
  memberJoinedAt?: Record<string, string>;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupInvite {
  token: string;
  groupId: string;
  groupName: string;
  createdBy: string;
  createdByName?: string;
  status?: 'active' | 'revoked';
  revokedBy?: string;
  revokedAt?: Timestamp;
  expiresAt: Timestamp;
  maxUses: number;
  usesCount: number;
  usedBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupEmailInvite {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  emailLower: string;
  inviteToken: string;
  inviteUrl: string;
  existingUserUid?: string;
  existingUserName?: string;
  status: 'pending' | 'accepted' | 'cancelled';
  deliveryStatus: 'sent' | 'provider_unconfigured' | 'failed';
  deliveryNote?: string;
  invitedByUid: string;
  invitedByName: string;
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
  tripId?: string;
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
  receiptMetadata?: ReceiptMetadata;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency;
  recurringIntervalDays?: number;
  nextOccurrenceDate?: string;
  recurringRuleId?: string;
  occurrenceKey?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RecurringExpenseRule {
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
  splitMethod: SplitMethod;
  payers: ExpensePayer[];
  shares: ExpenseShare[];
  participantUids: string[];
  payerUids: string[];
  frequency: RecurringRuleFrequency;
  intervalDays: number;
  anchorDayOfMonth: number;
  monthEndPolicy: 'clamp_last_day';
  startDate: string;
  endDate?: string;
  nextOccurrenceDate: string;
  status: RecurringRuleStatus;
  generatedCount: number;
  lastGeneratedDate?: string;
  lastGeneratedAt?: Timestamp;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  description: string;
  coverImage?: string;
  startDate: string;
  endDate: string;
  currency: CurrencyCode;
  exchangeRateToInr: number;
  exchangeRateUpdatedAt?: string;
  budgetPaise: number;
  memberBudgetsPaise?: Record<string, number>;
  isArchived: boolean;
  participantUids: string[];
  participantNames: Record<string, string>;
  participantEmails?: Record<string, string>;
  participantJoinedAt?: Record<string, string>;
  lastJoinToken?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TripInvite {
  token: string;
  tripId: string;
  tripName: string;
  destination?: string;
  createdBy: string;
  createdByName?: string;
  status?: 'active' | 'revoked';
  revokedBy?: string;
  revokedAt?: Timestamp;
  expiresAt: Timestamp;
  maxUses: number;
  usesCount: number;
  usedBy: string[];
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
