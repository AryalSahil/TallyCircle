import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from 'recharts';
import {
  Download,
  FileSpreadsheet,
  Zap,
  BarChart3,
  Paperclip,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import {
  EXPENSE_CATEGORIES,
  Expense,
  Settlement,
  SUPPORTED_CURRENCIES,
} from '../types';
import { computeGroupBalances } from '../utils/finance';
import { exportReportToExcel, exportReportToPDF } from '../utils/exportReports';
import { formatShortDate } from '../utils/helpers';
import { generateSpendingBrief } from '../services/aiService';
import { Button, Card, EmptyState } from '../components/ui/Primitives';

const CHART_COLORS = [
  '#059669',
  '#0EA5E9',
  '#D97706',
  '#6366F1',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#8B5CF6',
  '#64748B',
];

type DatePreset =
  | 'all'
  | 'today'
  | 'week'
  | 'month'
  | 'last_month'
  | '3m'
  | 'year'
  | 'custom';

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AnalyticsPage() {
  const { profile } = useAuth();
  const {
    groups,
    trips,
    expensesByGroup,
    settlementsByGroup,
    expensesByTrip,
    settlementsByTrip,
  } = useAppData();
  const { baseCurrency, currencySymbol, formatAmount, convertToDisplayNumber } = useCurrency();
  const { showToast } = useToast();

  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedMemberUid, setSelectedMemberUid] = useState('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cadence, setCadence] = useState<'monthly' | 'weekly'>('monthly');

  const [aiBrief, setAiBrief] = useState('');
  const [loadingBrief, setLoadingBrief] = useState(false);

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = toIsoDate(now);
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      setDateFrom(toIsoDate(start));
      setDateTo(todayStr);
    } else if (preset === 'month') {
      setDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      setDateTo(todayStr);
    } else if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(toIsoDate(start));
      setDateTo(toIsoDate(end));
    } else if (preset === '3m') {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      setDateFrom(toIsoDate(start));
      setDateTo(todayStr);
    } else if (preset === 'year') {
      setDateFrom(`${now.getFullYear()}-01-01`);
      setDateTo(todayStr);
    }
  };

  // Combine Groups + Trips into unified buckets for filtering and balance attribution
  const allBuckets = useMemo(() => {
    const items: Array<{
      scopeKey: string;
      kind: 'group' | 'trip';
      id: string;
      name: string;
      memberNames: Record<string, string>;
      expenses: Expense[];
      settlements: Settlement[];
    }> = [];
    for (const g of groups) {
      items.push({
        scopeKey: `group:${g.id}`,
        kind: 'group',
        id: g.id,
        name: g.name,
        memberNames: g.memberNames,
        expenses: expensesByGroup[g.id] || [],
        settlements: settlementsByGroup[g.id] || [],
      });
    }
    for (const t of trips) {
      items.push({
        scopeKey: `trip:${t.id}`,
        kind: 'trip',
        id: t.id,
        name: t.name,
        memberNames: t.participantNames,
        expenses: expensesByTrip[t.id] || [],
        settlements: settlementsByTrip[t.id] || [],
      });
    }
    return items;
  }, [groups, trips, expensesByGroup, settlementsByGroup, expensesByTrip, settlementsByTrip]);

  const matchingBuckets = useMemo(() => {
    return allBuckets.filter((b) => {
      if (scopeFilter === 'ALL') return true;
      if (scopeFilter === 'GROUPS_ONLY') return b.kind === 'group';
      if (scopeFilter === 'TRIPS_ONLY') return b.kind === 'trip';
      return b.scopeKey === scopeFilter;
    });
  }, [allBuckets, scopeFilter]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const b of allBuckets) {
      for (const e of b.expenses) {
        (e.tags || []).forEach((t) => set.add(t));
      }
    }
    return Array.from(set).sort();
  }, [allBuckets]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const b of allBuckets) {
      for (const e of b.expenses) set.add(e.category);
    }
    return Array.from(set);
  }, [allBuckets]);

  const allMembers = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of allBuckets) {
      Object.entries(b.memberNames).forEach(([uid, name]) => map.set(uid, name));
    }
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
  }, [allBuckets]);

  const filteredExpenses = useMemo(() => {
    const list: Array<Expense & { groupName: string; scopeKind: 'group' | 'trip' }> = [];
    for (const b of matchingBuckets) {
      for (const e of b.expenses) {
        if (selectedCategory !== 'ALL' && e.category !== selectedCategory) continue;
        if (selectedTag !== 'ALL' && !(e.tags || []).includes(selectedTag)) continue;
        if (
          selectedMemberUid !== 'ALL' &&
          !e.payerUids.includes(selectedMemberUid) &&
          !e.participantUids.includes(selectedMemberUid)
        ) {
          continue;
        }
        const d = e.expenseDate.slice(0, 10);
        if (dateFrom && d < dateFrom) continue;
        if (dateTo && d > dateTo) continue;
        list.push({ ...e, groupName: b.name, scopeKind: b.kind });
      }
    }
    return list.sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  }, [matchingBuckets, selectedCategory, selectedTag, selectedMemberUid, dateFrom, dateTo]);

  const filteredSettlements = useMemo(() => {
    const list: Array<Settlement & { groupName: string }> = [];
    for (const b of matchingBuckets) {
      for (const s of b.settlements) {
        if (
          selectedMemberUid !== 'ALL' &&
          s.fromUid !== selectedMemberUid &&
          s.toUid !== selectedMemberUid
        ) {
          continue;
        }
        if (dateFrom || dateTo) {
          const d = (s.createdAt?.toDate?.()?.toISOString?.() || '').slice(0, 10);
          if (d) {
            if (dateFrom && d < dateFrom) continue;
            if (dateTo && d > dateTo) continue;
          }
        }
        list.push({ ...s, groupName: b.name });
      }
    }
    return list;
  }, [matchingBuckets, selectedMemberUid, dateFrom, dateTo]);

  // 8 KPIs
  const stats = useMemo(() => {
    const myUid = profile?.uid || '';
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = `${now.getFullYear()}-`;

    let totalPaise = 0;
    let paidByUserPaise = 0;
    let monthlyPaise = 0;
    let yearlyPaise = 0;

    for (const e of filteredExpenses) {
      totalPaise += e.amountPaise;
      if (myUid) {
        const paid = e.payers.find((p) => p.uid === myUid)?.amountPaise ?? 0;
        paidByUserPaise += paid;
      }
      if (e.expenseDate.startsWith(currentMonthPrefix)) monthlyPaise += e.amountPaise;
      if (e.expenseDate.startsWith(currentYearPrefix)) yearlyPaise += e.amountPaise;
    }

    // Compute owed vs to-receive across matching buckets (respecting filters)
    let owedByUserPaise = 0;
    let toReceiveByUserPaise = 0;
    for (const b of matchingBuckets) {
      const bucketExpenses = filteredExpenses.filter(
        (e) => (e.tripId || e.groupId) === b.id && e.scopeKind === b.kind
      );
      const bucketSettlements = b.settlements.filter((s) => {
        if (dateFrom || dateTo) {
          const d = (s.createdAt?.toDate?.()?.toISOString?.() || '').slice(0, 10);
          if (d) {
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
          }
        }
        return true;
      });
      const { memberBalances } = computeGroupBalances(
        b.memberNames,
        bucketExpenses,
        bucketSettlements
      );
      const me = memberBalances.find((m) => m.uid === myUid);
      if (me) {
        if (me.netBalancePaise > 0) toReceiveByUserPaise += me.netBalancePaise;
        else if (me.netBalancePaise < 0) owedByUserPaise += Math.abs(me.netBalancePaise);
      }
    }

    const averagePaise =
      filteredExpenses.length > 0 ? Math.round(totalPaise / filteredExpenses.length) : 0;

    return {
      totalPaise,
      paidByUserPaise,
      owedByUserPaise,
      toReceiveByUserPaise,
      monthlyPaise,
      yearlyPaise,
      count: filteredExpenses.length,
      averagePaise,
    };
  }, [filteredExpenses, matchingBuckets, profile?.uid, dateFrom, dateTo]);

  // Chart 1: Monthly / Weekly spending line chart
  const trendData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      const d = new Date(e.expenseDate);
      if (Number.isNaN(d.getTime())) continue;
      let key: string;
      if (cadence === 'monthly') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        key = monday.toISOString().slice(0, 10);
      }
      map.set(key, (map.get(key) || 0) + e.amountPaise);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, paise]) => ({
        period,
        amountDisplay: Math.round(convertToDisplayNumber(paise)),
      }));
  }, [filteredExpenses, cadence, baseCurrency]);

  // Chart 2: Category-wise PieChart
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const e of filteredExpenses) {
      map.set(e.category, (map.get(e.category) || 0) + e.amountPaise);
      total += e.amountPaise;
    }
    return Array.from(map.entries())
      .map(([category, paise]) => ({
        category,
        amountDisplay: Math.round(convertToDisplayNumber(paise)),
        amountInr: Math.round(paise / 100),
        percent: total > 0 ? Math.round((paise / total) * 100) : 0,
      }))
      .sort((a, b) => b.amountDisplay - a.amountDisplay);
  }, [filteredExpenses, baseCurrency]);

  // Chart 3: Spending by Group / Trip BarChart
  const groupData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      const label = e.scopeKind === 'trip' ? `${e.groupName} (Trip)` : e.groupName;
      map.set(label, (map.get(label) || 0) + e.amountPaise);
    }
    return Array.from(map.entries())
      .map(([groupName, paise]) => ({
        groupName,
        amountDisplay: Math.round(convertToDisplayNumber(paise)),
      }))
      .sort((a, b) => b.amountDisplay - a.amountDisplay);
  }, [filteredExpenses, baseCurrency]);

  // Chart 4: Individual Member Spending (Paid vs Share)
  const memberSpendingData = useMemo(() => {
    const map = new Map<string, { name: string; paidPaise: number; sharePaise: number }>();
    for (const e of filteredExpenses) {
      for (const p of e.payers) {
        const entry = map.get(p.uid) || { name: p.name, paidPaise: 0, sharePaise: 0 };
        entry.paidPaise += p.amountPaise;
        map.set(p.uid, entry);
      }
      for (const s of e.shares) {
        const entry = map.get(s.uid) || { name: s.name, paidPaise: 0, sharePaise: 0 };
        entry.sharePaise += s.sharePaise;
        map.set(s.uid, entry);
      }
    }
    return Array.from(map.values())
      .map((item) => ({
        name: item.name,
        paidDisplay: Math.round(convertToDisplayNumber(item.paidPaise)),
        shareDisplay: Math.round(convertToDisplayNumber(item.sharePaise)),
      }))
      .sort((a, b) => b.paidDisplay - a.paidDisplay)
      .slice(0, 10);
  }, [filteredExpenses, baseCurrency]);

  // Chart 5: Monthly Spending Comparison (last 6 calendar months + MoM change)
  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const months: Array<{ key: string; label: string; paise: number }> = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      months.push({ key, label, paise: 0 });
    }
    const indexByKey = new Map(months.map((m, i) => [m.key, i]));
    for (const e of filteredExpenses) {
      const key = e.expenseDate.slice(0, 7);
      const idx = indexByKey.get(key);
      if (idx !== undefined) {
        months[idx].paise += e.amountPaise;
      }
    }

    const prevPaise = months[4]?.paise || 0;
    const currPaise = months[5]?.paise || 0;
    const momPct =
      prevPaise > 0
        ? Math.round(((currPaise - prevPaise) / prevPaise) * 100)
        : currPaise > 0
          ? 100
          : 0;

    return {
      series: months.map((m) => ({
        month: m.label,
        amountDisplay: Math.round(convertToDisplayNumber(m.paise)),
      })),
      prevPaise,
      currPaise,
      momPct,
    };
  }, [filteredExpenses, baseCurrency]);

  const scopeLabel = useMemo(() => {
    if (scopeFilter === 'ALL') return 'All Groups & Trips';
    if (scopeFilter === 'GROUPS_ONLY') return 'All Groups';
    if (scopeFilter === 'TRIPS_ONLY') return 'All Trips';
    return matchingBuckets[0]?.name || 'Filtered Scope';
  }, [scopeFilter, matchingBuckets]);

  const dateRangeLabel =
    dateFrom || dateTo ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}` : 'All Dates';

  const handleGenerateBrief = async () => {
    setLoadingBrief(true);
    try {
      const pendingCount = filteredSettlements.filter(
        (s) => s.status === 'pending' || s.status === 'awaiting_confirmation'
      ).length;
      const brief = await generateSpendingBrief({
        scopeLabel,
        totalInr: stats.totalPaise / 100,
        expenseCount: filteredExpenses.length,
        topCategories: categoryData.slice(0, 4),
        pendingSettlementsCount: pendingCount,
      });
      setAiBrief(brief);
    } catch (err: unknown) {
      showToast('Could not generate brief', {
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setLoadingBrief(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters & Export Bar */}
      <Card className="p-3.5 sm:p-4 space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All time' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This week' },
                { id: 'month', label: 'This month' },
                { id: 'last_month', label: 'Last month' },
                { id: '3m', label: 'Last 3m' },
                { id: 'year', label: 'This year' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 sm:flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateBrief}
              loading={loadingBrief}
              disabled={filteredExpenses.length === 0}
              className="w-full sm:w-auto"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Brief
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                exportReportToPDF({
                  title: scopeLabel,
                  dateRangeLabel,
                  expenses: filteredExpenses,
                  settlements: filteredSettlements,
                  totalSpentPaise: stats.totalPaise,
                  currentUserUid: profile?.uid,
                });
                showToast('PDF report downloaded', { variant: 'success' });
              }}
              className="w-full sm:w-auto"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                exportReportToExcel({
                  title: scopeLabel,
                  dateRangeLabel,
                  expenses: filteredExpenses,
                  settlements: filteredSettlements,
                  totalSpentPaise: stats.totalPaise,
                  currentUserUid: profile?.uid,
                });
                showToast('Excel report downloaded', { variant: 'success' });
              }}
              className="w-full sm:w-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          >
            <option value="ALL">All Groups & Trips</option>
            <option value="GROUPS_ONLY">All Groups</option>
            <option value="TRIPS_ONLY">All Trips</option>
            {groups.map((g) => (
              <option key={`g-${g.id}`} value={`group:${g.id}`}>
                Group: {g.name}
              </option>
            ))}
            {trips.map((t) => (
              <option key={`t-${t.id}`} value={`trip:${t.id}`}>
                Trip: {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          >
            <option value="ALL">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          >
            <option value="ALL">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>

          <select
            value={selectedMemberUid}
            onChange={(e) => setSelectedMemberUid(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          >
            <option value="ALL">All members</option>
            {allMembers.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDatePreset('custom');
              setDateFrom(e.target.value);
            }}
            aria-label="Start date"
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDatePreset('custom');
              setDateTo(e.target.value);
            }}
            aria-label="End date"
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          />
        </div>

        {aiBrief && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {aiBrief}
          </div>
        )}
      </Card>

      {/* 8 Dashboard Overview KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Total money spent</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.totalPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Total paid by you</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.paidByUserPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Total money owed</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-red-600 dark:text-red-400 truncate">
            {formatAmount(stats.owedByUserPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Total to receive</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-emerald-600 dark:text-emerald-400 truncate">
            {formatAmount(stats.toReceiveByUserPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Monthly spending</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.monthlyPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Yearly spending</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.yearlyPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Number of expenses</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {stats.count}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Average expense</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.averagePaise)}
          </p>
        </Card>
      </div>

      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No spending data for these filters"
          description="Log group or trip expenses or adjust your date, category, tag, or scope filters."
        />
      ) : (
        <>
          {/* 5 Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* 1. Monthly Spending Line Chart */}
            <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Monthly spending trend ({baseCurrency})
                </h3>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  {(['monthly', 'weekly'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadence(c)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                        cadence === c
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={52} />
                    <Tooltip
                      formatter={(val) =>
                        `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="amountDisplay"
                      name="Spent"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#059669' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* 2. Category-wise Pie Chart */}
            <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Category-wise spending ({baseCurrency})
              </h3>
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="amountDisplay"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={2}
                    >
                      {categoryData.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, _name, item) =>
                        `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)} (${item?.payload?.percent ?? 0}%)`
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* 3. Spending by Group / Trip Bar Chart */}
            <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Spending by Group & Trip ({baseCurrency})
              </h3>
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={groupData}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="groupName" type="category" width={96} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(val) =>
                        `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                      }
                    />
                    <Bar dataKey="amountDisplay" name="Total Spent" fill="#0EA5E9" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* 4. Individual Member Spending Bar Chart */}
            <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Individual member spending — Paid vs Share ({baseCurrency})
              </h3>
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={memberSpendingData}
                    margin={{ top: 8, right: 8, left: -12, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={42}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={52} />
                    <Tooltip
                      formatter={(val) =>
                        `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="paidDisplay" name="Paid" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="shareDisplay" name="Share" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* 5. Monthly Spending Comparison Bar Chart */}
            <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0 lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Monthly spending comparison ({baseCurrency})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Current month vs previous month and rolling 6-month baseline
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono-nums">
                  <span className="text-slate-500 dark:text-slate-400">
                    MoM change:
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      monthlyComparison.momPct > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {monthlyComparison.momPct > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {monthlyComparison.momPct > 0 ? '+' : ''}
                    {monthlyComparison.momPct}%
                  </span>
                </div>
              </div>
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyComparison.series}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} width={52} />
                    <Tooltip
                      formatter={(val) =>
                        `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                      }
                    />
                    <Bar dataKey="amountDisplay" name="Monthly Spend" radius={[6, 6, 0, 0]}>
                      {monthlyComparison.series.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={idx === monthlyComparison.series.length - 1 ? '#059669' : '#94a3b8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Detailed Report Table */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Detailed expense report ({filteredExpenses.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Line-by-line audit of filtered expenses and your exact share
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Date</th>
                    <th className="text-left font-medium px-4 py-2.5">Expense</th>
                    <th className="text-left font-medium px-4 py-2.5">Category</th>
                    <th className="text-left font-medium px-4 py-2.5">Group / Trip</th>
                    <th className="text-left font-medium px-4 py-2.5">Paid by</th>
                    <th className="text-right font-medium px-4 py-2.5">Total</th>
                    <th className="text-right font-medium px-4 py-2.5">Your Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...filteredExpenses]
                    .reverse()
                    .slice(0, 60)
                    .map((exp) => {
                      const myShare =
                        exp.shares.find((s) => s.uid === profile?.uid)?.sharePaise ?? 0;
                      const hasReceipt = Boolean(
                        exp.receiptMetadata?.storagePath || exp.receiptImage
                      );
                      return (
                        <tr key={`${exp.scopeKind}-${exp.id}`}>
                          <td className="px-4 py-2.5 font-mono-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {formatShortDate(exp.expenseDate)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-1.5 font-medium">
                              <span>{exp.title}</span>
                              {hasReceipt && (
                                <Paperclip className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {exp.category}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                            {exp.groupName}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                            {exp.payers.map((p) => p.name).join(', ')}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatAmount(exp.amountPaise)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {myShare > 0 ? formatAmount(myShare) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
