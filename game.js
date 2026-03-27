// Replace with your Render/backend URL when deployed
const socket = io('https://ice-breaker-backend.onrender.com'); 

const urlParams = new URLSearchParams(window.location.search);
const adminParam = urlParams.get('admin');
const joinParam = urlParams.get('join');

let sessionId = '';
let isPlaying = false;
let myId = '';
let playersData = {};
let iceAmount = 1000;
let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

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

// 2. Buttons
document.getElementById('btn-create').onclick = () => socket.emit('createSession');
document.getElementById('btn-join').onclick = () => {
    const name = document.getElementById('input-name').value;
    if (name) socket.emit('joinSession', { sessionId, name });
};
document.getElementById('input-time').onchange = (e) => socket.emit('updateTime', { sessionId, time: e.target.value });
document.getElementById('btn-start').onclick = () => socket.emit('startGame', sessionId);

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

socket.on('gameStarted', ({ players, time }) => {
    playersData = players;
    document.getElementById('timer').innerText = `Time: ${time}`;
    if (adminParam) showView(viewGame); // Admin can watch
    isPlaying = true;
    requestAnimationFrame(gameLoop);
});

socket.on('tick', (time) => document.getElementById('timer').innerText = `Time: ${time}`);
socket.on('playerMoved', ({ id, x, y }) => { if (playersData[id]) { playersData[id].x = x; playersData[id].y = y; }});
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
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Check if clicked inside the central ice area
    if (clickX > 300 && clickX < 500 && clickY > 200 && clickY < 400) {
        socket.emit('clickIce', sessionId);
    }
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

    // Draw Ice Pyramid
    ctx.fillStyle = '#81d4fa';
    ctx.beginPath();
    ctx.moveTo(400, 200);
    ctx.lineTo(500, 400);
    ctx.lineTo(300, 400);
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