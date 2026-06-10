const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

// ─── DETECÇÃO DE DISPOSITIVO ──────────────────────────────────────────────
const isMobile = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const maxWidth = Math.min(rect.width, 800);
    canvas.style.width = maxWidth + 'px';
    canvas.style.height = (maxWidth * 0.5) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ─── VELOCIDADES: mobile vs desktop ──────────────────────────────────────
const SPEED = isMobile() ? {
    ballStart:    7,     // era 5 — mais rápido no arranque
    ballMax:      14,    // era 10 — teto mais alto
    ballIncrease: 0.25,  // era 0.15 — acelera mais a cada batida
    player:       9,     // era 7
    computer:     8.5    // era 6.5
} : {
    ballStart:    9,
    ballMax:      10,
    ballIncrease: 0.20,
    player:       7,
    computer:     6.5
};

const paddle = {
    width: 10, height: 80,
    x: 20, y: canvas.height / 2 - 40,
    maxSpeed: SPEED.player
};

const computer = {
    width: 10, height: 80,
    x: canvas.width - 30, y: canvas.height / 2 - 40,
    maxSpeed: SPEED.computer,
    predictionOffset: 0
};

const ball = {
    x: canvas.width / 2, y: canvas.height / 2,
    radius: 7,
    dx: SPEED.ballStart,
    dy: SPEED.ballStart,
    speed: SPEED.ballStart,
    maxSpeed: SPEED.ballMax
};

const game = {
    playerScore: 0, computerScore: 0,
    isPlaying: false, difficulty: 'hard'
};

// ─── AUDIO ────────────────────────────────────────────────────────────────
let audioCtx = null;
let musicPlaying = false;
let musicInterval = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playHitSound(freq = 440) {
    const ac = getAudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
}

function playWallSound() {
    const ac = getAudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ac.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.08);
}

function playScoreSound(playerScored) {
    const ac = getAudioCtx();
    const notes = playerScored ? [523, 659, 784, 1047] : [400, 300, 200, 150];
    notes.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = playerScored ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, ac.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.25, ac.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.12 + 0.1);
        osc.start(ac.currentTime + i * 0.12);
        osc.stop(ac.currentTime + i * 0.12 + 0.15);
    });
}

const melody   = [329,349,392,440,392,349,329,294,329,392,440,494,440,392,329,261,392,440,494,523,494,440,392,349,392,349,329,294,261,294,329,349];
const bassLine = [130,130,146,146,130,130,116,116,130,130,146,146,130,130,116,116,146,146,164,164,146,146,130,130,146,146,130,130,116,116,130,130];
let melodyIndex = 0;
const noteDuration = 0.18;

function playMusicNote() {
    if (!musicPlaying) return;
    const ac = getAudioCtx();
    const now = ac.currentTime;
    const freq = melody[melodyIndex % melody.length];
    const bassFreq = bassLine[melodyIndex % bassLine.length];

    [[freq, 'square', 0.08], [bassFreq, 'triangle', 0.06], [bassFreq * 1.5, 'triangle', 0.04]].forEach(([f, type, vol]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + noteDuration * 0.9);
        osc.start(now); osc.stop(now + noteDuration);
    });
    melodyIndex++;
}

function startMusic() {
    if (musicPlaying) return;
    musicPlaying = true;
    melodyIndex = 0;
    playMusicNote();
    musicInterval = setInterval(playMusicNote, noteDuration * 1000);
}

function stopMusic() {
    musicPlaying = false;
    if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
}

function toggleMusic() {
    if (musicPlaying) {
        stopMusic();
        document.getElementById('musicBtn').textContent = '🔇 Música OFF';
    } else {
        startMusic();
        document.getElementById('musicBtn').textContent = '🎵 Música ON';
    }
}

