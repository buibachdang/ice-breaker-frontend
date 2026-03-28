// Replace with your Render/backend URL when deployed
const socket = io('http://localhost:3000'); 

const urlParams = new URLSearchParams(window.location.search);
const adminParam = urlParams.get('admin');
const joinParam = urlParams.get('join');

let sessionId = '';
let isPlaying = false;
let myId = '';
let playersData = {};
let iceAmount = 1000;
let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

// --- NEW GLOBAL VARIABLES FOR SHAPES ---
let gameShape = 'circle';
let initialIceAmount = 1;

// UI Elements
const viewLanding = document.getElementById('view-landing');
const viewAdmin = document.getElementById('view-admin');
const viewGame = document.getElementById('view-game');
const joinSection = document.getElementById('join-section');

// 1. Routing logic
if (adminParam) {
    sessionId = adminParam;
    showView(viewAdmin);
    document.getElementById('admin-link').href = window.location.href;
    document.getElementById('admin-link').innerText = "Admin Link";
    const jLink = `${window.location.origin}${window.location.pathname}?join=${sessionId}`;
    document.getElementById('join-link').href = jLink;
    document.getElementById('join-link').innerText = jLink;
} else if (joinParam) {
    sessionId = joinParam;
    joinSection.style.display = 'block';
    document.getElementById('btn-create').style.display = 'none';
}

// 2. Buttons & Settings
document.getElementById('btn-create').onclick = () => socket.emit('createSession');
document.getElementById('btn-join').onclick = () => {
    const name = document.getElementById('input-name').value;
    if (name) socket.emit('joinSession', { sessionId, name });
};
document.getElementById('btn-start').onclick = () => socket.emit('startGame', sessionId);

// Send settings to backend whenever the admin changes them
const sendSettings = () => {
    socket.emit('updateSettings', { 
        sessionId, 
        time: document.getElementById('input-time').value,
        shape: document.getElementById('input-shape').value,
        size: document.getElementById('input-size').value
    });
};

// Listeners for the admin settings inputs
document.getElementById('input-time').onchange = sendSettings;
if(document.getElementById('input-shape')) document.getElementById('input-shape').onchange = sendSettings;
if(document.getElementById('input-size')) document.getElementById('input-size').onchange = sendSettings;

// 3. Socket Events
socket.on('sessionCreated', (id) => {
    window.location.href = `?admin=${id}`;
});

socket.on('updatePlayers', (players) => {
    if (adminParam) {
        document.getElementById('admin-player-list').innerText = `Players joined: ${players.length}/20`;
    } else {
        showView(viewGame);
        myId = socket.id;
        players.forEach(p => playersData[p.id] = p);
    }
});

// Updated to receive the chosen shape and total ice amount
socket.on('gameStarted', ({ players, time, shape, initialIce }) => {
    playersData = players;
    gameShape = shape || 'circle';
    initialIceAmount = initialIce || 1000;
    iceAmount = initialIceAmount;
    
    document.getElementById('timer').innerText = `Time: ${time}`;
    document.getElementById('ice-counter').innerText = `Ice: ${iceAmount}`;
    
    if (adminParam) showView(viewGame); 
    isPlaying = true;
    requestAnimationFrame(gameLoop);
});

socket.on('tick', (time) => document.getElementById('timer').innerText = `Time: ${time}`);

socket.on('playerMoved', ({ id, x, y }) => { 
    if (playersData[id]) { 
        playersData[id].x = x; 
        playersData[id].y = y; 
    }
});

socket.on('iceUpdate', ({ iceRemaining, players }) => {
    iceAmount = iceRemaining;
    playersData = players;
    document.getElementById('ice-counter').innerText = `Ice: ${iceAmount}`;
});

socket.on('gameOver', ({ winners, highestScore }) => {
    isPlaying = false;
    const banner = document.getElementById('banner-win');
    const winText = document.getElementById('win-text');
    banner.style.display = 'block';
    if (winners.length > 1) {
        winText.innerText = `Tie! ${winners.map(w => w.name).join(', ')} won with ${highestScore} cubes!`;
    } else if (winners.length === 1) {
        winText.innerText = `${winners[0].name} wins with ${highestScore} cubes!`;
    } else {
        winText.innerText = "Game Over! No ice broken.";
    }
});

// 4. Game Loop & Canvas
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.code)) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.code)) keys[e.code] = false; });

canvas.addEventListener('mousedown', (e) => {
    if (!isPlaying || !myId) return;
    
    // We emit the click to the backend, the backend will verify if they are close enough
    socket.emit('clickIce', sessionId);
});

function gameLoop() {
    if (!isPlaying) return;

    // Movement (Client prediction)
    if (myId && playersData[myId]) {
        const speed = 4;
        let p = playersData[myId];
        let moved = false;
        if (keys.ArrowUp && p.y > 0) { p.y -= speed; moved = true; }
        if (keys.ArrowDown && p.y < 600) { p.y += speed; moved = true; }
        if (keys.ArrowLeft && p.x > 0) { p.x -= speed; moved = true; }
        if (keys.ArrowRight && p.x < 800) { p.x += speed; moved = true; }
        if (moved) socket.emit('move', { sessionId, x: p.x, y: p.y });
    }

    // Drawing
    ctx.clearRect(0, 0, 800, 600);

    // --- DRAW DYNAMIC ICE SHAPE ---
    // Calculate current size based on remaining cubes so it visibly shrinks
    const safeInitialIce = initialIceAmount > 0 ? initialIceAmount : 1;
    const scale = Math.sqrt(Math.max(0, iceAmount) / safeInitialIce); 
    const baseSize = document.getElementById('input-size') ? document.getElementById('input-size').value : 100;
    const currentSize = baseSize * scale;

    ctx.fillStyle = '#81d4fa';
    ctx.strokeStyle = '#0097a7';
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (gameShape === 'circle') {
        ctx.arc(400, 300, currentSize, 0, Math.PI * 2);
    } else if (gameShape === 'square') {
        ctx.rect(400 - currentSize, 300 - currentSize, currentSize * 2, currentSize * 2);
    }
    
    ctx.fill();
    ctx.stroke();

    // Draw Players
    Object.values(playersData).forEach(p => {
        // Body
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Axe line
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 15, p.y - 15);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1;

        // Name and Score
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - 20);
        ctx.fillText(`Score: ${p.score}`, p.x, p.y + 25);
    });

    requestAnimationFrame(gameLoop);
}

function showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    view.classList.add('active');
}