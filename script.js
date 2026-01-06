// ======= PERFECT ORBIT V2 (Pv02.2) =======
// Step 1: Rock-Solid Architecture with modular structure

import { initPlayerData, savePlayerData, getVersion } from './js/storage.js';
import { getEnvInfo, logEnvInfo } from './js/env.js';
import { ensureABGroup, getABParams, getExperimentInfo } from './js/ab.js';
import * as telemetry from './js/telemetry.js';
import { MODES, getModeConfig, getTodayId, getDailyPattern, getDailyGapCenter, isNewDay } from './js/modes.js';
import { loadMissions, rollMissions, updateMissionProgress, formatMissionProgress } from './js/missions.js';
import { loadAchievements, processRunCompletion, getAllCosmetics, isCosmeticUnlocked, selectCosmetic, getProgressionStatus } from './js/progression.js';
// PWA imports disabled for now
// import { registerServiceWorker, initInstallPrompt, checkPostRunInstallTriggers, showInstallPrompt } from './js/pwa.js';
import { initDebugPanel } from './js/debug.js';

// ======= INITIALIZATION =======
// This runs BEFORE the game loop starts
let playerData = null;
let abParams = null;
let envInfo = null;
let missionTemplates = null;
let currentMode = 'endless'; // Current mode: 'endless', 'daily', 'sprint'
let dailyPattern = null; // Daily orbit pattern
let modesPlayedThisSession = new Set(); // Track modes played for "play_all_modes" mission

async function initApp() {
  console.log(`[App] Perfect Orbit ${getVersion()} - Initializing...`);

  // Step 1: Load/migrate playerData
  playerData = initPlayerData();

  // Step 2: Detect environment
  envInfo = logEnvInfo();

  // Step 3: Update player environment data
  playerData.env.platform = envInfo.platform;
  playerData.env.isStandalone = envInfo.isStandalone;
  savePlayerData(playerData);

  // Step 4: Ensure A/B cohort is assigned
  ensureABGroup(playerData);
  abParams = getABParams(playerData.abGroup);
  savePlayerData(playerData);

  // Step 5: Initialize telemetry (stub for now)
  telemetry.init({ debug: true });

  // Step 6: Set user properties (will be used in Phase 5)
  telemetry.setUserProps({
    ab_group: playerData.abGroup,
    platform: envInfo.platform,
    is_standalone: envInfo.isStandalone,
    pwa_installed: envInfo.isStandalone,
    player_level: playerData.level
  });

  // Step 7: Log experiment info
  const expInfo = getExperimentInfo(playerData.abGroup);
  console.log('[A/B Experiment]', expInfo);

  // Step 8: Load mission templates
  missionTemplates = await loadMissions();

  // Step 8b: Load achievements (Step 4)
  await loadAchievements();

  // Step 9: Check if new day for daily missions
  const todayId = getTodayId();
  if (isNewDay(playerData, todayId)) {
    console.log('[Missions] New day detected, rolling new missions');
    const rolled = rollMissions(missionTemplates, playerData.missions.cooldown);
    playerData.missions.active = rolled;
    playerData.missions.dateRolled = todayId;
    playerData.stats.lastDailyDate = todayId;
    savePlayerData(playerData);
  } else if (!playerData.missions.active || playerData.missions.active.length === 0) {
    // No missions yet, roll initial set
    console.log('[Missions] Rolling initial missions');
    const rolled = rollMissions(missionTemplates, playerData.missions.cooldown);
    playerData.missions.active = rolled;
    playerData.missions.dateRolled = todayId;
    savePlayerData(playerData);
  }

  // Step 10: Load daily pattern if needed
  dailyPattern = getDailyPattern(getVersion(), todayId);

  // Step 11: Register service worker (Step 5) - DISABLED FOR NOW
  // await registerServiceWorker();

  // Step 12: Initialize install prompt listeners (Step 5) - DISABLED FOR NOW
  // initInstallPrompt(playerData);

  // Step 13: Initialize debug panel (Step 7)
  initDebugPanel(playerData, envInfo);

  // Step 14: Log session start
  telemetry.logSessionStart(currentMode);

  console.log('[App] Initialization complete');
  console.log('[App] Current mode:', currentMode);
  console.log('[App] Active missions:', playerData.missions.active);
}

// Initialize immediately (await at top level)
await initApp();

