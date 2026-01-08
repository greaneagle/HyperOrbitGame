# Perfect Orbit V2

A minimalist orbital physics game with progression systems, multiple game modes, and A/B testing infrastructure.

## 🚀 Quick Start

```bash
# Start local development server
python server.py

# Or use standard Python HTTP server
python -m http.server 8000

# Open browser
http://localhost:8000
```

## 🎮 Game Features

### Core Gameplay
- **Orbital Physics**: Tap to reverse direction and escape through ring gaps
- **Chain Escapes**: Pass through multiple rings in one move for combos
- **Pressure System**: Building tension with critical orbit mechanic
- **Ring Timer**: Survive within each ring's time limit
- **Expert Mode**: Toggle for advanced difficulty
- **Obstacles**: Appear after ring 50

### Game Modes
- **Endless**: Classic survival mode with progressive difficulty
- **Daily Orbit**: Deterministic daily challenge (same for all players on a given date)
- **Sprint 30**: Speed run to escape 30 rings

### Progression
- **XP System**: Earn experience from rings escaped
- **Level Up**: Progress through player levels
- **Cosmetics**: Unlock trails and themes (see Cosmetic System below)
- **Achievements**: 12 achievement badges to collect
- **Missions**: 3 active missions with daily rotation (35 total templates)

### Cosmetic System

#### 🎨 Themes (Environment Skins)
Themes change the entire color palette of the game, affecting background, rings, UI, and visual feedback:

| Theme | Unlock | Description |
|-------|--------|-------------|
| **Default** | Default | Dark neutral aesthetic with bright green accents |
| **Neon** | Level 5 | Cyberpunk vibes - electric cyan and magenta highlights |
| **Sunset** | Achievement: 7-day streak | Warm palette - golden-orange and pink |
| **Midnight** | Achievement: 100 runs | Cool blue aesthetic - icy and serene |
| **Ocean** | Level 12 | Deep water theme - navy, cyan-blue, and teal |

Each theme defines 3 core colors:
- **Background**: Canvas fill color
- **Foreground**: Rings, text, and UI borders
- **Accent**: Success feedback, score popups, timer arc

*Multi-ring escape effects (glowing rings) automatically adapt to theme colors, pulsing between foreground and accent colors.*

#### ✨ Trails (Particle Effect Skins)
Trails customize the particle effects when escaping rings. Each trail has unique visual properties:

| Trail | Unlock | Visual Effect |
|-------|--------|---------------|
| **Default** | Default | Green circles (adapts to theme accent color) |
| **Sparkle** ⭐ | Level 2 | Gold 4-pointed stars, longer life, gentle floating |
| **Rainbow** 🌈 | Achievement: Chain 5 | Circles with animated rainbow color cycling |
| **Inferno** 🔥 | Achievement: Critical Pro | Red-orange particles, upward-biased, short-lived flames |
| **Lightning** ⚡ | Achievement: Sprint Fast | Electric blue velocity-stretched lines, extremely fast |
| **Neon Glow** 💚 | Level 8 | Neon green with shadow glow effect, medium persistence |
| **Cosmic** 🌌 | Achievement: Total Rings 500 | Purple particles with spiral motion, long-lasting cosmic dust |

**Trail Properties** (customizable per trail):
- **Particle Count**: Density of the effect
- **Shape**: Circles, stars, or velocity-stretched lines
- **Speed**: How fast particles move (60-500 px/s range)
- **Lifespan**: How long particles persist (0.1-0.7s range)
- **Size**: Particle radius and variation
- **Motion**: Special effects like upward bias, spiral rotation, or velocity stretching
- **Effects**: Shadow glow, varied friction

