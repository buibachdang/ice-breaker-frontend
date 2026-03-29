// Add these variables near the top of game.js with your other variables
let warningMessage = "";
let particles = [];
let audioCtx; // To be initialized on user gesture

// A robust way to initialize and resume audio context
function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // On iOS and some browsers, the context is created in a "suspended" state.
            // It must be resumed by a user gesture.
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            // Play a silent sound to "unlock" the audio context
            const buffer = audioCtx.createBuffer(1, 1, 22050);
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(0);
        } catch (e) {
            console.error("Web Audio API is not supported in this browser", e);
        }
    } else if (audioCtx.state === 'suspended') {
        // If the context exists but is suspended, try to resume it.
        audioCtx.resume();
    }
}

// One-time listener to initialize audio on the first user interaction
function initAudioOnFirstInteraction() {
    initAudio();
    document.removeEventListener('click', initAudioOnFirstInteraction);
    document.removeEventListener('touchstart', initAudioOnFirstInteraction);
}

document.addEventListener('click', initAudioOnFirstInteraction);
document.addEventListener('touchstart', initAudioOnFirstInteraction);

// Sound for breaking ice
function playIceHitSound() {
    if (!audioCtx) return;
    const play = () => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(660, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.15);
    };
    if (audioCtx.state === 'running') {
        play();
    } else {
        audioCtx.resume().then(play);
    }
}

// Sound for the last 10 seconds countdown
function playTickSound() {
    if (!audioCtx) return;
    const play = () => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
    };
    if (audioCtx.state === 'running') {
        play();
    } else {
        audioCtx.resume().then(play);
    }
}

// Generates an explosion of 12 white squares at a specific X, Y coordinate
function createParticles(x, y) {
    for (let i = 0; i < 12; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10, // Random velocity left/right
            vy: (Math.random() - 0.5) * 10, // Random velocity up/down
            life: 1.0,                      // Starts fully visible (opacity 1)
            size: Math.random() * 5 + 2     // Random size between 2px and 7px
        });
    }
}

let warningTimeout = null;
let lastFrameTime = 0;
let lastMoveEmit = 0;

let iceBlocks = [];
const blockSize = 12;
const iceRadius = 90; // The radius of the circular ice field
for (let x = -iceRadius; x < iceRadius; x += blockSize) {
    for (let y = -iceRadius; y < iceRadius; y += blockSize) {
        if (Math.hypot(x, y) < iceRadius) {
            iceBlocks.push({ x: 400 + x, y: 300 + y, active: true, color: '#aee9ff' });
        }
    }
}

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
let iceAmount = 0;

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
document.getElementById('btn-create').onclick = () => {
    socket.emit('createSession');
};
document.getElementById('btn-join').onclick = () => {
    const name = document.getElementById('input-name').value;
    if (name) socket.emit('joinSession', { sessionId, name });
};
document.getElementById('input-time').onchange = (e) => socket.emit('updateTime', { sessionId, time: e.target.value });
document.getElementById('btn-start').onclick = () => {
    // New: Calculate spawn points in a circle around the ice
    const playerIds = Object.keys(playersData);
    const spawnRadius = iceRadius + 60; // Spawn players 60px away from the ice edge
    const angleIncrement = (2 * Math.PI) / playerIds.length;
    
    const playerSpawns = {};
    playerIds.forEach((id, index) => {
        const angle = index * angleIncrement;
        playerSpawns[id] = {
            x: 400 + spawnRadius * Math.cos(angle),
            y: 300 + spawnRadius * Math.sin(angle)
        };
    });

    // Client now sends the positions of the blocks it has generated
    const blockPositions = iceBlocks.map(b => ({ x: b.x, y: b.y }));

    socket.emit('startGame', {
        sessionId,
        players: playerSpawns,
        blockPositions: blockPositions
    });
};

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
    players.forEach(p => playersData[p.id] = p); // Keep everyone's data in sync
    if (isAdmin) {
        document.getElementById('admin-player-list').innerText = `Players joined: ${players.length}/20`;
    } else {
        showView(viewGame);
        myId = socket.id;
    }
});

socket.on('gameStarted', ({ players, time, iceBlocks: serverIceBlocks }) => {
    playersData = players;
    iceBlocks = serverIceBlocks; // The server is the source of truth for block data
    iceAmount = iceBlocks.length;
    document.getElementById('timer').innerText = `Time: ${time}`;
    document.getElementById('ice-counter').innerText = `Ice: ${iceAmount}`;
    if (isAdmin) showView(viewGame);
    isPlaying = true;
    requestAnimationFrame(gameLoop);
});