// ======= GAME CODE (from original script.js) =======
// Wrapped in an IIFE to avoid polluting global scope
(() => {
  // ======= PALETTE =======
  const COL_BG   = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const COL_FG   = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
  const COL_GOOD = getComputedStyle(document.documentElement).getPropertyValue('--good').trim();

  // "Heat" hot color (used for UI + ball tint). This is an extra tint on purpose.
  const COL_HOT  = '#FF3B30';

  // ======= STEP 4: COSMETIC RENDERING =======

  /**
   * Get trail color based on selected cosmetic
   */
  function getTrailColor(trailId) {
    switch(trailId) {
      case 'sparkle': return '#FFD700'; // Gold
      case 'rainbow': return `hsl(${(Date.now() / 10) % 360}, 70%, 60%)`; // Animated rainbow
      case 'inferno': return '#FF4500'; // Red-orange
      case 'lightning': return '#00BFFF'; // Electric blue
      case 'neon': return '#00FF88'; // Neon green
      case 'cosmic': return '#9400D3'; // Purple
      default: return COL_GOOD; // Default green
    }
  }

  /**
   * Get theme colors based on selected cosmetic
   */
  function getThemeColors(themeId) {
    switch(themeId) {
      case 'neon':
        return {
          bg: '#0A0A15',
          fg: '#00FFFF',
          good: '#FF00FF'
        };
      case 'sunset':
        return {
          bg: '#1A0F1F',
          fg: '#FFB74D',
          good: '#FF6B9D'
        };
      case 'midnight':
        return {
          bg: '#000814',
          fg: '#B8C5D6',
          good: '#4CC9F0'
        };
      case 'ocean':
        return {
          bg: '#001F3F',
          fg: '#7FDBFF',
          good: '#39CCCC'
        };
      default:
        return {
          bg: COL_BG,
          fg: COL_FG,
          good: COL_GOOD
        };
    }
  }

  /**
   * Apply theme colors to canvas (called once per frame)
   */
  function applyTheme() {
    const theme = getThemeColors(playerData.cosmetics.themeId);
    // We'll use these in the draw function
    return theme;
  }

  // ======= SPEED CONFIGURATION =======
  // Ball orbit speed
  const BALL_SPEED_BASE_NORMAL = 1.15;      // Base speed in normal mode
  const BALL_SPEED_BASE_EXPERT = 1.45;      // Base speed in expert mode
  const BALL_SPEED_INCREASE_NORMAL = 0.018; // Speed increase per score in normal mode
  const BALL_SPEED_INCREASE_EXPERT = 0.025; // Speed increase per score in expert mode
  const BALL_SPEED_MAX = 3.5;               // Maximum ball orbit speed cap

  // Ring rotation speed
  const RING_SPEED_MIN = 0.40;              // Minimum ring rotation speed
  const RING_SPEED_MAX_NORMAL = 1.05;       // Maximum initial ring speed (normal mode)
  const RING_SPEED_MAX_EXPERT = 1.35;       // Maximum initial ring speed (expert mode)
  const RING_SPEED_INCREASE = 0.06;         // Speed multiplier increase per ring index
  const RING_SPEED_ABSOLUTE_MAX = 3.0;      // Absolute maximum ring rotation speed cap

  // ======= CANVAS SETUP =======
  const state = {
    cx: 0, cy: 0,

    escaped: 0,
    rings: new Map(),

    ballAngle: 0,
    ballDir: 1,
    orbitSpeed: 0,

    score: 0,
    chain: 1,
    chainTimer: 0,
    timeSinceLastEscape: 999,  // Track time since last escape for chaining

    // PHASE 1: Pressure system (replaces heat)
    pressure: 0, // 0..1
    criticalActive: false,
    criticalStartTime: 0,
    criticalElapsed: 0,
    criticalWindow: 0, // Set from A/B params

    // Perfect streak (kept from your working build)
    perfectStreak: 0,
    bestPerfectStreak: 0,

    timeInRing: 0,
    maxRingTime: 8.0,

    shake: 0,
    particles: [],
    scorePops: [],

    // Multi-ring escape animation
    pendingEscapes: [],
    escapeTweenProgress: 0,
    escapeTweenDuration: 0,
    escapeTargetEscaped: 0,
    ballTweenRadius: 0,
    ringGlows: new Map(),

    // Layout (screen-space)
    R_inner: 0,
    gapPx: 0,
    baseThickness: 0,
    ballRadius: 0,

    // Run tracking (for telemetry)
    runStartTime: 0,
    runStats: {
      maxChain: 1,
      criticalEntries: 0,
      criticalEscapes: 0
    },

    // Tap tracking (for pressure spam detection)
    lastTapTime: 0,
    tapsInWindow: [],

    // PHASE 2: Mode-specific state
    mode: 'endless', // Current run mode
    sprintCompleted: false, // Sprint completion flag
    dailyCompleted: false // Daily completion flag
  };

  const WINDOW = {
    PAST: 2,     // was 3
    FUTURE: 4,   // was 5
    focus: 0
  };

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.floor(innerWidth);
    H = Math.floor(innerHeight);
    canvas.width  = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    setLayoutConstants(); // keep layout responsive
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  // ======= UI =======
  const elScore = document.getElementById('score');
  const elBest  = document.getElementById('best');
  const elChain = document.getElementById('chain');
  const elHeatFill = document.getElementById('heatFill');
  const elHeatText = document.getElementById('heatText');
  const centerMsg = document.getElementById('centerMsg');
  const btnStart = document.getElementById('btnStart');
  const btnExpert = document.getElementById('btnExpert');
  // const btnReset = document.getElementById('btnReset'); // Removed - button doesn't exist
  const goodFlash = document.getElementById('goodFlash');
  const darkOverlay = document.getElementById('darkOverlay');
  const criticalMsg = document.getElementById('criticalMsg');
  const onboardingHint = document.getElementById('onboardingHint');
  const hintTitle = document.getElementById('hintTitle');
  const hintText = document.getElementById('hintText');
  const hintDismiss = document.getElementById('hintDismiss');
  const achievementHintName = document.getElementById('achievementHintName');
  const achievementHintDesc = document.getElementById('achievementHintDesc');
  const achievementHintProgress = document.getElementById('achievementHintProgress');
  const achievementToast = document.getElementById('achievementToast');
  const achievementToastTitle = document.getElementById('achievementToastTitle');
  const achievementToastXp = document.getElementById('achievementToastXp');

  // Track achievements unlocked during current run
  let runAchievements = [];

  // Use playerData instead of localStorage directly
  let best = playerData.bestScore.endless;
  let expert = playerData.settings.expert;
  elBest.textContent = best;
  btnExpert.textContent = `Expert: ${expert ? 'On' : 'Off'}`;

  btnExpert.addEventListener('click', () => {
    expert = !expert;
    playerData.settings.expert = expert;
    savePlayerData(playerData);
    btnExpert.textContent = `Expert: ${expert ? 'On' : 'Off'}`;
  });

  // Reset button removed - not needed in UI
  // btnReset.addEventListener('click', () => {
  //   best = 0;
  //   playerData.bestScore.endless = 0;
  //   savePlayerData(playerData);
  //   elBest.textContent = '0';
  // });

  // ======= MODE SELECTOR UI =======
  const modeButtons = {
    endless: document.getElementById('modeEndless'),
    daily: document.getElementById('modeDaily'),
    sprint: document.getElementById('modeSprint')
  };
  const modeBestLabels = {
    endless: document.getElementById('bestEndless'),
    daily: document.getElementById('bestDaily'),
    sprint: document.getElementById('bestSprint')
  };

  // Initialize mode best scores display
  function updateModeBestScores() {
    modeBestLabels.endless.textContent = `Best: ${playerData.bestScore.endless}`;
    modeBestLabels.daily.textContent = `Best: ${playerData.bestScore.daily}`;
    if (playerData.bestScore.sprint > 0) {
      const seconds = (playerData.bestScore.sprint / 1000).toFixed(1);
      modeBestLabels.sprint.textContent = `Best: ${seconds}s`;
    } else {
      modeBestLabels.sprint.textContent = 'Best: --';
    }
  }
  updateModeBestScores();

  // Mode selection handler
  function selectMode(mode) {
    if (running) {
      // If mid-run, ask for confirmation
      if (!confirm('End current run and switch mode?')) {
        return;
      }
      endGame('mode_switch');
    }

    currentMode = mode;

    // Update active button
    Object.keys(modeButtons).forEach(m => {
      modeButtons[m].classList.toggle('active', m === mode);
    });

    // Update best score display
    const modeConfig = getModeConfig(mode);
    if (modeConfig.scoreType === 'rings') {
      best = playerData.bestScore[mode];
      elBest.textContent = best;
    } else if (modeConfig.scoreType === 'time') {
      if (playerData.bestScore[mode] > 0) {
        const seconds = (playerData.bestScore[mode] / 1000).toFixed(1);
        elBest.textContent = `${seconds}s`;
      } else {
        elBest.textContent = '--';
      }
    }

    // Step 6: Log mode selected event
    telemetry.logModeSelected(mode);

    console.log(`[Mode] Selected: ${mode}`);
  }

  // Attach mode button listeners
  Object.keys(modeButtons).forEach(mode => {
    modeButtons[mode].addEventListener('click', () => selectMode(mode));
  });

  // ======= MISSION UI =======
  const missionPanel = document.getElementById('missionPanel');
  const missionList = document.getElementById('missionList');
  const missionToast = document.getElementById('missionToast');

  function updateMissionDisplay() {
    if (!playerData.missions.active || playerData.missions.active.length === 0) {
      missionPanel.classList.remove('show');
      return;
    }

    missionList.innerHTML = '';
    playerData.missions.active.forEach(mission => {
      const item = document.createElement('div');
      item.className = `missionItem ${mission.completed ? 'completed' : ''}`;

      const progress = Math.min(100, Math.round((mission.progress / mission.target) * 100));

      item.innerHTML = `
        <div class="missionName">${mission.name}</div>
        <div class="missionDesc">${mission.desc}</div>
        <div class="missionProgressBar">
          <div class="missionProgressFill" style="width: ${progress}%"></div>
        </div>
        <div class="missionReward">+${mission.reward} XP</div>
      `;

      missionList.appendChild(item);
    });
  }

  function showMissionToast(mission) {
    missionToast.textContent = `✓ ${mission.name} (+${mission.reward} XP)`;
    missionToast.classList.add('show');

    setTimeout(() => {
      missionToast.classList.remove('show');
    }, 3000);
  }

  // Show mission panel during gameplay
  function showMissionPanel() {
    updateMissionDisplay();
    missionPanel.classList.add('show');
  }

  function hideMissionPanel() {
    missionPanel.classList.remove('show');
  }

  // ======= ONBOARDING HINTS =======
  // Phase 1: Agency-first, milestone-triggered, non-blocking hints
  const HINTS = {
    first_escape: {
      title: "Nice Escape!",
      text: "Tap to reverse direction and align with gaps. Perfect timing creates rhythm!",
      shown: false
    },
    first_chain: {
      title: "Chain Bonus!",
      text: "Multiple aligned rings = instant chain escape. Look ahead to maximize combos!",
      shown: false
    },
    first_critical: {
      title: "Critical Orbit!",
      text: "Pressure builds over time. When it hits Critical, escape quickly or you'll fail. Critical escapes reset all pressure!",
      shown: false
    }
  };

  let currentHintTimeout = null;

  function showHint(hintKey) {
    if (!HINTS[hintKey] || HINTS[hintKey].shown) return;
    if (playerData.stats.totalRuns > 5) return; // Only show hints in first 5 runs

    const hint = HINTS[hintKey];
    hintTitle.textContent = hint.title;
    hintText.textContent = hint.text;
    onboardingHint.classList.add('show');
    HINTS[hintKey].shown = true;

    // Auto-hide after 5 seconds
    if (currentHintTimeout) clearTimeout(currentHintTimeout);
    currentHintTimeout = setTimeout(() => {
      onboardingHint.classList.remove('show');
    }, 5000);
  }

  function hideHint() {
    onboardingHint.classList.remove('show');
    if (currentHintTimeout) {
      clearTimeout(currentHintTimeout);
      currentHintTimeout = null;
    }
  }

  hintDismiss.addEventListener('click', hideHint);

  // ======= STEP 4: RUN SUMMARY & LOCKER UI =======

  /**
   * Display run summary with XP, level progress, and unlocks
   */
  function displayRunSummary(progressionResult) {
    const runSummary = document.getElementById('runSummary');
    const xpEarned = document.getElementById('xpEarned');
    const xpBreakdown = document.getElementById('xpBreakdown');
    const summaryProgressFill = document.getElementById('summaryProgressFill');
    const summaryLevel = document.getElementById('summaryLevel');
    const summaryXpPercent = document.getElementById('summaryXpPercent');
    const unlockNotice = document.getElementById('unlockNotice');

    // Show XP earned
    xpEarned.textContent = progressionResult.xp.earned;

    // Show XP breakdown
    const breakdown = progressionResult.xp.breakdown;
    let breakdownText = [];
    if (breakdown.base > 0) breakdownText.push(`Rings: ${breakdown.base}`);
    if (breakdown.chain > 0) breakdownText.push(`Chain: ${breakdown.chain}`);
    if (breakdown.critical > 0) breakdownText.push(`Critical: ${breakdown.critical}`);
    if (breakdown.modeBonus > 0) breakdownText.push(`Mode Bonus: ${breakdown.modeBonus}`);
    if (breakdown.missions > 0) breakdownText.push(`Missions: ${breakdown.missions}`);
    if (breakdown.achievements > 0) breakdownText.push(`Achievements: ${breakdown.achievements}`);
    xpBreakdown.innerHTML = breakdownText.join(' • ');

    // Show level progress
    const status = getProgressionStatus(playerData);
    summaryLevel.textContent = status.level;
    summaryXpPercent.textContent = status.xpPercent;
    summaryProgressFill.style.width = (status.xpProgress * 100) + '%';

    // Show unlocks if any
    const allUnlocks = [
      ...progressionResult.level.unlocks,
      ...progressionResult.achievements
    ];

    if (allUnlocks.length > 0) {
      let unlockText = [];

      // Level-ups
      if (progressionResult.level.levelsGained.length > 0) {
        unlockText.push(`🎉 Level ${progressionResult.level.newLevel}!`);
      }

      // New unlocks
      for (const unlock of progressionResult.level.unlocks) {
        unlockText.push(`Unlocked: ${unlock.name}`);
      }

      // Achievements (from both mid-run and end-of-run checks)
      const allAchievements = [...new Set([...runAchievements, ...progressionResult.achievements])];
      for (const achievement of allAchievements) {
        unlockText.push(`🏆 ${achievement.name} (+${achievement.reward.xp} XP)`);
      }

      unlockNotice.innerHTML = unlockText.join('<br/>');
      unlockNotice.style.display = 'block';
    } else {
      unlockNotice.style.display = 'none';
    }

    runSummary.style.display = 'block';
  }

  // ======= LOCKER UI =======
  const lockerPanel = document.getElementById('lockerPanel');
  const lockerClose = document.getElementById('lockerClose');
  const btnLocker = document.getElementById('btnLocker');
  const lockerTabContent = document.getElementById('lockerTabContent');

  let currentLockerTab = 'trails';

  function openLocker() {
    lockerPanel.classList.add('show');
    updateLockerProgress();
    renderLockerTab(currentLockerTab);
  }

  function closeLocker() {
    lockerPanel.classList.remove('show');
  }

  function updateLockerProgress() {
    const status = getProgressionStatus(playerData);
    document.getElementById('lockerLevel').textContent = status.level;
    document.getElementById('lockerXp').textContent = playerData.xp;
    document.getElementById('lockerXpNeeded').textContent = status.xpNeeded;
    document.getElementById('lockerXpFill').style.width = (status.xpProgress * 100) + '%';
  }

  function renderLockerTab(tab) {
    currentLockerTab = tab;

    // Update active tab
    document.querySelectorAll('.lockerTab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    if (tab === 'trails') {
      renderCosmeticsTab('trails');
    } else if (tab === 'themes') {
      renderCosmeticsTab('themes');
    } else if (tab === 'badges') {
      renderBadgesTab();
    }
  }

  function renderCosmeticsTab(type) {
    const cosmetics = getAllCosmetics();
    const items = cosmetics[type];
    const selectedId = playerData.cosmetics[type === 'trails' ? 'trailId' : 'themeId'];

    let html = '<div class="cosmeticGrid">';

    for (const item of items) {
      const unlocked = isCosmeticUnlocked(playerData, type, item.id);
      const selected = item.id === selectedId;
      const lockedClass = unlocked ? '' : 'locked';
      const selectedClass = selected ? 'selected' : '';

      let unlockText = '';
      if (!unlocked) {
        if (item.unlockType === 'level') {
          unlockText = `Level ${item.unlockValue}`;
        } else if (item.unlockType === 'achievement') {
          unlockText = 'Achievement';
        }
      } else if (selected) {
        unlockText = 'Equipped';
      }

      const emoji = type === 'trails' ? '✨' : '🎨';

      html += `
        <div class="cosmeticItem ${lockedClass} ${selectedClass}" data-type="${type}" data-id="${item.id}">
          <div class="cosmeticPreview">${emoji}</div>
          <div class="cosmeticName">${item.name}</div>
          <div class="cosmeticUnlock">${unlockText}</div>
        </div>
      `;
    }

    html += '</div>';
    lockerTabContent.innerHTML = html;

    // Attach click handlers
    lockerTabContent.querySelectorAll('.cosmeticItem').forEach(el => {
      el.addEventListener('click', () => {
        const itemType = el.dataset.type;
        const itemId = el.dataset.id;
        if (!el.classList.contains('locked')) {
          selectCosmetic(playerData, itemType === 'trails' ? 'trail' : 'theme', itemId);
          renderCosmeticsTab(type); // Re-render to update selection
        }
      });
    });
  }

  async function renderBadgesTab() {
    const achievements = await loadAchievements();

    let html = '<div class="badgeGrid">';

    for (const achievement of achievements) {
      const unlocked = playerData.unlocks.achievements.includes(achievement.id);
      const unlockedClass = unlocked ? 'unlocked' : 'locked';
      const icon = unlocked ? '🏆' : '🔒';

      html += `
        <div class="badgeItem ${unlockedClass}">
          <div class="badgeIcon">${icon}</div>
          <div class="badgeName">${achievement.name}</div>
          <div class="badgeDesc">${achievement.desc}</div>
        </div>
      `;
    }

    html += '</div>';
    lockerTabContent.innerHTML = html;
  }

  // ======= ACHIEVEMENT SYSTEM =======

  /**
   * Show achievement unlock toast (mid-run)
   */
  function showAchievementToast(achievement) {
    achievementToastTitle.textContent = achievement.name;
    achievementToastXp.textContent = `+${achievement.reward.xp} XP`;
    achievementToast.classList.add('show');

    // Flash good effect
    flashGood();

    // Animate the achievement hint area
    const achievementHint = document.getElementById('achievementHint');
    achievementHint.classList.add('completed');
    setTimeout(() => {
      achievementHint.classList.remove('completed');
    }, 600);

    // Add floating XP number from achievement hint location
    const hintRect = achievementHint.getBoundingClientRect();
    state.scorePops.push({
      x: hintRect.left + hintRect.width / 2,
      y: hintRect.top + hintRect.height / 2,
      val: `+${achievement.reward.xp} XP`,
      life: 1.5,
      vy: -80,
      isXP: true
    });

    // Hide toast after 3 seconds
    setTimeout(() => {
      achievementToast.classList.remove('show');
    }, 3000);
  }

  /**
   * Check for achievements mid-run and show immediate feedback
   */
  async function checkMidRunAchievements() {
    if (!running) return;

    const newAchievements = checkAchievements(playerData, {
      rings: state.score,
      maxChain: state.runStats.maxChain,
      criticalEscapes: state.runStats.criticalEscapes,
      max_chain: state.runStats.maxChain,
      critical_escapes: state.runStats.criticalEscapes
    });

    // Show toast for any new achievements
    for (const achievement of newAchievements) {
      runAchievements.push(achievement);
      showAchievementToast(achievement);
      updateAchievementHint(); // Update the hint to show next achievement
      savePlayerData(playerData); // Save immediately
    }
  }

  // ======= ACHIEVEMENT HINT (Bottom Right) =======
  async function updateAchievementHint() {
    const achievements = await loadAchievements();

    // Find first unfinished achievement
    let nextAchievement = null;
    let progressText = '';

    for (const achievement of achievements) {
      if (!playerData.unlocks.achievements.includes(achievement.id)) {
        nextAchievement = achievement;

        // Calculate progress based on achievement type
        let current = 0;
        let target = achievement.threshold;

        switch (achievement.type) {
          case 'rings':
            current = state.score || 0;
            progressText = `${current} / ${target} rings`;
            break;
          case 'bestScore':
            const maxBest = Math.max(
              playerData.bestScore.endless,
              playerData.bestScore.daily,
              playerData.bestScore.sprint || 0
            );
            current = maxBest;
            progressText = `Best: ${current} / ${target}`;
            break;
          case 'maxChain':
            current = state.runStats?.maxChain || state.chain || 1;
            progressText = `Chain: x${current} / x${target}`;
            break;
          case 'criticalEscapes':
            current = state.runStats?.criticalEscapes || 0;
            progressText = `${current} / ${target} critical escapes`;
            break;
          case 'sprintComplete':
            progressText = 'Complete Sprint 30';
            break;
          case 'sprintTime':
            progressText = 'Complete Sprint 30 < 90s';
            break;
          case 'dailyStreak':
            current = playerData.stats.dailyStreak || 0;
            progressText = `${current} / ${target} days`;
            break;
          case 'level':
            current = playerData.level;
            progressText = `Level ${current} / ${target}`;
            break;
          case 'totalRuns':
            current = playerData.stats.totalRuns;
            progressText = `${current} / ${target} runs`;
            break;
          default:
            progressText = achievement.desc;
        }

        break; // Only show first unfinished
      }
    }

    if (nextAchievement) {
      achievementHintName.textContent = `🏆 ${nextAchievement.name}`;
      achievementHintDesc.textContent = nextAchievement.desc;
      achievementHintProgress.textContent = progressText;
    } else {
      achievementHintName.textContent = '🎉 All Complete!';
      achievementHintDesc.textContent = 'You unlocked everything!';
      achievementHintProgress.textContent = '';
    }
  }

  // Initialize achievement hint
  updateAchievementHint();

  // Locker event listeners
  btnLocker.addEventListener('click', openLocker);
  lockerClose.addEventListener('click', closeLocker);

  document.querySelectorAll('.lockerTab').forEach(tab => {
    tab.addEventListener('click', () => {
      renderLockerTab(tab.dataset.tab);
    });
  });

  // Install button - DISABLED FOR NOW
  // const btnInstall = document.getElementById('btnInstall');
  // if (btnInstall) {
  //   btnInstall.addEventListener('click', () => {
  //     showInstallPrompt(playerData, playerData.env.platform);
  //   });
  //
  //   // Show button if install is available and not already installed
  //   if (playerData.env.installPromptAvailable && !playerData.env.pwaInstalled && !playerData.env.isStandalone) {
  //     btnInstall.style.display = 'inline-block';
  //   }
  // }

  // ======= HELPERS =======
  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function lerp(a,b,t){ return a + (b-a)*t; }

  function angNorm(a){
    a %= (Math.PI*2);
    if (a < -Math.PI) a += Math.PI*2;
    if (a >  Math.PI) a -= Math.PI*2;
    return a;
  }
  function angDiff(a,b){ return angNorm(a-b); }

  function flashGood(){
    goodFlash.style.transition = 'none';
    goodFlash.style.opacity = '0.18';
    requestAnimationFrame(() => {
      goodFlash.style.transition = 'opacity 220ms ease';
      goodFlash.style.opacity = '0';
    });
  }

  // --- color utils (robust enough for #RRGGBB / rgb()) ---
  function parseToRGB(c){
    c = (c || '#E6E6E6').trim();
    if(c[0] === '#'){
      const hex = c.slice(1);
      if(hex.length === 6){
        return {
          r: parseInt(hex.slice(0,2), 16),
          g: parseInt(hex.slice(2,4), 16),
          b: parseInt(hex.slice(4,6), 16)
        };
      }
    }
    return {r:230,g:230,b:230};
  }

  const FG_RGB  = parseToRGB(COL_FG);
  const HOT_RGB = {r:255,g:59,b:48};

  function mixRGB(a,b,t){
    t = clamp(t,0,1);
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const b2= Math.round(lerp(a.b, b.b, t));
    return `rgb(${r},${g},${b2})`;
  }

  function heatColor(t){
    // start close to FG, end at HOT
    // (nonlinear makes it feel "calm" until mid heat, then ramps)
    const tt = t*t;
    return mixRGB(FG_RGB, HOT_RGB, tt);
  }

  // ======= RENDER WINDOW (LESS RINGS) =======
  function easeToward(curr, target, hz, dt){
    const a = 1 - Math.exp(-hz * dt);
    return curr + (target - curr) * a;
  }

  // ======= GAME STATE =======
  let running = false;
  let lastT = performance.now();

  // Don't render gameplay behind the start UI
  let renderEnabled = false;

  function setLayoutConstants(){
    const minDim = Math.min(W,H);
    const aspect = W / Math.max(1, H);

    // thicker + wider spacing
    const thickness = Math.max(7, Math.floor(minDim * 0.016));
    const gapPx = minDim * 0.072; // more spacing than before

    // Outer radius cap:
    // - Tall screens: let it grow but always fit (keep margins)
    // - Wide screens: keep it small so it doesn't dominate (roughly <= half-screen diameter)
    let outerCap;
    if(aspect >= 1.15){
      outerCap = minDim * 0.25; // wide: radius ~ 25% of minDim (diameter ~ 50%)
    } else if(aspect <= 0.90){
      outerCap = minDim * 0.46; // tall: big but still fits (with HUD padding)
    } else {
      outerCap = minDim * 0.38; // neutral
    }

    // Choose inner radius so the biggest (furthest) visible ring fits the cap
    // We render up to current + FUTURE, so outer ring index offset ~ FUTURE
    const minInner = minDim * 0.10;
    let R_inner = outerCap - WINDOW.FUTURE * gapPx;
    R_inner = Math.max(minInner, R_inner);

    state.gapPx = gapPx;
    state.R_inner = R_inner;
    state.baseThickness = thickness;
    state.ballRadius = Math.max(6, minDim * 0.013);
  }

  // ======= RINGS =======
  function ringParamsForIndex(i){
    // gap never shrinks (constant)
    const gapWidth = expert ? 0.42 : 0.56;

    // PHASE 2: Determine gap center based on mode
    let gapCenter;
    if (state.mode === 'daily' && dailyPattern) {
      // Daily mode: use deterministic pattern
      gapCenter = getDailyGapCenter(dailyPattern, i);
    } else {
      // Endless/Sprint: random
      gapCenter = rand(0, Math.PI * 2);
    }

    // difficulty from speed only
    const maxSpeed = expert ? RING_SPEED_MAX_EXPERT : RING_SPEED_MAX_NORMAL;
    const baseRotSpeed =
      (Math.random() < 0.5 ? -1 : 1) *
      rand(RING_SPEED_MIN, maxSpeed) *
      (1 + i * RING_SPEED_INCREASE);
    const rotSpeed = Math.min(Math.abs(baseRotSpeed), RING_SPEED_ABSOLUTE_MAX) * Math.sign(baseRotSpeed);

    const drift = rand(0.0, expert ? 0.085 : 0.055);

    // Obstacle logic: after ring 50, chance increases from 10% to 20% over 200 rings
    let hasObstacle = false;
    let obstacleAngle = 0;
    if(i >= 5){
      const progress = Math.min(1, (i - 50) / 200); // 0 at ring 50, 1 at ring 250
      const obstacleChance = 0.30 + progress * 0.40; // 10% to 20%
      if(Math.random() < obstacleChance){
        hasObstacle = true;
        // Place obstacle away from gap (at least 90 degrees away)
        const minSeparation = Math.PI / 2;
        const maxSeparation = Math.PI * 2 - gapWidth - minSeparation;
        obstacleAngle = rand(minSeparation, maxSeparation);
      }
    }

    // Reduce ring speed by 50% if it has an obstacle
    const finalRotSpeed = hasObstacle ? rotSpeed * 0.5 : rotSpeed;

    return { gapCenter, gapWidth, rotSpeed: finalRotSpeed, drift, hasObstacle, obstacleAngle };
  }

  function ensureRing(i){
    if(state.rings.has(i)) return;
    const { gapCenter, gapWidth, rotSpeed, drift, hasObstacle, obstacleAngle } = ringParamsForIndex(i);
    state.rings.set(i, {
      i,
      gapCenter,
      gapWidth,
      rotSpeed,
      drift,
      hasObstacle,
      obstacleAngle
    });
  }

  function pruneRings(){
    const start = Math.max(0, state.escaped - WINDOW.PAST);
    const end   = state.escaped + WINDOW.FUTURE;
    for(const k of state.rings.keys()){
      if(k < start || k > end) state.rings.delete(k);
    }
  }

  function ensureWindow(){
    const start = Math.max(0, state.escaped - WINDOW.PAST);
    const end   = state.escaped + WINDOW.FUTURE;
    for(let i=start;i<=end;i++) ensureRing(i);
    pruneRings();
  }

  function screenRadiusForIndex(i){
    return state.R_inner + (i - WINDOW.focus) * state.gapPx;
  }

  function effectiveGapWidth(r){
    return clamp(r.gapWidth, 0.08, 0.95);
  }

  // ======= FX =======
  function addParticles(x,y, n=16, size=2.2){
    for(let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2;
      const s = rand(90, 260);
      state.particles.push({
        x,y,
        vx: Math.cos(a)*s,
        vy: Math.sin(a)*s,
        life: rand(0.22,0.52),
        r: size * rand(0.85, 1.35)
      });
    }
  }

  // ======= UI / GAME FLOW =======
  function setPressureUI(){
    const pct = Math.round(state.pressure*100);
    elHeatFill.style.width = pct + '%';
    elHeatText.textContent = pct + '%';

    // Pressure becomes fiery as it approaches critical (bar color shifts with pressure)
    // Critical zone (>= 0.9) shows intense red
    const displayPressure = state.criticalActive ? 1.0 : state.pressure;
    elHeatFill.style.background = heatColor(displayPressure);

    // Critical state visual feedback
    if(state.criticalActive){
      elHeatFill.style.animation = 'pulse 0.5s ease-in-out infinite';
    } else {
      elHeatFill.style.animation = 'none';
    }
  }

  function resetGame(){
    state.cx = W/2;
    state.cy = H/2;

    state.rings.clear();
    state.escaped = 0;

    state.ballAngle = rand(0, Math.PI*2);
    state.ballDir = 1;

    state.score = 0;
    state.chain = 1;
    state.chainTimer = 0;
    state.timeSinceLastEscape = 999;

    // PHASE 1: Reset pressure system
    state.pressure = 0;
    state.criticalActive = false;
    state.criticalStartTime = 0;
    state.criticalElapsed = 0;
    state.criticalWindow = abParams.criticalWindow; // From A/B params

    state.perfectStreak = 0;
    state.bestPerfectStreak = 0;

    state.timeInRing = 0;
    state.maxRingTime = expert ? 6.0 : 7.5;

    state.shake = 0;
    state.particles.length = 0;
    state.scorePops.length = 0;

    state.pendingEscapes = [];
    state.escapeTweenProgress = 0;
    state.escapeTweenDuration = 0;
    state.escapeTargetEscaped = 0;
    state.ballTweenRadius = 0;
    state.ringGlows.clear();

    // PHASE 2: Set mode from global currentMode
    state.mode = currentMode;
    state.sprintCompleted = false;
    state.dailyCompleted = false;

    WINDOW.focus = 0;
    ensureWindow();

    elScore.textContent = '0';
    elChain.textContent = 'x1';
    setPressureUI();

    // Reset run tracking
    state.runStartTime = performance.now();
    state.runStats = {
      maxChain: 1,
      criticalEntries: 0,
      criticalEscapes: 0
    };

    // Reset tap tracking
    state.lastTapTime = 0;
    state.tapsInWindow = [];

    // Reset run achievements tracking
    runAchievements = [];
  }

  async function endGame(reason){
    running = false;
    darkOverlay.style.opacity = '0.7';
    centerMsg.style.display = 'block';
    criticalMsg.style.opacity = '0'; // Hide critical message
    hideMissionPanel(); // PHASE 2: Hide mission panel on game end

    let headline = 'Run Over';
    let line1 = `You escaped <b>${state.score}</b> rings.`;
    let tip = `Tap <b>Start</b> to try again — you can always do better.`;

    if(reason === 'pressure_fail'){
      headline = 'Critical Orbit Failed';
      line1 = `Pressure overwhelmed you after escaping <b>${state.score}</b> rings.`;
      tip = `<b>Tip:</b> Escape during Critical Orbit to reset pressure. Watch your timing!`;
    } else if(reason === 'burn'){
      headline = 'You Burned Up';
      line1 = `You <b>burned up</b> after escaping <b>${state.score}</b> rings.`;
    } else if(reason === 'time'){
      headline = 'Out of Time';
      line1 = `You <b>ran out of time</b> after escaping <b>${state.score}</b> rings.`;
    } else if(reason === 'obstacle'){
      headline = 'Hit Obstacle';
      line1 = `You <b>hit an obstacle</b> after escaping <b>${state.score}</b> rings.`;
    }

    const perfectLine = state.bestPerfectStreak > 0
      ? `<br/>Best Perfect: <b>x${state.bestPerfectStreak}</b>`
      : ``;

    document.querySelector('.title').textContent = headline;
    document.querySelector('.subtitle').innerHTML =
      `${line1}${perfectLine}<br/>${tip}`;

    // PHASE 2: Update best score per mode
    const modeConfig = getModeConfig(state.mode);
    if (modeConfig.scoreType === 'rings' && state.score > playerData.bestScore[state.mode]) {
      playerData.bestScore[state.mode] = state.score;
      // Update UI if we're in endless mode
      if (state.mode === 'endless') {
        best = state.score;
        elBest.textContent = String(best);
      }
    }

    // Update stats
    playerData.stats.totalRuns++;
    playerData.stats.totalRings += state.score;
    playerData.stats.deaths[reason] = (playerData.stats.deaths[reason] || 0) + 1;

    // PHASE 2: Update mission progress
    const runDuration = performance.now() - state.runStartTime;
    const completedMissions = updateMissionProgress(
      playerData.missions.active,
      'run_end',
      {
        mode: state.mode,
        rings: state.score,
        cause: reason,
        time_ms: Math.round(runDuration),
        critical_escapes: state.runStats.criticalEscapes
      }
    );

    // Show mission completion toast if any completed
    if (completedMissions.length > 0) {
      for (const mission of completedMissions) {
        showMissionToast(mission);
      }
      updateMissionDisplay();
    }

    // STEP 4: Process XP, level-ups, and achievements
    const progressionResult = await processRunCompletion(playerData, {
      rings: state.score,
      max_chain: state.runStats.maxChain,
      critical_escapes: state.runStats.criticalEscapes,
      time_ms: Math.round(runDuration),
      sprintWin: false,
      completedMissions
    });

    // Display run summary with XP
    displayRunSummary(progressionResult);

    // Update mode best scores display
    updateModeBestScores();

    // Save player data
    savePlayerData(playerData);

    // STEP 5: Check install triggers - DISABLED FOR NOW
    // const isNewBest = state.score > best && state.mode === 'endless';
    // checkPostRunInstallTriggers(playerData, {
    //   isNewBest,
    //   sprintComplete: false
    // });

    // Log run end
    telemetry.logRunEnd({
      mode: state.mode,
      rings: state.score,
      cause: reason,
      time_ms: Math.round(runDuration),
      max_chain: state.runStats.maxChain,
      critical_entries: state.runStats.criticalEntries,
      critical_escapes: state.runStats.criticalEscapes
    });
  }


  function start(){
    setLayoutConstants();
    resetGame();
    running = true;
    renderEnabled = true; // render gameplay only after click
    darkOverlay.style.opacity = '0';
    centerMsg.style.display = 'none';
    lastT = performance.now();

    // PHASE 2: Show mission panel during gameplay
    showMissionPanel();

    // PHASE 2: Log run start with current mode
    telemetry.logRunStart(state.mode);

    // PHASE 2: Update mission progress for mode participation
    modesPlayedThisSession.add(state.mode);
    const startMissions = updateMissionProgress(playerData.missions.active, 'run_start', { mode: state.mode });

    // Track modes played
    if (modesPlayedThisSession.size >= 3) {
      const modeMissions = updateMissionProgress(playerData.missions.active, 'modes_played_updated', { modesPlayed: 3 });
      if (modeMissions.length > 0) startMissions.push(...modeMissions);
    }

    // Show toasts for any missions completed on run start
    if (startMissions.length > 0) {
      for (const mission of startMissions) {
        showMissionToast(mission);
      }
      updateMissionDisplay();
    }
  }

  btnStart.addEventListener('click', () => {
    document.querySelector('.title').textContent = 'Perfect Orbit';
    document.querySelector('.subtitle').innerHTML =
      `Watch the gaps align. <b>Tap</b> to reverse orbit direction.<br/>
       If your angle matches the gap, the ball slips outward — sometimes through <b>multiple rings at once</b>.
       <br/><span style="opacity:.85">(Pressure builds over time. Escape during <b>Critical Orbit</b> to reset it!)</span>`;
    start();
  });

  // ======= INPUT =======
  function onTap(){
    if(!running) return;

    state.ballDir *= -1;

    // PHASE 1: Pressure system with spam detection
    const now = performance.now();
    const TAP_WINDOW = 1000; // 1 second window for spam detection

    // Clean old taps outside window
    state.tapsInWindow = state.tapsInWindow.filter(t => now - t < TAP_WINDOW);
    state.tapsInWindow.push(now);

    // Calculate spam multiplier (more taps = more pressure)
    const tapsInLastSecond = state.tapsInWindow.length;
    let spamMultiplier = 1.0;
    if(tapsInLastSecond > 3) {
      spamMultiplier = 1 + (tapsInLastSecond - 3) * 0.3; // +30% per tap over 3
    }

    // Add pressure (tap-based)
    const baseTapPressure = abParams.pressureTapRate;
    state.pressure = clamp(state.pressure + baseTapPressure * spamMultiplier, 0, 1);
    setPressureUI();

    state.shake = Math.min(12, state.shake + 6);
    state.lastTapTime = now;
  }

  addEventListener('pointerdown', (e) => {
    const t = e.target;
    if(t && t.classList && t.classList.contains('pill')) return;
    onTap();
  }, {passive:true});

  addEventListener('keydown', (e) => {
    if(e.code === 'Space' || e.code === 'Enter') onTap();
  });

  // ======= STEP =======
  function step(dt){
    ensureWindow();

    // PHASE 1: Pressure system
    // 1. Time-based pressure increase
    state.pressure = clamp(state.pressure + abParams.pressureTimeRate * dt, 0, 1);

    // 2. Natural pressure decay (slower than old heat)
    const pressureDecay = expert ? 0.08 : 0.06;
    state.pressure = clamp(state.pressure - pressureDecay * dt, 0, 1);

    // 3. Critical Orbit logic
    if(!state.criticalActive && state.pressure >= abParams.criticalThreshold){
      // Enter critical orbit
      state.criticalActive = true;
      state.criticalStartTime = performance.now();
      state.runStats.criticalEntries++;

      // Visual feedback
      state.shake = Math.min(20, state.shake + 12);
      criticalMsg.style.opacity = '1';
      console.log('[Critical] CRITICAL ORBIT ENTERED!');

      // Onboarding hint: first critical entry
      showHint('first_critical');
    }

    if(state.criticalActive){
      // Update elapsed time in critical
      state.criticalElapsed = (performance.now() - state.criticalStartTime) / 1000;

      // Check critical timeout (fail condition)
      if(state.criticalElapsed >= state.criticalWindow){
        criticalMsg.style.opacity = '0';
        endGame('pressure_fail');
        return;
      }
    }

    setPressureUI();

    // Orbit speed (IMPORTANT CHANGE):
    // Pressure HIGH => ball SLOW. Pressure LOW => ball FAST.
    const baseSpeed = expert ? BALL_SPEED_BASE_EXPERT : BALL_SPEED_BASE_NORMAL;
    const speedIncrease = expert ? BALL_SPEED_INCREASE_EXPERT : BALL_SPEED_INCREASE_NORMAL;
    const baseFast = Math.min(baseSpeed + state.score * speedIncrease, BALL_SPEED_MAX);
    const slowFactor = lerp(1.00, 0.45, state.pressure); // 0 pressure => 1x, 1 pressure => 0.45x
    state.orbitSpeed = baseFast * slowFactor;

    // Rotate rings (freeze during multi-ring animation)
    if(state.pendingEscapes.length === 0){
      for(const r of state.rings.values()){
        const drift = (Math.random()-0.5) * r.drift;
        r.gapCenter = (r.gapCenter + (r.rotSpeed + drift)*dt) % (Math.PI*2);
      }
    }

    // Ball angle
    state.ballAngle = (state.ballAngle + state.ballDir * state.orbitSpeed * dt) % (Math.PI*2);

    // Multi-ring escape animation
    if(state.pendingEscapes.length > 0){
      state.escapeTweenProgress = clamp(state.escapeTweenProgress + dt / state.escapeTweenDuration, 0, 1);

      // Interpolate ball radius
      const startR = screenRadiusForIndex(state.escaped);
      const endR = screenRadiusForIndex(state.escapeTargetEscaped);
      state.ballTweenRadius = lerp(startR, endR, state.escapeTweenProgress);

      // Update glows
      for(const [i, glow] of state.ringGlows){
        glow.fade *= (1 - 1.5 * dt);
        glow.hueOffset = (glow.hueOffset + 360 * dt) % 360;
      }

      // Spawn rainbow trail particles during animation
      if(Math.random() < 0.3){
        const bx = state.cx + Math.cos(state.ballAngle) * state.ballTweenRadius;
        const by = state.cy + Math.sin(state.ballAngle) * state.ballTweenRadius;

        // Slow global rainbow shift with variation
        const hue = (Date.now() / 15 + rand(-20, 20)) % 360;

        for(let i = 0; i < 3; i++){
          const a = Math.random() * Math.PI * 2;
          const s = rand(90, 260);
          state.particles.push({
            x: bx,
            y: by,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: rand(0.22, 0.52),
            r: 1.5 * rand(0.85, 1.35),
            hue: hue
          });
        }
      }

      // Complete animation
      if(state.escapeTweenProgress >= 1){
        // NOW advance state.escaped to match the target
        state.escaped = state.escapeTargetEscaped;
        state.pendingEscapes = [];
        state.escapeTweenProgress = 0;
        state.ballTweenRadius = 0;

        // Final burst
        const sr = screenRadiusForIndex(state.escaped);
        addParticles(
          state.cx + Math.cos(state.ballAngle)*sr,
          state.cy + Math.sin(state.ballAngle)*sr,
          40,
          3.5
        );

        ensureWindow();
      }
    }

    // Obstacle collision check
    const currentRing = state.rings.get(state.escaped);
    if(currentRing && currentRing.hasObstacle){
      // Triangle size: 75% of gap between rings
      const triangleSize = state.gapPx * 0.75;
      const triangleAngleWidth = triangleSize / screenRadiusForIndex(state.escaped);

      // Obstacle rotates with the ring
      const obstacleCurrentAngle = currentRing.gapCenter + currentRing.obstacleAngle;
      const obsDiff = Math.abs(angDiff(state.ballAngle, obstacleCurrentAngle));
      if(obsDiff <= triangleAngleWidth * 0.5){
        endGame('obstacle');
        return;
      }
    }

    // Track time since last escape for chain detection
    state.timeSinceLastEscape += dt;

    // Always increment timeInRing
    state.timeInRing += dt;

    const timeLimit = Math.max(2.6, state.maxRingTime - state.score*(expert ? 0.08 : 0.06));
    if(state.timeInRing > timeLimit){
      endGame('time');
      return;
    }

    // Chain timer
    state.chainTimer = Math.max(0, state.chainTimer - dt);
    if(state.chainTimer === 0) state.chain = 1;

    // Escape / chain (only skip if animating)
    if(state.pendingEscapes.length === 0){
      const timeLimit = Math.max(2.6, state.maxRingTime - state.score*(expert ? 0.08 : 0.06));

      // Spatial chain: raycast ahead for aligned rings
      const maxChainCheck = 6;  // Cap chain length
      const QUICK_ESCAPE_WINDOW = 0.5;  // Quick succession window for glow rewards (seconds)

      let alignedRings = [];

      // Check current ring and subsequent rings for alignment
      for(let i = 0; i < maxChainCheck; i++){
        const ringIndex = state.escaped + i;
        ensureRing(ringIndex);
        const r = state.rings.get(ringIndex);
        if(!r) break;

        const gw = effectiveGapWidth(r);
        const d = Math.abs(angDiff(state.ballAngle, r.gapCenter));

        // Check if ball is aligned with this ring's gap (exact alignment required)
        if(d <= gw / 2){
          alignedRings.push({index: ringIndex});
        } else {
          // First misaligned ring breaks the chain
          break;
        }
      }

      // Process escapes if any rings are aligned
      if(alignedRings.length > 0){
        let pending = alignedRings;
        let escapedThisFrame = alignedRings.length;

        // Check if this escape qualifies for quick succession glow BEFORE resetting timer
        const isQuickSuccession = (state.timeSinceLastEscape <= QUICK_ESCAPE_WINDOW);

        // Update perfect streak based on first ring timing
        const firstRingFrac = clamp(state.timeInRing / Math.max(0.0001, timeLimit), 0, 1);
        if(firstRingFrac <= 0.05){
          state.perfectStreak += 1;
        } else {
          state.perfectStreak = 0;
        }
        state.bestPerfectStreak = Math.max(state.bestPerfectStreak, state.perfectStreak);

        // PHASE 1: Critical Orbit escape handling
        if(state.criticalActive){
          // Critical escape! Full pressure reset + bonus
          state.pressure = 0;
          state.criticalActive = false;
          state.criticalElapsed = 0;
          state.runStats.criticalEscapes++;

          // Hide critical message
          criticalMsg.style.opacity = '0';

          // Extra visual feedback for critical escape
          state.shake = Math.min(30, state.shake + 15);
          flashGood();
          console.log('[Critical] ESCAPED! Pressure reset.');

          // Check for critical escape achievements
          checkMidRunAchievements();
        } else {
          // Normal escape: partial pressure reset
          state.pressure = Math.max(0, state.pressure - abParams.partialResetAmount);
        }

        // Update score immediately, but DON'T advance state.escaped yet (wait for animation)
        state.score += escapedThisFrame;
        state.timeInRing = 0;
        state.timeSinceLastEscape = 0;

        // PHASE 2: Check mode completion
        const modeConfig = getModeConfig(state.mode);
        if (modeConfig.finiteTarget && state.score >= modeConfig.finiteTarget) {
          if (state.mode === 'sprint' && !state.sprintCompleted) {
            state.sprintCompleted = true;
            console.log('[Sprint] Completed Sprint 30!');
            // Will trigger completion screen in next frame
          } else if (state.mode === 'daily' && !state.dailyCompleted) {
            state.dailyCompleted = true;
            console.log('[Daily] Completed Daily Orbit!');
            // Will trigger completion screen in next frame
          }
        }

        // PHASE 2: Update ring escape mission progress
        const escapeMissions = updateMissionProgress(playerData.missions.active, 'ring_escape', { count: escapedThisFrame });
        if (escapeMissions.length > 0) {
          for (const mission of escapeMissions) {
            showMissionToast(mission);
          }
          updateMissionDisplay();
        }

        // Onboarding hints
        if(state.score === 1) {
          // First escape ever
          showHint('first_escape');
        }
        if(pending.length > 1 && !HINTS.first_chain.shown) {
          // First chain escape
          showHint('first_chain');
        }

        if(pending.length > 1){
          // Multi-ring chain: queue animation
          state.pendingEscapes = pending;
          state.escapeTweenDuration = (expert ? 0.12 : 0.15) + (pending.length - 1) * 0.05;
          state.escapeTweenDuration = Math.min(state.escapeTweenDuration, 0.4);
          state.escapeTweenProgress = 0;
          state.escapeTargetEscaped = state.escaped + escapedThisFrame;
          state.ballTweenRadius = screenRadiusForIndex(state.escaped);

          // Haptic feedback (mobile)
          if(envInfo.supportsVibration && playerData.settings.hapticEnabled){
            const vibrateDuration = Math.min(50 * pending.length, 200);
            navigator.vibrate([vibrateDuration, 30]);
          }

          // Add glows - multi-ring chains ALWAYS glow (they're inherently instant)
          // OR if this follows a recent escape (quick succession)
          state.ringGlows.clear();
          if(isQuickSuccession || pending.length > 1){
            for(const p of pending){
              state.ringGlows.set(p.index, {hueOffset: rand(0, 360), fade: 1});
            }
          }

          // Boost effects
          state.shake = Math.min(25, state.shake + pending.length * 3);
          flashGood();

          // Chain
          state.chainTimer = 1.15 * pending.length;
          state.chain = Math.min(9, state.chain + pending.length);

          // Track max chain for stats
          state.runStats.maxChain = Math.max(state.runStats.maxChain, state.chain);

          // PHASE 2: Update chain mission progress
          const chainMissions = updateMissionProgress(playerData.missions.active, 'chain_reached', { chain: state.chain });
          if (chainMissions.length > 0) {
            for (const mission of chainMissions) {
              showMissionToast(mission);
            }
            updateMissionDisplay();
          }

          // Check for chain achievements
          checkMidRunAchievements();

          // UI polish: scale chain display
          const scaleAmount = 1.2 + Math.min(0.4, pending.length * 0.1);
          elChain.style.transform = `scale(${scaleAmount})`;

          // Reset after animation completes (300ms base + 50ms per ring)
          const resetDelay = 300 + pending.length * 50;
          setTimeout(() => {
            elChain.style.transform = 'scale(1)';
          }, resetDelay);

          // Spawn floating "+X" popup
          const scoreRect = elScore.getBoundingClientRect();
          state.scorePops.push({
            x: scoreRect.left + scoreRect.width / 2,
            y: scoreRect.top + scoreRect.height / 2,
            val: pending.length,
            life: 1,
            vy: -100
          });

        } else if(pending.length === 1){
          // Single escape: use smooth animation
          state.pendingEscapes = pending;
          state.escapeTweenDuration = expert ? 0.10 : 0.12;
          state.escapeTweenProgress = 0;
          state.escapeTargetEscaped = state.escaped + escapedThisFrame;
          state.ballTweenRadius = screenRadiusForIndex(state.escaped);

          // Visual reward: glow if quick succession
          if(isQuickSuccession){
            state.ringGlows.clear();
            state.ringGlows.set(pending[0].index, {hueOffset: rand(0, 360), fade: 1});
          }

          flashGood();
          state.shake = Math.min(18, state.shake + 9);

          // Chain
          state.chainTimer = 1.15;
          state.chain = Math.min(9, state.chain + 1);

          // Track max chain for stats
          state.runStats.maxChain = Math.max(state.runStats.maxChain, state.chain);

          ensureWindow();
        }

        // Update UI
        elScore.textContent = String(state.score);
        elChain.textContent = 'x' + String(state.chain);

        // Update achievement hint
        updateAchievementHint();
      }
    }

    setPressureUI();

    // Particles update
    for(let i=state.particles.length-1;i>=0;i--){
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vx *= (1 - 2.6*dt);
      p.vy *= (1 - 2.6*dt);
      if(p.life <= 0) state.particles.splice(i,1);
    }

    // Score popups update
    for(let i=state.scorePops.length-1;i>=0;i--){
      const pop = state.scorePops[i];
      pop.life -= 2 * dt;
      pop.y += pop.vy * dt;
      pop.vy *= (1 - 1.5 * dt); // slow down
      if(pop.life <= 0) state.scorePops.splice(i,1);
    }

    // Shake decay
    state.shake *= (1 - 8*dt);

    // Sliding recentre
    const minDim = Math.min(W,H);
    const safeOuter = minDim * 0.42;
    const curR = screenRadiusForIndex(state.escaped);

    const edgeRatio = curR / Math.max(1, safeOuter);
    const urgency = clamp((edgeRatio - 0.75) / 0.25, 0, 1);
    const followHz = 0.65 + 2.4 * (urgency * urgency);

    WINDOW.focus = easeToward(WINDOW.focus, state.escaped, followHz, dt);
    ensureWindow();

    // PHASE 2: Check for mode completion (Sprint/Daily)
    if (state.sprintCompleted || state.dailyCompleted) {
      handleModeCompletion();
    }
  }

  // PHASE 2: Handle Sprint/Daily completion
  async function handleModeCompletion() {
    running = false;
    darkOverlay.style.opacity = '0.7';
    centerMsg.style.display = 'block';
    hideMissionPanel(); // Hide mission panel on completion

    const runDuration = performance.now() - state.runStartTime;
    const timeSeconds = (runDuration / 1000).toFixed(1);

    let headline = 'Victory!';
    let line1 = '';
    let tip = 'Tap <b>Start</b> to play again!';
    let completedMissions = [];

    if (state.sprintCompleted) {
      headline = 'Sprint Complete!';
      line1 = `You reached <b>30 rings</b> in <b>${timeSeconds}s</b>!`;

      // Update best time for sprint
      if (!playerData.bestScore.sprint || runDuration < playerData.bestScore.sprint) {
        playerData.bestScore.sprint = runDuration;
        line1 += '<br/><b style="color:var(--good)">NEW BEST TIME!</b>';
      }

      // Mission progress
      const sprintMissions = updateMissionProgress(playerData.missions.active, 'sprint_complete', { time_ms: runDuration });
      if (sprintMissions.length > 0) {
        completedMissions = sprintMissions;
        for (const mission of sprintMissions) {
          showMissionToast(mission);
        }
        updateMissionDisplay();
      }
    } else if (state.dailyCompleted) {
      headline = 'Daily Complete!';
      line1 = `You completed today's Daily Orbit!<br/>Rings: <b>${state.score}</b> | Time: <b>${timeSeconds}s</b>`;

      // Update best for daily
      if (state.score > playerData.bestScore.daily) {
        playerData.bestScore.daily = state.score;
      }

      // Mission progress
      const dailyMissions = updateMissionProgress(playerData.missions.active, 'daily_complete', {});
      if (dailyMissions.length > 0) {
        completedMissions = dailyMissions;
        for (const mission of dailyMissions) {
          showMissionToast(mission);
        }
        updateMissionDisplay();
      }
    }

    document.querySelector('.title').textContent = headline;
    document.querySelector('.subtitle').innerHTML = line1 + '<br/>' + tip;

    // Update stats
    playerData.stats.totalRuns++;
    playerData.stats.totalRings += state.score;

    // STEP 4: Process XP, level-ups, and achievements
    const progressionResult = await processRunCompletion(playerData, {
      rings: state.score,
      max_chain: state.runStats.maxChain,
      critical_escapes: state.runStats.criticalEscapes,
      time_ms: Math.round(runDuration),
      sprintWin: state.sprintCompleted,
      completedMissions
    });

    // Display run summary with XP
    displayRunSummary(progressionResult);

    // Update mode best scores display
    updateModeBestScores();

    // Save
    savePlayerData(playerData);

    // STEP 5: Check install triggers for sprint completion - DISABLED FOR NOW
    // checkPostRunInstallTriggers(playerData, {
    //   isNewBest: false,
    //   sprintComplete: state.sprintCompleted
    // });

    // Log completion
    telemetry.log(state.sprintCompleted ? 'sprint_complete' : 'daily_complete', {
      time_ms: Math.round(runDuration),
      rings: state.score
    });
  }

  // ======= DRAW =======
  function draw(){
    // STEP 4: Apply theme colors
    const theme = applyTheme();

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0,0,W,H);

    if(!renderEnabled) return;

    const s = state.shake;
    const ox = (Math.random()-0.5)*s;
    const oy = (Math.random()-0.5)*s;

    const cx = state.cx + ox;
    const cy = state.cy + oy;

    ensureWindow();

    const start = Math.max(0, state.escaped - WINDOW.PAST);
    const end   = state.escaped + WINDOW.FUTURE;

    ctx.lineCap = 'round';

    // Rainbow glows (for perfect multi-ring escapes)
    for(const [i, glow] of state.ringGlows){
      const r = state.rings.get(i);
      if(!r) continue;

      const sr = screenRadiusForIndex(i);
      if(sr < 8) continue;

      const gw = effectiveGapWidth(r);

      ctx.strokeStyle = `hsl(${glow.hueOffset}, 100%, 60%)`;
      ctx.globalAlpha = glow.fade * 0.8;
      ctx.lineWidth = state.baseThickness * 1.8;

      ctx.beginPath();
      ctx.arc(cx, cy, sr, r.gapCenter - gw/2, r.gapCenter + gw/2, false);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Rings
    for(let i=start;i<=end;i++){
      const r = state.rings.get(i);
      if(!r) continue;

      const gw = effectiveGapWidth(r);
      const startGap = r.gapCenter - gw/2;
      const endGap   = r.gapCenter + gw/2;

      const sr = screenRadiusForIndex(i);

      let alpha = 0.85;
      if(i < state.escaped){
        const age = state.escaped - i;
        alpha = clamp(0.34 - (age-1)*0.12, 0.10, 0.34);
      } else if(i === state.escaped){
        alpha = 0.95;
      } else {
        const ahead = i - state.escaped;
        alpha = clamp(0.88 - (ahead-1)*0.10, 0.40, 0.88);
      }

      if(sr < 8) continue;

      ctx.strokeStyle = theme.fg;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = state.baseThickness;

      ctx.beginPath();
      ctx.arc(cx, cy, sr, endGap, startGap + Math.PI*2, false);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Obstacles (white triangles)
    for(let i=start;i<=end;i++){
      const r = state.rings.get(i);
      if(!r || !r.hasObstacle) continue;

      const sr = screenRadiusForIndex(i);
      if(sr < 8) continue;

      // Triangle size: 75% of gap between rings
      const triangleSize = state.gapPx * 0.75;

      // Triangle points inward from the ring (rotates with ring's gap center)
      const angle = r.gapCenter + r.obstacleAngle;
      const outerX = cx + Math.cos(angle) * sr;
      const outerY = cy + Math.sin(angle) * sr;
      const innerX = cx + Math.cos(angle) * (sr - triangleSize);
      const innerY = cy + Math.sin(angle) * (sr - triangleSize);

      // Create triangle pointing inward
      const halfWidth = triangleSize * 0.35; // width of triangle base
      const perpAngle = angle + Math.PI / 2;

      const baseX1 = outerX + Math.cos(perpAngle) * halfWidth;
      const baseY1 = outerY + Math.sin(perpAngle) * halfWidth;
      const baseX2 = outerX - Math.cos(perpAngle) * halfWidth;
      const baseY2 = outerY - Math.sin(perpAngle) * halfWidth;

      let alpha = 0.9;
      if(i < state.escaped){
        const age = state.escaped - i;
        alpha = clamp(0.34 - (age-1)*0.12, 0.10, 0.34);
      } else if(i === state.escaped){
        alpha = 1.0;
      } else {
        const ahead = i - state.escaped;
        alpha = clamp(0.88 - (ahead-1)*0.10, 0.40, 0.88);
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY); // tip pointing inward
      ctx.lineTo(baseX1, baseY1); // base corner 1
      ctx.lineTo(baseX2, baseY2); // base corner 2
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ball (changes color with pressure)
    const cr = state.rings.get(state.escaped);
    if(cr){
      // Use tween radius if animating, otherwise normal radius
      const baseR = state.ballTweenRadius > 0 ? state.ballTweenRadius : screenRadiusForIndex(state.escaped);
      const rr = baseR * 0.94;
      const bx = cx + Math.cos(state.ballAngle)*rr;
      const by = cy + Math.sin(state.ballAngle)*rr;

      // PHASE 1: Ball color reflects pressure level
      ctx.fillStyle = heatColor(state.pressure);
      ctx.beginPath();
      ctx.arc(bx, by, state.ballRadius, 0, Math.PI*2);
      ctx.fill();
    }

    // Particles (green or rainbow) - STEP 4: Apply trail cosmetics
    for(const p of state.particles){
      const a = clamp(p.life / 0.52, 0, 1);
      ctx.globalAlpha = a;

      // Rainbow particles (from chain trails) or standard green
      if(p.hue !== undefined){
        ctx.fillStyle = `hsl(${p.hue}, 70%, 60%)`;
      } else {
        // Apply trail cosmetic
        ctx.fillStyle = getTrailColor(playerData.cosmetics.trailId);
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Score popups (floating "+X" text or "+XP")
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for(const pop of state.scorePops){
      const alpha = clamp(pop.life, 0, 1);

      if (pop.isXP) {
        // XP popup (from achievements)
        ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#FFD700'; // Gold color for XP
      } else {
        // Regular score popup
        ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = theme.good;
      }

      ctx.globalAlpha = alpha;

      if (pop.isXP) {
        ctx.fillText(pop.val, pop.x, pop.y);
      } else {
        ctx.fillText(`+${pop.val}`, pop.x, pop.y);
      }
    }
    ctx.globalAlpha = 1;

    // Timer arc (uses theme color)
    if(running){
      const timeLimit = Math.max(2.6, state.maxRingTime - state.score*(expert ? 0.08 : 0.06));
      const t = clamp(state.timeInRing / Math.max(0.0001, timeLimit), 0, 1);
      const baseR = screenRadiusForIndex(state.escaped) * 0.72;

      if(baseR > 8){
        ctx.strokeStyle = theme.good;
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, -Math.PI/2, -Math.PI/2 + t*Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function loop(t){
    const dt = Math.min(0.033, (t - lastT)/1000);
    lastT = t;
    if(running) step(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Initial: no gameplay rendering until Start
  elScore.textContent = '0';
  elChain.textContent = 'x1';
  setPressureUI();
})();
