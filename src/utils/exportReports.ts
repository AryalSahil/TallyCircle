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
}

export function exportReportToExcel(payload: ReportExportPayload): void {
  const expenseRows = payload.expenses.map((e) => ({
    Date: formatShortDate(e.expenseDate),
    Group: e.groupName,
    Title: e.title,
    Category: e.category,
    Tags: (e.tags || []).map((t) => `#${t}`).join(', '),
    Original_Currency: e.currency || 'INR',
    Original_Amount: Number(((e.originalAmountMinor || e.amountPaise) / 100).toFixed(2)),
    Exchange_Rate_INR: e.exchangeRateToInr || 1,
    Amount_INR: Number((e.amountPaise / 100).toFixed(2)),
    Paid_By: e.payers.map((p) => `${p.name} (${(p.amountPaise / 100).toFixed(2)})`).join('; '),
    Split_Method: e.splitMethod,
    Participants: e.shares.map((s) => `${s.name}: ${(s.sharePaise / 100).toFixed(2)}`).join('; '),
    Description: e.description || '',
  }));

  const settlementRows = payload.settlements.map((s) => ({
    Group: s.groupName,
    From: s.fromName,
    To: s.toName,
    Amount_INR: Number((s.amountPaise / 100).toFixed(2)),
    Method: s.method.toUpperCase(),
    Status: s.status,
    Reference: s.upiTransactionRef || '',
    Note: s.note || '',
  }));

  const wb = XLSX.utils.book_new();
  const wsExpenses = XLSX.utils.json_to_sheet(
    expenseRows.length > 0 ? expenseRows : [{ Notice: 'No expenses in selected filter' }]
  );
  const wsSettlements = XLSX.utils.json_to_sheet(
    settlementRows.length > 0 ? settlementRows : [{ Notice: 'No settlements in selected filter' }]
  );

  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');
  XLSX.utils.book_append_sheet(wb, wsSettlements, 'Settlements');

  const safeName = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  XLSX.writeFile(wb, `${safeName}-report.xlsx`);
}

export function exportReportToPDF(payload: ReportExportPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
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

  for (const exp of payload.expenses.slice(0, 60)) {
    if (y > 760) {
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
    const paidText = `Paid by ${exp.payers.map((p) => p.name).join(', ')}  ·  Split (${exp.splitMethod}) among ${exp.shares.length}${tagPart}`;
    doc.text(paidText.slice(0, 95), 48, y);
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
    for (const st of payload.settlements.slice(0, 40)) {
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
