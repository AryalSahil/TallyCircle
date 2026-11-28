import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  computeGroupBalances,
  computeSplits,
  verifyZeroSumBalance,
} from './src/utils/finance.js';
import type { SplitMethod } from './src/types/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

interface AuthedRequest extends Request {
  uid?: string;
  email?: string;
}

async function verifyFirebaseAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Invalid authentication token' });
    return;
  }

  try {
    const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const verifyRes = await fetch(lookupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (!verifyRes.ok) {
      res.status(401).json({ error: 'Invalid or expired authentication session' });
      return;
    }

    const data = (await verifyRes.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }

    req.uid = user.localId;
    req.email = user.email || '';
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
}

interface FirestoreFieldValue {
  stringValue?: string;
  integerValue?: string;
  timestampValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreFieldValue[] };
}

function readFsString(fields: Record<string, FirestoreFieldValue> | undefined, key: string): string {
  return fields?.[key]?.stringValue ?? '';
}

function readFsInt(fields: Record<string, FirestoreFieldValue> | undefined, key: string): number {
  const raw = fields?.[key]?.integerValue;
  return raw !== undefined ? Number(raw) : 0;
}

function readFsBool(fields: Record<string, FirestoreFieldValue> | undefined, key: string): boolean {
  return Boolean(fields?.[key]?.booleanValue);
}

function readFsTimestamp(fields: Record<string, FirestoreFieldValue> | undefined, key: string): string {
  return fields?.[key]?.timestampValue ?? '';
}

function readFsStringArray(fields: Record<string, FirestoreFieldValue> | undefined, key: string): string[] {
  const values = fields?.[key]?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  return values.map((v) => v.stringValue ?? '').filter(Boolean);
}

