import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  amountToMinorUnits,
  classifyBudgetStatus,
  computeGroupBalances,
  computeSplits,
  convertInrPaiseToCurrencyAmount,
  foreignMinorToInrPaise,
  normalizeExpenseTag,
  simplifyDebts,
  verifyZeroSumBalance,
} from '../src/utils/finance.js';
import {
  buildGroupWhatsAppInviteMessage,
  generateToken,
  isValidEmailAddress,
  sanitizeHandleInput,
} from '../src/utils/helpers.js';
import {
  buildOccurrenceIdempotencyKey,
  calculateDueOccurrences,
  computeNextOccurrenceDate,
} from '../src/utils/recurrence.js';
import {
  processRecurringRuleSynchronously,
  type RecurringBatchAdapter,
  type SimulatedExpenseRecord,
} from '../src/utils/recurrenceEngine.js';
import { sanitizeSpreadsheetCell } from '../src/utils/exportReports.js';
import { DIRTY_DOZEN_CASES, FEATURE_SECURITY_CASES } from '../firestore.rules.test.js';
import { createServerApp } from '../server.js';

describe('Financial Splitting Engine (Integer Paise)', () => {
  it('distributes equal splits with deterministic remainder paise allocation', () => {
    const res = computeSplits(10000, 'equal', [
      { uid: 'u1', name: 'Aarav', rawValue: 1 },
      { uid: 'u2', name: 'Diya', rawValue: 1 },
      { uid: 'u3', name: 'Kabir', rawValue: 1 },
    ]);
    assert.equal(res.isValid, true);
    assert.equal(res.allocatedPaise, 10000);
    assert.equal(res.remainingPaise, 0);
    assert.deepEqual(
      res.shares.map((s) => s.sharePaise),
      [3334, 3333, 3333]
    );
    assert.equal(
      res.shares.reduce((sum, s) => sum + s.sharePaise, 0),
      10000
    );
  });

  it('validates exact unequal splits and flags mismatches', () => {
    const valid = computeSplits(50000, 'unequal', [
      { uid: 'u1', name: 'Aarav', rawValue: 30000 },
      { uid: 'u2', name: 'Diya', rawValue: 20000 },
    ]);
    assert.equal(valid.isValid, true);
    assert.equal(valid.remainingPaise, 0);

    const invalid = computeSplits(50000, 'unequal', [
      { uid: 'u1', name: 'Aarav', rawValue: 30000 },
      { uid: 'u2', name: 'Diya', rawValue: 15000 },
    ]);
    assert.equal(invalid.isValid, false);
    assert.equal(invalid.remainingPaise, 5000);
    assert.ok(invalid.error?.includes('remaining'));
  });

  it('computes percentage splits using Hamilton largest-remainder rounding', () => {
    const res = computeSplits(1001, 'percentage', [
      { uid: 'u1', name: 'Aarav', rawValue: 33.33 },
      { uid: 'u2', name: 'Diya', rawValue: 33.33 },
      { uid: 'u3', name: 'Kabir', rawValue: 33.34 },
    ]);
    assert.equal(res.isValid, true);
    assert.equal(
      res.shares.reduce((sum, s) => sum + s.sharePaise, 0),
      1001
    );
  });

  it('computes weighted share-unit splits accurately', () => {
    const res = computeSplits(9000, 'shares', [
      { uid: 'u1', name: 'Aarav', rawValue: 2 },
      { uid: 'u2', name: 'Diya', rawValue: 1 },
    ]);
    assert.equal(res.isValid, true);
    assert.deepEqual(
      res.shares.map((s) => s.sharePaise),
      [6000, 3000]
    );
  });

  it('rejects zero/negative totals and empty participant lists', () => {
    assert.equal(computeSplits(0, 'equal', [{ uid: 'u1', name: 'A', rawValue: 1 }]).isValid, false);
    assert.equal(computeSplits(1000, 'equal', []).isValid, false);
  });
});

