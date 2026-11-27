import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Download, FileSpreadsheet, Zap, BarChart3 } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useToast } from '../contexts/ToastContext';
import { EXPENSE_CATEGORIES, Expense, Settlement, SUPPORTED_CURRENCIES } from '../types';
import { exportReportToExcel, exportReportToPDF } from '../utils/exportReports';
import { generateSpendingBrief } from '../services/aiService';
import { Button, Card, EmptyState } from '../components/ui/Primitives';

const CHART_COLORS = ['#059669', '#0EA5E9', '#D97706', '#6366F1', '#EC4899', '#14B8A6'];

export function AnalyticsPage() {
  const { groups, expensesByGroup, settlementsByGroup } = useAppData();
  const { baseCurrency, currencySymbol, formatAmount, convertToDisplayNumber } = useCurrency();
  const { showToast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedMemberUid, setSelectedMemberUid] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cadence, setCadence] = useState<'monthly' | 'weekly'>('monthly');

  const [aiBrief, setAiBrief] = useState('');
  const [loadingBrief, setLoadingBrief] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const e of expensesByGroup[g.id] || []) {
        (e.tags || []).forEach((t) => set.add(t));
      }
    }
    return Array.from(set).sort();
  }, [groups, expensesByGroup]);

  const allMembers = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      Object.entries(g.memberNames).forEach(([uid, name]) => map.set(uid, name));
    }
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
  }, [groups]);

  const filteredExpenses = useMemo(() => {
    const list: Array<Expense & { groupName: string }> = [];
    for (const g of groups) {
      if (selectedGroupId !== 'ALL' && g.id !== selectedGroupId) continue;
      for (const e of expensesByGroup[g.id] || []) {
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
        list.push({ ...e, groupName: g.name });
      }
    }
    return list.sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  }, [groups, expensesByGroup, selectedGroupId, selectedCategory, selectedTag, selectedMemberUid, dateFrom, dateTo]);

  const filteredSettlements = useMemo(() => {
    const list: Array<Settlement & { groupName: string }> = [];
    for (const g of groups) {
      if (selectedGroupId !== 'ALL' && g.id !== selectedGroupId) continue;
      for (const s of settlementsByGroup[g.id] || []) {
        if (
          selectedMemberUid !== 'ALL' &&
          s.fromUid !== selectedMemberUid &&
          s.toUid !== selectedMemberUid
        ) {
          continue;
        }
        list.push({ ...s, groupName: g.name });
      }
    }
    return list;
  }, [groups, settlementsByGroup, selectedGroupId, selectedMemberUid]);

  const stats = useMemo(() => {
    const totalPaise = filteredExpenses.reduce((s, e) => s + e.amountPaise, 0);
    const highestPaise = filteredExpenses.reduce((m, e) => Math.max(m, e.amountPaise), 0);
    const averagePaise =
      filteredExpenses.length > 0 ? Math.round(totalPaise / filteredExpenses.length) : 0;
    const confirmedSettlementPaise = filteredSettlements
      .filter((s) => s.status === 'confirmed')
      .reduce((sum, s) => sum + s.amountPaise, 0);
    return { totalPaise, highestPaise, averagePaise, confirmedSettlementPaise };
  }, [filteredExpenses, filteredSettlements]);

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

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      map.set(e.category, (map.get(e.category) || 0) + e.amountPaise);
    }
    return Array.from(map.entries())
      .map(([category, paise]) => ({
        category,
        amountDisplay: Math.round(convertToDisplayNumber(paise)),
        amountInr: Math.round(paise / 100),
      }))
      .sort((a, b) => b.amountDisplay - a.amountDisplay);
  }, [filteredExpenses, baseCurrency]);

  const groupData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      map.set(e.groupName, (map.get(e.groupName) || 0) + e.amountPaise);
    }
    return Array.from(map.entries())
      .map(([groupName, paise]) => ({
        groupName,
        amountDisplay: Math.round(convertToDisplayNumber(paise)),
      }))
      .sort((a, b) => b.amountDisplay - a.amountDisplay);
  }, [filteredExpenses, baseCurrency]);

  const memberContribData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      for (const p of e.payers) {
        map.set(p.name, (map.get(p.name) || 0) + p.amountPaise);
      }
    }
    return Array.from(map.entries())
      .map(([name, paise]) => ({
        name,
        amountDisplay: Math.round(convertToDisplayNumber(paise)),
      }))
      .sort((a, b) => b.amountDisplay - a.amountDisplay)
      .slice(0, 10);
  }, [filteredExpenses, baseCurrency]);

  const scopeLabel =
    selectedGroupId === 'ALL'
      ? 'All Accessible Groups'
      : groups.find((g) => g.id === selectedGroupId)?.name || 'Group';

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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateBrief}
              loading={loadingBrief}
              disabled={filteredExpenses.length === 0}
              className="w-full sm:w-auto"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Spending Brief
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
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
                });
                showToast('PDF report downloaded', { variant: 'success' });
              }}
              className="w-full sm:w-auto"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
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
                });
                showToast('Excel report downloaded', { variant: 'success' });
              }}
              className="w-full sm:w-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          >
            <option value="ALL">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          >
            <option value="ALL">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
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
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Start date"
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
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

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Filtered total spent</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.totalPaise)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500">{filteredExpenses.length} expenses</p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Highest single</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.highestPaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Average expense</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white truncate">
            {formatAmount(stats.averagePaise)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Confirmed settlements</p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold font-mono-nums text-emerald-600 dark:text-emerald-400 truncate">
            {formatAmount(stats.confirmedSettlementPaise)}
          </p>
        </Card>
      </div>

      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No spending data for these filters"
          description="Log group expenses or adjust your date, category, tag, or group filters to visualize trends."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Spending Trend */}
          <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Spending trend ({baseCurrency})
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
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={52} />
                  <Tooltip
                    formatter={(val) =>
                      `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="amountDisplay"
                    stroke="#059669"
                    fill="#10b981"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Category Breakdown */}
          <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Category-wise spending ({baseCurrency})
            </h3>
            <div className="h-56 sm:h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={42} />
                  <YAxis tick={{ fontSize: 10 }} width={52} />
                  <Tooltip
                    formatter={(val) =>
                      `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                    }
                  />
                  <Bar dataKey="amountDisplay" radius={[6, 6, 0, 0]}>
                    {categoryData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Group-wise Spending */}
          <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Group-wise spending ({baseCurrency})
            </h3>
            <div className="h-56 sm:h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="groupName" type="category" width={88} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(val) =>
                      `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                    }
                  />
                  <Bar dataKey="amountDisplay" fill="#0EA5E9" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Member-wise Contributions */}
          <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Member-wise paid contributions ({baseCurrency})
            </h3>
            <div className="h-56 sm:h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberContribData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10 }} width={52} />
                  <Tooltip
                    formatter={(val) =>
                      `${currencySymbol}${Number(val || 0).toLocaleString(SUPPORTED_CURRENCIES[baseCurrency].locale)}`
                    }
                  />
                  <Bar dataKey="amountDisplay" fill="#059669" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
