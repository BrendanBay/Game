const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Images ---
const images = {
  santa: null,
  gift: null,
  charcoal: null
};
let assetsLoaded = false;

// --- Sounds ---
const sounds = {
  catch: new Audio('catch.mp3'),
  hit: new Audio('hit.mp3'),
  gameover: new Audio('gameover.mp3')
};
let audioUnlocked = false;
let hasStarted = false;

// --- Best score (localStorage) ---
let bestScore = 0;
const BEST_SCORE_KEY = 'catch_the_gifts_best_score';
const stored = localStorage.getItem(BEST_SCORE_KEY);
if (stored !== null) {
  const n = Number(stored);
  if (!Number.isNaN(n) && n >= 0) bestScore = n;
}

function saveBestScore() {
  localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
}

// --- Good job banner ---
let goodJobShown = false;
const GOOD_JOB_SCORE = 100;

// --- Damage / invulnerability ---
let lastHitTime = -Infinity;
const INVULN_DURATION = 1000; // 1 second in ms

// --- UI state buffer to avoid jitter ---
let uiData = {
  score: 0,
  lives: 3,
  bestScore: 0,
  gameOver: false,
  hasStarted: false,
  goodJobShown: false
};

// --- iOS RAF optimization: visibility state nudge + page visibility handler ---
window.addEventListener('touchstart', () => {
  // Wake iOS RAF throttling
  if (typeof document.webkitVisibilityState !== 'undefined') {
    document.webkitVisibilityState; // Access triggers RAF resumption
  }
}, { once: true, passive: true });

// Page visibility change handler for iOS RAF recovery
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Force RAF resumption on tab refocus
    requestAnimationFrame(() => {});
  }
});

// --- Audio unlock on first explicit start action ---
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  Object.values(sounds).forEach(audio => {
    audio.preload = 'auto';
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {});
  });
}

function playSound(name, volume = 1) {
  if (!audioUnlocked || !hasStarted) return;
  const s = sounds[name];
  if (!s) return;
  s.muted = false;
  s.pause();
  s.currentTime = 0;
  s.volume = volume;
  s.play().catch(() => {});
}

function stopSound(name) {
  const s = sounds[name];
  if (!s) return;
  s.pause();
  s.currentTime = 0;
}

// Stop all sounds so only one plays at a time
function stopAllSounds() {
  Object.values(sounds).forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function startGameFromInput() {
  if (!hasStarted) {
    unlockAudio();
    hasStarted = true;
  }
}

// --- Load images ---
function loadImages() {
  const santaImg = new Image();
  const giftImg = new Image();
  const charcoalImg = new Image();
  let loadedCount = 0;
  const total = 3;
  
  function onLoad() {
    loadedCount++;
    if (loadedCount === total) {
      assetsLoaded = true;
    }
  }
  
  santaImg.onload = onLoad;
  giftImg.onload = onLoad;
  charcoalImg.onload = onLoad;
  
  santaImg.src = 'santa.png';
  giftImg.src = 'gift.png';
  charcoalImg.src = 'charcoal.png';
  
  images.santa = santaImg;
  images.gift = giftImg;
  images.charcoal = charcoalImg;
}

// --- Resize & layout (iOS-optimized, minimal getBoundingClientRect calls) ---
const groundFraction = 0.2;
let currentRect = { width: 0, height: 0 }; // Cache rect to reduce calls

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR at 2
  const maxDimension = 3840;
  const scale = Math.min(1, maxDimension / Math.max(rect.width, rect.height));
  
  canvas.width = rect.width * dpr * scale;
  canvas.height = rect.height * dpr * scale;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  
  currentRect = rect; // Cache
  updateLayout(rect.width, rect.height);
}

function updateLayout(viewWidth, viewHeight) {
  const groundHeight = viewHeight * groundFraction;
  player.width = 96;
  player.height = 96;
  player.x = (viewWidth / 2) - player.width / 2;
  player.y = viewHeight - groundHeight - player.height;
}

window.addEventListener('resize', resizeCanvas);

// --- Game state ---
let score = 0;
let lives = 3;
let gameOver = false;

// difficulty / spawn
const baseSpawnInterval = 900;
const minSpawnInterval = 250;
const timeToMaxDifficulty = 60000;
let lastSpawnTime = 0;
let difficultyStartTime = performance.now();

// --- Player ---
const player = {
  width: 96,
  height: 96,
  x: 0,
  y: 0,
  maxSpeed: 8,
  targetX: null
};

// --- Smooth Keyboard Controls ---
let keys = { left: false, right: false };

window.addEventListener('keydown', (e) => {
  if (!hasStarted && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    startGameFromInput();
    return;
  }
  if (gameOver && e.key === 'Enter') {
    restartGame();
    return;
  }
  if (['ArrowLeft', 'a'].includes(e.key)) {
    keys.left = true;
    e.preventDefault();
  } else if (['ArrowRight', 'd'].includes(e.key)) {
    keys.right = true;
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a'].includes(e.key)) {
    keys.left = false;
  } else if (['ArrowRight', 'd'].includes(e.key)) {
    keys.right = false;
  }
});

