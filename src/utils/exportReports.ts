import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { Expense, Settlement } from '../types';
import { formatINR } from './finance';
import { formatShortDate } from './helpers';

export interface ReportExportPayload {
  title: string;
  dateRangeLabel: string;
  expenses: Array<Expense & { groupName: string }>;
  settlements: Array<Settlement & { groupName: string }>;
  totalSpentPaise: number;
  currentUserUid?: string;
  reportMeta?: {
    destination?: string;
    dates?: string;
    budgetPaise?: number;
  };
}

export function sanitizeSpreadsheetCell(value: string): string {
  const str = String(value ?? '');
  if (!str) return '';
  if (/^[\s]*[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function exportReportToExcel(payload: ReportExportPayload): void {
  const uid = payload.currentUserUid || '';
  const expenseRows = payload.expenses.map((e) => {
    const mySharePaise = uid ? e.shares.find((s) => s.uid === uid)?.sharePaise ?? 0 : 0;
    const myPaidPaise = uid ? e.payers.find((p) => p.uid === uid)?.amountPaise ?? 0 : 0;
    return {
      Date: sanitizeSpreadsheetCell(formatShortDate(e.expenseDate)),
      Group_Or_Trip: sanitizeSpreadsheetCell(e.groupName),
      Title: sanitizeSpreadsheetCell(e.title),
      Category: sanitizeSpreadsheetCell(e.category),
      Tags: sanitizeSpreadsheetCell((e.tags || []).map((t) => `#${t}`).join(', ')),
      Original_Currency: e.currency || 'INR',
      Original_Amount: Number(((e.originalAmountMinor || e.amountPaise) / 100).toFixed(2)),
      Exchange_Rate_INR: e.exchangeRateToInr || 1,
      Amount_INR: Number((e.amountPaise / 100).toFixed(2)),
      ...(uid
        ? {
            Your_Paid_INR: Number((myPaidPaise / 100).toFixed(2)),
            Your_Share_INR: Number((mySharePaise / 100).toFixed(2)),
          }
        : {}),
      Paid_By: sanitizeSpreadsheetCell(
        e.payers.map((p) => `${p.name} (${(p.amountPaise / 100).toFixed(2)})`).join('; ')
      ),
      Split_Method: e.splitMethod,
      Participants: sanitizeSpreadsheetCell(
        e.shares.map((s) => `${s.name}: ${(s.sharePaise / 100).toFixed(2)}`).join('; ')
      ),
      Description: sanitizeSpreadsheetCell(e.description || ''),
    };
  });

  const settlementRows = payload.settlements.map((s) => ({
    Group_Or_Trip: sanitizeSpreadsheetCell(s.groupName),
    From: sanitizeSpreadsheetCell(s.fromName),
    To: sanitizeSpreadsheetCell(s.toName),
    Amount_INR: Number((s.amountPaise / 100).toFixed(2)),
    Method: s.method.toUpperCase(),
    Status: s.status,
    Reference: sanitizeSpreadsheetCell(s.upiTransactionRef || ''),
    Note: sanitizeSpreadsheetCell(s.note || ''),
  }));

  const wb = XLSX.utils.book_new();
  const wsExpenses = XLSX.utils.json_to_sheet(
    expenseRows.length > 0 ? expenseRows : [{ Notice: 'No expenses in selected filter' }]
  );
  const wsSettlements = XLSX.utils.json_to_sheet(
    settlementRows.length > 0 ? settlementRows : [{ Notice: 'No settlements in selected filter' }]
  );

  if (payload.reportMeta) {
    const budget = payload.reportMeta.budgetPaise || 0;
    const summaryRows = [
      {
        Scope: sanitizeSpreadsheetCell(payload.title),
        Destination: sanitizeSpreadsheetCell(payload.reportMeta.destination || ''),
        Dates: sanitizeSpreadsheetCell(payload.reportMeta.dates || payload.dateRangeLabel),
        Total_Spent_INR: Number((payload.totalSpentPaise / 100).toFixed(2)),
        Budget_INR: Number((budget / 100).toFixed(2)),
        Remaining_INR: budget > 0 ? Number(((budget - payload.totalSpentPaise) / 100).toFixed(2)) : 0,
      },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  }

  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');
  XLSX.utils.book_append_sheet(wb, wsSettlements, 'Settlements');

  const safeName = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  XLSX.writeFile(wb, `${safeName}-report.xlsx`);
}

export function exportReportToPDF(payload: ReportExportPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const uid = payload.currentUserUid || '';
  let y = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('TallyCircle Expense & Settlement Report', 40, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Scope: ${payload.title}  |  Range: ${payload.dateRangeLabel}`, 40, y);
  y += 16;

  if (payload.reportMeta?.destination || payload.reportMeta?.budgetPaise) {
    const parts: string[] = [];
    if (payload.reportMeta.destination) parts.push(`Destination: ${payload.reportMeta.destination}`);
    if (payload.reportMeta.dates) parts.push(`Dates: ${payload.reportMeta.dates}`);
    if (payload.reportMeta.budgetPaise && payload.reportMeta.budgetPaise > 0) {
      parts.push(`Budget: ${formatINR(payload.reportMeta.budgetPaise)}`);
    }
    doc.text(parts.join('  |  '), 40, y);
    y += 16;
  }

  doc.text(
    `Total Expenses: ${payload.expenses.length}  |  Total Spent: ${formatINR(payload.totalSpentPaise)}  |  Settlements: ${payload.settlements.length}`,
    40,
    y
  );
  y += 24;

  doc.setDrawColor(226, 232, 240);
  doc.line(40, y, pageWidth - 40, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Expense Breakdown', 40, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  for (const exp of payload.expenses.slice(0, 80)) {
    if (y > 750) {
      doc.addPage();
      y = 48;
    }
    const lineLeft = `${formatShortDate(exp.expenseDate)}  ·  ${exp.groupName}  ·  ${exp.title} (${exp.category})`;
    const lineRight =
      exp.currency && exp.currency !== 'INR'
        ? `${exp.currency} ${((exp.originalAmountMinor || exp.amountPaise) / 100).toFixed(2)} (${formatINR(exp.amountPaise)})`
        : formatINR(exp.amountPaise);
    doc.setTextColor(15, 23, 42);
    doc.text(lineLeft.slice(0, 68), 40, y);
    doc.text(lineRight, pageWidth - 40, y, { align: 'right' });
    y += 13;

    doc.setTextColor(100, 116, 139);
    const tagPart = exp.tags && exp.tags.length > 0 ? `  ·  Tags: ${exp.tags.map((t) => `#${t}`).join(' ')}` : '';
    const mySharePaise = uid ? exp.shares.find((s) => s.uid === uid)?.sharePaise ?? 0 : 0;
    const sharePart = uid ? `  ·  Your share: ${formatINR(mySharePaise)}` : '';
    const paidText = `Paid by ${exp.payers.map((p) => p.name).join(', ')}  ·  Split (${exp.splitMethod}) among ${exp.shares.length}${sharePart}${tagPart}`;
    doc.text(paidText.slice(0, 98), 48, y);
    y += 16;
  }

  if (payload.settlements.length > 0) {
    if (y > 700) {
      doc.addPage();
      y = 48;
    }
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Settlements Summary', 40, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const st of payload.settlements.slice(0, 50)) {
      if (y > 760) {
        doc.addPage();
        y = 48;
      }
      const line = `${st.fromName} -> ${st.toName}  (${st.groupName})  ·  ${st.method.toUpperCase()}  ·  ${st.status}`;
      doc.setTextColor(15, 23, 42);
      doc.text(line.slice(0, 75), 40, y);
      doc.text(formatINR(st.amountPaise), pageWidth - 40, y, { align: 'right' });
      y += 16;
    }
  }

  const safeName = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`${safeName}-report.pdf`);
}
