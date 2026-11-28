import React, { useEffect, useMemo, useState } from 'react';
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Tag,
  Plus,
  Repeat,
  Layers,
  Plane,
} from 'lucide-react';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useToast } from '../../contexts/ToastContext';
import {
  CURRENCY_CODES,
  CurrencyCode,
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  ExpensePayer,
  Group,
  PRESET_EXPENSE_TAGS,
  ReceiptMetadata,
  RecurringFrequency,
  RecurringRuleFrequency,
  SUPPORTED_CURRENCIES,
  SplitMethod,
  Trip,
} from '../../types';
import { addExpense, updateExpense } from '../../services/expenseService';
import { addTripExpense, updateTripExpense } from '../../services/tripService';
import { createRecurringRule } from '../../services/recurringService';
import { uploadReceiptAttachment } from '../../services/storageService';
import { parseExpenseWithAI } from '../../services/aiService';
import {
  amountToMinorUnits,
  computeSplits,
  foreignMinorToInrPaise,
  formatINR,
  inrToPaise,
  isSupportedCurrency,
  normalizeExpenseTag,
  paiseToInputString,
} from '../../utils/finance';
import {
  buildOccurrenceIdempotencyKey,
  computeNextOccurrenceDate,
  extractAnchorDayOfMonth,
  getTodayIsoDate,
} from '../../utils/recurrence';
import { ReceiptAttachmentControl } from '../ReceiptAttachmentControl';
import { Button, InputField, Modal } from '../ui/Primitives';

async function fileToBase64DataUrl(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        dataUrl: String(reader.result || ''),
        mimeType: file.type || 'image/jpeg',
      });
    reader.onerror = () => reject(new Error('Could not read receipt image.'));
    reader.readAsDataURL(file);
  });
}