describe('Multi-Currency Conversion & Tag Normalization', () => {
  it('converts foreign minor units to canonical INR paise and back accurately', () => {
    const usdCents = amountToMinorUnits('12.50');
    assert.equal(usdCents, 1250);
    const inrPaise = foreignMinorToInrPaise(usdCents, 'USD', 84.5);
    assert.equal(inrPaise, 105625);
    const displayUsd = convertInrPaiseToCurrencyAmount(845000, 'USD');
    assert.equal(Math.round(displayUsd), 100);
  });

  it('normalizes tags to clean lowercase slugs', () => {
    assert.equal(normalizeExpenseTag(' #Goa Vacation! '), 'goa-vacation');
    assert.equal(normalizeExpenseTag('Essential_2026'), 'essential_2026');
  });
});

describe('Group Ledger Reconciliation & Debt Simplification', () => {
  it('handles multi-payer expenses, ignores unconfirmed settlements, applies confirmed settlements, and preserves zero-sum', () => {
    const memberNames = { u1: 'Aarav', u2: 'Diya', u3: 'Kabir' };
    const expenses = [
      {
        amountPaise: 30000,
        payers: [
          { uid: 'u1', name: 'Aarav', amountPaise: 20000 },
          { uid: 'u2', name: 'Diya', amountPaise: 10000 },
        ],
        shares: [
          { uid: 'u1', name: 'Aarav', sharePaise: 10000 },
          { uid: 'u2', name: 'Diya', sharePaise: 10000 },
          { uid: 'u3', name: 'Kabir', sharePaise: 10000 },
        ],
      },
    ];

    const settlements = [
      {
        fromUid: 'u3',
        fromName: 'Kabir',
        toUid: 'u1',
        toName: 'Aarav',
        amountPaise: 5000,
        status: 'awaiting_confirmation' as const,
      },
      {
        fromUid: 'u3',
        fromName: 'Kabir',
        toUid: 'u1',
        toName: 'Aarav',
        amountPaise: 4000,
        status: 'confirmed' as const,
      },
    ];

    const result = computeGroupBalances(memberNames, expenses, settlements);
    assert.equal(result.totalExpenditurePaise, 30000);
    assert.equal(result.zeroSumCheckPaise, 0);
    assert.equal(verifyZeroSumBalance(result.memberBalances), true);

    const u1 = result.memberBalances.find((m) => m.uid === 'u1')!;
    const u2 = result.memberBalances.find((m) => m.uid === 'u2')!;
    const u3 = result.memberBalances.find((m) => m.uid === 'u3')!;
    assert.equal(u1.netBalancePaise, 6000);
    assert.equal(u2.netBalancePaise, 0);
    assert.equal(u3.netBalancePaise, -6000);

    assert.deepEqual(result.simplifiedDebts, [
      {
        fromUid: 'u3',
        fromName: 'Kabir',
        toUid: 'u1',
        toName: 'Aarav',
        amountPaise: 6000,
      },
    ]);
  });

  it('simplifies multi-creditor/multi-debtor cash flows cleanly', () => {
    const simplified = simplifyDebts([
      { uid: 'a', name: 'A', expensePaidPaise: 0, expenseSharePaise: 0, settlementPaidPaise: 0, settlementReceivedPaise: 0, netBalancePaise: 5000 },
      { uid: 'b', name: 'B', expensePaidPaise: 0, expenseSharePaise: 0, settlementPaidPaise: 0, settlementReceivedPaise: 0, netBalancePaise: 3000 },
      { uid: 'c', name: 'C', expensePaidPaise: 0, expenseSharePaise: 0, settlementPaidPaise: 0, settlementReceivedPaise: 0, netBalancePaise: -4000 },
      { uid: 'd', name: 'D', expensePaidPaise: 0, expenseSharePaise: 0, settlementPaidPaise: 0, settlementReceivedPaise: 0, netBalancePaise: -4000 },
    ]);
    const totalTransferred = simplified.reduce((sum, d) => sum + d.amountPaise, 0);
    assert.equal(totalTransferred, 8000);
    assert.ok(simplified.length <= 3);
  });
});

