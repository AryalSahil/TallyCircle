import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  amountToMinorUnits,
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
} from '../src/utils/helpers.js';
import { DIRTY_DOZEN_CASES } from '../firestore.rules.test.js';
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
});

describe('Security Rules & Spec Invariants', () => {
  it('contains all 16 Dirty Dozen + extended adversarial cases', () => {
    assert.equal(DIRTY_DOZEN_CASES.length, 16);
    for (const c of DIRTY_DOZEN_CASES) {
      assert.equal(c.expected, 'PERMISSION_DENIED');
    }
  });

  it('enforces default deny, email verification, terminal settlement locks, invite revocation, emailInvites, and atomic group delete in firestore.rules', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    assert.ok(rules.includes('allow read, write: if false;'));
    assert.ok(rules.includes('request.auth.token.email_verified == true'));
    assert.ok(rules.includes("existing().status != 'confirmed'"));
    assert.ok(rules.includes('!existsAfter(/databases/$(database)/documents/groups/$(groupId))'));
    assert.ok(rules.includes('data.nicknames.keys().hasOnly(data.users)'));
    assert.ok(rules.includes("incoming().status == 'revoked'"));
    assert.ok(rules.includes('match /emailInvites/{inviteId}'));
    assert.ok(rules.includes('match /invites/{token}'));
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
