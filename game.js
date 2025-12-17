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

// --- iOS touch visibility nudge (harmless elsewhere) ---
window.addEventListener('touchstart', () => {
  // No-op on most browsers; exists to encourage iOS to resume full RAF rate
  if (typeof document.webkitVisibilityState !== 'undefined') {
    // eslint-disable-next-line no-unused-expressions
    document.webkitVisibilityState;
  }
}, { once: true, passive: true });

// unlock audio on first explicit start action
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
  santaImg.onerror = () => console.log('Failed to load santa.png'); // iOS safe
  giftImg.onload = onLoad;
  giftImg.onerror = () => console.log('Failed to load gift.png');
  charcoalImg.onload = onLoad;
  charcoalImg.onerror = () => console.log('Failed to load charcoal.png');
  santaImg.src = 'santa.png';
  giftImg.src = 'gift.png';
  charcoalImg.src = 'charcoal.png';
  images.santa = santaImg;
  images.gift = giftImg;
  images.charcoal = charcoalImg;
}

// --- Resize & layout (iOS-optimized) ---
const groundFraction = 0.2;
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  // FIXED: Safe iOS DPR detection
  let dpr = 1;
  try {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      dpr = 1; // Force DPR=1 on iOS
    } else {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    }
  } catch (e) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  }
  const maxDimension = 3840;
  const scale = Math.min(1, maxDimension / Math.max(rect.width, rect.height));
  canvas.width = rect.width * dpr * scale;
  canvas.height = rect.height * dpr * scale;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
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

// --- Touch controls ---
canvas.addEventListener('touchstart', (e) => {
  if (!hasStarted && !gameOver) {
    startGameFromInput();
    return;
  }
  if (gameOver) return;
  handleTouch(e);
}, { passive: false });
canvas.addEventListener('touchmove', handleTouch);
canvas.addEventListener('touchend', () => {
  player.targetX = null;
});

function handleTouch(e) {
  if (gameOver) return;
  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const touchX = touch.clientX - rect.left;
  player.targetX = touchX - player.width / 2;
  e.preventDefault();
}

// --- Falling objects ---
const objects = [];
const MAX_OBJECTS = 20; // PERFORMANCE: Cap object count

function spawnObject() {
  // PERFORMANCE: Prevent object explosion
  if (objects.length >= MAX_OBJECTS) return;
  const rect = canvas.getBoundingClientRect();
  const size = 56;
  const x = Math.random() * (rect.width - size);
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

// --- Objects update (OPTIMIZED) ---
function updateObjects(dt) {
  if (gameOver || !hasStarted) return;
  const now = performance.now();
  const currentInterval = getCurrentSpawnInterval();
  if (now - lastSpawnTime > currentInterval) {
    spawnObject();
    lastSpawnTime = now;
  }

  const rect = canvas.getBoundingClientRect();
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    // apply dt normalization to falling speed
    obj.y += obj.speed * (dt / 16.67);

    // PERFORMANCE: Early exit for off-screen objects
    if (obj.y > rect.height + 50 || obj.y < -100) {
      objects.splice(i, 1);
      continue;
    }

    if (obj.y > rect.height) {
      objects.splice(i, 1);
      continue;
    }

    // PERFORMANCE: Only check collision when object is near player Y
    if (Math.abs(obj.y - player.y) < 150 && rectsOverlap(player, obj)) {
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

// hitboxes
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

// --- Update & draw ---
let lastFrameTime = performance.now();
function update() {
  if (!assetsLoaded) return;
  const now = performance.now();
  let dt = now - lastFrameTime;
  // FIXED: RAF protection - only skip extreme drops (>100ms)
  if (dt > 100) return;
  // clamp dt to smooth out iOS Safari frame skips
  dt = Math.min(50, dt);
  lastFrameTime = now;

  if (!gameOver && hasStarted) {
    const rect = canvas.getBoundingClientRect();
    // Smooth keyboard movement
    let vx = 0;
    if (keys.left) vx = -player.maxSpeed;
    if (keys.right) vx = player.maxSpeed;
    player.x += vx * (dt / 16.67); // Normalize to 60fps
    player.x = Math.max(0, Math.min(player.x, rect.width - player.width));

    // Keep touch controls working
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
        player.x = Math.max(0, Math.min(player.x, rect.width - player.width));
      }
    }

    updateObjects(dt);

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

  // Update UI buffer every frame so it stays in sync but renders smoothly
  uiData.score = score;
  uiData.lives = lives;
  uiData.bestScore = bestScore;
  uiData.gameOver = gameOver;
  uiData.hasStarted = hasStarted;
  uiData.goodJobShown = goodJobShown;
}

function drawBackground(rect) {
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, rect.width, rect.height);
  const groundHeight = rect.height * groundFraction;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, rect.height - groundHeight, rect.width, groundHeight);
}

function drawPlayer() {
  const now = performance.now();
  const timeSinceHit = now - lastHitTime;
  const isInvulnerable = timeSinceHit < INVULN_DURATION;
  // Golden glow while invulnerable
  if (isInvulnerable) {
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffd700'; // gold
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

function drawUI(rect) {
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
    const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
    gradient.addColorStop(0, '#ff3333');
    gradient.addColorStop(1, '#00cc66');
    ctx.fillStyle = gradient;
    ctx.fillText('Good job!', rect.width / 2, rect.height * 0.2);
    ctx.restore();
  }

  if (!uiData.hasStarted && !uiData.gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px system-ui';
    ctx.fillText('Catch the Gifts', rect.width / 2, rect.height / 2 - 20);
    ctx.font = 'bold 18px system-ui';
    ctx.fillText('Tap to Start', rect.width / 2, rect.height / 2 + 10);
    ctx.textAlign = 'left';
  }

  if (uiData.gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px system-ui';
    ctx.fillText('Game Over!', rect.width / 2, rect.height / 2 - 30);
    ctx.font = 'bold 20px system-ui';
    ctx.fillText(`Score: ${uiData.score}`, rect.width / 2, rect.height / 2 + 5);
    ctx.fillText(`Best: ${uiData.bestScore}`, rect.width / 2, rect.height / 2 + 30);
    ctx.fillText('Tap or Enter to Restart', rect.width / 2, rect.height / 2 + 60);
    ctx.textAlign = 'left';
  }

  if (!assetsLoaded) {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px system-ui';
    ctx.fillText('Loading...', rect.width / 2, rect.height / 2);
    ctx.textAlign = 'left';
  }
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  update();
  drawBackground(rect);
  drawObjects();
  drawPlayer();
  drawUI(rect);
  requestAnimationFrame(draw);
}

// Restart / start handlers
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
requestAnimationFrame(draw);
