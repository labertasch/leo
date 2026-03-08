const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const starsLabel = document.getElementById("starsCount");
const bumpsLabel = document.getElementById("bumpsCount");
const startPanel = document.getElementById("startPanel");
const startBtn = document.getElementById("startBtn");

const state = {
  running: false,
  lastTs: 0,
  starsCollected: 0,
  bumps: 0,
};

const input = {
  keys: new Set(),
  mouseX: canvas.width / 2,
  mouseY: canvas.height / 2,
  mouseActive: false,
};

const rocket = {
  x: canvas.width * 0.45,
  y: canvas.height * 0.5,
  vx: 0,
  vy: 0,
  angle: 0,
  radius: 16,
};

const collectibles = [];
const asteroids = [];
const starsSky = Array.from({ length: 140 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  r: Math.random() * 1.8 + 0.3,
  twinkle: Math.random() * Math.PI * 2,
}));

const planets = [
  { name: "Sun", x: 120, y: 130, r: 70, c1: "#ffd66b", c2: "#ff9848" },
  { name: "Mercury", x: 270, y: 135, r: 12, c1: "#c0b39d", c2: "#99836a" },
  { name: "Venus", x: 350, y: 145, r: 19, c1: "#f5c281", c2: "#cf9248" },
  { name: "Earth", x: 445, y: 160, r: 23, c1: "#49a5ff", c2: "#2ac57a" },
  { name: "Moon", x: 486, y: 167, r: 7, c1: "#e4e8ef", c2: "#b8c0cc" },
  { name: "Mars", x: 545, y: 172, r: 18, c1: "#f48f67", c2: "#d95f40" },
  { name: "Jupiter", x: 690, y: 210, r: 44, c1: "#f9cc9a", c2: "#d79a66" },
  { name: "Saturn", x: 855, y: 223, r: 37, c1: "#f7dc94", c2: "#c9ad60", ring: true },
  { name: "Uranus", x: 995, y: 205, r: 29, c1: "#9ceaf5", c2: "#62c4dd" },
  { name: "Neptune", x: 1120, y: 196, r: 27, c1: "#668cff", c2: "#4156b8" },
];

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(980, Math.floor(rect.width));
  canvas.height = Math.max(560, Math.floor(rect.height));

  rocket.x = Math.min(rocket.x, canvas.width - 50);
  rocket.y = Math.min(rocket.y, canvas.height - 50);
}

function spawnCollectible() {
  collectibles.push({
    x: Math.random() * (canvas.width - 120) + 60,
    y: Math.random() * (canvas.height - 120) + 80,
    r: 12,
    pulse: Math.random() * Math.PI,
  });
}

function spawnAsteroid() {
  asteroids.push({
    x: Math.random() * (canvas.width - 80) + 40,
    y: Math.random() * (canvas.height - 80) + 50,
    r: Math.random() * 10 + 20,
    vx: (Math.random() - 0.5) * 45,
    vy: (Math.random() - 0.5) * 45,
  });
}

for (let i = 0; i < 8; i += 1) spawnCollectible();
for (let i = 0; i < 6; i += 1) spawnAsteroid();

let audioCtx;
let masterGainNode;
const atmosphereLoop = new Audio("./assets/audio/space_atmosphere.mp3");
const engineLoop = new Audio("./assets/audio/rocket_engine.wav");
let loopsStarted = false;

atmosphereLoop.loop = true;
atmosphereLoop.preload = "auto";
atmosphereLoop.volume = 0.35;

engineLoop.loop = true;
engineLoop.preload = "auto";
engineLoop.volume = 0.08;
engineLoop.playbackRate = 0.85;

function beep({ freq = 440, type = "sine", duration = 0.12, gain = 0.08, slide = 0 }) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide !== 0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + duration);
  }
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g).connect(masterGainNode || audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function startAudio() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioCtx = new AudioCtor();
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = 0.9;
    masterGainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  if (!loopsStarted) {
    atmosphereLoop.currentTime = 0;
    engineLoop.currentTime = 0;
    atmosphereLoop.play().catch(() => {});
    engineLoop.play().catch(() => {});
    loopsStarted = true;
  }

  beep({ freq: 330, type: "triangle", duration: 0.16, gain: 0.11, slide: 140 });
  setTimeout(() => {
    beep({ freq: 520, type: "triangle", duration: 0.14, gain: 0.1, slide: 70 });
  }, 90);
}

