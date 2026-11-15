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

export const firebaseConfig: FirebaseConfig | null = {
  apiKey: 'AIzaSyAXLUW0CAAYFBugjpqa90R6XTwS0_bgOSI',
  authDomain: 'klavir-7c41e9.firebaseapp.com',
  projectId: 'klavir-7c41e9',
  appId: '1:898621727048:web:a973d36359ac8a82c0937d',
};
