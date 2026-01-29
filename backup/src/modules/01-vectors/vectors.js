// ===== Vector Utility Functions =====
const Vec = {
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    scale: (v, s) => ({ x: v.x * s, y: v.y * s }),
    magnitude: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    normalize: (v) => {
        const mag = Vec.magnitude(v);
        return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
    },
    dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
    reflect: (v, normal) => {
        const d = Vec.dot(v, normal) * 2;
        return { x: v.x - normal.x * d, y: v.y - normal.y * d };
    }
};

// ===== Demo 1: Vector Visualization =====
(function() {
    const canvas = document.getElementById('vectorDemo');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let mousePos = { x: centerX + 100, y: centerY };

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    });

    function drawArrow(fromX, fromY, toX, toY, color = '#6c5ce7') {
        const headLen = 15;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    function render() {
        ctx.fillStyle = '#1a1a24';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        ctx.strokeStyle = '#2a2a3a';
        ctx.lineWidth = 1;
        for (let i = 0; i < canvas.width; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i < canvas.height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
            ctx.stroke();
        }

        // Draw center point
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Draw vector
        drawArrow(centerX, centerY, mousePos.x, mousePos.y, '#6c5ce7');

        // Calculate and display info
        const vec = Vec.sub(mousePos, { x: centerX, y: centerY });
        const mag = Vec.magnitude(vec);
        const norm = Vec.normalize(vec);

        ctx.fillStyle = '#fff';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText(`Vector: (${vec.x.toFixed(0)}, ${vec.y.toFixed(0)})`, 10, 25);
        ctx.fillText(`Magnitude: ${mag.toFixed(1)}`, 10, 45);
        ctx.fillText(`Normalized: (${norm.x.toFixed(2)}, ${norm.y.toFixed(2)})`, 10, 65);

        requestAnimationFrame(render);
    }

    render();
})();

// ===== Demo 2: Dot Product Visualization =====
(function() {
    const canvas = document.getElementById('dotProductDemo');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let mousePos = { x: centerX + 100, y: centerY };

    const fixedVec = { x: 100, y: 0 }; // Blue vector, pointing right

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    });

    function drawArrow(fromX, fromY, toX, toY, color) {
        const headLen = 12;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    function render() {
        ctx.fillStyle = '#1a1a24';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw center
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Fixed vector (blue)
        drawArrow(centerX, centerY, centerX + fixedVec.x, centerY + fixedVec.y, '#74b9ff');

        // Mouse vector (red)
        const mouseVec = Vec.sub(mousePos, { x: centerX, y: centerY });
        const normalizedMouse = Vec.normalize(mouseVec);
        const scaledMouse = Vec.scale(normalizedMouse, 100);
        drawArrow(centerX, centerY, centerX + scaledMouse.x, centerY + scaledMouse.y, '#e17055');

        // Calculate dot product of normalized vectors
        const normFixed = Vec.normalize(fixedVec);
        const dotProduct = Vec.dot(normFixed, normalizedMouse);

        // Draw arc showing angle
        const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
        ctx.strokeStyle = '#fdcb6e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const startAngle = 0;
        const endAngle = Math.atan2(scaledMouse.y, scaledMouse.x);
        ctx.arc(centerX, centerY, 40, startAngle, endAngle, scaledMouse.y < 0);
        ctx.stroke();

        // Display info
        ctx.fillStyle = '#fff';
        ctx.font = '16px Inter, sans-serif';
        
        let interpretation = '';
        let color = '#fff';
        if (dotProduct > 0.5) {
            interpretation = 'Similar direction';
            color = '#00b894';
        } else if (dotProduct > -0.5) {
            interpretation = 'Perpendicular-ish';
            color = '#fdcb6e';
        } else {
            interpretation = 'Opposite direction';
            color = '#e17055';
        }

        ctx.fillText(`Dot Product: ${dotProduct.toFixed(2)}`, 10, 25);
        ctx.fillText(`Angle: ${(angle * 180 / Math.PI).toFixed(0)}°`, 10, 50);
        ctx.fillStyle = color;
        ctx.fillText(interpretation, 10, 75);

        ctx.fillStyle = '#74b9ff';
        ctx.fillText('Blue: Fixed vector', canvas.width - 150, 25);
        ctx.fillStyle = '#e17055';
        ctx.fillText('Red: Your vector', canvas.width - 150, 50);

        requestAnimationFrame(render);
    }

    render();
})();