socket.on('tick', (time) => {
    document.getElementById('timer').innerText = `Time: ${time}`;
    if (time > 0 && time <= 10) {
        playTickSound();
    }
});
socket.on('playerMoved', ({ id, x, y }) => {
    // Don't overwrite our own position — we use client-side prediction
    if (id !== myId && playersData[id]) { playersData[id].x = x; playersData[id].y = y; }
});

socket.on('iceUpdate', ({ iceRemaining, brokenBlocks, players }) => {
    iceAmount = iceRemaining;
    // Preserve our own client-predicted position — only update scores/other state from server
    const myPos = (myId && playersData[myId]) ? { x: playersData[myId].x, y: playersData[myId].y } : null;
    playersData = players;
    if (myPos && playersData[myId]) {
        playersData[myId].x = myPos.x;
        playersData[myId].y = myPos.y;
    }
    document.getElementById('ice-counter').innerText = `Ice: ${iceAmount}`;

    // Server now sends only the newly broken blocks
    brokenBlocks.forEach(index => {
        if (iceBlocks[index]) {
            iceBlocks[index].active = false;
        }
    });
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

    if (isAdmin) {
        const backToHomeLink = document.getElementById('back-to-home-link');
        if (backToHomeLink) {
            backToHomeLink.style.display = 'inline-block';
        }
    }
});

// 4. Game Loop & Canvas
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const joystick = {
    active: false,
    base: { x: 0, y: 0 },
    stick: { x: 0, y: 0 },
    touchId: null
};

window.addEventListener('keydown', (e) => {
    if (!isPlaying || !myId || !playersData[myId]) return;

    let p = playersData[myId];
    let moved = false;
    const moveAmount = blockSize; // move one block at a time

    switch (e.code) {
        case 'ArrowUp':
            if (p.y > 0) { p.y -= moveAmount; moved = true; }
            break;
        case 'ArrowDown':
            if (p.y < 600) { p.y += moveAmount; moved = true; }
            break;
        case 'ArrowLeft':
            if (p.x > 0) { p.x -= moveAmount; moved = true; }
            break;
        case 'ArrowRight':
            if (p.x < 800) { p.x += moveAmount; moved = true; }
            break;
    }

    if (moved) {
        socket.emit('move', { sessionId, x: p.x, y: p.y });
    }
});

function getTouchPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio(); // Ensure audio is unlocked on every touch — iOS requires this in the gesture handler
    const touch = e.changedTouches[0];
    const pos = getTouchPos(canvas, touch);

    // Only activate joystick on the left half of the screen
    if (pos.x < canvas.width / 2) {
        joystick.touchId = touch.identifier;
        joystick.active = true;
        joystick.base.x = pos.x;
        joystick.base.y = pos.y;
        joystick.stick.x = pos.x;
        joystick.stick.y = pos.y;
    } else {
        // Handle clicking ice on the right half
        handleIceClick(e);
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (let touch of e.changedTouches) {
        if (touch.identifier === joystick.touchId) {
            joystick.active = false;
            joystick.touchId = null;
            break;
        }
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let touch of e.changedTouches) {
        if (touch.identifier === joystick.touchId) {
            const pos = getTouchPos(canvas, touch);
            joystick.stick.x = pos.x;
            joystick.stick.y = pos.y;
            break;
        }
    }
}, { passive: false });


canvas.addEventListener('mousedown', (e) => {
    // Don't handle mousedown if a touch joystick is active
    if (joystick.touchId !== null) return;
    handleIceClick(e);
});