export function ExpenseFormModal({
  open,
  onClose,
  defaultGroupId,
  defaultTripId,
  editingExpense,
}: {
  open: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  defaultTripId?: string;
  editingExpense?: Expense | null;
}) {
  const { profile, updateMyProfile } = useAuth();
  const { activeGroups, groups, activeTrips, trips } = useAppData();
  const { baseCurrency } = useCurrency();
  const { showToast } = useToast();

  const availableGroups = useMemo(
    () => (editingExpense ? groups : activeGroups.length > 0 ? activeGroups : groups),
    [editingExpense, activeGroups, groups]
  );

  const availableTrips = useMemo(
    () => (editingExpense ? trips : activeTrips.length > 0 ? activeTrips : trips),
    [editingExpense, activeTrips, trips]
  );

  const [targetScope, setTargetScope] = useState<'group' | 'trip'>('group');
  const [groupId, setGroupId] = useState('');
  const [tripId, setTripId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [exchangeRateInput, setExchangeRateInput] = useState('1');
  const [amountInput, setAmountInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Food & Drinks');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [multiPayerMode, setMultiPayerMode] = useState(false);
  const [singlePayerUid, setSinglePayerUid] = useState('');
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [rawSplitInputs, setRawSplitInputs] = useState<Record<string, string>>({});

  // Firebase Storage Receipt state
  const [pendingReceiptFile, setPendingReceiptFile] = useState<File | null>(null);
  const [existingReceiptMeta, setExistingReceiptMeta] = useState<ReceiptMetadata | null>(null);
  const [legacyReceiptImage, setLegacyReceiptImage] = useState('');
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Recurring expense state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringRuleFrequency>('monthly');
  const [recurringIntervalDays, setRecurringIntervalDays] = useState('30');
  const [recurringEndDate, setRecurringEndDate] = useState('');

  const [quickPrompt, setQuickPrompt] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const availableTagLibrary = useMemo(() => {
    const set = new Set<string>([
      ...PRESET_EXPENSE_TAGS,
      ...(profile?.customTags || []),
      ...tags,
    ]);
    return Array.from(set);
  }, [profile?.customTags, tags]);

  const selectedGroup: Group | undefined = useMemo(
    () => (targetScope === 'group' ? availableGroups.find((g) => g.id === groupId) : undefined),
    [targetScope, availableGroups, groupId]
  );

  const selectedTrip: Trip | undefined = useMemo(
    () => (targetScope === 'trip' ? availableTrips.find((t) => t.id === tripId) : undefined),
    [targetScope, availableTrips, tripId]
  );

  const activeParent = targetScope === 'trip' ? selectedTrip : selectedGroup;

  const activeMemberNames = useMemo<Record<string, string>>(() => {
    if (selectedTrip) return selectedTrip.participantNames;
    if (selectedGroup) return selectedGroup.memberNames;
    return {};
  }, [selectedTrip, selectedGroup]);

  const activeMemberUids = useMemo<string[]>(() => {
    if (selectedTrip) return selectedTrip.participantUids;
    if (selectedGroup) return selectedGroup.memberUids;
    return [];
  }, [selectedTrip, selectedGroup]);

  const members = useMemo(
    () =>
      activeMemberUids.map((uid) => ({
        uid,
        name: activeMemberNames[uid] || 'Member',
      })),
    [activeMemberUids, activeMemberNames]
  );

  const categoryOptions = useMemo<ExpenseCategory[]>(() => {
    const base: ExpenseCategory[] = [...EXPENSE_CATEGORIES];
    if (editingExpense && !base.includes(editingExpense.category)) {
      base.push(editingExpense.category);
    }
    return base;
  }, [editingExpense]);

  // Initialize form when opened
  useEffect(() => {
    if (!open) return;

    setPendingReceiptFile(null);
    setReceiptRemoved(false);
    setUploadProgress(null);

    if (editingExpense) {
      const isTripEdit = Boolean(editingExpense.tripId);
      setTargetScope(isTripEdit ? 'trip' : 'group');
      if (isTripEdit) {
        setTripId(editingExpense.tripId || editingExpense.groupId);
        setGroupId('');
      } else {
        setGroupId(editingExpense.groupId);
        setTripId('');
      }

      const expCurrency: CurrencyCode = isSupportedCurrency(editingExpense.currency)
        ? editingExpense.currency
        : 'INR';
      const expRate =
        editingExpense.exchangeRateToInr && editingExpense.exchangeRateToInr > 0
          ? editingExpense.exchangeRateToInr
          : SUPPORTED_CURRENCIES[expCurrency].defaultRateToInr;
      const origMinor =
        editingExpense.originalAmountMinor && editingExpense.originalAmountMinor > 0
          ? editingExpense.originalAmountMinor
          : editingExpense.amountPaise;

      setTitle(editingExpense.title);
      setDescription(editingExpense.description || '');
      setCurrency(expCurrency);
      setExchangeRateInput(String(expRate));
      setAmountInput(paiseToInputString(origMinor));
      setTags(editingExpense.tags || []);
      setNewTagInput('');
      setCategory(editingExpense.category);
      setExpenseDate(editingExpense.expenseDate.slice(0, 16));
      setSplitMethod(editingExpense.splitMethod);
      setExistingReceiptMeta(editingExpense.receiptMetadata || null);
      setLegacyReceiptImage(editingExpense.receiptImage || '');
      setIsRecurring(editingExpense.isRecurring);
      setRecurringFrequency(
        editingExpense.recurringFrequency === 'none'
          ? 'monthly'
          : (editingExpense.recurringFrequency as RecurringRuleFrequency)
      );
      setRecurringIntervalDays(String(editingExpense.recurringIntervalDays || 30));
      setRecurringEndDate('');

      if (editingExpense.payers.length > 1) {
        setMultiPayerMode(true);
        const map: Record<string, string> = {};
        editingExpense.payers.forEach((p) => {
          map[p.uid] = paiseToInputString(p.amountPaise);
        });
        setPayerAmounts(map);
      } else {
        setMultiPayerMode(false);
        setSinglePayerUid(editingExpense.payers[0]?.uid || profile?.uid || '');
        setPayerAmounts({});
      }

      setSelectedParticipants(editingExpense.shares.map((s) => s.uid));
      const splitMap: Record<string, string> = {};
      editingExpense.shares.forEach((s) => {
        if (editingExpense.splitMethod === 'unequal') {
          splitMap[s.uid] = paiseToInputString(s.sharePaise);
        } else if (
          editingExpense.splitMethod === 'percentage' ||
          editingExpense.splitMethod === 'shares'
        ) {
          splitMap[s.uid] = String(s.rawValue);
        }
      });
      setRawSplitInputs(splitMap);
      setQuickPrompt('');
      return;
    }

    const startInTrip =
      Boolean(defaultTripId) || (availableGroups.length === 0 && availableTrips.length > 0);
    const initialScope: 'group' | 'trip' = startInTrip ? 'trip' : 'group';
    const initialGroupId = defaultGroupId || availableGroups[0]?.id || '';
    const initialTripId = defaultTripId || availableTrips[0]?.id || '';

    const chosenTrip =
      initialScope === 'trip' ? availableTrips.find((t) => t.id === initialTripId) : undefined;
    const chosenGroup =
      initialScope === 'group' ? availableGroups.find((g) => g.id === initialGroupId) : undefined;

    const defaultCurr: CurrencyCode =
      chosenTrip && isSupportedCurrency(chosenTrip.currency)
        ? chosenTrip.currency
        : isSupportedCurrency(baseCurrency)
          ? baseCurrency
          : 'INR';
    const defaultRate =
      chosenTrip && chosenTrip.currency === defaultCurr && chosenTrip.exchangeRateToInr > 0
        ? chosenTrip.exchangeRateToInr
        : SUPPORTED_CURRENCIES[defaultCurr].defaultRateToInr;

    setTargetScope(initialScope);
    setGroupId(initialGroupId);
    setTripId(initialTripId);
    setTitle('');
    setDescription('');
    setCurrency(defaultCurr);
    setExchangeRateInput(String(defaultRate));
    setAmountInput('');
    setTags([]);
    setNewTagInput('');
    setCategory('Food & Drinks');
    setExpenseDate(new Date().toISOString().slice(0, 16));
    setSplitMethod('equal');
    setMultiPayerMode(false);
    setSinglePayerUid(profile?.uid || '');
    setPayerAmounts({});
    setRawSplitInputs({});
    setExistingReceiptMeta(null);
    setLegacyReceiptImage('');
    setIsRecurring(false);
    setRecurringFrequency('monthly');
    setRecurringIntervalDays('30');
    setRecurringEndDate('');
    setQuickPrompt('');

    const initMembers = chosenTrip
      ? chosenTrip.participantUids
      : chosenGroup
        ? chosenGroup.memberUids
        : [];
    setSelectedParticipants(initMembers);
  }, [open, editingExpense, defaultGroupId, defaultTripId, profile?.uid, baseCurrency]);

  // Reset participants and trip currency when switching target parent on new expense
  useEffect(() => {
    if (!open || editingExpense || !activeParent) return;
    const uids = selectedTrip
      ? selectedTrip.participantUids
      : selectedGroup
        ? selectedGroup.memberUids
        : [];
    setSelectedParticipants(uids);
    if (!uids.includes(singlePayerUid)) {
      setSinglePayerUid(profile?.uid && uids.includes(profile.uid) ? profile.uid : uids[0] || '');
    }
    if (selectedTrip) {
      const tc = isSupportedCurrency(selectedTrip.currency) ? selectedTrip.currency : 'INR';
      setCurrency(tc);
      setExchangeRateInput(
        String(
          selectedTrip.exchangeRateToInr > 0
            ? selectedTrip.exchangeRateToInr
            : SUPPORTED_CURRENCIES[tc].defaultRateToInr
        )
      );
      setIsRecurring(false);
    }
  }, [targetScope, groupId, tripId]);

  const parsedExchangeRate = useMemo(() => {
    if (currency === 'INR') return 1;
    const val = parseFloat(exchangeRateInput);
    return Number.isFinite(val) && val > 0 ? val : SUPPORTED_CURRENCIES[currency].defaultRateToInr;
  }, [currency, exchangeRateInput]);

  const originalAmountMinor = useMemo(() => amountToMinorUnits(amountInput), [amountInput]);
  const totalPaise = useMemo(
    () => foreignMinorToInrPaise(originalAmountMinor, currency, parsedExchangeRate),
    [originalAmountMinor, currency, parsedExchangeRate]
  );

  const handleCurrencyChange = (next: CurrencyCode) => {
    setCurrency(next);
    if (selectedTrip && selectedTrip.currency === next && selectedTrip.exchangeRateToInr > 0) {
      setExchangeRateInput(String(selectedTrip.exchangeRateToInr));
    } else {
      setExchangeRateInput(String(SUPPORTED_CURRENCIES[next].defaultRateToInr));
    }
  };

  const toggleTag = (rawTag: string) => {
    const tag = normalizeExpenseTag(rawTag);
    if (!tag) return;
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 10) {
        showToast('Maximum 10 tags per expense', { variant: 'info' });
        return prev;
      }
      return [...prev, tag];
    });
  };

  const handleAddCustomTag = () => {
    const tag = normalizeExpenseTag(newTagInput);
    if (!tag) return;
    if (!tags.includes(tag)) {
      if (tags.length >= 10) {
        showToast('Maximum 10 tags per expense', { variant: 'info' });
        return;
      }
      setTags((prev) => [...prev, tag]);
    }
    setNewTagInput('');
  };

  // Compute payers list & validation
  const payersResult = useMemo(() => {
    if (!activeParent) {
      return {
        payers: [] as ExpensePayer[],
        isValid: false,
        error: targetScope === 'trip' ? 'Select a trip.' : 'Select a group.',
      };
    }
    if (totalPaise <= 0) {
      return { payers: [] as ExpensePayer[], isValid: false, error: 'Enter total amount.' };
    }

    if (!multiPayerMode) {
      const uid = singlePayerUid || members[0]?.uid;
      if (!uid) return { payers: [] as ExpensePayer[], isValid: false, error: 'Select a payer.' };
      return {
        payers: [{ uid, name: activeMemberNames[uid] || 'Member', amountPaise: totalPaise }],
        isValid: true,
      };
    }

    const payers: ExpensePayer[] = [];
    let sum = 0;
    for (const m of members) {
      const paise = inrToPaise(payerAmounts[m.uid] || '0');
      if (paise > 0) {
        payers.push({ uid: m.uid, name: m.name, amountPaise: paise });
        sum += paise;
      }
    }
    const diff = totalPaise - sum;
    return {
      payers,
      isValid: diff === 0 && payers.length > 0,
      error:
        diff === 0
          ? undefined
          : diff > 0
            ? `${formatINR(diff)} remaining in payer totals.`
            : `${formatINR(Math.abs(diff))} over total expense in payer amounts.`,
    };
  }, [activeParent, targetScope, totalPaise, multiPayerMode, singlePayerUid, members, activeMemberNames, payerAmounts]);

  // Compute participant shares & validation
  const splitResult = useMemo(() => {
    const activeMembers = members.filter((m) => selectedParticipants.includes(m.uid));
    const inputs = activeMembers.map((m) => {
      const rawStr = rawSplitInputs[m.uid] || '';
      if (splitMethod === 'unequal') {
        return { uid: m.uid, name: m.name, rawValue: inrToPaise(rawStr) };
      }
      if (splitMethod === 'percentage') {
        const pct = parseFloat(rawStr);
        return { uid: m.uid, name: m.name, rawValue: Number.isFinite(pct) ? pct : 0 };
      }
      if (splitMethod === 'shares') {
        const u = parseFloat(rawStr);
        return { uid: m.uid, name: m.name, rawValue: Number.isFinite(u) && u >= 0 ? u : 1 };
      }
      return { uid: m.uid, name: m.name, rawValue: 1 };
    });

    return computeSplits(totalPaise, splitMethod, inputs);
  }, [members, selectedParticipants, rawSplitInputs, splitMethod, totalPaise]);

  const toggleParticipant = (uid: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const handleSmartScan = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('Smart scan requires an internet connection', { variant: 'error' });
      return;
    }
    if (!quickPrompt.trim() && !pendingReceiptFile && !legacyReceiptImage) {
      showToast('Enter a note or attach a receipt first', { variant: 'info' });
      return;
    }
    setAiParsing(true);
    try {
      let imageBase64: string | undefined = legacyReceiptImage || undefined;
      let mimeType: string | undefined = legacyReceiptImage ? 'image/jpeg' : undefined;
      if (pendingReceiptFile) {
        const encoded = await fileToBase64DataUrl(pendingReceiptFile);
        imageBase64 = encoded.dataUrl;
        mimeType = encoded.mimeType;
      }

      const parsed = await parseExpenseWithAI({
        text: quickPrompt.trim() || undefined,
        imageBase64,
        mimeType,
        memberNames: members.map((m) => m.name),
      });

      if (parsed.title) setTitle(parsed.title);
      if (parsed.currency && isSupportedCurrency(parsed.currency)) {
        handleCurrencyChange(parsed.currency);
      }
      if (parsed.amount > 0) setAmountInput(String(parsed.amount));
      if (parsed.category) setCategory(parsed.category);
      if (parsed.description) setDescription(parsed.description);
      if (Array.isArray(parsed.suggestedTags) && parsed.suggestedTags.length > 0) {
        setTags((prev) =>
          Array.from(
            new Set([...prev, ...parsed.suggestedTags.map(normalizeExpenseTag).filter(Boolean)])
          ).slice(0, 10)
        );
      }
      if (parsed.expenseDate && /^\d{4}-\d{2}-\d{2}/.test(parsed.expenseDate)) {
        setExpenseDate(`${parsed.expenseDate.slice(0, 10)}T${expenseDate.slice(11, 16) || '12:00'}`);
      }
      if (parsed.matchedMembers.length > 0) {
        const matchedLower = parsed.matchedMembers.map((n) => n.toLowerCase());
        const matchedUids = members
          .filter((m) =>
            matchedLower.some(
              (mn) => m.name.toLowerCase().includes(mn) || mn.includes(m.name.toLowerCase())
            )
          )
          .map((m) => m.uid);
        if (profile?.uid && !matchedUids.includes(profile.uid)) matchedUids.push(profile.uid);
        if (matchedUids.length > 0) setSelectedParticipants(matchedUids);
      }

      showToast('Smart scan filled expense details', { variant: 'success' });
    } catch (err: unknown) {
      showToast('Smart scan failed', {
        description: err instanceof Error ? err.message : 'Try entering fields manually.',
        variant: 'error',
      });
    } finally {
      setAiParsing(false);
    }
  };

  const recurringPreviewNextDate = useMemo(() => {
    if (!isRecurring) return '';
    const startIso = (expenseDate || getTodayIsoDate()).slice(0, 10);
    const interval =
      recurringFrequency === 'custom' ? Math.max(1, parseInt(recurringIntervalDays, 10) || 30) : 0;
    return computeNextOccurrenceDate(
      startIso,
      recurringFrequency,
      interval,
      extractAnchorDayOfMonth(startIso)
    );
  }, [isRecurring, expenseDate, recurringFrequency, recurringIntervalDays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeParent) return;
    if (!title.trim()) {
      showToast('Enter an expense title', { variant: 'error' });
      return;
    }
    if (!payersResult.isValid) {
      showToast(payersResult.error || 'Verify payer amounts', { variant: 'error' });
      return;
    }
    if (!splitResult.isValid) {
      showToast(splitResult.error || 'Verify participant shares', { variant: 'error' });
      return;
    }

    const startIso = (expenseDate || getTodayIsoDate()).slice(0, 10);
    if (isRecurring && recurringEndDate && recurringEndDate < startIso) {
      showToast('Recurring end date must be on or after the start date', { variant: 'error' });
      return;
    }

    const storageScope = targetScope === 'trip' ? 'trips' : 'groups';
    const parentId = activeParent.id;
    const targetExpenseId =
      editingExpense?.id || doc(collection(db, storageScope, parentId, 'expenses')).id;

    setSubmitting(true);
    try {
      let nextReceiptMeta: ReceiptMetadata | null = receiptRemoved
        ? null
        : existingReceiptMeta;
      let nextLegacyImage = receiptRemoved ? '' : legacyReceiptImage;

      if (pendingReceiptFile) {
        setUploadProgress(1);
        nextReceiptMeta = await uploadReceiptAttachment({
          scope: storageScope,
          parentId,
          expenseId: targetExpenseId,
          file: pendingReceiptFile,
          uid: profile.uid,
          onProgress: setUploadProgress,
        });
        nextLegacyImage = '';
      }

      const prevStoragePath = editingExpense?.receiptMetadata?.storagePath;
      const shouldEnableRecurring = isRecurring && targetScope === 'group' && Boolean(selectedGroup);
      const freq: RecurringFrequency = shouldEnableRecurring ? recurringFrequency : 'none';
      const intervalDays =
        freq === 'custom' ? Math.max(1, parseInt(recurringIntervalDays, 10) || 30) : 0;

      if (editingExpense) {
        if (targetScope === 'trip' && selectedTrip) {
          const { queuedOffline } = await updateTripExpense(
            profile,
            selectedTrip,
            editingExpense.id,
            {
              title,
              description,
              amountPaise: totalPaise,
              currency,
              originalAmountMinor: originalAmountMinor || totalPaise,
              exchangeRateToInr: parsedExchangeRate,
              tags,
              category,
              expenseDate,
              splitMethod,
              payers: payersResult.payers,
              shares: splitResult.shares,
              receiptImage: nextLegacyImage,
              receiptMetadata: nextReceiptMeta,
            },
            prevStoragePath
          );
          showToast(queuedOffline ? 'Saved offline — queued for sync' : 'Trip expense updated', {
            variant: queuedOffline ? 'info' : 'success',
          });
        } else if (selectedGroup) {
          const { queuedOffline } = await updateExpense(
            profile,
            selectedGroup,
            editingExpense.id,
            {
              title,
              description,
              amountPaise: totalPaise,
              currency,
              originalAmountMinor: originalAmountMinor || totalPaise,
              exchangeRateToInr: parsedExchangeRate,
              tags,
              category,
              expenseDate,
              splitMethod,
              payers: payersResult.payers,
              shares: splitResult.shares,
              receiptImage: nextLegacyImage,
              receiptMetadata: nextReceiptMeta,
              isRecurring: shouldEnableRecurring,
              recurringFrequency: freq,
              recurringIntervalDays: intervalDays,
              nextOccurrenceDate: shouldEnableRecurring ? recurringPreviewNextDate : '',
            },
            prevStoragePath
          );
          showToast(queuedOffline ? 'Saved offline — queued for sync' : 'Expense updated', {
            variant: queuedOffline ? 'info' : 'success',
          });
        }
      } else if (targetScope === 'trip' && selectedTrip) {
        const { queuedOffline } = await addTripExpense(profile, selectedTrip, {
          expenseId: targetExpenseId,
          title,
          description,
          amountPaise: totalPaise,
          currency,
          originalAmountMinor: originalAmountMinor || totalPaise,
          exchangeRateToInr: parsedExchangeRate,
          tags,
          category,
          expenseDate,
          splitMethod,
          payers: payersResult.payers,
          shares: splitResult.shares,
          receiptImage: nextLegacyImage,
          receiptMetadata: nextReceiptMeta,
        });
        showToast(queuedOffline ? 'Saved offline — queued for sync' : 'Trip expense added', {
          variant: queuedOffline ? 'info' : 'success',
        });
      } else if (selectedGroup) {
        const todayIso = getTodayIsoDate();
        let createdRuleId: string | undefined;
        let shouldLogInitialNow = true;

        if (shouldEnableRecurring) {
          shouldLogInitialNow = startIso <= todayIso;
          createdRuleId = await createRecurringRule(profile, selectedGroup, {
            title,
            description,
            amountPaise: totalPaise,
            currency,
            originalAmountMinor: originalAmountMinor || totalPaise,
            exchangeRateToInr: parsedExchangeRate,
            tags,
            category,
            splitMethod,
            payers: payersResult.payers,
            shares: splitResult.shares,
            frequency: recurringFrequency,
            intervalDays,
            startDate: startIso,
            endDate: recurringEndDate || '',
            skipInitialOccurrence: shouldLogInitialNow,
          });
        }

        if (shouldLogInitialNow) {
          const occurrenceKey = createdRuleId
            ? buildOccurrenceIdempotencyKey(createdRuleId, startIso)
            : undefined;
          const { queuedOffline } = await addExpense(profile, selectedGroup, {
            expenseId: occurrenceKey || targetExpenseId,
            title,
            description,
            amountPaise: totalPaise,
            currency,
            originalAmountMinor: originalAmountMinor || totalPaise,
            exchangeRateToInr: parsedExchangeRate,
            tags,
            category,
            expenseDate,
            splitMethod,
            payers: payersResult.payers,
            shares: splitResult.shares,
            receiptImage: nextLegacyImage,
            receiptMetadata: nextReceiptMeta,
            isRecurring: shouldEnableRecurring,
            recurringFrequency: freq,
            recurringIntervalDays: intervalDays,
            nextOccurrenceDate: shouldEnableRecurring ? recurringPreviewNextDate : '',
            recurringRuleId: createdRuleId,
            occurrenceKey,
          });
          showToast(
            queuedOffline
              ? 'Saved offline — queued for sync'
              : createdRuleId
                ? 'Expense logged & recurring schedule active'
                : 'Expense added',
            { variant: queuedOffline ? 'info' : 'success' }
          );
        } else {
          showToast(`Recurring schedule created starting ${startIso}`, { variant: 'success' });
        }
      }

      // Persist brand-new custom tags to user's tag library
      const existingLibrary = new Set(profile.customTags || []);
      const newlyCreatedTags = tags.filter((t) => !existingLibrary.has(t));
      if (newlyCreatedTags.length > 0) {
        updateMyProfile({
          customTags: Array.from(
            new Set([...(profile.customTags || []), ...newlyCreatedTags])
          ).slice(0, 40),
        }).catch(() => {});
      }

      onClose();
    } catch (err: unknown) {
      showToast('Failed to save expense', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const hasAnyDestination = availableGroups.length > 0 || availableTrips.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingExpense ? 'Edit Expense' : 'Add Expense'}
      subtitle="Exact integer-paise splitting with receipts, multi-currency & recurring rules"
      maxWidth="max-w-2xl"
    >
      {!hasAnyDestination ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Create or join a group or trip before logging an expense.
          </p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Low-latency Gemini Quick Parse / Receipt Scan */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Smart Quick-Fill or Receipt Scan
              </span>
              <span className="text-[11px] text-slate-400">Optional</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder='e.g. "Dinner at Thalassa 3400 split with Aman and Rahul"'
                className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={aiParsing}
                onClick={handleSmartScan}
              >
                <Zap className="w-3.5 h-3.5" />
                Smart Fill
              </Button>
            </div>
          </div>

          {/* Scope switcher (Group vs Trip) when both exist */}
          {!editingExpense && availableGroups.length > 0 && availableTrips.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTargetScope('group')}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  targetScope === 'group'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Group Ledger
              </button>
              <button
                type="button"
                onClick={() => setTargetScope('trip')}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  targetScope === 'trip'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                Trip Mode
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {targetScope === 'trip' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Trip
                </label>
                <select
                  value={tripId}
                  disabled={Boolean(editingExpense)}
                  onChange={(e) => setTripId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
                >
                  {availableTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.destination})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Group
                </label>
                <select
                  value={groupId}
                  disabled={Boolean(editingExpense)}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
                >
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <InputField
            label="Expense title"
            placeholder="e.g., Baga Beach Shack Dinner"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />

          {/* Multi-Currency Entry & Exchange Rate */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code} ({SUPPORTED_CURRENCIES[code].symbol}) — {SUPPORTED_CURRENCIES[code].name}
                    </option>
                  ))}
                </select>
              </div>

              <InputField
                label={`Amount (${SUPPORTED_CURRENCIES[currency].symbol})`}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="3000"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="font-mono-nums"
                required
              />

              {currency !== 'INR' ? (
                <InputField
                  label={`Rate (1 ${currency} → ₹ INR)`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={exchangeRateInput}
                  onChange={(e) => setExchangeRateInput(e.target.value)}
                  className="font-mono-nums"
                  required
                />
              ) : (
                <div className="flex flex-col justify-end pb-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ledger currency: INR (1:1)
                  </p>
                </div>
              )}
            </div>

            {currency !== 'INR' && totalPaise > 0 && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/70 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">
                  Stored entry rate: 1 {currency} = ₹{parsedExchangeRate}
                </span>
                <span className="font-mono-nums font-semibold text-emerald-600 dark:text-emerald-400">
                  Ledger equivalent: {formatINR(totalPaise)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <InputField
              label="Date & time"
              type="datetime-local"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
            <InputField
              label="Description / notes (optional)"
              placeholder="Starters, drinks, and service charge"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {/* Custom Tags Section */}
          <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                Labels & tags (optional)
              </label>
              <span className="text-[11px] text-slate-400 font-mono-nums">
                {tags.length}/10 selected
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availableTagLibrary.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder="Create custom tag (e.g. goa-2026, client-meal)"
                maxLength={30}
                className="flex-1 min-w-0 h-10 sm:h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddCustomTag}
                disabled={!normalizeExpenseTag(newTagInput)}
                className="w-full sm:w-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Tag
              </Button>
            </div>
          </div>

          {/* Paid By Section */}
          <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Paid by
                {multiPayerMode && currency !== 'INR' && totalPaise > 0
                  ? ` (in ₹ INR · Target: ${formatINR(totalPaise)})`
                  : multiPayerMode && currency !== 'INR'
                    ? ' (in ₹ INR)'
                    : ''}
              </label>
              <button
                type="button"
                onClick={() => setMultiPayerMode((v) => !v)}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {multiPayerMode ? 'Switch to single payer' : 'Multiple people paid?'}
              </button>
            </div>

            {!multiPayerMode ? (
              <select
                value={singlePayerUid}
                onChange={(e) => setSinglePayerUid(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => (
                  <div
                    key={m.uid}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 px-3 py-2.5"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                      {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={payerAmounts[m.uid] || ''}
                      onChange={(e) =>
                        setPayerAmounts((prev) => ({ ...prev, [m.uid]: e.target.value }))
                      }
                      className="w-full sm:w-32 h-9 sm:h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-right text-sm font-mono-nums text-slate-900 dark:text-slate-100"
                    />
                  </div>
                ))}
                {!payersResult.isValid && totalPaise > 0 && (
                  <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    {payersResult.error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Splitting Engine Section */}
          <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Split method & participants
              </label>
              <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-full sm:w-auto">
                {(
                  [
                    { id: 'equal', label: 'Equal' },
                    { id: 'unequal', label: currency !== 'INR' ? 'Exact (₹ INR)' : 'Exact ₹' },
                    { id: 'percentage', label: 'Percent %' },
                    { id: 'shares', label: 'Shares' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSplitMethod(tab.id)}
                    className={`px-2.5 min-h-[34px] py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      splitMethod === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {splitMethod === 'unequal' && currency !== 'INR' && totalPaise > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Enter exact member shares in INR (canonical target: {formatINR(totalPaise)}).
              </p>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((m) => {
                const included = selectedParticipants.includes(m.uid);
                const computedShare = splitResult.shares.find((s) => s.uid === m.uid);
                return (
                  <div
                    key={m.uid}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-3 py-2.5"
                  >
                    <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1 min-h-[32px]">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleParticipant(m.uid)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
                        {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                      </span>
                    </label>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-6 sm:pl-0">
                      {included && splitMethod !== 'equal' && (
                        <input
                          type="number"
                          step={splitMethod === 'shares' ? '0.5' : '0.01'}
                          min="0"
                          placeholder={splitMethod === 'shares' ? '1' : '0'}
                          value={
                            rawSplitInputs[m.uid] ??
                            (splitMethod === 'shares' ? '1' : '')
                          }
                          onChange={(e) =>
                            setRawSplitInputs((prev) => ({ ...prev, [m.uid]: e.target.value }))
                          }
                          className="w-28 sm:w-24 h-9 sm:h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-right text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                        />
                      )}
                      <span className="sm:w-24 text-right text-sm font-mono-nums font-medium text-slate-700 dark:text-slate-200 ml-auto sm:ml-0">
                        {included && computedShare ? formatINR(computedShare.sharePaise) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPaise > 0 && (
              <div
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                  splitResult.isValid
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                }`}
              >
                {splitResult.isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Split balanced: {formatINR(splitResult.allocatedPaise)} allocated across{' '}
                      {splitResult.shares.length} participant(s).
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{splitResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Receipt & Recurring Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <ReceiptAttachmentControl
              pendingFile={pendingReceiptFile}
              existingMetadata={receiptRemoved ? null : existingReceiptMeta}
              legacyReceiptImage={receiptRemoved ? '' : legacyReceiptImage}
              uploadProgress={uploadProgress}
              disabled={submitting}
              onSelectFile={(file) => {
                setPendingReceiptFile(file);
                setReceiptRemoved(false);
              }}
              onRemove={() => {
                setPendingReceiptFile(null);
                setExistingReceiptMeta(null);
                setLegacyReceiptImage('');
                setReceiptRemoved(true);
              }}
              onValidationError={(msg) =>
                showToast('Invalid receipt image', { description: msg, variant: 'error' })
              }
            />

            <div className="space-y-2.5">
              {targetScope === 'trip' ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3 text-xs text-slate-500 dark:text-slate-400">
                  Recurring schedules apply to permanent Groups. Manage automated bills in the
                  Expenses &rarr; Recurring tab.
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      disabled={Boolean(editingExpense)}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                    />
                    <Repeat className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Make this a recurring group expense
                  </label>
                  {editingExpense?.recurringRuleId && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Generated from a recurring schedule. Manage future occurrences on the
                      Expenses page.
                    </p>
                  )}
                  {isRecurring && !editingExpense && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={recurringFrequency}
                          onChange={(e) =>
                            setRecurringFrequency(e.target.value as RecurringRuleFrequency)
                          }
                          className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs text-slate-900 dark:text-slate-100"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="custom">Custom interval (days)</option>
                        </select>
                        {recurringFrequency === 'custom' && (
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={recurringIntervalDays}
                            onChange={(e) => setRecurringIntervalDays(e.target.value)}
                            aria-label="Interval days"
                            className="w-20 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                          />
                        )}
                      </div>
                      <InputField
                        label="End date (optional)"
                        type="date"
                        value={recurringEndDate}
                        min={(expenseDate || getTodayIsoDate()).slice(0, 10)}
                        onChange={(e) => setRecurringEndDate(e.target.value)}
                      />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Next automated run:{' '}
                        <span className="font-mono-nums font-medium text-slate-700 dark:text-slate-300">
                          {recurringPreviewNextDate}
                        </span>
                        . Month-end dates (29th–31st) clamp cleanly in shorter months.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={!payersResult.isValid || !splitResult.isValid}
              className="w-full sm:w-auto"
            >
              {editingExpense ? 'Save Changes' : 'Save Expense'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