function updateEngineSound() {
  if (!loopsStarted) return;
  const speed = Math.hypot(rocket.vx, rocket.vy);
  const movingNorm = Math.min(1, speed / 240);
  const hasThrustInput =
    input.mouseActive ||
    input.keys.has("arrowup") ||
    input.keys.has("arrowdown") ||
    input.keys.has("arrowleft") ||
    input.keys.has("arrowright") ||
    input.keys.has("w") ||
    input.keys.has("a") ||
    input.keys.has("s") ||
    input.keys.has("d");
  const throttle = Math.min(1, movingNorm + (hasThrustInput ? 0.45 : 0));

  const engineGain = 0.045 + throttle * 0.18;
  const engineRate = 0.74 + throttle * 0.68;
  const atmosphereGain = 0.23 + (1 - throttle) * 0.2;

  engineLoop.volume = Math.min(0.24, engineGain);
  engineLoop.playbackRate = Math.min(1.5, engineRate);
  atmosphereLoop.volume = Math.min(0.5, atmosphereGain);
}

function drawBackground(t) {
  const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grd.addColorStop(0, "#09132b");
  grd.addColorStop(1, "#02070f");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  starsSky.forEach((s) => {
    const tw = (Math.sin(t * 0.0016 + s.twinkle) + 1) * 0.4 + 0.2;
    ctx.beginPath();
    ctx.arc((s.x + t * 0.01) % canvas.width, s.y, s.r + tw, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(214, 235, 255, ${0.2 + tw})`;
    ctx.fill();
  });
}

function drawPlanet(p) {
  const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.2, p.x, p.y, p.r);
  g.addColorStop(0, p.c1);
  g.addColorStop(1, p.c2);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  if (p.ring) {
    ctx.strokeStyle = "rgba(230, 220, 170, 0.8)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, p.r + 15, p.r * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(233, 246, 255, 0.88)";
  ctx.font = "bold 15px 'Baloo 2'";
  ctx.textAlign = "center";
  ctx.fillText(p.name, p.x, p.y + p.r + 20);
}

function drawSolarSystem() {
  ctx.save();
  ctx.globalAlpha = 0.96;
  planets.forEach(drawPlanet);
  ctx.restore();

  ctx.strokeStyle = "rgba(138, 215, 255, 0.18)";
  ctx.lineWidth = 1;
  [250, 350, 450, 560, 690, 860, 1030].forEach((w) => {
    ctx.beginPath();
    ctx.ellipse(120, 130, w, w * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawCollectibles(t) {
  collectibles.forEach((c) => {
    const pulse = Math.sin(t * 0.004 + c.pulse) * 0.25 + 0.9;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(t * 0.001);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const outerX = Math.cos(a) * c.r;
      const outerY = Math.sin(a) * c.r;
      const innerA = a + Math.PI / 5;
      const innerX = Math.cos(innerA) * c.r * 0.45;
      const innerY = Math.sin(innerA) * c.r * 0.45;
      if (i === 0) ctx.moveTo(outerX, outerY);
      else ctx.lineTo(outerX, outerY);
      ctx.lineTo(innerX, innerY);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffe875";
    ctx.fill();
    ctx.strokeStyle = "#ffbd4e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  });
}

function drawAsteroids() {
  asteroids.forEach((a) => {
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    ctx.fillStyle = "#5b6476";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(a.x - a.r * 0.3, a.y - a.r * 0.2, a.r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "#475060";
    ctx.fill();
  });
}

function drawRocket() {
  ctx.save();
  ctx.translate(rocket.x, rocket.y);
  ctx.rotate(rocket.angle);

  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-12, -12);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-12, 12);
  ctx.closePath();
  ctx.fillStyle = "#ff8662";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(1, 0, 13, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f3f9ff";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(4, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#4ec9ff";
  ctx.fill();

  const speed = Math.hypot(rocket.vx, rocket.vy);
  if (speed > 20) {
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-22 - Math.random() * 10, 0);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 199, 90, 0.95)";
    ctx.fill();
  }

  ctx.restore();
}

function keepInBounds() {
  rocket.x = Math.max(16, Math.min(canvas.width - 16, rocket.x));
  rocket.y = Math.max(16, Math.min(canvas.height - 16, rocket.y));
}

function updateRocket(dt) {
  const thrust = 320;
  let ax = 0;
  let ay = 0;

  if (input.keys.has("ArrowUp") || input.keys.has("w")) ay -= thrust;
  if (input.keys.has("ArrowDown") || input.keys.has("s")) ay += thrust;
  if (input.keys.has("ArrowLeft") || input.keys.has("a")) ax -= thrust;
  if (input.keys.has("ArrowRight") || input.keys.has("d")) ax += thrust;

  if (input.mouseActive) {
    const dx = input.mouseX - rocket.x;
    const dy = input.mouseY - rocket.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      ax += (dx / dist) * thrust * 0.9;
      ay += (dy / dist) * thrust * 0.9;
    }
  }

  rocket.vx += ax * dt;
  rocket.vy += ay * dt;

  rocket.vx *= 0.94;
  rocket.vy *= 0.94;

  rocket.x += rocket.vx * dt;
  rocket.y += rocket.vy * dt;
  keepInBounds();

  if (Math.hypot(rocket.vx, rocket.vy) > 2) {
    rocket.angle = Math.atan2(rocket.vy, rocket.vx);
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function handleCollisions() {
  for (let i = collectibles.length - 1; i >= 0; i -= 1) {
    const c = collectibles[i];
    if (distance(rocket, c) < rocket.radius + c.r) {
      collectibles.splice(i, 1);
      spawnCollectible();
      state.starsCollected += 1;
      starsLabel.textContent = String(state.starsCollected);
      beep({ freq: 560, type: "triangle", duration: 0.1, gain: 0.1, slide: 180 });
    }
  }

  asteroids.forEach((a) => {
    if (distance(rocket, a) < rocket.radius + a.r) {
      const dx = rocket.x - a.x;
      const dy = rocket.y - a.y;
      const mag = Math.max(0.001, Math.hypot(dx, dy));
      rocket.vx = (dx / mag) * 190;
      rocket.vy = (dy / mag) * 190;
      state.bumps += 1;
      bumpsLabel.textContent = String(state.bumps);
      beep({ freq: 190, type: "square", duration: 0.14, gain: 0.08, slide: -80 });
    }
  });
}

function updateAsteroids(dt) {
  asteroids.forEach((a) => {
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    if (a.x < a.r || a.x > canvas.width - a.r) a.vx *= -1;
    if (a.y < a.r + 40 || a.y > canvas.height - a.r) a.vy *= -1;
  });
}

function drawIntroText() {
  if (!state.running) return;
  if (state.starsCollected >= 20) {
    ctx.fillStyle = "rgba(18, 42, 72, 0.7)";
    ctx.fillRect(canvas.width / 2 - 260, 20, 520, 46);
    ctx.fillStyle = "#fff4d6";
    ctx.font = "700 28px 'Baloo 2'";
    ctx.textAlign = "center";
    ctx.fillText("Great job, Space Captain!", canvas.width / 2, 52);
  }
}

function frame(ts) {
  const dt = Math.min(0.033, (ts - state.lastTs) / 1000 || 0.016);
  state.lastTs = ts;

  drawBackground(ts);
  drawSolarSystem();
  updateRocket(dt);
  updateEngineSound();
  updateAsteroids(dt);
  handleCollisions();
  drawCollectibles(ts);
  drawAsteroids();
  drawRocket();
  drawIntroText();

  if (state.running) {
    requestAnimationFrame(frame);
  }
}

function startGame() {
  state.running = true;
  state.lastTs = performance.now();
  startPanel.style.display = "none";
  startAudio();
  requestAnimationFrame(frame);
}

startBtn.addEventListener("click", startGame);

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

window.addEventListener("keydown", (e) => {
  input.keys.add(e.key.toLowerCase());
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  input.keys.delete(e.key.toLowerCase());
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  input.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
  input.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
  input.mouseActive = true;
});

canvas.addEventListener("mouseleave", () => {
  input.mouseActive = false;
});

canvas.addEventListener(
  "touchmove",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    input.mouseX = ((touch.clientX - rect.left) / rect.width) * canvas.width;
    input.mouseY = ((touch.clientY - rect.top) / rect.height) * canvas.height;
    input.mouseActive = true;
    e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener("touchend", () => {
  input.mouseActive = false;
});
