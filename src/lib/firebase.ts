import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (err) {
    console.warn('Persistent local cache unavailable, falling back to default Firestore:', err);
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const storage = getStorage(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Could not set local auth persistence:', err);
});

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('email');
googleAuthProvider.addScope('profile');
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = logFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

export async function commitBatchOfflineAware(
  batch: WriteBatch,
  operationType: OperationType,
  path: string | null,
  onAfterCommit?: () => Promise<void>
): Promise<{ queuedOffline: boolean }> {
  const commitPromise = batch.commit();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    commitPromise
      .then(() => {
        if (onAfterCommit) {
          return onAfterCommit().catch(() => {});
        }
      })
      .catch((err) => {
        const info = logFirestoreError(err, operationType, path);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('tallycircle:sync-error', {
              detail: {
                message: `Queued offline change failed to sync: ${info.error}`,
              },
            })
          );
        }
      });
    return { queuedOffline: true };
  }

  try {
    await commitPromise;
  } catch (err) {
    handleFirestoreError(err, operationType, path);
  }

  if (onAfterCommit) {
    await onAfterCommit();
  }

  return { queuedOffline: false };
}

let connectionChecked = false;
export async function testConnection(): Promise<boolean> {
  if (connectionChecked) return true;
  connectionChecked = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase connection failed: the client is offline. Please verify configuration.');
      return false;
    }
    return true;
  }
}

void testConnection();