describe('Invitation Security, Messaging & Email Validation Helpers', () => {
  it('generates unique 192-bit CSPRNG tokens with prefix and URL-safe characters', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const tok = generateToken('grp');
      assert.match(tok, /^grp_[A-Za-z0-9_-]{32}$/);
      assert.ok(!tok.includes('group'), 'Token must not embed predictable group strings');
      tokens.add(tok);
    }
    assert.equal(tokens.size, 50);
  });

  it('formats the exact structured WhatsApp group invitation message', () => {
    const msg = buildGroupWhatsAppInviteMessage(
      'Goa Beach Trip',
      'https://tallycircle.example/join/group/grp_abc123'
    );
    assert.equal(
      msg,
      [
        'Hey! Join our group on TallyCircle (Friends Expense Tracker).',
        '',
        'Group: Goa Beach Trip',
        '',
        'Click this link to join:',
        'https://tallycircle.example/join/group/grp_abc123',
      ].join('\n')
    );
  });

  it('validates recipient email addresses accurately', () => {
    assert.equal(isValidEmailAddress('priya.sharma@example.com'), true);
    assert.equal(isValidEmailAddress('not-an-email'), false);
    assert.equal(isValidEmailAddress('missing@domain'), false);
  });

  it('sanitizes @handles deterministically without generating random fallback handles', () => {
    assert.equal(sanitizeHandleInput(' @Aarav_99 '), 'aarav_99');
    assert.equal(sanitizeHandleInput('@a'), 'a');
    assert.equal(sanitizeHandleInput('@@@'), '');
  });
  it('sanitizes spreadsheet cells against CSV/Excel formula injection', () => {
    assert.equal(sanitizeSpreadsheetCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
    assert.equal(sanitizeSpreadsheetCell('+cmd|calc'), "'+cmd|calc");
    assert.equal(sanitizeSpreadsheetCell('-1+1'), "'-1+1");
    assert.equal(sanitizeSpreadsheetCell('@SUM(1,2)'), "'@SUM(1,2)");
    assert.equal(sanitizeSpreadsheetCell('  =1+1'), "'  =1+1");
    assert.equal(sanitizeSpreadsheetCell('Goa Dinner'), 'Goa Dinner');
    assert.equal(sanitizeSpreadsheetCell(''), '');
  });
});

describe('Security Rules & Spec Invariants', () => {
  it('contains all 20 Dirty Dozen + extended adversarial cases', () => {
    assert.equal(DIRTY_DOZEN_CASES.length, 20);
    for (const c of DIRTY_DOZEN_CASES) {
      assert.equal(c.expected, 'PERMISSION_DENIED');
    }
  });

  it('enforces default deny, email verification, friendRequests rules, userLookup handle ownership, null-resource get guards, terminal settlement locks, invite revocation, emailInvites, and atomic group delete in firestore.rules', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    assert.ok(rules.includes('allow read, write: if false;'));
    assert.ok(rules.includes('request.auth.token.email_verified == true'));
    assert.ok(rules.includes('match /friendRequests/{requestId}'));
    assert.ok(rules.includes('function isValidFriendRequest(data, requestId)'));
    assert.ok(rules.includes("lookupKey == 'handle_' + incoming().handle"));
    assert.ok(rules.includes('resource == null || request.auth.uid in resource.data.users'));
    assert.ok(rules.includes('resource == null || request.auth.uid in resource.data.memberUids'));
    assert.ok(rules.includes("existing().status != 'confirmed'"));
    assert.ok(rules.includes('!existsAfter(/databases/$(database)/documents/groups/$(groupId))'));
    assert.ok(rules.includes('data.nicknames.keys().hasOnly(data.users)'));
    assert.ok(rules.includes("incoming().status == 'revoked'"));
    assert.ok(rules.includes('match /emailInvites/{inviteId}'));
    assert.ok(rules.includes('match /invites/{token}'));
  });

  it('contains extended feature security cases and enforces Trips, Recurring Expenses, and Receipt Storage rules', () => {
    assert.ok(FEATURE_SECURITY_CASES.length >= 6);
    for (const c of FEATURE_SECURITY_CASES) {
      assert.equal(c.expected, 'PERMISSION_DENIED');
    }

    const fsRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    assert.ok(fsRules.includes('match /recurringExpenses/{ruleId}'));
    assert.ok(fsRules.includes('match /trips/{tripId}'));
    assert.ok(fsRules.includes('match /tripInvites/{token}'));
    assert.ok(fsRules.includes('function isValidReceiptMetadata(meta)'));
    assert.ok(fsRules.includes('function isValidExpenseCategory(cat)'));
    assert.ok(fsRules.includes("incoming().generatedCount == existing().generatedCount"));

    const stRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');
    assert.ok(stRules.includes('allow read, write: if false;'));
    assert.ok(stRules.includes('5 * 1024 * 1024'));
    assert.ok(stRules.includes("request.resource.contentType.matches('^image/(jpeg|jpg|png|webp)$')"));
    assert.ok(stRules.includes('ai-studio-631d205c-cc67-42b0-bf7e-75e4c4c5ed5e'));
    assert.ok(stRules.includes('match /receipts/groups/{groupId}/{expenseId}/{fileName}'));
    assert.ok(stRules.includes('match /receipts/trips/{tripId}/{expenseId}/{fileName}'));
  });
});