function createMusicButton() {
    const btn = document.createElement('button');
    btn.id = 'musicBtn';
    btn.textContent = '🎵 Música ON';
    btn.style.cssText = `
        position:fixed;top:12px;right:12px;z-index:9999;
        padding:8px 14px;background:rgba(0,0,0,0.6);color:#ffd700;
        border:2px solid #ffd700;border-radius:8px;font-size:14px;
        font-weight:bold;cursor:pointer;backdrop-filter:blur(4px);
        touch-action:manipulation;-webkit-tap-highlight-color:transparent;
    `;
    btn.addEventListener('click', toggleMusic);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleMusic(); }, { passive: false });
    document.body.appendChild(btn);
}

// ─── CONTROLOS ────────────────────────────────────────────────────────────
const keys = {};
let upBtnPressed = false;
let downBtnPressed = false;
let mouseY = -1;
let usingMouse = false;

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

canvas.addEventListener('mousemove', (e) => {
    if (isMobile()) return;
    usingMouse = true;
    const rect = canvas.getBoundingClientRect();
    mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mouseleave', () => { usingMouse = false; });

const upBtn   = document.getElementById('upBtn');
const downBtn = document.getElementById('downBtn');
const pauseBtn = document.getElementById('pauseBtn');

function addBtnListeners(btn, onPress, onRelease) {
    btn.addEventListener('touchstart',  (e) => { e.preventDefault(); onPress();   }, { passive: false });
    btn.addEventListener('touchend',    (e) => { e.preventDefault(); onRelease(); }, { passive: false });
    btn.addEventListener('touchcancel', (e) => { e.preventDefault(); onRelease(); }, { passive: false });
    btn.addEventListener('mousedown',  () => onPress());
    btn.addEventListener('mouseup',    () => onRelease());
    btn.addEventListener('mouseleave', () => onRelease());
}

addBtnListeners(upBtn,
    () => { upBtnPressed = true;  usingMouse = false; },
    () => { upBtnPressed = false; }
);
addBtnListeners(downBtn,
    () => { downBtnPressed = true;  usingMouse = false; },
    () => { downBtnPressed = false; }
);

pauseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); togglePlay(); }, { passive: false });
pauseBtn.addEventListener('click', togglePlay);

// arrastar no canvas
let dragActive = false;
let dragY = -1;
canvas.addEventListener('touchstart',  (e) => { dragActive = true;  const r = canvas.getBoundingClientRect(); dragY = e.touches[0].clientY - r.top; }, { passive: true });
canvas.addEventListener('touchmove',   (e) => { if (!dragActive) return; const r = canvas.getBoundingClientRect(); dragY = e.touches[0].clientY - r.top; }, { passive: true });
canvas.addEventListener('touchend',    () => { dragActive = false; }, { passive: true });
canvas.addEventListener('touchcancel', () => { dragActive = false; }, { passive: true });

// ─── LÓGICA ───────────────────────────────────────────────────────────────
function togglePlay() {
    getAudioCtx();
    game.isPlaying = !game.isPlaying;
    if (game.isPlaying) startMusic(); else stopMusic();
    updatePauseButton();
}

function updatePauseButton() {
    pauseBtn.textContent = game.isPlaying ? '⏸ PAUSE' : '▶ START';
}

function updatePlayerPaddle() {
    if (dragActive && dragY >= 0) {
        paddle.y = dragY - paddle.height / 2;
    } else if (usingMouse && mouseY >= 0 && !upBtnPressed && !downBtnPressed) {
        paddle.y = mouseY - paddle.height / 2;
    }
    if (keys['ArrowUp']   || upBtnPressed)   paddle.y -= paddle.maxSpeed;
    if (keys['ArrowDown'] || downBtnPressed) paddle.y += paddle.maxSpeed;
    paddle.y = Math.max(0, Math.min(canvas.height - paddle.height, paddle.y));
}

