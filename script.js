(() => {
  // ======= PALETTE =======
  const COL_BG   = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const COL_FG   = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
  const COL_GOOD = getComputedStyle(document.documentElement).getPropertyValue('--good').trim();

  // “Heat” hot color (used for UI + ball tint). This is an extra tint on purpose.
  const COL_HOT  = '#FF3B30';

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

    heat: 0, // 0..1

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
  const btnReset = document.getElementById('btnReset');
  const goodFlash = document.getElementById('goodFlash');
  const darkOverlay = document.getElementById('darkOverlay');

  const LS_BEST = 'perfect_orbit_best_v1';
  const LS_EXPERT = 'perfect_orbit_expert_v1';
  let best = +(localStorage.getItem(LS_BEST) || 0);
  let expert = (localStorage.getItem(LS_EXPERT) === '1');
  elBest.textContent = best;
  btnExpert.textContent = `Expert: ${expert ? 'On' : 'Off'}`;

  btnExpert.addEventListener('click', () => {
    expert = !expert;
    localStorage.setItem(LS_EXPERT, expert ? '1' : '0');
    btnExpert.textContent = `Expert: ${expert ? 'On' : 'Off'}`;
  });

  btnReset.addEventListener('click', () => {
    best = 0;
    localStorage.setItem(LS_BEST, '0');
    elBest.textContent = '0';
  });

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
    // (nonlinear makes it feel “calm” until mid heat, then ramps)
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

  // Don’t render gameplay behind the start UI
  let renderEnabled = false;

  function setLayoutConstants(){
    const minDim = Math.min(W,H);
    const aspect = W / Math.max(1, H);

    // thicker + wider spacing
    const thickness = Math.max(7, Math.floor(minDim * 0.016));
    const gapPx = minDim * 0.072; // more spacing than before

    // Outer radius cap:
    // - Tall screens: let it grow but always fit (keep margins)
    // - Wide screens: keep it small so it doesn’t dominate (roughly <= half-screen diameter)
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

    // difficulty from speed only
    const rotSpeed =
      (Math.random() < 0.5 ? -1 : 1) *
      rand(0.40, expert ? 1.35 : 1.05) *
      (1 + i*0.06);

    const drift = rand(0.0, expert ? 0.085 : 0.055);

    // Obstacle logic: after ring 50, chance increases from 10% to 20% over 200 rings
    let hasObstacle = false;
    let obstacleAngle = 0;
    if(i >= 50){
      const progress = Math.min(1, (i - 50) / 200); // 0 at ring 50, 1 at ring 250
      const obstacleChance = 0.10 + progress * 0.10; // 10% to 20%
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

    return { gapWidth, rotSpeed: finalRotSpeed, drift, hasObstacle, obstacleAngle };
  }

  function ensureRing(i){
    if(state.rings.has(i)) return;
    const { gapWidth, rotSpeed, drift, hasObstacle, obstacleAngle } = ringParamsForIndex(i);
    state.rings.set(i, {
      i,
      gapCenter: rand(0, Math.PI*2),
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
  function setHeatUI(){
    const pct = Math.round(state.heat*100);
    elHeatFill.style.width = pct + '%';
    elHeatText.textContent = pct + '%';

    // Heat becomes fiery (bar color shifts with heat)
    elHeatFill.style.background = heatColor(state.heat);
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

    state.heat = 0;

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

    WINDOW.focus = 0;
    ensureWindow();

    elScore.textContent = '0';
    elChain.textContent = 'x1';
    setHeatUI();
  }

  function endGame(reason){
    running = false;
    darkOverlay.style.opacity = '0.7';
    centerMsg.style.display = 'block';

    let headline = 'Run Over';
    let line1 = `You escaped <b>${state.score}</b> rings.`;
    if(reason === 'burn'){
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
      `${line1}${perfectLine}<br/>Tap <b>Start</b> to try again — you can always do better.`;

    if(state.score > best){
      best = state.score;
      localStorage.setItem(LS_BEST, String(best));
      elBest.textContent = String(best);
    }
  }

  function start(){
    setLayoutConstants();
    resetGame();
    running = true;
    renderEnabled = true; // render gameplay only after click
    darkOverlay.style.opacity = '0';
    centerMsg.style.display = 'none';
    lastT = performance.now();
  }

  btnStart.addEventListener('click', () => {
    document.querySelector('.title').textContent = 'Perfect Orbit';
    document.querySelector('.subtitle').innerHTML =
      `Watch the gaps align. <b>Tap</b> to reverse orbit direction.<br/>
       If your angle matches the gap, the ball slips outward — sometimes through <b>multiple rings at once</b>.
       <br/><span style="opacity:.85">(Spamming taps builds “heat” and makes timing harder.)</span>`;
    start();
  });

  // ======= INPUT =======
  function onTap(){
    if(!running) return;

    state.ballDir *= -1;

    // More impactful heat
    const add = expert ? 0.18 : 0.15;
    state.heat = clamp(state.heat + add, 0, 1);
    setHeatUI();

    state.shake = Math.min(12, state.shake + 6);

    // Burn death
    if(state.heat >= 1){
      endGame('burn');
    }
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

    // Heat decay (slower so it matters)
    const heatDecay = expert ? 0.11 : 0.09; // was ~0.14–0.18
    state.heat = clamp(state.heat - heatDecay*dt, 0, 1);
    setHeatUI();

    // Orbit speed (IMPORTANT CHANGE):
    // Heat HIGH => ball SLOW. Heat LOW => ball FAST.
    const baseFast = (expert ? 1.45 : 1.15) + state.score * (expert ? 0.025 : 0.018);
    const slowFactor = lerp(1.00, 0.45, state.heat); // 0 heat => 1x, 1 heat => 0.45x
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

        // Update score immediately, but DON'T advance state.escaped yet (wait for animation)
        state.score += escapedThisFrame;
        state.timeInRing = 0;
        state.timeSinceLastEscape = 0;

        if(pending.length > 1){
          // Multi-ring chain: queue animation
          state.pendingEscapes = pending;
          state.escapeTweenDuration = (expert ? 0.12 : 0.15) + (pending.length - 1) * 0.05;
          state.escapeTweenDuration = Math.min(state.escapeTweenDuration, 0.4);
          state.escapeTweenProgress = 0;
          state.escapeTargetEscaped = state.escaped + escapedThisFrame;
          state.ballTweenRadius = screenRadiusForIndex(state.escaped);

          // Haptic feedback (mobile)
          if(navigator.vibrate){
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

          ensureWindow();
        }

        // Update UI
        elScore.textContent = String(state.score);
        elChain.textContent = 'x' + String(state.chain);
      }
    }

    setHeatUI();

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

    // Burn check (decay + taps can both hit 1, but taps already check)
    if(state.heat >= 1){
      endGame('burn');
    }
  }

  // ======= DRAW =======
  function draw(){
    ctx.fillStyle = COL_BG;
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

      ctx.strokeStyle = COL_FG;
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

    // Ball (changes color with heat)
    const cr = state.rings.get(state.escaped);
    if(cr){
      // Use tween radius if animating, otherwise normal radius
      const baseR = state.ballTweenRadius > 0 ? state.ballTweenRadius : screenRadiusForIndex(state.escaped);
      const rr = baseR * 0.94;
      const bx = cx + Math.cos(state.ballAngle)*rr;
      const by = cy + Math.sin(state.ballAngle)*rr;

      ctx.fillStyle = heatColor(state.heat);
      ctx.beginPath();
      ctx.arc(bx, by, state.ballRadius, 0, Math.PI*2);
      ctx.fill();
    }

    // Particles (green or rainbow)
    for(const p of state.particles){
      const a = clamp(p.life / 0.52, 0, 1);
      ctx.globalAlpha = a;

      // Rainbow particles (from chain trails) or standard green
      if(p.hue !== undefined){
        ctx.fillStyle = `hsl(${p.hue}, 70%, 60%)`;
      } else {
        ctx.fillStyle = COL_GOOD;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Score popups (floating "+X" text)
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for(const pop of state.scorePops){
      const alpha = clamp(pop.life, 0, 1);
      ctx.fillStyle = COL_GOOD;
      ctx.globalAlpha = alpha;
      ctx.fillText(`+${pop.val}`, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;

    // Timer arc (GREEN)
    if(running){
      const timeLimit = Math.max(2.6, state.maxRingTime - state.score*(expert ? 0.08 : 0.06));
      const t = clamp(state.timeInRing / Math.max(0.0001, timeLimit), 0, 1);
      const baseR = screenRadiusForIndex(state.escaped) * 0.72;

      if(baseR > 8){
        ctx.strokeStyle = COL_GOOD;
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
  setHeatUI();
})();
