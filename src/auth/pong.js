export function startPong(canvas) {
  const ctx = canvas.getContext('2d');

  let W, H;
  const NW = 108, NH = 38, NR = 6;
  const MARGIN = 64;
  const BALL_R = 4;
  const TRAIL_LEN = 48;
  const INIT_SPEED = 3.0;

  // Game state
  let lx, rx;   // node x positions (left/right)
  let ly, ry;   // node y positions (animated)
  let bx, by;   // ball position
  let vx, vy;   // ball velocity
  let trail = [];

  function init() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    lx = MARGIN;
    rx = W - MARGIN - NW;
    ly = H / 2 - NH / 2;
    ry = H / 2 - NH / 2;
    bx = W / 2;
    by = H / 2;
    vx = INIT_SPEED;
    vy = 1.6;
    trail = [];
  }

  // ── Rounded rect helper (no ctx.roundRect for broader compat) ──────────────
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawNode(x, y, label) {
    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    rrect(x, y, NW, NH, NR);
    ctx.fillStyle = '#1a1a1f';
    ctx.fill();
    ctx.restore();

    // Border
    rrect(x, y, NW, NH, NR);
    ctx.strokeStyle = '#2d2d3a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Note dot (top-right accent dot, like in the app)
    ctx.fillStyle = '#d4a574';
    ctx.beginPath();
    ctx.arc(x + NW - 10, y + 10, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Title text
    ctx.fillStyle = '#3c3c50';
    ctx.font = '500 11px "Fraunces", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 12, y + NH / 2);
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw individual segments from oldest→newest with increasing opacity & width
    // This recreates the look of the connector lines with a fading tail
    for (let i = 1; i < trail.length; i++) {
      const t = i / trail.length;
      ctx.globalAlpha = t * 0.5;
      ctx.lineWidth   = t * 2.5;
      ctx.strokeStyle = '#d4a574';
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x,     trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    ctx.shadowColor = 'rgba(212,165,116,0.55)';
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = '#d4a574';
    ctx.beginPath();
    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function update() {
    bx += vx;
    by += vy;

    // Top / bottom wall bounce
    if (by - BALL_R < 0)  { by = BALL_R;      vy =  Math.abs(vy); }
    if (by + BALL_R > H)  { by = H - BALL_R;  vy = -Math.abs(vy); }

    // Left node collision
    if (vx < 0 && bx - BALL_R <= lx + NW && bx + BALL_R >= lx) {
      const mid = ly + NH / 2;
      if (Math.abs(by - mid) < NH / 2 + BALL_R) {
        bx = lx + NW + BALL_R;
        vx = Math.abs(vx) * 1.03;                 // tiny speedup on each hit
        vy += ((by - mid) / (NH / 2)) * 1.3;      // angle from hit position
      }
    }

    // Right node collision
    if (vx > 0 && bx + BALL_R >= rx && bx - BALL_R <= rx + NW) {
      const mid = ry + NH / 2;
      if (Math.abs(by - mid) < NH / 2 + BALL_R) {
        bx = rx - BALL_R;
        vx = -(Math.abs(vx) * 1.03);
        vy += ((by - mid) / (NH / 2)) * 1.3;
      }
    }

    // Speed cap (keeps game from getting too fast after many hits)
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 7) { vx = (vx / speed) * 7; vy = (vy / speed) * 7; }

    // Ball out of bounds → smooth reset
    if (bx < -30 || bx > W + 30) {
      bx = W / 2;
      by = H / 2 + (Math.random() - 0.5) * H * 0.3;
      vx = (bx < 0 ? 1 : -1) * INIT_SPEED;
      vy = (Math.random() - 0.5) * 2.5;
      trail = [];
    }

    // AI: smooth node tracking (intentional slight lag creates organic movement)
    const ease = 0.06;
    ly += (by - NH / 2 - ly) * ease;
    ry += (by - NH / 2 - ry) * ease;
    ly = Math.max(0, Math.min(H - NH, ly));
    ry = Math.max(0, Math.min(H - NH, ry));

    // Record trail point
    trail.push({ x: bx, y: by });
    if (trail.length > TRAIL_LEN) trail.shift();
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  let animId;

  function frame() {
    if (!canvas.isConnected) return;
    ctx.clearRect(0, 0, W, H);
    update();
    drawTrail();
    drawBall();
    drawNode(lx, ly, 'start here');
    drawNode(rx, ry, 'all ideas');
    animId = requestAnimationFrame(frame);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  const onResize = () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    rx = W - MARGIN - NW;
  };
  window.addEventListener('resize', onResize);

  init();
  animId = requestAnimationFrame(frame);

  // Return cleanup function
  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
  };
}