describe('Recurring Expenses Engine & Idempotency', () => {
  it('clamps month-end and leap-year occurrences accurately', () => {
    const feb2026 = computeNextOccurrenceDate('2026-01-31', 'monthly', 0, 31);
    assert.equal(feb2026, '2026-02-28');
    const mar2026 = computeNextOccurrenceDate(feb2026, 'monthly', 0, 31);
    assert.equal(mar2026, '2026-03-31');

    const feb2028 = computeNextOccurrenceDate('2028-01-31', 'monthly', 0, 31);
    assert.equal(feb2028, '2028-02-29');
    const mar2028 = computeNextOccurrenceDate(feb2028, 'monthly', 0, 31);
    assert.equal(mar2028, '2028-03-31');

    const yearly2025 = computeNextOccurrenceDate('2024-02-29', 'yearly', 0, 29);
    assert.equal(yearly2025, '2025-02-28');
    const yearly2028 = computeNextOccurrenceDate('2027-02-28', 'yearly', 0, 29);
    assert.equal(yearly2028, '2028-02-29');
  });

  it('catches up due dates up to endDate and marks schedule completed', () => {
    const res = calculateDueOccurrences(
      {
        id: 'rule_1',
        frequency: 'monthly',
        intervalDays: 0,
        anchorDayOfMonth: 31,
        startDate: '2026-01-31',
        endDate: '2026-03-31',
        nextOccurrenceDate: '2026-01-31',
        status: 'active',
      },
      '2026-04-15'
    );
    assert.deepEqual(res.dueDates, ['2026-01-31', '2026-02-28', '2026-03-31']);
    assert.equal(res.nextOccurrenceDate, '2026-04-30');
    assert.equal(res.nextStatus, 'completed');
  });

  it('guarantees idempotent generation across repeated runs via deterministic occurrence keys', () => {
    const store = new Map<string, SimulatedExpenseRecord>();
    const activities: string[] = [];
    let ruleState: Parameters<typeof processRecurringRuleSynchronously>[0] = {
      id: 'rule_rent',
      groupId: 'grp_flat',
      title: 'Apartment Rent',
      description: 'Monthly shared flat rent',
      amountPaise: 3000000,
      currency: 'INR' as const,
      originalAmountMinor: 3000000,
      exchangeRateToInr: 1,
      tags: ['rent'],
      category: 'Bills' as const,
      splitMethod: 'equal' as const,
      payers: [{ uid: 'u1', name: 'Aarav', amountPaise: 3000000 }],
      shares: [
        { uid: 'u1', name: 'Aarav', sharePaise: 1500000, rawValue: 1 },
        { uid: 'u2', name: 'Diya', sharePaise: 1500000, rawValue: 1 },
      ],
      participantUids: ['u1', 'u2'],
      payerUids: ['u1'],
      frequency: 'monthly' as const,
      intervalDays: 0,
      anchorDayOfMonth: 1,
      startDate: '2026-01-01',
      endDate: '',
      nextOccurrenceDate: '2026-01-01',
      status: 'active' as const,
      generatedCount: 0,
      lastGeneratedDate: '',
      createdBy: 'u1',
    };

    const adapter: RecurringBatchAdapter = {
      hasExpense: (_g, id) => store.has(id),
      insertExpense: (_g, id, doc) => {
        store.set(id, doc);
      },
      updateRule: (_g, _r, patch) => {
        ruleState = { ...ruleState, ...patch };
      },
      appendActivity: (_g, summary) => {
        activities.push(summary);
      },
    };

    const first = processRecurringRuleSynchronously(ruleState, '2026-02-10', adapter);
    assert.deepEqual(first.createdIds, [
      buildOccurrenceIdempotencyKey('rule_rent', '2026-01-01'),
      buildOccurrenceIdempotencyKey('rule_rent', '2026-02-01'),
    ]);
    assert.equal(store.size, 2);
    assert.equal(ruleState.generatedCount, 2);
    assert.equal(ruleState.nextOccurrenceDate, '2026-03-01');

    // Simulate a duplicate run at the same date (e.g. concurrent Cloud Function / stale snapshot)
    const staleRepeat = processRecurringRuleSynchronously(
      { ...ruleState, nextOccurrenceDate: '2026-01-01', generatedCount: 2 },
      '2026-02-10',
      adapter
    );
    assert.equal(staleRepeat.createdIds.length, 0);
    assert.equal(store.size, 2);
    assert.equal(activities.length, 2);
  });
});

