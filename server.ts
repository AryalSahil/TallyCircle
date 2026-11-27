import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

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
      users?: Array<{ localId?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }

    req.uid = user.localId;
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
}

const VALID_CATEGORIES = [
  'Food',
  'Restaurant',
  'Travel',
  'Hotel',
  'Clubbing',
  'Shopping',
  'Entertainment',
  'Transport',
  'Fuel',
  'Tickets',
  'Other',
] as const;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

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
      const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other';
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

  // Vite dev middleware or static production build
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TallyCircle server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