function handleIceClick(evt) {
    if (!isPlaying || !myId) return;
    const player = playersData[myId];
    if (!player) return;

    // For touch events, we use the first changed touch. For mouse, we use the event itself.
    const pos = getTouchPos(canvas, evt.changedTouches ? evt.changedTouches[0] : evt);

    // Initialize click tracking on the player object if it's not there
    if (!player.clickTimestamps) player.clickTimestamps = [];

    const axeHeadX = player.x + 25;
    const axeHeadY = player.y - 8;

    // Check if the axe is outside the ice field. If so, show warning and stop.
    if (Math.hypot(axeHeadX - 400, axeHeadY - 300) > iceRadius + 20) {
        warningMessage = "Too far! Move closer!";
        clearTimeout(warningTimeout);
        warningTimeout = setTimeout(() => { warningMessage = ""; }, 1500);
        return;
    }

    // Find the primary block hit by the axe
    let hitIndex = -1;
    for (let i = 0; i < iceBlocks.length; i++) {
        const b = iceBlocks[i];
        if (!b.active) continue;
        if (axeHeadX >= b.x && axeHeadX <= b.x + blockSize &&
            axeHeadY >= b.y && axeHeadY <= b.y + blockSize) {
            hitIndex = i;
            break;
        }
    }

    if (hitIndex !== -1) {
        // A block was successfully hit
        playIceHitSound();
        iceBlocks[hitIndex].color = 'white';
        // Client-side combo calculation
        const now = Date.now();
        player.clickTimestamps = player.clickTimestamps.filter(t => now - t < 1000);
        player.clickTimestamps.push(now);
        const cubesToBreak = Math.min(5, 1 + Math.floor(player.clickTimestamps.length / 2));

        const blocksToBreak = [hitIndex];

        // Find adjacent blocks to satisfy the combo
        let checkIndex = 0;
        while (blocksToBreak.length < cubesToBreak && checkIndex < iceBlocks.length) {
            if (checkIndex !== hitIndex && iceBlocks[checkIndex].active && !blocksToBreak.includes(checkIndex)) {
                const dist = Math.hypot(
                    iceBlocks[checkIndex].x - iceBlocks[hitIndex].x,
                    iceBlocks[checkIndex].y - iceBlocks[hitIndex].y
                );
                // If block is within ~2 block widths, consider it "adjacent" for combo purposes
                if (dist < blockSize * 2.5) {
                    blocksToBreak.push(checkIndex);
                }
            }
            checkIndex++;
        }
        
        createParticles(iceBlocks[hitIndex].x + blockSize / 2, iceBlocks[hitIndex].y + blockSize / 2);
        socket.emit('clickIce', { sessionId, blocksToBreak });
    }
    // If inside the perimeter but no block is hit, do nothing.
}

function gameLoop(timestamp) {
    if (!isPlaying) return;

    // Delta-time: normalise movement to 60fps regardless of actual frame rate
    const dt = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 16.67, 3) : 1;
    lastFrameTime = timestamp;

    // Movement (Client prediction)
    let moved = false;
    if (myId && playersData[myId]) {
        const speed = 2;
        let p = playersData[myId];

        // Joystick movement
        if (joystick.active) {
            const dx = joystick.stick.x - joystick.base.x;
            const dy = joystick.stick.y - joystick.base.y;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);

            // Normalize and apply speed scaled by delta-time
            if (dist > 10) { // Only move if stick is moved significantly
                p.x += Math.cos(angle) * speed * dt;
                p.y += Math.sin(angle) * speed * dt;
                moved = true;
            }
        }

        // Throttle network emissions to ~20/s to avoid flooding on mobile
        if (moved && timestamp - lastMoveEmit > 50) {
            socket.emit('move', { sessionId, x: p.x, y: p.y });
            lastMoveEmit = timestamp;
        }
    }

    // Clear Canvas
    ctx.clearRect(0, 0, 800, 600);

    // Draw the Ice Blocks
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < iceBlocks.length; i++) {
        const block = iceBlocks[i];
        if (!block.active) continue; // Skip broken blocks!
        
        ctx.fillStyle = block.color; 
        ctx.fillRect(block.x, block.y, blockSize, blockSize);
        ctx.strokeRect(block.x, block.y, blockSize, blockSize);
        
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

    // Draw Joystick if active
    if (joystick.active) {
        ctx.beginPath();
        ctx.arc(joystick.base.x, joystick.base.y, 40, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(joystick.stick.x, joystick.stick.y, 25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(128, 128, 128, 0.6)';
        ctx.fill();
    }

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

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        
        // Move the particle
        p.x += p.vx;
        p.y += p.vy;
        
        // Add a tiny bit of gravity so they arc downwards
        p.vy += 0.2; 
        
        // Fade it out
        p.life -= 0.03; 

        if (p.life <= 0) {
            // Remove dead particles from the array
            particles.splice(i, 1);
        } else {
            // Draw living particles with fading opacity
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
    }

    requestAnimationFrame(gameLoop);
}

function showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    view.classList.add('active');
}