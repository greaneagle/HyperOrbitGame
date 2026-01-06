// ======= PWA MODULE (Pv02.2 - Step 5 + Step 6) =======
// Handles service worker registration, install prompts, and update notifications

import { savePlayerData } from './storage.js';
import * as telemetry from './telemetry.js';

// ======= SERVICE WORKER REGISTRATION =======

let swRegistration = null;
let deferredInstallPrompt = null;

/**
 * Register service worker
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return null;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', {
      scope: './'
    });

    console.log('[PWA] Service worker registered:', swRegistration.scope);

    // Check for updates on load
    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration.installing;
      console.log('[PWA] New service worker found, installing...');

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[PWA] New service worker installed, update available');
          showUpdateNotification();
        }
      });
    });

    return swRegistration;
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Show update notification
 * Step 7: User-facing update nudge for standalone mode
 */
function showUpdateNotification() {
  console.log('[PWA] New version available! Reload to update.');

  // Only show UI prompt in standalone mode (avoid confusing browser users)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;

  if (!isStandalone) {
    console.log('[PWA] Not in standalone mode, skipping update prompt');
    return;
  }

  // Show update toast
  const updateToast = document.getElementById('updateToast');
  if (updateToast) {
    updateToast.classList.add('show');

    // Click to reload
    const handleClick = () => {
      window.location.reload();
    };
    updateToast.addEventListener('click', handleClick, { once: true });

    // Auto-hide after 10 seconds
    setTimeout(() => {
      updateToast.classList.remove('show');
      updateToast.removeEventListener('click', handleClick);
    }, 10000);
  }
}

// ======= INSTALL PROMPT LOGIC =======

/**
 * Initialize install prompt listeners
 */
export function initInstallPrompt(playerData) {
  // Capture beforeinstallprompt event (Android/Desktop Chrome/Edge)
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] beforeinstallprompt event captured');

    // Prevent automatic prompt
    e.preventDefault();

    // Store for later use
    deferredInstallPrompt = e;

    // Update player data that install is available
    if (!playerData.env.installPromptAvailable) {
      playerData.env.installPromptAvailable = true;
      savePlayerData(playerData);
    }
  });

  // Track successful install (Android/Desktop)
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App successfully installed');

    // Step 6: Log install accepted event
    telemetry.log('install_accepted', {
      platform: playerData.env.platform
    });

    // Update player data
    playerData.env.pwaInstalled = true;
    playerData.env.installPromptShown = (playerData.env.installPromptShown || 0);
    savePlayerData(playerData);

    // Clear deferred prompt
    deferredInstallPrompt = null;
  });
}

/**
 * Check if install should be offered based on triggers
 * Triggers: new best, 10 runs, sprint completion, or daily streak
 */
export function checkInstallTriggers(playerData, trigger) {
  // Don't show if already installed
  if (playerData.env.pwaInstalled || playerData.env.isStandalone) {
    return false;
  }

  // Limit frequency: max 3 times shown, or once per week
  const shownCount = playerData.env.installPromptShown || 0;
  const lastShown = playerData.env.installPromptLastShown || 0;
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  if (shownCount >= 3) {
    return false; // Max 3 times lifetime
  }

  if (now - lastShown < oneWeek) {
    return false; // Wait at least 1 week between prompts
  }

  // Check triggers
  const validTriggers = [
    'new_best',
    'total_runs_10',
    'sprint_complete',
    'daily_streak_3'
  ];

  return validTriggers.includes(trigger);
}

/**
 * Show appropriate install prompt based on platform
 */
export function showInstallPrompt(playerData, platform) {
  const isIOS = platform === 'ios';

  if (isIOS) {
    // iOS: show education sheet
    showIOSInstallSheet();
  } else if (deferredInstallPrompt) {
    // Android/Desktop: show native prompt
    showAndroidInstallPrompt();
  } else {
    console.log('[PWA] Install prompt not available');
    return;
  }

  // Step 6: Log install prompt shown event
  telemetry.log('install_prompt_shown', {
    platform: platform
  });

  // Track that prompt was shown
  playerData.env.installPromptShown = (playerData.env.installPromptShown || 0) + 1;
  playerData.env.installPromptLastShown = Date.now();
  savePlayerData(playerData);
}

/**
 * Show Android/Desktop install prompt
 */
function showAndroidInstallPrompt() {
  const installPrompt = document.getElementById('installPrompt');
  const installPromptAccept = document.getElementById('installPromptAccept');
  const installPromptDecline = document.getElementById('installPromptDecline');
  const installPromptClose = document.getElementById('installPromptClose');

  if (!installPrompt) return;

  // Show prompt
  installPrompt.classList.add('show');

  // Handle accept
  const handleAccept = async () => {
    if (!deferredInstallPrompt) return;

    // Show native install dialog
    deferredInstallPrompt.prompt();

    // Wait for user choice
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] User choice:', outcome);

    // Clear prompt
    deferredInstallPrompt = null;
    installPrompt.classList.remove('show');

    // Cleanup listeners
    cleanup();
  };

  // Handle decline/close
  const handleDecline = () => {
    installPrompt.classList.remove('show');
    cleanup();
  };

  const cleanup = () => {
    installPromptAccept.removeEventListener('click', handleAccept);
    installPromptDecline.removeEventListener('click', handleDecline);
    installPromptClose.removeEventListener('click', handleDecline);
  };

  // Attach listeners
  installPromptAccept.addEventListener('click', handleAccept);
  installPromptDecline.addEventListener('click', handleDecline);
  installPromptClose.addEventListener('click', handleDecline);
}

/**
 * Show iOS install education sheet
 */
function showIOSInstallSheet() {
  const iosInstallSheet = document.getElementById('iosInstallSheet');
  const iosInstallDismiss = document.getElementById('iosInstallDismiss');
  const iosInstallClose = document.getElementById('iosInstallClose');

  if (!iosInstallSheet) return;

  // Show sheet
  iosInstallSheet.classList.add('show');

  // Handle dismiss/close
  const handleDismiss = () => {
    iosInstallSheet.classList.remove('show');
    cleanup();
  };

  const cleanup = () => {
    iosInstallDismiss.removeEventListener('click', handleDismiss);
    iosInstallClose.removeEventListener('click', handleDismiss);
  };

  // Attach listeners
  iosInstallDismiss.addEventListener('click', handleDismiss);
  iosInstallClose.addEventListener('click', handleDismiss);
}

/**
 * Check specific install triggers after run end
 */
export function checkPostRunInstallTriggers(playerData, runResult) {
  const platform = playerData.env.platform;

  // Trigger 1: New personal best
  if (runResult.isNewBest) {
    if (checkInstallTriggers(playerData, 'new_best')) {
      setTimeout(() => showInstallPrompt(playerData, platform), 2000);
    }
  }

  // Trigger 2: 10 total runs
  if (playerData.stats.totalRuns === 10) {
    if (checkInstallTriggers(playerData, 'total_runs_10')) {
      setTimeout(() => showInstallPrompt(playerData, platform), 2000);
    }
  }

  // Trigger 3: Sprint completion
  if (runResult.sprintComplete) {
    if (checkInstallTriggers(playerData, 'sprint_complete')) {
      setTimeout(() => showInstallPrompt(playerData, platform), 2000);
    }
  }

  // Trigger 4: Daily streak (day 3)
  if (playerData.stats.dailyStreak === 3) {
    if (checkInstallTriggers(playerData, 'daily_streak_3')) {
      setTimeout(() => showInstallPrompt(playerData, platform), 2000);
    }
  }
}
