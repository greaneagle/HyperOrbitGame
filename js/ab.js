// ======= A/B TESTING MODULE =======
// Handles permanent cohort assignment and experiment parameters

/**
 * Assign A/B cohort (50/50 split)
 * This should only be called ONCE per player, ever
 * Returns: 'A' or 'B'
 */
export function assignABGroup() {
  return Math.random() < 0.5 ? 'A' : 'B';
}

/**
 * Get A/B parameters based on cohort
 * SINGLE-KNOB RULE: Each experiment changes exactly ONE parameter
 *
 * Current experiment (Phase 1):
 * - criticalWindow: A=12s, B=14s
 *
 * @param {string} abGroup - 'A' or 'B'
 * @returns {object} experiment parameters
 */
export function getABParams(abGroup) {
  if (abGroup !== 'A' && abGroup !== 'B') {
    console.warn(`[A/B] Invalid group "${abGroup}", defaulting to A`);
    abGroup = 'A';
  }

  // Phase 1 experiment: Critical Window duration
  const params = {
    // Critical Orbit parameters
    criticalWindow: abGroup === 'A' ? 12 : 14,  // seconds

    // Everything else is IDENTICAL (no other differences!)
    // This ensures we can attribute metric changes to the single knob

    // Pressure parameters (Phase 1)
    pressureTimeRate: 0.08,      // pressure increase per second (base)
    pressureTapRate: 0.12,       // pressure increase per tap (base)
    criticalThreshold: 0.9,      // pressure level to enter critical (0..1)
    partialResetAmount: 0.4,     // pressure reduction on non-critical escape

    // Future knobs (for reference, but not active in Step 1)
    // ringSpeedMultiplier: 1.0,
    // gapWidthMultiplier: 1.0,
    // xpMultiplier: 1.0,
  };

  return params;
}

/**
 * Validate A/B group and ensure it's set
 * @param {object} playerData - player data object
 * @returns {string} - validated A/B group ('A' or 'B')
 */
export function ensureABGroup(playerData) {
  if (!playerData.abGroup) {
    // First time - assign cohort permanently
    playerData.abGroup = assignABGroup();
    console.log(`[A/B] Assigned to cohort: ${playerData.abGroup}`);
  } else {
    console.log(`[A/B] Existing cohort: ${playerData.abGroup}`);
  }

  return playerData.abGroup;
}

/**
 * Get experiment info (for debugging/telemetry)
 */
export function getExperimentInfo(abGroup) {
  const params = getABParams(abGroup);

  return {
    name: 'critical_window_12v14',
    cohort: abGroup,
    knob: 'criticalWindow',
    value: params.criticalWindow,
    allParams: params
  };
}
