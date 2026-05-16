import * as admin from 'firebase-admin';

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID env var is required');
  admin.initializeApp({ projectId });
  initialized = true;
}

export async function validateToken(token: string): Promise<{ uid: string; displayName?: string; photoURL?: string } | null> {
  try {
    ensureInitialized();
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      displayName: decoded.name as string | undefined,
      photoURL: decoded.picture as string | undefined,
    };
  } catch {
    return null;
  }
}
