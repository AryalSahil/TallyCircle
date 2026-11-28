import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { generateToken, isValidEmailAddress } from '../utils/helpers';

const COOLDOWN_STORAGE_KEY = 'tallycircle_last_contact_ts';
const COOLDOWN_MS = 60_000;

export interface ContactSubmissionInput {
  name: string;
  email: string;
  subject: string;
  message: string;
  honeypot?: string;
  elapsedMs: number;
}

export async function submitContactMessage(
  input: ContactSubmissionInput
): Promise<{ referenceId: string }> {
  const cleanName = input.name.trim();
  const cleanEmail = input.email.trim();
  const cleanSubject = input.subject.trim();
  const cleanMessage = input.message.trim();

  if (input.honeypot && input.honeypot.trim().length > 0) {
    throw new Error('Submission could not be verified.');
  }
  if (input.elapsedMs < 1500) {
    throw new Error('Please wait a moment before submitting the form.');
  }
  if (cleanName.length < 2 || cleanName.length > 80) {
    throw new Error('Name must be between 2 and 80 characters.');
  }
  if (!isValidEmailAddress(cleanEmail) || cleanEmail.length > 120) {
    throw new Error('Please enter a valid email address.');
  }
  if (cleanSubject.length < 3 || cleanSubject.length > 120) {
    throw new Error('Subject must be between 3 and 120 characters.');
  }
  if (cleanMessage.length < 10 || cleanMessage.length > 2000) {
    throw new Error('Message must be between 10 and 2000 characters.');
  }

  try {
    const lastTs = Number(localStorage.getItem(COOLDOWN_STORAGE_KEY) || '0');
    if (lastTs > 0 && Date.now() - lastTs < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - lastTs)) / 1000);
      throw new Error(`Please wait ${waitSec}s before sending another message.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Please wait')) {
      throw err;
    }
  }

  const verifyRes = await fetch('/api/contact/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
      honeypot: input.honeypot || '',
      elapsedMs: input.elapsedMs,
    }),
  });

  if (!verifyRes.ok) {
    const errBody = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || 'Could not validate contact submission.');
  }

  const messageId = generateToken('msg');
  const payload: Record<string, unknown> = {
    name: cleanName,
    email: cleanEmail,
    subject: cleanSubject,
    message: cleanMessage,
    status: 'new',
    sourcePath: '/contact',
    createdAt: serverTimestamp(),
  };

  if (auth.currentUser?.uid) {
    payload.submitterUid = auth.currentUser.uid;
  }

  try {
    await setDoc(doc(db, 'contactMessages', messageId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `contactMessages/${messageId}`);
  }

  try {
    localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage quota/privacy mode errors
  }

  return { referenceId: messageId };
}
