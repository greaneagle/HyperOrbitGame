// ======= FIREBASE CONFIG & INITIALIZATION =======
// Step 6 (Phase 5): Firebase Analytics integration

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';

/**
 * Firebase configuration - PLACEHOLDERS for GitHub Actions injection
 */
export const firebaseConfig = {
  apiKey: "${FIREBASE_API_KEY}",
  authDomain: "${FIREBASE_AUTH_DOMAIN}",
  projectId: "${FIREBASE_PROJECT_ID}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${FIREBASE_APP_ID}",
  measurementId: "${FIREBASE_MEASUREMENT_ID}"
};

let firebaseApp = null;
let analytics = null;

/**
 * Initialize Firebase and Analytics
 */
export function initFirebase() {
  try {
    // Check if using placeholder config (GitHub Actions replaces these)
    if (firebaseConfig.apiKey === "${FIREBASE_API_KEY}") {
      console.warn('[Firebase] Using placeholder config - analytics will not send until deployed.');
      return null;
    }

    firebaseApp = initializeApp(firebaseConfig);
    console.log('[Firebase] App initialized');

    analytics = getAnalytics(firebaseApp);
    console.log('[Firebase] Analytics initialized');

    return analytics;
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error);
    return null;
  }
}

export function getAnalyticsInstance() {
  return analytics;
}
