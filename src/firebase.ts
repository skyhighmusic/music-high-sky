import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Standard Google sign-in provider (minimum scopes for workspace sign-in)
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Dedicated Google Drive read-only provider for authorized media import (never deletes or modifies Drive files)
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// Strictly in-memory Google Drive OAuth access token cache — NEVER persisted to localStorage or sessionStorage.
let driveAccessTokenMemory: string | null = null;
let driveTokenExpiresAt = 0;
const driveTokenListeners = new Set<(connected: boolean) => void>();

function notifyDriveTokenListeners() {
  const connected = hasActiveDriveAccessToken();
  driveTokenListeners.forEach((cb) => cb(connected));
}

// Automatically clear in-memory Drive OAuth token whenever the user signs out.
onAuthStateChanged(auth, (fbUser) => {
  if (!fbUser) {
    clearDriveAccessToken();
  }
});

export function hasActiveDriveAccessToken(): boolean {
  return Boolean(driveAccessTokenMemory && Date.now() < driveTokenExpiresAt);
}

export function getDriveAccessToken(): string | null {
  if (!driveAccessTokenMemory) return null;
  if (Date.now() >= driveTokenExpiresAt) {
    driveAccessTokenMemory = null;
    driveTokenExpiresAt = 0;
    notifyDriveTokenListeners();
    return null;
  }
  return driveAccessTokenMemory;
}

export function clearDriveAccessToken(): void {
  driveAccessTokenMemory = null;
  driveTokenExpiresAt = 0;
  notifyDriveTokenListeners();
}

export function subscribeDriveConnection(listener: (connected: boolean) => void): () => void {
  driveTokenListeners.add(listener);
  return () => {
    driveTokenListeners.delete(listener);
  };
}

/**
 * Requests read-only Google Drive permission via Firebase GoogleAuthProvider popup
 * and caches the returned OAuth access token strictly in memory.
 */
export async function authorizeGoogleDriveReadOnly(): Promise<string> {
  const driveProvider = new GoogleAuthProvider();
  driveProvider.addScope(DRIVE_READONLY_SCOPE);
  driveProvider.setCustomParameters({ prompt: 'consent' });

  const result = await signInWithPopup(auth, driveProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) {
    throw new Error(
      'Google Drive access token was not returned. Please grant read-only Google Drive access in the Google prompt.'
    );
  }
  driveAccessTokenMemory = token;
  // Google OAuth access tokens typically remain valid ~55 minutes
  driveTokenExpiresAt = Date.now() + 50 * 60 * 1000;
  notifyDriveTokenListeners();
  return token;
}

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export { firebaseConfig };