describe('Trip Budget Thresholds & Balance Reconciliation', () => {
  it('classifies trip budgets accurately at <80%, >=80%, and >100%', () => {
    assert.deepEqual(classifyBudgetStatus(50000, 0), { percentUsed: 0, status: 'unset' });
    assert.deepEqual(classifyBudgetStatus(50000, 100000), { percentUsed: 50, status: 'ok' });
    assert.deepEqual(classifyBudgetStatus(80000, 100000), { percentUsed: 80, status: 'approaching' });
    assert.deepEqual(classifyBudgetStatus(115000, 100000), { percentUsed: 115, status: 'exceeded' });
  });

  it('reconciles trip expenses across multi-currency entries with zero-sum verification', () => {
    const res = computeGroupBalances(
      { u1: 'Aarav', u2: 'Diya' },
      [
        {
          amountPaise: 84500, // 10 USD converted at 84.50
          payers: [{ uid: 'u1', name: 'Aarav', amountPaise: 84500 }],
          shares: [
            { uid: 'u1', name: 'Aarav', sharePaise: 42250 },
            { uid: 'u2', name: 'Diya', sharePaise: 42250 },
          ],
        },
      ],
      []
    );
    assert.equal(res.zeroSumCheckPaise, 0);
    assert.equal(verifyZeroSumBalance(res.memberBalances), true);
    assert.equal(res.simplifiedDebts.length, 1);
    assert.equal(res.simplifiedDebts[0].amountPaise, 42250);
  });
});

