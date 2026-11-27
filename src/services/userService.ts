import { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../lib/firebase';
import type { CurrencyCode, PublicProfile, ThemePreference, UserPrivateProfile } from '../types';
import { normalizeHandle, sanitizeHandleInput, sha256Hex } from '../utils/helpers';
import { isSupportedCurrency, normalizeExpenseTag } from '../utils/finance';

const publicProfileCache = new Map<string, PublicProfile>();

export async function ensureUserProfile(firebaseUser: User): Promise<UserPrivateProfile> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const publicRef = doc(db, 'publicProfiles', firebaseUser.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
  }

  if (existingSnap.exists()) {
    const profile = existingSnap.data() as UserPrivateProfile;
    // Ensure public profile and both lookup entries exist
    const emailKey = `email_${await sha256Hex(profile.email)}`;
    const handleKey = `handle_${profile.handle}`;
    const emailLookupRef = doc(db, 'userLookup', emailKey);
    const handleLookupRef = doc(db, 'userLookup', handleKey);
    try {
      const [pubSnap, emailSnap, handleSnap] = await Promise.all([
        getDoc(publicRef),
        getDoc(emailLookupRef),
        getDoc(handleLookupRef),
      ]);
      if (!pubSnap.exists() || !emailSnap.exists() || !handleSnap.exists()) {
        const batch = writeBatch(db);
        if (!pubSnap.exists()) {
          batch.set(publicRef, {
            uid: profile.uid,
            displayName: profile.fullName,
            handle: profile.handle,
            photoUrl: profile.photoUrl || '',
            upiId: profile.upiId || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        if (!emailSnap.exists()) {
          batch.set(emailLookupRef, {
            uid: profile.uid,
            displayName: profile.fullName,
            handle: profile.handle,
            photoUrl: profile.photoUrl || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        if (!handleSnap.exists()) {
          batch.set(handleLookupRef, {
            uid: profile.uid,
            displayName: profile.fullName,
            handle: profile.handle,
            photoUrl: profile.photoUrl || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
    } catch (err) {
      logFirestoreError(err, OperationType.WRITE, `publicProfiles/${firebaseUser.uid}`);
    }
    return profile;
  }

  const email = (firebaseUser.email || '').trim().toLowerCase();
  const fullName = (firebaseUser.displayName || email.split('@')[0] || 'TallyCircle User').slice(0, 80);
  const baseHandle = normalizeHandle(email.split('@')[0] || fullName);
  const handle = `${baseHandle.slice(0, 24)}_${firebaseUser.uid.slice(0, 4).toLowerCase()}`;
  const photoUrl = (firebaseUser.photoURL || '').slice(0, 250000);

  const emailKey = `email_${await sha256Hex(email)}`;
  const handleKey = `handle_${handle}`;

  const batch = writeBatch(db);
  batch.set(userRef, {
    uid: firebaseUser.uid,
    fullName,
    email,
    phone: '',
    upiId: '',
    photoUrl,
    handle,
    theme: 'system',
    preferredCurrency: 'INR',
    customTags: ['vacation', 'work', 'essential'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(publicRef, {
    uid: firebaseUser.uid,
    displayName: fullName,
    handle,
    photoUrl,
    upiId: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'userLookup', emailKey), {
    uid: firebaseUser.uid,
    displayName: fullName,
    handle,
    photoUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'userLookup', handleKey), {
    uid: firebaseUser.uid,
    displayName: fullName,
    handle,
    photoUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    const created = await getDoc(userRef);
    return created.data() as UserPrivateProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
  }
}

export async function updateUserProfile(
  current: UserPrivateProfile,
  updates: {
    fullName?: string;
    phone?: string;
    upiId?: string;
    photoUrl?: string;
    handle?: string;
    theme?: ThemePreference;
    preferredCurrency?: CurrencyCode;
    customTags?: string[];
  }
): Promise<UserPrivateProfile> {
  const fullName = (updates.fullName ?? current.fullName).trim().slice(0, 80) || current.fullName;
  const phone = (updates.phone ?? current.phone ?? '').trim().slice(0, 30);
  const upiId = (updates.upiId ?? current.upiId ?? '').trim().slice(0, 100);
  const photoUrl = (updates.photoUrl ?? current.photoUrl ?? '').trim().slice(0, 250000);
  let newHandle = current.handle;
  if (updates.handle !== undefined) {
    const cleaned = sanitizeHandleInput(updates.handle);
    if (cleaned.length < 2) {
      throw new Error('Username handle must be at least 2 characters (letters, numbers, or underscores).');
    }
    newHandle = cleaned;
    if (newHandle !== current.handle) {
      const handleCheck = await getDoc(doc(db, 'userLookup', `handle_${newHandle}`));
      if (handleCheck.exists() && handleCheck.data()?.uid !== current.uid) {
        throw new Error(`Username @${newHandle} is already taken. Please choose another.`);
      }
    }
  }
  const theme = updates.theme ?? current.theme ?? 'system';
  const preferredCurrency: CurrencyCode = isSupportedCurrency(updates.preferredCurrency)
    ? updates.preferredCurrency
    : isSupportedCurrency(current.preferredCurrency)
      ? current.preferredCurrency
      : 'INR';
  const customTags = Array.from(
    new Set(
      (updates.customTags ?? current.customTags ?? [])
        .map(normalizeExpenseTag)
        .filter(Boolean)
    )
  ).slice(0, 40);

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', current.uid), {
    fullName,
    phone,
    upiId,
    photoUrl,
    handle: newHandle,
    theme,
    preferredCurrency,
    customTags,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'publicProfiles', current.uid), {
    displayName: fullName,
    handle: newHandle,
    photoUrl,
    upiId,
    updatedAt: serverTimestamp(),
  });

  const emailKey = `email_${await sha256Hex(current.email)}`;
  batch.update(doc(db, 'userLookup', emailKey), {
    displayName: fullName,
    handle: newHandle,
    photoUrl,
    updatedAt: serverTimestamp(),
  });

  if (newHandle !== current.handle) {
    batch.delete(doc(db, 'userLookup', `handle_${current.handle}`));
    batch.set(doc(db, 'userLookup', `handle_${newHandle}`), {
      uid: current.uid,
      displayName: fullName,
      handle: newHandle,
      photoUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(doc(db, 'userLookup', `handle_${newHandle}`), {
      displayName: fullName,
      handle: newHandle,
      photoUrl,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    const updatedSnap = await getDoc(doc(db, 'users', current.uid));
    const updated = updatedSnap.data() as UserPrivateProfile;
    publicProfileCache.set(current.uid, {
      uid: current.uid,
      displayName: updated.fullName,
      handle: updated.handle,
      photoUrl: updated.photoUrl,
      upiId: updated.upiId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${current.uid}`);
  }
}

export async function getPublicProfile(uid: string, forceRefresh = false): Promise<PublicProfile | null> {
  if (!forceRefresh && publicProfileCache.has(uid)) {
    return publicProfileCache.get(uid)!;
  }
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as PublicProfile;
    publicProfileCache.set(uid, data);
    return data;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `publicProfiles/${uid}`);
  }
}

export async function getPublicProfiles(uids: string[]): Promise<Record<string, PublicProfile>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const result: Record<string, PublicProfile> = {};
  await Promise.all(
    unique.map(async (uid) => {
      try {
        const profile = await getPublicProfile(uid);
        if (profile) result[uid] = profile;
      } catch {
        // Ignore single lookup failure gracefully
      }
    })
  );
  return result;
}

export async function findUserByEmailOrHandle(queryStr: string): Promise<{
  uid: string;
  displayName: string;
  handle: string;
  photoUrl?: string;
  createdAt: Timestamp;
} | null> {
  const trimmed = queryStr.trim().toLowerCase();
  if (!trimmed) return null;

  let lookupKey: string;
  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    lookupKey = `email_${await sha256Hex(trimmed)}`;
  } else {
    const cleanHandle = sanitizeHandleInput(trimmed);
    if (cleanHandle.length < 2) return null;
    lookupKey = `handle_${cleanHandle}`;
  }

  try {
    const snap = await getDoc(doc(db, 'userLookup', lookupKey));
    if (!snap.exists()) return null;
    return snap.data() as {
      uid: string;
      displayName: string;
      handle: string;
      photoUrl?: string;
      createdAt: Timestamp;
    };
  } catch (err) {
    logFirestoreError(err, OperationType.GET, `userLookup/${lookupKey}`);
    throw new Error('Could not search users right now. Please check your connection and try again.');
  }
}
