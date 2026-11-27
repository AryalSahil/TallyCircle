import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Trash2, Zap, CheckCircle2, AlertCircle, Tag, Plus } from 'lucide-react';
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
  RecurringFrequency,
  SUPPORTED_CURRENCIES,
  SplitMethod,
} from '../../types';
import { addExpense, updateExpense } from '../../services/expenseService';
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
import { compressImageFile } from '../../utils/helpers';
import { Button, InputField, Modal } from '../ui/Primitives';

export function ExpenseFormModal({
  open,
  onClose,
  defaultGroupId,
  editingExpense,
}: {
  open: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  editingExpense?: Expense | null;
}) {
  const { profile, updateMyProfile } = useAuth();
  const { activeGroups, groups } = useAppData();
  const { baseCurrency } = useCurrency();
  const { showToast } = useToast();

  const availableGroups = useMemo(
    () => (editingExpense ? groups : activeGroups.length > 0 ? activeGroups : groups),
    [editingExpense, activeGroups, groups]
  );

  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [exchangeRateInput, setExchangeRateInput] = useState('1');
  const [amountInput, setAmountInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Food');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [multiPayerMode, setMultiPayerMode] = useState(false);
  const [singlePayerUid, setSinglePayerUid] = useState('');
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [rawSplitInputs, setRawSplitInputs] = useState<Record<string, string>>({});
  const [receiptImage, setReceiptImage] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('monthly');
  const [recurringIntervalDays, setRecurringIntervalDays] = useState('30');

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
    () => availableGroups.find((g) => g.id === groupId),
    [availableGroups, groupId]
  );

  const groupMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.memberUids.map((uid) => ({
      uid,
      name: selectedGroup.memberNames[uid] || 'Member',
    }));
  }, [selectedGroup]);

  // Initialize form when opened
  useEffect(() => {
    if (!open) return;

    if (editingExpense) {
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

      setGroupId(editingExpense.groupId);
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
      setReceiptImage(editingExpense.receiptImage || '');
      setIsRecurring(editingExpense.isRecurring);
      setRecurringFrequency(
        editingExpense.recurringFrequency === 'none' ? 'monthly' : editingExpense.recurringFrequency
      );
      setRecurringIntervalDays(String(editingExpense.recurringIntervalDays || 30));

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
        } else if (editingExpense.splitMethod === 'percentage' || editingExpense.splitMethod === 'shares') {
          splitMap[s.uid] = String(s.rawValue);
        }
      });
      setRawSplitInputs(splitMap);
      setQuickPrompt('');
      return;
    }

    const initialGroupId = defaultGroupId || availableGroups[0]?.id || '';
    const defaultCurr: CurrencyCode = isSupportedCurrency(baseCurrency) ? baseCurrency : 'INR';
    setGroupId(initialGroupId);
    setTitle('');
    setDescription('');
    setCurrency(defaultCurr);
    setExchangeRateInput(String(SUPPORTED_CURRENCIES[defaultCurr].defaultRateToInr));
    setAmountInput('');
    setTags([]);
    setNewTagInput('');
    setCategory('Food');
    setExpenseDate(new Date().toISOString().slice(0, 16));
    setSplitMethod('equal');
    setMultiPayerMode(false);
    setSinglePayerUid(profile?.uid || '');
    setPayerAmounts({});
    setRawSplitInputs({});
    setReceiptImage('');
    setIsRecurring(false);
    setRecurringFrequency('monthly');
    setRecurringIntervalDays('30');
    setQuickPrompt('');

    const grp = availableGroups.find((g) => g.id === initialGroupId);
    if (grp) {
      setSelectedParticipants(grp.memberUids);
    }
  }, [open, editingExpense, defaultGroupId, profile?.uid, baseCurrency]);

  // Reset participants when switching groups on new expense
  useEffect(() => {
    if (!open || editingExpense || !selectedGroup) return;
    setSelectedParticipants(selectedGroup.memberUids);
    if (!selectedGroup.memberUids.includes(singlePayerUid)) {
      setSinglePayerUid(profile?.uid && selectedGroup.memberUids.includes(profile.uid) ? profile.uid : selectedGroup.memberUids[0] || '');
    }
  }, [groupId]);

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
    setExchangeRateInput(String(SUPPORTED_CURRENCIES[next].defaultRateToInr));
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
    if (!selectedGroup) return { payers: [] as ExpensePayer[], isValid: false, error: 'Select a group.' };
    if (totalPaise <= 0) return { payers: [] as ExpensePayer[], isValid: false, error: 'Enter total amount.' };

    if (!multiPayerMode) {
      const uid = singlePayerUid || groupMembers[0]?.uid;
      if (!uid) return { payers: [] as ExpensePayer[], isValid: false, error: 'Select a payer.' };
      return {
        payers: [{ uid, name: selectedGroup.memberNames[uid] || 'Member', amountPaise: totalPaise }],
        isValid: true,
      };
    }

    const payers: ExpensePayer[] = [];
    let sum = 0;
    for (const m of groupMembers) {
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
  }, [selectedGroup, totalPaise, multiPayerMode, singlePayerUid, groupMembers, payerAmounts]);

  // Compute participant shares & validation
  const splitResult = useMemo(() => {
    const activeMembers = groupMembers.filter((m) => selectedParticipants.includes(m.uid));
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
  }, [groupMembers, selectedParticipants, rawSplitInputs, splitMethod, totalPaise]);

  const toggleParticipant = (uid: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 1000, 320000);
      setReceiptImage(compressed);
    } catch (err: unknown) {
      showToast('Receipt upload failed', {
        description: err instanceof Error ? err.message : 'Choose a smaller image.',
        variant: 'error',
      });
    }
  };

  const handleSmartScan = async () => {
    if (!quickPrompt.trim() && !receiptImage) {
      showToast('Enter a note or attach a receipt first', { variant: 'info' });
      return;
    }
    setAiParsing(true);
    try {
      const parsed = await parseExpenseWithAI({
        text: quickPrompt.trim() || undefined,
        imageBase64: receiptImage || undefined,
        mimeType: receiptImage ? 'image/jpeg' : undefined,
        memberNames: groupMembers.map((m) => m.name),
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
        const matchedUids = groupMembers
          .filter((m) => matchedLower.some((mn) => m.name.toLowerCase().includes(mn) || mn.includes(m.name.toLowerCase())))
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

  const computeNextOccurrence = (baseDate: string, freq: RecurringFrequency, customDays: number): string => {
    if (freq === 'none') return '';
    const d = new Date(baseDate || Date.now());
    if (freq === 'weekly') d.setDate(d.getDate() + 7);
    else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + Math.max(1, customDays));
    return d.toISOString().slice(0, 10);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedGroup) return;
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

    const freq: RecurringFrequency = isRecurring ? recurringFrequency : 'none';
    const intervalDays = freq === 'custom' ? Math.max(1, parseInt(recurringIntervalDays, 10) || 30) : 0;

    setSubmitting(true);
    try {
      const payload = {
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
        receiptImage,
        isRecurring,
        recurringFrequency: freq,
        recurringIntervalDays: intervalDays,
        nextOccurrenceDate: isRecurring ? computeNextOccurrence(expenseDate, freq, intervalDays) : '',
      };

      if (editingExpense) {
        await updateExpense(profile, selectedGroup, editingExpense.id, payload);
        showToast('Expense updated', { variant: 'success' });
      } else {
        await addExpense(profile, selectedGroup, payload);
        showToast('Expense added', { variant: 'success' });
      }

      // Persist any brand-new custom tags to user's tag library
      const existingLibrary = new Set(profile.customTags || []);
      const newlyCreatedTags = tags.filter((t) => !existingLibrary.has(t));
      if (newlyCreatedTags.length > 0) {
        updateMyProfile({
          customTags: Array.from(new Set([...(profile.customTags || []), ...newlyCreatedTags])).slice(0, 40),
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
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingExpense ? 'Edit Expense' : 'Add Expense'}
      subtitle="Exact integer-paise splitting with multi-payer and receipt support"
      maxWidth="max-w-2xl"
    >
      {availableGroups.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Create or join a group before logging an expense.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {EXPENSE_CATEGORIES.map((c) => (
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

            <div className="flex items-center gap-2">
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
                className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddCustomTag}
                disabled={!normalizeExpenseTag(newTagInput)}
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
                Paid by {multiPayerMode && currency !== 'INR' ? '(in ₹ INR)' : ''}
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
                {groupMembers.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {groupMembers.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between gap-3 px-3 py-2">
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
                      className="w-28 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-right text-sm font-mono-nums text-slate-900 dark:text-slate-100"
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Split method & participants
              </label>
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'equal', label: 'Equal' },
                    { id: 'unequal', label: 'Exact ₹' },
                    { id: 'percentage', label: 'Percent %' },
                    { id: 'shares', label: 'Shares' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSplitMethod(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
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

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {groupMembers.map((m) => {
                const included = selectedParticipants.includes(m.uid);
                const computedShare = splitResult.shares.find((s) => s.uid === m.uid);
                return (
                  <div
                    key={m.uid}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleParticipant(m.uid)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
                        {m.name} {m.uid === profile?.uid ? '(You)' : ''}
                      </span>
                    </label>

                    <div className="flex items-center gap-3 shrink-0">
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
                          className="w-24 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-right text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                        />
                      )}
                      <span className="w-24 text-right text-sm font-mono-nums font-medium text-slate-700 dark:text-slate-200">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Bill receipt image (optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {receiptImage ? 'Replace receipt' : 'Upload receipt'}
                  <input type="file" accept="image/*" onChange={handleReceiptUpload} className="hidden" />
                </label>
                {receiptImage && (
                  <button
                    type="button"
                    onClick={() => setReceiptImage('')}
                    className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
              {receiptImage && (
                <img
                  src={receiptImage}
                  alt="Receipt preview"
                  className="h-20 w-auto rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Recurring expense
              </label>
              {isRecurring && (
                <div className="flex items-center gap-2">
                  <select
                    value={recurringFrequency}
                    onChange={(e) => setRecurringFrequency(e.target.value as RecurringFrequency)}
                    className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Every N days</option>
                  </select>
                  {recurringFrequency === 'custom' && (
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={recurringIntervalDays}
                      onChange={(e) => setRecurringIntervalDays(e.target.value)}
                      className="w-20 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono-nums"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={!payersResult.isValid || !splitResult.isValid}
            >
              {editingExpense ? 'Save Changes' : 'Save Expense'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
