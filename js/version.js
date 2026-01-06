// ======= VERSION MODULE (Pv02.2 - Step 7) =======
// Single source of truth for version and build number
// Update this file every deploy to prevent PWA cache issues

/**
 * APP_VERSION: Semantic version
 * Format: "pv[major].[minor]"
 * Example: "pv02.2" means Phase 02, minor version 2
 *
 * INCREMENT when:
 * - Adding new features
 * - Changing gameplay mechanics
 * - Updating data schemas
 */
export const APP_VERSION = 'pv02.2';

/**
 * BUILD_NUMBER: Sequential build identifier
 * Format: Zero-padded 3-digit number
 * Example: "001", "002", "003", etc.
 *
 * INCREMENT every deploy:
 * - Even for tiny bug fixes
 * - Even for config-only changes
 * - Ensures cache busting works
 *
 * CRITICAL: Bump this before EVERY GitHub Pages deploy
 */
export const BUILD_NUMBER = '003';

/**
 * FULL_VERSION: Combined version string
 * Used in UI, logs, and service worker cache names
 */
export const FULL_VERSION = `${APP_VERSION}+build.${BUILD_NUMBER}`;

/**
 * Get version info object (for debug panel)
 */
export function getVersionInfo() {
  return {
    version: APP_VERSION,
    build: BUILD_NUMBER,
    full: FULL_VERSION,
    timestamp: document.lastModified || 'unknown'
  };
}
