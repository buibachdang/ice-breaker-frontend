// Add these variables near the top of game.js with your other variables
let warningMessage = "";
let warningTimeout = null;

// Generate the visual ice blocks (Do this once outside the loop)
const visualIceBlocks = [];
const blockSize = 14;
const rows = 16;
for (let r = 0; r < rows; r++) {
    const blocksInRow = r + 1;
    const startX = 400 - (blocksInRow * blockSize) / 2;
    const y = 180 + r * blockSize;
    for (let c = 0; c < blocksInRow; c++) {
        visualIceBlocks.push({ x: startX + c * blockSize, y: y });
    }
}
// Randomize the blocks so the pyramid crumbles randomly instead of strictly top-down
visualIceBlocks.sort(() => Math.random() - 0.5);

// Replace with your Render/backend URL when deployed
const socket = io('https://ice-breaker-backend.onrender.com'); 

const urlParams = new URLSearchParams(window.location.search);
// const adminParam = urlParams.get('admin');
const joinParam = urlParams.get('join');
let isAdmin = urlParams.has('admin');

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
if (isAdmin) {
    sessionId = urlParams.get('admin');
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
    sessionId = id;
    isAdmin = true; // <--- ADD THIS LINE so the code remembers you are the admin!
    
    // 1. Update the URL silently without reloading the page
    window.history.pushState({}, '', `?admin=${id}`);
    
    // 2. Switch the UI to the Admin view
    showView(viewAdmin);
    
    // 3. Populate the links on the dashboard
    document.getElementById('admin-link').href = window.location.href;
    document.getElementById('admin-link').innerText = "Admin Link";
    const jLink = `${window.location.origin}${window.location.pathname}?join=${id}`;
    document.getElementById('join-link').href = jLink;
    document.getElementById('join-link').innerText = jLink;
});

socket.on('updatePlayers', (players) => {
    if (isAdmin) {
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
    if (isAdmin) showView(viewGame); // Admin can watch
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
    const player = playersData[myId];
    if (!player) return;

    const dist = Math.hypot(player.x - 400, player.y - 300);
    
    if (dist > 150) {
        // Player is too far away
        warningMessage = "Too far! Move closer!";
        clearTimeout(warningTimeout);
        warningTimeout = setTimeout(() => { warningMessage = ""; }, 1500);
    } else {
        // Player is close enough to mine
        socket.emit('clickIce', sessionId);
    }
});

function gameLoop() {
    if (!isPlaying) return;

    // Movement (Client prediction)
    if (myId && playersData[myId]) {
        const speed = 5;
        let p = playersData[myId];
        let moved = false;
        if (keys.ArrowUp && p.y > 0) { p.y -= speed; moved = true; }
        if (keys.ArrowDown && p.y < 600) { p.y += speed; moved = true; }
        if (keys.ArrowLeft && p.x > 0) { p.x -= speed; moved = true; }
        if (keys.ArrowRight && p.x < 800) { p.x += speed; moved = true; }
        if (moved) socket.emit('move', { sessionId, x: p.x, y: p.y });
    }

    // Clear Canvas
    ctx.clearRect(0, 0, 800, 600);

    // Draw the Ice Pyramid (The new cube logic!)
    // Calculate how many visual cubes to draw based on the 1000 total pool
    const blocksToDraw = Math.ceil((iceAmount / 1000) * visualIceBlocks.length);
    
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < blocksToDraw; i++) {
        const block = visualIceBlocks[i];
        
        // Base cube color
        ctx.fillStyle = '#29b6f6'; 
        ctx.fillRect(block.x, block.y, blockSize, blockSize);
        ctx.strokeRect(block.x, block.y, blockSize, blockSize);
        
        // Shiny highlight on top of the cube
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(block.x, block.y, blockSize, blockSize / 3);
    }

    // Draw Players
    Object.values(playersData).forEach(p => {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 12, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Player Body
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Pickaxe Handle
        ctx.beginPath();
        ctx.moveTo(p.x + 5, p.y);
        ctx.lineTo(p.x + 20, p.y - 15);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#795548'; // Wood color
        ctx.stroke();
        
        // Pickaxe Head
        ctx.beginPath();
        ctx.moveTo(p.x + 12, p.y - 17);
        ctx.lineTo(p.x + 25, p.y - 8);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#9e9e9e'; // Iron color
        ctx.stroke();

        // Name and Score Text
        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        // Add white outline to text so it's readable over the ice
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.strokeText(p.name, p.x, p.y - 25);
        ctx.fillText(p.name, p.x, p.y - 25);
        
        ctx.font = '12px sans-serif';
        ctx.strokeText(`Score: ${p.score}`, p.x, p.y + 28);
        ctx.fillText(`Score: ${p.score}`, p.x, p.y + 28);
    });

    // Draw Warning Message if active
    if (warningMessage) {
        const player = playersData[myId];
        if (player) {
            ctx.fillStyle = '#d32f2f';
            ctx.font = 'bold 16px sans-serif';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.strokeText(warningMessage, player.x, player.y - 45);
            ctx.fillText(warningMessage, player.x, player.y - 45);
        }
    }

    requestAnimationFrame(gameLoop);
}

function showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    view.classList.add('active');
}