// --- Touch controls (optimized for iOS) ---
canvas.addEventListener('touchstart', (e) => {
  if (!hasStarted && !gameOver) {
    startGameFromInput();
    return;
  }
  if (gameOver) return;
  handleTouch(e);
}, { passive: false });

canvas.addEventListener('touchmove', handleTouch, { passive: false });
canvas.addEventListener('touchend', () => {
  player.targetX = null;
}, { passive: true });

function handleTouch(e) {
  if (gameOver) return;
  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  const touchX = touch.clientX - currentRect.left; // Use cached rect
  player.targetX = touchX - player.width / 2;
  e.preventDefault();
}

// --- Falling objects ---
const objects = [];

function spawnObject() {
  const size = 56;
  const x = Math.random() * (currentRect.width - size); // Use cached rect
  const y = -size;
  const speed = 2 + Math.random() * 2;
  const type = Math.random() < 0.7 ? 'gift' : 'charcoal';
  objects.push({ x, y, width: size, height: size, speed, type });
}

function getCurrentSpawnInterval() {
  const now = performance.now();
  const elapsed = now - difficultyStartTime;
  const t = Math.min(1, elapsed / timeToMaxDifficulty);
  return baseSpawnInterval - t * (baseSpawnInterval - minSpawnInterval);
}

// --- Objects update (optimized loop) ---
function updateObjects(dt) {
  if (gameOver || !hasStarted) return;
  
  const now = performance.now();
  const currentInterval = getCurrentSpawnInterval();
  if (now - lastSpawnTime > currentInterval) {
    spawnObject();
    lastSpawnTime = now;
  }
  
  // Reverse iteration for efficient splicing
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    obj.y += obj.speed * (dt / 16.67);
    
    if (obj.y > currentRect.height) { // Cached rect
      objects.splice(i, 1);
      continue;
    }
    
    if (rectsOverlap(player, obj)) {
      if (obj.type === 'gift') {
        score += 1;
        if (!goodJobShown && score >= GOOD_JOB_SCORE) {
          goodJobShown = true;
        }
        stopAllSounds();
        playSound('catch', 0.7);
        objects.splice(i, 1);
      } else {
        // coal hit – only if not invulnerable
        const nowHit = performance.now();
        const timeSinceHit = nowHit - lastHitTime;
        if (timeSinceHit >= INVULN_DURATION) {
          lives -= 1;
          lastHitTime = nowHit;
          stopAllSounds();
          playSound('hit', 0.9);
        }
        // coal always disappears on contact
        objects.splice(i, 1);
      }
    }
  }
}

// --- Collision detection ---
function rectsOverlap(a, b) {
  const shrinkA = 0.2;
  const shrinkB = 0.2;
  const ax = a.x + a.width * shrinkA / 2;
  const ay = a.y + a.height * shrinkA / 2;
  const aw = a.width * (1 - shrinkA);
  const ah = a.height * (1 - shrinkA);
  const bx = b.x + b.width * shrinkB / 2;
  const by = b.y + b.height * shrinkB / 2;
  const bw = b.width * (1 - shrinkB);
  const bh = b.height * (1 - shrinkB);
  
  return (
    ax < bx + bw &&
    ax + aw > bx &&
    ay < by + bh &&
    ay + ah > by
  );
}

function restartGame() {
  stopSound('gameover');
  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
  }
  
  score = 0;
  lives = 3;
  gameOver = false;
  objects.length = 0;
  player.targetX = null;
  lastSpawnTime = 0;
  difficultyStartTime = performance.now();
  hasStarted = false;
  goodJobShown = false;
  lastHitTime = -Infinity;
}

// --- Optimized Update (iOS frame-skip resistant) ---
let lastFrameTime = performance.now();
let frameAccumulator = 0;
const FIXED_DT = 1000 / 60; // 60fps target

function update() {
  if (!assetsLoaded) return;
  
  const now = performance.now();
  let dt = Math.min(50, now - lastFrameTime); // Clamp extreme iOS skips
  lastFrameTime = now;
  
  frameAccumulator += dt;
  
  if (!gameOver && hasStarted) {
    // Fixed timestep loop for consistent physics
    while (frameAccumulator >= FIXED_DT) {
      updatePlayer(FIXED_DT);
      updateObjects(FIXED_DT);
      frameAccumulator -= FIXED_DT;
    }
    
    if (lives <= 0 && !gameOver) {
      gameOver = true;
      if (score > bestScore) {
        bestScore = score;
        saveBestScore();
      }
      stopAllSounds();
      playSound('gameover', 0.9);
    }
  }
  
  // Update UI buffer every frame
  uiData.score = score;
  uiData.lives = lives;
  uiData.bestScore = bestScore;
  uiData.gameOver = gameOver;
  uiData.hasStarted = hasStarted;
  uiData.goodJobShown = goodJobShown;
}

