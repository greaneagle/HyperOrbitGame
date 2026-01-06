// ======= ENVIRONMENT DETECTION MODULE =======
// Detects platform, standalone mode, and browser capabilities

/**
 * Detect platform based on user agent
 * Returns: 'ios', 'android', 'desktop', or 'unknown'
 */
export function detectPlatform() {
  const ua = navigator.userAgent || '';

  // iOS detection (iPhone, iPad, iPod)
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    return 'ios';
  }

  // Android detection
  if (/android/i.test(ua)) {
    return 'android';
  }

  // Desktop (Windows, Mac, Linux)
  if (/Windows|Macintosh|Linux/.test(ua)) {
    return 'desktop';
  }

  return 'unknown';
}

/**
 * Detect if app is running in standalone mode (installed PWA)
 * Uses both modern and legacy detection methods
 */
export function detectStandalone() {
  // Modern approach: display-mode media query
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // iOS Safari legacy detection
  if (window.navigator.standalone === true) {
    return true;
  }

  // Android/Chrome legacy detection
  if (document.referrer.includes('android-app://')) {
    return true;
  }

  return false;
}

/**
 * Check if device supports vibration (for haptic feedback)
 */
export function supportsVibration() {
  return 'vibrate' in navigator;
}

/**
 * Check if beforeinstallprompt is available (for install prompts)
 * iOS Safari doesn't support this - installation is manual via Share menu
 */
export function supportsInstallPrompt() {
  // This will be set by the beforeinstallprompt event
  // For now, we just check if it's likely to be supported
  const platform = detectPlatform();
  return platform === 'android' || platform === 'desktop';
}

/**
 * Get full environment info
 */
export function getEnvInfo() {
  const platform = detectPlatform();
  const isStandalone = detectStandalone();

  return {
    platform,
    isStandalone,
    supportsVibration: supportsVibration(),
    supportsInstallPrompt: supportsInstallPrompt(),
    userAgent: navigator.userAgent
  };
}

/**
 * Log environment info (useful for debugging)
 */
export function logEnvInfo() {
  const env = getEnvInfo();
  console.log('[Environment]', env);
  return env;
}