describe('Backend Express API Endpoints', () => {
  it('serves /api/health with emailConfigured flag and rejects unauthenticated protected endpoints with 401', async () => {
    const app = await createServerApp({ withVite: false });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    try {
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.equal(healthRes.headers.get('x-powered-by'), null);
      const healthJson = (await healthRes.json()) as {
        ok: boolean;
        status: string;
        emailConfigured: boolean;
      };
      assert.equal(healthJson.ok, true);
      assert.equal(healthJson.status, 'healthy');
      assert.equal(typeof healthJson.emailConfigured, 'boolean');

      const emailStatusRes = await fetch(`${baseUrl}/api/invitations/email-status`);
      assert.equal(emailStatusRes.status, 401);

      const validateInviteRes = await fetch(`${baseUrl}/api/invitations/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'grp_test' }),
      });
      assert.equal(validateInviteRes.status, 401);

      const validateTripInviteRes = await fetch(`${baseUrl}/api/invitations/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'trp_test', kind: 'trip' }),
      });
      assert.equal(validateTripInviteRes.status, 401);

      const sendEmailRes = await fetch(`${baseUrl}/api/invitations/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName: 'Trip', inviteUrl: 'https://example.com', recipients: [] }),
      });
      assert.equal(sendEmailRes.status, 401);

      const splitsRes = await fetch(`${baseUrl}/api/finance/compute-splits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalPaise: 1000, method: 'equal', participants: [] }),
      });
      assert.equal(splitsRes.status, 401);

      const reconcileRes = await fetch(`${baseUrl}/api/finance/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberNames: {}, expenses: [], settlements: [] }),
      });
      assert.equal(reconcileRes.status, 401);

      const aiRes = await fetch(`${baseUrl}/api/ai/parse-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Dinner 500' }),
      });
      assert.equal(aiRes.status, 401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('PWA Assets, Icon Dimensions & Vercel Configuration', () => {
  function readPngDimensions(filePath: string): { width: number; height: number } {
    const buf = fs.readFileSync(filePath);
    const pngSig = '89504e470d0a1a0a';
    assert.equal(buf.subarray(0, 8).toString('hex'), pngSig, `${path.basename(filePath)} must be a valid PNG`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  it('includes valid 192x192, 512x512, maskable 512x512, and 180x180 apple-touch icons plus offline.html and icon.svg', () => {
    const publicDir = path.resolve(process.cwd(), 'public');
    assert.deepEqual(readPngDimensions(path.join(publicDir, 'pwa-192x192.png')), { width: 192, height: 192 });
    assert.deepEqual(readPngDimensions(path.join(publicDir, 'pwa-512x512.png')), { width: 512, height: 512 });
    assert.deepEqual(readPngDimensions(path.join(publicDir, 'pwa-maskable-512x512.png')), { width: 512, height: 512 });
    assert.deepEqual(readPngDimensions(path.join(publicDir, 'apple-touch-icon.png')), { width: 180, height: 180 });
    assert.equal(fs.existsSync(path.join(publicDir, 'icon.svg')), true);
    assert.equal(fs.existsSync(path.join(publicDir, 'favicon.ico')), true);

    const offlineHtml = fs.readFileSync(path.join(publicDir, 'offline.html'), 'utf8');
    assert.ok(offlineHtml.includes("You're currently offline"));
  });

  it('configures vercel.json with service worker no-cache headers, manifest MIME type, and safe SPA rewrites', () => {
    const vercelPath = path.resolve(process.cwd(), 'vercel.json');
    const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8')) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
      rewrites: Array<{ source: string; destination: string }>;
    };
    assert.ok(Array.isArray(vercel.headers) && vercel.headers.length >= 2);
    const swHeader = vercel.headers.find((h) => h.source === '/sw.js');
    assert.ok(swHeader, 'vercel.json must configure headers for /sw.js');
    assert.ok(
      swHeader.headers.some((x) => x.key.toLowerCase() === 'cache-control' && x.value.includes('must-revalidate'))
    );
    const manifestHeader = vercel.headers.find((h) => h.source === '/manifest.webmanifest');
    assert.ok(manifestHeader, 'vercel.json must configure headers for /manifest.webmanifest');
    assert.ok(
      manifestHeader.headers.some((x) => x.key.toLowerCase() === 'content-type' && x.value.includes('application/manifest+json'))
    );
    assert.ok(vercel.rewrites.some((r) => r.destination === '/index.html' && r.source.includes('manifest\\.webmanifest')));
  });
});