**Implementation**: `script.js` ([lines 149-239](script.js#L149-L239))

### Technical Features
- **A/B Testing**: Permanent cohort assignment for experimentation
- **Platform Detection**: Optimized for iOS, Android, and Desktop
- **Telemetry**: Event logging (currently console-only stub)
- **Data Persistence**: Versioned localStorage with V1 migration support
- **Debug Panel**: Accessible with `?debug=1` URL parameter

## 📁 Project Structure

```
V2/
├── index.html                  # Main entry point
├── styles.css                  # All styling
├── script.js                   # Main game logic
├── manifest.json               # PWA manifest (icons only)
├── favicon.ico                 # Browser tab icon
├── server.py                   # Custom dev server with ES6 module support
│
├── js/                         # Core modules
│   ├── storage.js              # Data persistence + migration
│   ├── env.js                  # Platform detection
│   ├── ab.js                   # A/B testing system
│   ├── telemetry.js            # Event logging
│   ├── modes.js                # Game mode logic + daily patterns
│   ├── missions.js             # Mission system
│   ├── progression.js          # XP, levels, cosmetics, achievements
│   ├── pwa.js                  # PWA features (CURRENTLY DISABLED)
│   ├── debug.js                # Debug panel (?debug=1)
│   └── version.js              # Centralized versioning
│
├── data/                       # Game configuration (JSON)
│   ├── missions.json           # 35 mission templates
│   └── achievements.json       # 12 achievement definitions
│
├── config/                     # External integrations
│   └── firebase-config.js      # Firebase Analytics (placeholder)
│
├── icons/                      # PWA icons
│   ├── icon-192.png           # 192x192 app icon
│   └── icon-512.png           # 512x512 app icon
│
├── docs/                       # Documentation
│   └── archived/              # Historical documentation
│
└── cleanup tools/              # Development utilities
    ├── unregister-sw.html     # Service worker cleanup
    └── force-cleanup.html     # Nuclear cache cleanup
```

## 🛠️ Development

### Requirements
- **Browser**: Modern browser with ES6 module support (Chrome, Firefox, Safari, Edge)
- **Server**: Python 3.x
- **Editor**: Any text editor

### Running Locally

1. **Start the server**:
   ```bash
   python server.py
   ```

2. **Open in browser**:
   ```
   http://localhost:8000
   ```

3. **Enable debug mode** (optional):
   ```
   http://localhost:8000?debug=1
   ```

### Key Files to Edit

| File | Purpose |
|------|---------|
| `script.js` | Main game logic, physics, rendering |
| `js/storage.js` | Player data structure and persistence |
| `js/ab.js` | A/B experiment parameters |
| `js/modes.js` | Game mode configurations |
| `js/progression.js` | Cosmetics definitions and unlock conditions |
| `data/missions.json` | Mission templates and targets |
| `data/achievements.json` | Achievement definitions |
| `styles.css` | All visual styling |

### Adding New Cosmetics

#### Adding a New Theme

1. **Define theme metadata** in `js/progression.js`:
   ```javascript
   export const COSMETICS = {
     themes: [
       // ... existing themes
       { id: 'myTheme', name: 'My Theme', unlockType: 'level', unlockValue: 20 }
     ]
   }
   ```

2. **Add color palette** in `script.js` (`getThemeColors` function):
   ```javascript
   case 'myTheme':
     return {
       bg: '#1A1A2E',    // Background color
       fg: '#16213E',    // Foreground (rings, text)
       good: '#0F3460'   // Accent (success feedback)
     };
   ```

That's it! The theme will automatically work with all game systems.

#### Adding a New Trail

1. **Define trail metadata** in `js/progression.js`:
   ```javascript
   export const COSMETICS = {
     trails: [
       // ... existing trails
       { id: 'myTrail', name: 'My Trail', unlockType: 'achievement', unlockValue: 'ach_id' }
     ]
   }
   ```

2. **Add color** in `script.js` (`getTrailColor` function):
   ```javascript
   case 'myTrail': return '#FF5733';
   ```

3. **Add particle configuration** in `script.js` (`getTrailConfig` function):
   ```javascript
   case 'myTrail':
     return {
       count: 20,              // Number of particles
       size: 2.5,              // Base size in pixels
       sizeVar: [0.8, 1.5],    // Size variation range
       speed: [100, 250],      // Speed range (px/s)
       life: [0.3, 0.5],       // Lifespan range (seconds)
       shape: 'circle',        // 'circle', 'star', or 'line'
       friction: 2.0,          // Deceleration rate
       // Optional special effects:
       glow: true,             // Shadow glow
       spiral: true,           // Spiral motion
       upwardBias: -0.2,       // Directional bias
       stretch: true           // Velocity-based stretching (for 'line' shape)
     };
   ```

The particle system supports mixing and matching these properties to create unique effects!

### Debugging

**Console Logs**:
- Open DevTools → Console
- See initialization sequence and game events
- Telemetry events logged in real-time

**Debug Panel** (`?debug=1`):
- Shows version info
- Displays A/B cohort
- Shows platform detection
- Mirrors last 15 telemetry events

**LocalStorage**:
- DevTools → Application → Local Storage
- Key: `po_data`
- Contains all player progress

## 📊 A/B Testing

### Current Experiment
**Critical Window Duration**:
- **Cohort A**: 12 seconds
- **Cohort B**: 14 seconds

Cohort assignment is:
- Permanent (persists in localStorage)
- 50/50 random split
- Privacy-first (no player IDs)

### Modifying Parameters

Edit `js/ab.js`:
```javascript
function getABParams(cohort) {
  const params = {
    criticalWindow: 12,      // Cohort A value
    pressureTimeRate: 0.08,
    pressureTapRate: 0.12,
    // ... other params
  };

  if (cohort === 'B') {
    params.criticalWindow = 14;  // Cohort B override
  }

  return params;
}
```

## 🔧 Configuration

### Firebase Analytics (Optional)

Currently using **stub mode** (events logged to console only).

To enable Firebase Analytics:
1. See `docs/archived/FIREBASE_SETUP.md`
2. Update `config/firebase-config.js` with your project config
3. Events will automatically start flowing to Firebase

### PWA Features (Currently Disabled)

Service worker and install prompts are disabled for stability.

To re-enable (not recommended until testing):
1. Uncomment PWA imports in `script.js`
2. Uncomment service worker registration
3. Test thoroughly before deploying

## ⚠️ Known Issues

### CSP Warnings
- `unsafe-eval` warning in console is **expected**
- Required for Firebase Analytics SDK
- Safe in this context

### PWA Disabled
- Service worker registration commented out
- Install prompts disabled
- Offline mode not available
- Will be re-enabled after thorough testing

## 🚧 Status

### Implemented ✅
- ✅ Core orbital physics gameplay
- ✅ Pressure + critical orbit system
- ✅ Three game modes (Endless, Daily, Sprint)
- ✅ Mission system (35 missions, 3 active)
- ✅ XP, levels, cosmetics system
  - ✅ 5 themes with full game palette integration
  - ✅ 7 trails with unique particle effects (shapes, physics, special effects)
  - ✅ Theme-adaptive multi-ring glow effects
- ✅ 12 achievements
- ✅ A/B testing infrastructure
- ✅ Platform detection
- ✅ Debug panel
- ✅ Telemetry framework

### Disabled / Pending ⏸️
- ⏸️ PWA features (service worker, install prompts)
- ⏸️ Firebase Analytics (stub mode only)
- ⏸️ Deployment workflow
- ⏸️ Metrics dashboard

## 📚 Additional Documentation

Archived documentation (historical reference):
- `docs/archived/FIREBASE_SETUP.md` - Firebase Analytics setup
- `docs/archived/RELEASE_CHECKLIST.md` - Deployment checklist
- `docs/archived/METRICS_DASHBOARD.md` - Analytics metrics guide
- `docs/archived/EXPERIMENT_TRACKER.md` - A/B experiment log

## 🎯 Quick Reference

### Player Data Structure
```javascript
{
  version: "pv02.2",
  abGroup: "A" | "B",
  bestScore: { endless: 0, daily: 0, sprint: 0 },
  stats: { totalRuns: 0, totalRings: 0, ... },
  settings: { expert: false },
  xp: 0,
  level: 1,
  cosmetics: { ... },
  missions: { active: [], completed: [] },
  achievements: { ... },
  env: { platform, isStandalone, ... }
}
```

### Telemetry Events
1. `session_start` - Game loaded
2. `run_start` - Run began
3. `run_end` - Run finished (includes rings, mode, XP, etc.)
4. `mode_selected` - Player switched modes
5. `level_up` - Player leveled up
6. `mission_complete` - Mission completed
7. `achievement_unlock` - Achievement unlocked
8. `critical_entry` - Entered critical orbit
9. `critical_escape` - Escaped from critical orbit
10. `daily_complete` - Finished Daily Orbit
11. `sprint_complete` - Finished Sprint 30

### Game Constants

Edit in `js/ab.js` (base values):
- `criticalWindow`: 12 seconds
- `pressureTimeRate`: 0.08 per second
- `pressureTapRate`: 0.12 per tap
- `criticalThreshold`: 0.9 (90% pressure)
- `partialResetAmount`: 0.4 (40% reduction)

## 📝 License

MIT License..

---

**Version**: pv02.2+build.003
**Last Updated**: 2026-01-08
**Status**: Stable (PWA features disabled, Enhanced cosmetics system)
