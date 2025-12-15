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

// unlock audio on first explicit start action
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  Object.values(sounds).forEach(audio => {
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

// --- Resize & layout ---
const groundFraction = 0.2;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

canvas.addEventListener('touchmove', (e) => {
  handleTouch(e);
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  player.targetX = null;
}, { passive: false });


// --- Falling objects ---
const objects = [];

function spawnObject() {
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

// --- Particles ---
const particles = [];

function spawnBurst(x, y, color) {
  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400,
      age: 0,
      size: 4 + Math.random() * 3,
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = 1 - p.age / p.life;
    ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Objects update ---
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
    obj.y += obj.speed;
    if (obj.y > rect.height) {
      objects.splice(i, 1);
      continue;
    }
    if (rectsOverlap(player, obj)) {
      const centerX = obj.x + obj.width / 2;
      const centerY = obj.y + obj.height / 2;
      if (obj.type === 'gift') {
        score += 1;
        if (!goodJobShown && score >= GOOD_JOB_SCORE) {
          goodJobShown = true;
        }
        playSound('catch', 0.7);
        spawnBurst(centerX, centerY, { r: 255, g: 215, b: 0 });
      } else {
        lives -= 1;
        playSound('hit', 0.9);
        spawnBurst(centerX, centerY, { r: 80, g: 80, b: 80 });
      }
      objects.splice(i, 1);
    }
  }
}

// hitboxes
function rectsOverlap(a, b) {
  const shrinkA = 0.1;
  const shrinkB = 0.1;
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
  particles.length = 0;
  player.targetX = null;
  lastSpawnTime = 0;
  difficultyStartTime = performance.now();
  hasStarted = false;
  goodJobShown = false;
}

// --- Update & draw ---
let lastFrameTime = performance.now();

function update() {
  if (!assetsLoaded) return;
  const now = performance.now();
  const dt = now - lastFrameTime;
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
    updateParticles(dt);

    if (lives <= 0 && !gameOver) {
      gameOver = true;
      if (score > bestScore) {
        bestScore = score;
        saveBestScore();
      }
      playSound('gameover', 0.9);
    }
  } else {
    updateParticles(dt);
  }
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
  ctx.fillText(`Score: ${score}`, 10, 24);
  ctx.fillText(`Best: ${bestScore}`, 10, 48);
  ctx.fillText(`Lives: ${lives}`, 10, 72);

  // Good job banner
  if (goodJobShown) {
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

  if (!hasStarted && !gameOver) {
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

  if (gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px system-ui';
    ctx.fillText('Game Over!', rect.width / 2, rect.height / 2 - 30);
    ctx.font = 'bold 20px system-ui';
    ctx.fillText(`Score: ${score}`, rect.width / 2, rect.height / 2 + 5);
    ctx.fillText(`Best: ${bestScore}`, rect.width / 2, rect.height / 2 + 30);
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
  drawParticles();
  drawUI(rect);
  ctx.restore();
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