function updatePlayer(fixedDt) {
  const rectWidth = currentRect.width;
  
  // Keyboard movement
  let vx = 0;
  if (keys.left) vx = -player.maxSpeed;
  if (keys.right) vx = player.maxSpeed;
  player.x += vx * (fixedDt / 16.67);
  
  // Touch controls (lerp for smoothness)
  if (player.targetX != null) {
    const dx = player.targetX - player.x;
    const distance = Math.abs(dx);
    if (distance < 1) {
      player.x = player.targetX;
      player.targetX = null;
    } else {
      const direction = dx > 0 ? 1 : -1;
      const speed = Math.min(player.maxSpeed, distance * 0.2);
      player.x += direction * speed;
    }
  }
  
  // Clamp position
  player.x = Math.max(0, Math.min(player.x, rectWidth - player.width));
}

// --- Render functions (optimized canvas state) ---
function drawBackground() {
  ctx.clearRect(0, 0, currentRect.width, currentRect.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, currentRect.width, currentRect.height);
  const groundHeight = currentRect.height * groundFraction;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, currentRect.height - groundHeight, currentRect.width, groundHeight);
}

function drawPlayer() {
  const now = performance.now();
  const timeSinceHit = now - lastHitTime;
  const isInvulnerable = timeSinceHit < INVULN_DURATION;
  
  // Golden glow while invulnerable (batched state changes)
  if (isInvulnerable) {
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.strokeRect(player.x - 4, player.y - 4, player.width + 8, player.height + 8);
    ctx.restore();
  }
  
  if (images.santa && assetsLoaded) {
    ctx.drawImage(images.santa, player.x, player.y, player.width, player.height);
  } else {
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
}

function drawObjects() {
  for (const obj of objects) {
    let img = null;
    if (obj.type === 'gift') img = images.gift;
    else if (obj.type === 'charcoal') img = images.charcoal;
    
    if (img && assetsLoaded) {
      ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    } else {
      ctx.fillStyle = obj.type === 'gift' ? '#ffcc00' : '#333333';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
    }
  }
}

function drawUI() {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${uiData.score}`, 10, 24);
  ctx.fillText(`Best: ${uiData.bestScore}`, 10, 48);
  ctx.fillText(`Lives: ${uiData.lives}`, 10, 72);
  
  // Good job banner
  if (uiData.goodJobShown) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px system-ui';
    const gradient = ctx.createLinearGradient(0, 0, currentRect.width, 0);
    gradient.addColorStop(0, '#ff3333');
    gradient.addColorStop(1, '#00cc66');
    ctx.fillStyle = gradient;
    ctx.fillText('Good job!', currentRect.width / 2, currentRect.height * 0.2);
    ctx.restore();
  }
  
  if (!uiData.hasStarted && !uiData.gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, currentRect.width, currentRect.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px system-ui';
    ctx.fillText('Catch the Gifts', currentRect.width / 2, currentRect.height / 2 - 20);
    ctx.font = 'bold 18px system-ui';
    ctx.fillText('Tap to Start', currentRect.width / 2, currentRect.height / 2 + 10);
    ctx.textAlign = 'left';
  }
  
  if (uiData.gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, currentRect.width, currentRect.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px system-ui';
    ctx.fillText('Game Over!', currentRect.width / 2, currentRect.height / 2 - 30);
    ctx.font = 'bold 20px system-ui';
    ctx.fillText(`Score: ${uiData.score}`, currentRect.width / 2, currentRect.height / 2 + 5);
    ctx.fillText(`Best: ${uiData.bestScore}`, currentRect.width / 2, currentRect.height / 2 + 30);
    ctx.fillText('Tap or Enter to Restart', currentRect.width / 2, currentRect.height / 2 + 60);
    ctx.textAlign = 'left';
  }
  
  if (!assetsLoaded) {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px system-ui';
    ctx.fillText('Loading...', currentRect.width / 2, currentRect.height / 2);
    ctx.textAlign = 'left';
  }
}

// --- Main loop (iOS-optimized RAF with fixed timestep) ---
function gameLoop() {
  update();
  drawBackground();
  drawObjects();
  drawPlayer();
  drawUI();
  requestAnimationFrame(gameLoop);
}

// --- Input handlers ---
canvas.addEventListener('click', () => {
  if (!hasStarted && !gameOver) {
    startGameFromInput();
  } else if (gameOver) {
    restartGame();
  }
});

canvas.addEventListener('touchstart', (e) => {
  if (gameOver) {
    e.preventDefault();
    restartGame();
  }
}, { passive: false });

// --- Init ---
loadImages();
resizeCanvas();
requestAnimationFrame(gameLoop);
