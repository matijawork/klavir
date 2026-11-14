/**
 * Firebase project of the app (ADR-011, ADR-017). These values are public by design: access is
 * limited by the security rules in `firestore.rules`, not by hiding them.
 * `null` = no project yet: the app works as before, everything stays on the device.
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export const firebaseConfig: FirebaseConfig | null = null;