const VALID_CATEGORIES = [
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

const LEGACY_CATEGORY_MAP: Record<string, (typeof VALID_CATEGORIES)[number]> = {
  Food: 'Food & Drinks',
  Restaurant: 'Food & Drinks',
  Hotel: 'Accommodation',
  Clubbing: 'Entertainment',
  Fuel: 'Transport',
  Tickets: 'Entertainment',
};

const VALID_SPLIT_METHODS: SplitMethod[] = ['equal', 'unequal', 'percentage', 'shares'];

export async function createServerApp(options: { withVite?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '4mb' }));

  const emailProviderConfigured = Boolean(process.env.RESEND_API_KEY?.trim());

  // Operational health check for uptime monitors and deployment readiness probes
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      status: 'healthy',
      service: 'tallycircle',
      databaseId: firebaseConfig.firestoreDatabaseId,
      aiConfigured: Boolean(ai),
      emailConfigured: emailProviderConfigured,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Anti-spam verification & sliding-window rate limiter for public contact submissions
  const contactRateMap = new Map<string, number[]>();
  app.post('/api/contact/verify', (req: Request, res: Response) => {
    const { name, email, subject, message, honeypot, elapsedMs } = req.body as {
      name?: unknown;
      email?: unknown;
      subject?: unknown;
      message?: unknown;
      honeypot?: unknown;
      elapsedMs?: unknown;
    };

    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      res.status(400).json({ error: 'Unable to submit message.' });
      return;
    }
    if (typeof elapsedMs === 'number' && elapsedMs < 1500) {
      res.status(429).json({ error: 'Please take a moment before submitting the form.' });
      return;
    }

    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';

    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > 120) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (cleanSubject.length < 3 || cleanSubject.length > 120) {
      res.status(400).json({ error: 'Subject must be between 3 and 120 characters.' });
      return;
    }
    if (cleanMessage.length < 10 || cleanMessage.length > 2000) {
      res.status(400).json({ error: 'Message must be between 10 and 2000 characters.' });
      return;
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0])?.trim() ||
      req.ip ||
      'unknown';

    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const recent = (contactRateMap.get(clientIp) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= 5) {
      res.status(429).json({
        error: 'Too many messages sent recently. Please wait 15 minutes before sending another inquiry.',
      });
      return;
    }
    recent.push(now);
    contactRateMap.set(clientIp, recent);

    res.json({ ok: true });
  });

  // Truthful email provider capability check
  app.get('/api/invitations/email-status', verifyFirebaseAuth, (_req: AuthedRequest, res: Response) => {
    res.json({
      configured: emailProviderConfigured,
      provider: emailProviderConfigured ? 'resend' : null,
      fromAddress: emailProviderConfigured
        ? (process.env.EMAIL_FROM?.trim() || 'TallyCircle <onboarding@resend.dev>')
        : null,
    });
  });

  // Server-side invitation validation against Firestore REST using caller's verified Bearer token
  app.post('/api/invitations/validate', verifyFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    const { token, kind } = req.body as { token?: unknown; kind?: unknown };
    const inviteKind = kind === 'trip' ? 'trip' : 'group';
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
      res.json({
        valid: false,
        reason: 'invalid',
        message: 'This invitation token is malformed or invalid.',
      });
      return;
    }

    const idToken = req.headers.authorization!.slice('Bearer '.length).trim();
    const baseFsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;
    const inviteCollection = inviteKind === 'trip' ? 'tripInvites' : 'groupInvites';

    try {
      const invRes = await fetch(`${baseFsUrl}/${inviteCollection}/${encodeURIComponent(token)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (invRes.status === 404) {
        res.json({
          valid: false,
          reason: 'invalid',
          message: `This ${inviteKind} invitation link does not exist or has been removed.`,
        });
        return;
      }

      if (!invRes.ok) {
        res.status(502).json({ error: 'Unable to validate invitation with Firestore.' });
        return;
      }

      const invDoc = (await invRes.json()) as { fields?: Record<string, FirestoreFieldValue> };
      const fields = invDoc.fields;
      const targetId = readFsString(fields, inviteKind === 'trip' ? 'tripId' : 'groupId');
      const targetName = readFsString(fields, inviteKind === 'trip' ? 'tripName' : 'groupName');
      const destination = readFsString(fields, 'destination');
      const createdByName = readFsString(fields, 'createdByName');
      const status = readFsString(fields, 'status') || 'active';
      const expiresAtIso = readFsTimestamp(fields, 'expiresAt');
      const maxUses = readFsInt(fields, 'maxUses');
      const usesCount = readFsInt(fields, 'usesCount');
      const usedBy = readFsStringArray(fields, 'usedBy');

      const inviteMeta =
        inviteKind === 'trip'
          ? {
              token,
              tripId: targetId,
              tripName: targetName,
              destination,
              createdByName,
              expiresAtIso,
              maxUses,
              usesCount,
              status,
            }
          : {
              token,
              groupId: targetId,
              groupName: targetName,
              createdByName,
              expiresAtIso,
              maxUses,
              usesCount,
              status,
            };

      if (status === 'revoked') {
        res.json({
          valid: false,
          reason: 'revoked',
          message: `This ${inviteKind} invitation link was revoked by a member.`,
          invite: inviteMeta,
        });
        return;
      }

      if (expiresAtIso && new Date(expiresAtIso).getTime() < Date.now()) {
        res.json({
          valid: false,
          reason: 'expired',
          message: `This ${inviteKind} invitation link has expired.`,
          invite: inviteMeta,
        });
        return;
      }

      const targetCollection = inviteKind === 'trip' ? 'trips' : 'groups';
      const targetRes = await fetch(`${baseFsUrl}/${targetCollection}/${encodeURIComponent(targetId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (targetRes.ok) {
        const targetDoc = (await targetRes.json()) as { fields?: Record<string, FirestoreFieldValue> };
        const tFields = targetDoc.fields;
        const memberUids = readFsStringArray(
          tFields,
          inviteKind === 'trip' ? 'participantUids' : 'memberUids'
        );
        if (req.uid && memberUids.includes(req.uid)) {
          res.json({
            valid: true,
            reason: 'already_member',
            message: `You are already part of this ${inviteKind}.`,
            invite: inviteMeta,
            ...(inviteKind === 'trip'
              ? {
                  trip: {
                    id: targetId,
                    name: readFsString(tFields, 'name') || targetName,
                    destination: readFsString(tFields, 'destination') || destination,
                    memberCount: memberUids.length,
                    isArchived: readFsBool(tFields, 'isArchived'),
                  },
                }
              : {
                  group: {
                    id: targetId,
                    name: readFsString(tFields, 'name') || targetName,
                    description: readFsString(tFields, 'description'),
                    memberCount: memberUids.length,
                    isArchived: readFsBool(tFields, 'isArchived'),
                  },
                }),
          });
          return;
        }
      } else if (targetRes.status === 404) {
        res.json({
          valid: false,
          reason: 'group_deleted',
          message: `This ${inviteKind} has been deleted and is no longer available.`,
          invite: inviteMeta,
        });
        return;
      }

      if (usesCount >= maxUses) {
        res.json({
          valid: false,
          reason: 'limit_reached',
          message: `This ${inviteKind} invitation link has reached its maximum usage limit.`,
          invite: inviteMeta,
        });
        return;
      }

      if (req.uid && usedBy.includes(req.uid)) {
        res.json({
          valid: false,
          reason: 'already_used',
          message: `You already redeemed this invitation link previously. Ask a participant for a fresh link.`,
          invite: inviteMeta,
        });
        return;
      }

      res.json({
        valid: true,
        invite: inviteMeta,
      });
    } catch (err) {
      console.error('Invite validation error:', err);
      res.status(502).json({ error: 'Network error while validating invitation.' });
    }
  });

  // Real transactional email sender (Resend API when configured; never pretends if unconfigured)
  app.post('/api/invitations/send-email', verifyFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    const { groupName, inviteUrl, inviterName, recipients } = req.body as {
      groupId?: string;
      groupName?: string;
      inviteUrl?: string;
      inviterName?: string;
      recipients?: Array<{ email: string; existingAccountName?: string }>;
    };

    if (!groupName || !inviteUrl || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: 'groupName, inviteUrl, and recipients are required.' });
      return;
    }

    let safeInviteUrl = '';
    try {
      const parsed = new URL(inviteUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Invalid scheme');
      }
      safeInviteUrl = parsed.toString();
    } catch {
      res.status(400).json({ error: 'Invalid invitation URL.' });
      return;
    }

    const validRecipients = recipients
      .filter((r) => r && typeof r.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email.trim()))
      .slice(0, 20);

    if (validRecipients.length === 0) {
      res.status(400).json({ error: 'Provide at least one valid email address.' });
      return;
    }

    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (!resendKey) {
      res.json({
        delivered: false,
        emailConfigured: false,
        provider: null,
        message:
          'Email provider is not configured on the server (set RESEND_API_KEY in Settings > Secrets). Pending invite records and shareable links were created.',
        results: validRecipients.map((r) => ({
          email: r.email.trim(),
          status: 'provider_unconfigured',
          note: 'Email provider not configured; share the invite link directly or via WhatsApp.',
        })),
      });
      return;
    }

    const escapeHtml = (val: string) =>
      val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const fromAddress = process.env.EMAIL_FROM?.trim() || 'TallyCircle <onboarding@resend.dev>';
    const senderLabel = (inviterName || 'A friend').slice(0, 80);
    const safeGroup = groupName.slice(0, 80);
    const safeGroupHtml = escapeHtml(safeGroup);
    const safeSenderHtml = escapeHtml(senderLabel);
    const safeUrlHtml = escapeHtml(safeInviteUrl);

    const results = await Promise.all(
      validRecipients.map(async (r) => {
        const toEmail = r.email.trim();
        try {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [toEmail],
              subject: `${senderLabel} invited you to join "${safeGroup}" on TallyCircle`,
              text: [
                `Hey! ${senderLabel} invited you to join the expense group "${safeGroup}" on TallyCircle.`,
                '',
                `Click this link to join:`,
                safeInviteUrl,
              ].join('\n'),
              html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
                <h2 style="margin:0 0 12px;">Join "${safeGroupHtml}" on TallyCircle</h2>
                <p style="margin:0 0 20px;color:#475569;line-height:1.5;">
                  <strong>${safeSenderHtml}</strong> invited you to collaborate and split shared expenses in <strong>${safeGroupHtml}</strong>.
                </p>
                <a href="${safeUrlHtml}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">
                  Accept &amp; Join Group
                </a>
                <p style="margin:20px 0 0;font-size:12px;color:#64748b;word-break:break-all;">
                  Or copy this invitation link:<br/>${safeUrlHtml}
                </p>
              </div>`,
            }),
          });

          if (!emailRes.ok) {
            const errBody = await emailRes.text();
            return {
              email: toEmail,
              status: 'failed' as const,
              note: errBody.slice(0, 180) || `Provider returned ${emailRes.status}`,
            };
          }
          return {
            email: toEmail,
            status: 'sent' as const,
            note: 'Invitation email delivered.',
          };
        } catch (err) {
          return {
            email: toEmail,
            status: 'failed' as const,
            note: err instanceof Error ? err.message : 'Network error sending email',
          };
        }
      })
    );

    const anySent = results.some((r) => r.status === 'sent');
    res.json({
      delivered: anySent,
      emailConfigured: true,
      provider: 'resend',
      message: anySent
        ? 'Invitation email(s) sent.'
        : 'Email provider attempted delivery but rejected the request.',
      results,
    });
  });

  // Server-side deterministic paise split calculator
  app.post('/api/finance/compute-splits', verifyFirebaseAuth, (req: AuthedRequest, res: Response) => {
    const { totalPaise, method, participants } = req.body as {
      totalPaise?: unknown;
      method?: unknown;
      participants?: unknown;
    };

    if (
      typeof totalPaise !== 'number' ||
      !Number.isInteger(totalPaise) ||
      totalPaise <= 0 ||
      totalPaise > 1_000_000_000
    ) {
      res.status(400).json({ error: 'totalPaise must be a positive integer.' });
      return;
    }

    if (typeof method !== 'string' || !VALID_SPLIT_METHODS.includes(method as SplitMethod)) {
      res.status(400).json({ error: 'method must be equal, unequal, percentage, or shares.' });
      return;
    }

    if (!Array.isArray(participants) || participants.length === 0 || participants.length > 50) {
      res.status(400).json({ error: 'participants must be a non-empty array (max 50).' });
      return;
    }

    const sanitizedParticipants = participants
      .filter(
        (p): p is { uid: string; name: string; rawValue?: number; value?: number } =>
          Boolean(p) &&
          typeof p === 'object' &&
          typeof (p as { uid?: unknown }).uid === 'string' &&
          typeof (p as { name?: unknown }).name === 'string'
      )
      .map((p) => {
        const raw =
          typeof p.rawValue === 'number' && Number.isFinite(p.rawValue)
            ? p.rawValue
            : typeof p.value === 'number' && Number.isFinite(p.value)
              ? p.value
              : 0;
        return {
          uid: p.uid.trim().slice(0, 128),
          name: p.name.trim().slice(0, 80) || 'Member',
          rawValue: raw,
        };
      });

    if (sanitizedParticipants.length !== participants.length) {
      res.status(400).json({ error: 'Each participant requires uid and name strings.' });
      return;
    }

    const result = computeSplits(totalPaise, method as SplitMethod, sanitizedParticipants);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      totalPaise,
      method,
      shares: result.shares,
    });
  });

  // Server-side group ledger balance & zero-sum reconciliation verifier
  app.post('/api/finance/reconcile', verifyFirebaseAuth, (req: AuthedRequest, res: Response) => {
    const { memberNames, expenses, settlements } = req.body as {
      memberNames?: Record<string, string>;
      expenses?: Array<{
        amountPaise: number;
        payers: Array<{ uid: string; name: string; amountPaise: number }>;
        shares: Array<{ uid: string; name: string; sharePaise: number }>;
      }>;
      settlements?: Array<{
        fromUid: string;
        fromName: string;
        toUid: string;
        toName: string;
        amountPaise: number;
        status: 'pending' | 'awaiting_confirmation' | 'confirmed' | 'disputed';
      }>;
    };

    if (!memberNames || typeof memberNames !== 'object' || Array.isArray(memberNames)) {
      res.status(400).json({ error: 'memberNames map is required.' });
      return;
    }
    if (!Array.isArray(expenses) || !Array.isArray(settlements)) {
      res.status(400).json({ error: 'expenses and settlements arrays are required.' });
      return;
    }
    if (expenses.length > 2000 || settlements.length > 2000) {
      res.status(400).json({ error: 'Reconciliation payload exceeds maximum batch size (2000).' });
      return;
    }

    const computed = computeGroupBalances(memberNames, expenses, settlements);
    const zeroSumValid = verifyZeroSumBalance(computed.memberBalances);

    res.json({
      ...computed,
      zeroSumValid,
    });
  });

  // Low-latency smart expense parser & receipt scanner using gemini-3.1-flash-lite
  app.post('/api/ai/parse-expense', verifyFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    if (!ai) {
      res.status(503).json({
        error: 'Smart scan is unavailable because GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const { text, imageBase64, mimeType, memberNames } = req.body as {
      text?: string;
      imageBase64?: string;
      mimeType?: string;
      memberNames?: string[];
    };

    if ((!text || typeof text !== 'string' || !text.trim()) && (!imageBase64 || typeof imageBase64 !== 'string')) {
      res.status(400).json({ error: 'Provide either a description or a receipt image to parse.' });
      return;
    }

    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (imageBase64 && typeof imageBase64 === 'string') {
        const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        if (cleanBase64.length > 2_500_000) {
          res.status(400).json({ error: 'Receipt image exceeds maximum allowed size.' });
          return;
        }
        const safeMime =
          mimeType && /^image\/(png|jpeg|jpg|webp)$/i.test(mimeType) ? mimeType : 'image/jpeg';
        parts.push({
          inlineData: {
            mimeType: safeMime,
            data: cleanBase64,
          },
        });
      }

      const memberContext =
        Array.isArray(memberNames) && memberNames.length > 0
          ? `Available group members: ${memberNames.slice(0, 30).join(', ')}.`
          : '';

      const promptText = [
        'Extract structured expense fields for a multi-currency friends expense tracker.',
        `Allowed categories: ${VALID_CATEGORIES.join(', ')}.`,
        'Allowed currencies: INR, USD, EUR, GBP, AED, SGD, THB. Default to INR if not specified.',
        memberContext,
        text ? `User note: "${text.slice(0, 500)}"` : 'Extract details from the attached receipt image.',
        'Return title, total amount in the detected currency as a positive number (e.g. 1250.50), currency code, best matching category, ISO date YYYY-MM-DD (if visible or leave empty string), short description, matching member names mentioned, and 1-3 lowercase single-word tags (e.g. vacation, work, essential).',
      ]
        .filter(Boolean)
        .join('\n');

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Short expense title' },
              amount: { type: Type.NUMBER, description: 'Total expense amount in original currency' },
              currency: { type: Type.STRING, description: 'Currency code: INR, USD, EUR, GBP, AED, SGD, or THB' },
              category: { type: Type.STRING, description: 'One of the allowed categories' },
              expenseDate: { type: Type.STRING, description: 'Date in YYYY-MM-DD format or empty string' },
              description: { type: Type.STRING, description: 'Concise item or bill summary' },
              matchedMembers: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Names from the group member list mentioned in the note',
              },
              suggestedTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '1 to 3 concise lowercase tags like vacation, work, essential',
              },
            },
            required: ['title', 'amount', 'currency', 'category', 'expenseDate', 'description', 'matchedMembers', 'suggestedTags'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const rawCategory = String(parsed.category || '');
      const category = (VALID_CATEGORIES as readonly string[]).includes(rawCategory)
        ? rawCategory
        : LEGACY_CATEGORY_MAP[rawCategory] || 'Other';
      const validCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB'];
      const currency = validCurrencies.includes(String(parsed.currency || '').toUpperCase())
        ? String(parsed.currency).toUpperCase()
        : 'INR';
      res.json({
        title: typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : '',
        amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : 0,
        currency,
        category,
        expenseDate: typeof parsed.expenseDate === 'string' ? parsed.expenseDate : '',
        description: typeof parsed.description === 'string' ? parsed.description.slice(0, 400) : '',
        matchedMembers: Array.isArray(parsed.matchedMembers) ? parsed.matchedMembers : [],
        suggestedTags: Array.isArray(parsed.suggestedTags)
          ? parsed.suggestedTags
              .filter((t: unknown): t is string => typeof t === 'string')
              .map((t: string) => t.toLowerCase().replace(/[^a-z0-9\-_]/g, '').slice(0, 24))
              .filter(Boolean)
              .slice(0, 4)
          : [],
      });
    } catch (err: unknown) {
      console.error('Gemini parse-expense error:', err);
      const message = err instanceof Error ? err.message : 'Failed to analyze expense.';
      res.status(502).json({ error: message });
    }
  });

  // Low-latency spending brief using gemini-3.1-flash-lite
  app.post('/api/ai/spending-brief', verifyFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    if (!ai) {
      res.status(503).json({
        error: 'Insights are unavailable because GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const { scopeLabel, totalInr, expenseCount, topCategories, pendingSettlementsCount } = req.body as {
      scopeLabel?: string;
      totalInr?: number;
      expenseCount?: number;
      topCategories?: Array<{ category: string; amountInr: number }>;
      pendingSettlementsCount?: number;
    };

    try {
      const catSummary = Array.isArray(topCategories)
        ? topCategories
            .slice(0, 5)
            .map((c) => `${c.category}: ₹${Math.round(c.amountInr)}`)
            .join(', ')
        : 'None';

      const prompt = [
        `Summarize this shared expense ledger in 2 crisp, practical sentences (max 55 words total). Use ₹ for Indian Rupees.`,
        `Scope: ${String(scopeLabel || 'All Groups').slice(0, 80)}`,
        `Total spent: ₹${Math.round(Number(totalInr) || 0)} across ${Number(expenseCount) || 0} expenses.`,
        `Top categories: ${catSummary}.`,
        `Pending/awaiting settlements: ${Number(pendingSettlementsCount) || 0}.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      });

      res.json({ brief: (response.text ?? '').trim() });
    } catch (err: unknown) {
      console.error('Gemini spending-brief error:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate spending brief.';
      res.status(502).json({ error: message });
    }
  });

  // Structured API error handler (must precede Vite/static fallback)
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    if (res.headersSent) return;
    res.status(500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err instanceof Error
          ? err.message
          : 'Internal server error',
    });
  });

  if (options.withVite !== false) {
    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) {
      // Disable Vite HMR WebSocket over Cloud Run reverse proxies unless explicitly enabled
      if (!process.env.DISABLE_HMR && process.env.ENABLE_HMR !== 'true') {
        process.env.DISABLE_HMR = 'true';
      }
      const hmrDisabled = process.env.DISABLE_HMR === 'true';
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: hmrDisabled
          ? { middlewareMode: true, ws: false, hmr: false }
          : { middlewareMode: true },
        appType: 'spa',
      });
      if (hmrDisabled) {
        app.get('/@vite/client', (_req: Request, res: Response) => {
          res.type('application/javascript; charset=utf-8');
          res.send(`
const sheetsMap = new Map();
export class ErrorOverlay extends HTMLElement {}
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return { data: {}, accept: noop, acceptExports: noop, dispose: noop, prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
`);
        });
      }
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distPath)) {
        app.use(
          express.static(distPath, {
            setHeaders: (res, filePath) => {
              if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith('/sw.js')) {
                res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
                res.setHeader('Service-Worker-Allowed', '/');
              } else if (
                filePath.endsWith(`${path.sep}manifest.webmanifest`) ||
                filePath.endsWith('/manifest.webmanifest')
              ) {
                res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
                res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
              }
            },
          })
        );
        app.get('*', (req, res) => {
          if (req.path.startsWith('/api/')) {
            res.status(404).json({ error: 'API endpoint not found' });
            return;
          }
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  }

  return app;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  createServerApp()
    .then((app) => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`TallyCircle server running on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Server startup failed:', err);
      process.exit(1);
    });
}