// ===== Pong Game =====
(function() {
    const canvas = document.getElementById('pongGame');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Game state
    let gameRunning = false;
    let scores = { player: 0, ai: 0 };
    const WINNING_SCORE = 5;
    
    // Paddle settings
    const PADDLE_WIDTH = 12;
    const PADDLE_HEIGHT = 80;
    const PADDLE_SPEED = 6;
    
    // Ball settings
    const BALL_SIZE = 12;
    const BALL_SPEED = 5;
    
    // Game objects
    let player = {
        x: 30,
        y: canvas.height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        vy: 0
    };
    
    let ai = {
        x: canvas.width - 30 - PADDLE_WIDTH,
        y: canvas.height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        vy: 0
    };
    
    let ball = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        size: BALL_SIZE,
        vx: BALL_SPEED,
        vy: BALL_SPEED * (Math.random() - 0.5)
    };

    // Input handling
    const keys = {};
    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) {
            e.preventDefault();
        }
    });
    document.addEventListener('keyup', (e) => keys[e.key] = false);

    // Button handlers
    document.getElementById('startBtn')?.addEventListener('click', () => {
        if (!gameRunning) {
            gameRunning = true;
            resetBall();
        }
    });

    document.getElementById('resetBtn')?.addEventListener('click', () => {
        gameRunning = false;
        scores = { player: 0, ai: 0 };
        resetBall();
        player.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
        ai.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    });

    function resetBall() {
        ball.x = canvas.width / 2;
        ball.y = canvas.height / 2;
        ball.vx = BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
        ball.vy = BALL_SPEED * (Math.random() - 0.5);
    }

    function aabbCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    function update() {
        if (!gameRunning) return;

        // Player movement
        if (keys['ArrowUp'] || keys['w']) {
            player.y -= PADDLE_SPEED;
        }
        if (keys['ArrowDown'] || keys['s']) {
            player.y += PADDLE_SPEED;
        }

        // Clamp player position
        player.y = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, player.y));

        // AI movement (simple tracking with delay)
        const aiCenter = ai.y + PADDLE_HEIGHT / 2;
        const targetY = ball.y;
        const aiSpeed = PADDLE_SPEED * 0.7;
        
        if (aiCenter < targetY - 10) {
            ai.y += aiSpeed;
        } else if (aiCenter > targetY + 10) {
            ai.y -= aiSpeed;
        }
        ai.y = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, ai.y));

        // Ball movement
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Ball collision with top/bottom
        if (ball.y <= 0 || ball.y + ball.size >= canvas.height) {
            ball.vy *= -1;
            ball.y = ball.y <= 0 ? 0 : canvas.height - ball.size;
        }

        // Ball collision with paddles
        const ballRect = { x: ball.x, y: ball.y, width: ball.size, height: ball.size };

        if (aabbCollision(ballRect, player) && ball.vx < 0) {
            ball.vx *= -1.05; // Slight speed increase
            ball.x = player.x + player.width;
            
            // Add angle based on hit position
            const hitPos = (ball.y + ball.size / 2 - player.y) / PADDLE_HEIGHT;
            ball.vy = (hitPos - 0.5) * BALL_SPEED * 2;
        }

        if (aabbCollision(ballRect, ai) && ball.vx > 0) {
            ball.vx *= -1.05;
            ball.x = ai.x - ball.size;
            
            const hitPos = (ball.y + ball.size / 2 - ai.y) / PADDLE_HEIGHT;
            ball.vy = (hitPos - 0.5) * BALL_SPEED * 2;
        }

        // Scoring
        if (ball.x < 0) {
            scores.ai++;
            if (scores.ai >= WINNING_SCORE) {
                gameRunning = false;
            } else {
                resetBall();
            }
        }

        if (ball.x > canvas.width) {
            scores.player++;
            if (scores.player >= WINNING_SCORE) {
                gameRunning = false;
            } else {
                resetBall();
            }
        }
    }

    function render() {
        // Background
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Center line
        ctx.strokeStyle = '#2a2a3a';
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Paddles
        ctx.fillStyle = '#6c5ce7';
        ctx.fillRect(player.x, player.y, player.width, player.height);
        
        ctx.fillStyle = '#e17055';
        ctx.fillRect(ai.x, ai.y, ai.width, ai.height);

        // Ball
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.x + ball.size / 2, ball.y + ball.size / 2, ball.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Scores
        ctx.font = 'bold 48px Inter, sans-serif';
        ctx.fillStyle = '#6c5ce7';
        ctx.fillText(scores.player, canvas.width / 4, 60);
        ctx.fillStyle = '#e17055';
        ctx.fillText(scores.ai, canvas.width * 3 / 4 - 20, 60);

        // Game state messages
        if (!gameRunning) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px Inter, sans-serif';
            ctx.textAlign = 'center';
            
            if (scores.player >= WINNING_SCORE) {
                ctx.fillText('You Win! 🎉', canvas.width / 2, canvas.height / 2);
            } else if (scores.ai >= WINNING_SCORE) {
                ctx.fillText('AI Wins!', canvas.width / 2, canvas.height / 2);
            } else {
                ctx.fillText('Press Start to Play', canvas.width / 2, canvas.height / 2);
            }
            
            ctx.textAlign = 'left';
        }

        requestAnimationFrame(render);
    }

    // Game loop
    function gameLoop() {
        update();
        setTimeout(gameLoop, 1000 / 60);
    }

    gameLoop();
    render();
})();