function updateComputerPaddle() {
    const center = computer.y + computer.height / 2;
    if (ball.dx > 0) {
        computer.predictionOffset = ball.dy * ((canvas.width - ball.x) / ball.dx);
    }
    const target = ball.y + computer.predictionOffset;
    if (center < target - 30) computer.y += computer.maxSpeed;
    else if (center > target + 30) computer.y -= computer.maxSpeed;
    if (Math.random() < 0.02) computer.y += (Math.random() - 0.5) * 10;
    computer.y = Math.max(0, Math.min(canvas.height - computer.height, computer.y));
}

let ballHitWallLastFrame = false;

function updateBall() {
    if (!game.isPlaying) return;

    ball.x += ball.dx;
    ball.y += ball.dy;

    // Paredes
    const hitWall = ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height;
    if (hitWall && !ballHitWallLastFrame) {
        ball.dy = -ball.dy;
        ball.y = Math.max(ball.radius, Math.min(canvas.height - ball.radius, ball.y));
        playWallSound();
    }
    ballHitWallLastFrame = hitWall;

    // Paddle jogador
    if (ball.x - ball.radius < paddle.x + paddle.width &&
        ball.y > paddle.y && ball.y < paddle.y + paddle.height && ball.dx < 0) {
        ball.dx = Math.abs(ball.dx);
        ball.x = paddle.x + paddle.width + ball.radius;
        ball.dy = (ball.y - (paddle.y + paddle.height / 2)) * 0.12;
        ball.speed = Math.min(ball.speed + SPEED.ballIncrease, ball.maxSpeed);
        ball.dx = ball.speed;
        playHitSound(440 + ball.speed * 20);
    }

    // Paddle computador
    if (ball.x + ball.radius > computer.x &&
        ball.y > computer.y && ball.y < computer.y + computer.height && ball.dx > 0) {
        ball.dx = -Math.abs(ball.dx);
        ball.x = computer.x - ball.radius;
        ball.dy = (ball.y - (computer.y + computer.height / 2)) * 0.12;
        ball.speed = Math.min(ball.speed + SPEED.ballIncrease, ball.maxSpeed);
        ball.dx = -ball.speed;
        playHitSound(330 + ball.speed * 20);
    }

    // Pontos
    if (ball.x - ball.radius < 0) {
        game.computerScore++; updateScore();
        playScoreSound(false); stopMusic(); resetBall();
    }
    if (ball.x + ball.radius > canvas.width) {
        game.playerScore++; updateScore();
        playScoreSound(true); stopMusic(); resetBall();
    }
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = SPEED.ballStart;
    ball.dx = (Math.random() > 0.5 ? 1 : -1) * ball.speed;
    ball.dy = (Math.random() - 0.5) * 0.5 * ball.speed;
    game.isPlaying = false;
    updatePauseButton();
}

function updateScore() {
    document.getElementById('playerScore').textContent = game.playerScore;
    document.getElementById('computerScore').textContent = game.computerScore;
}

// ─── DESENHO ──────────────────────────────────────────────────────────────
function drawPaddle(p) {
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = 'rgba(0,255,136,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.shadowColor = 'transparent';
}

function drawBall() {
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = 'rgba(255,215,0,0.8)';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
}

function drawNet() {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
}

function gameLoop() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    drawNet();
    drawPaddle(paddle);
    drawPaddle(computer);
    drawBall();

    updatePlayerPaddle();
    updateComputerPaddle();
    updateBall();

    if (!game.isPlaying) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE TO START', canvas.width / 2, canvas.height / 2 - 30);
        ctx.font = '14px Arial';
        ctx.fillText('or tap START button', canvas.width / 2, canvas.height / 2 + 30);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('AI: HARD MODE', 10, 20);

    requestAnimationFrame(gameLoop);
}

// ─── INICIAR ──────────────────────────────────────────────────────────────
createMusicButton();
resetBall();
gameLoop();

// ─── COPIAR LINK ──────────────────────────────────────────────────────────
function copyLink() {
    navigator.clipboard.writeText('https://ponggame.com/').then(() => {
        const toast = document.getElementById('copyToast');
        toast.style.display = 'inline';
        setTimeout(() => { toast.style.display = 'none'; }, 2500);
    });
}