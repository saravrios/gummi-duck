/* ===========================================================================
   which gummi duck are you?
   - participant view: 3x3 grid of duck buttons
   - host view: matter.js "pond" with 9 bubbles + a QR code
   - sync: firebase realtime db, falling back to BroadcastChannel for local demo
   =========================================================================== */

const DUCKS = [
  { id: 1, name: "the main character" },
  { id: 2, name: "the 'i'm fine' duck" },
  { id: 3, name: "the 3pm slump" },
  { id: 4, name: "the leaner" },
  { id: 5, name: "the full collapse" },
  { id: 6, name: "the horizontal specialist" },
  { id: 7, name: "the faceplanter" },
  { id: 8, name: "the round unit" },
  { id: 9, name: "the submariner" },
];

// Default URL = host (the public presentation page with QR + pond).
// Phones land on the voter grid via ?vote (encoded into the QR).
const params  = new URLSearchParams(location.search);
const isVoter = params.has("vote");
const isHost  = !isVoter;

document.getElementById("voter").hidden = !isVoter;
document.getElementById("host").hidden  = !isHost;

/* ---------------------------------------------------------- sprite geometry */
/* The screenshot includes a title banner. We treat the 3x3 grid as occupying
   the area from --grid-top to (100% - --grid-bot) vertically, full width.    */

function cropStyleFor(duckId) {
  const row = Math.floor((duckId - 1) / 3);   // 0,1,2
  const col = (duckId - 1) % 3;               // 0,1,2

  const cssRoot = getComputedStyle(document.documentElement);
  const gridTop = parseFloat(cssRoot.getPropertyValue("--grid-top"));
  const gridBot = parseFloat(cssRoot.getPropertyValue("--grid-bot"));
  const gridH   = 100 - gridTop - gridBot;    // % of source image that is the 3x3 grid
  const cellH   = gridH / 3;
  const cellW   = 100 / 3;

  // bg-size: scale so that one cell == 100% of the button. button is square,
  // so we want each cell (which is ~cellW% wide × cellH% tall of source) to
  // map to 100%×100% of the button. that means:
  //   bg-width  = 100% / (cellW/100) = 100% * (100/cellW) = 300%
  //   bg-height = 100% / (cellH/100)
  const bgW = 100 / (cellW / 100);
  const bgH = 100 / (cellH / 100);

  // bg-position uses the "percentage of the *leftover* space" model, so:
  //   posX = (col * cellW) / (100 - cellW) * 100%
  //   posY = ((gridTop + row*cellH)) / (100 - cellH) * 100%
  const posX = (col * cellW) / (100 - cellW) * 100;
  const posY = (gridTop + row * cellH) / (100 - cellH) * 100;

  return {
    size: `${bgW}% ${bgH}%`,
    pos:  `${posX}% ${posY}%`,
  };
}

/* ---------------------------------------------------------- sync layer */
/* Two implementations behind a tiny interface:
     sync.onVotes(cb)   -> cb({1: n, 2: n, ...}) any time totals change
     sync.vote(duckId)  -> increments that duck's count
     sync.reset()       -> zero everything
*/

function makeFirebaseSync() {
  const cfg = window.FIREBASE_CONFIG || {};
  if (!cfg.databaseURL || cfg.databaseURL.includes("PASTE_ME")) return null;
  try {
    firebase.initializeApp(cfg);
    const db = firebase.database();
    const root = db.ref("polls/current");
    return {
      kind: "firebase",
      onVotes(cb) {
        root.child("votes").on("value", snap => cb(snap.val() || {}));
      },
      vote(id) {
        root.child("votes/" + id).transaction(v => (v || 0) + 1);
      },
      reset() {
        root.child("votes").set({});
      },
    };
  } catch (err) {
    console.warn("[firebase] init failed, falling back to local", err);
    return null;
  }
}

function makeLocalSync() {
  const KEY = "gummi-duck-votes";
  const ch  = ("BroadcastChannel" in window) ? new BroadcastChannel("gummi-duck") : null;
  const read  = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const write = v  => localStorage.setItem(KEY, JSON.stringify(v));
  const listeners = [];
  const emit = () => { const v = read(); listeners.forEach(fn => fn(v)); };

  if (ch) ch.onmessage = emit;
  window.addEventListener("storage", emit);

  return {
    kind: "local",
    onVotes(cb) { listeners.push(cb); cb(read()); },
    vote(id) {
      const v = read();
      v[id] = (v[id] || 0) + 1;
      write(v);
      ch?.postMessage("update");
      emit();
    },
    reset() {
      write({});
      ch?.postMessage("update");
      emit();
    },
  };
}

const sync = makeFirebaseSync() || makeLocalSync();

/* status indicator (voter view) */
const sDot  = document.getElementById("status-dot");
const sText = document.getElementById("status-text");
if (sDot && sText) {
  if (sync.kind === "firebase") {
    sDot.classList.add("live");
    sText.textContent = "live · synced";
  } else {
    sDot.classList.add("local");
    sText.textContent = "local demo mode · add firebase config to go live";
  }
}

/* ============================================================ VOTER VIEW */
if (!isHost) {
  const grid = document.getElementById("grid");
  DUCKS.forEach(d => {
    const { size, pos } = cropStyleFor(d.id);
    const btn = document.createElement("button");
    btn.className = "duck-btn";
    btn.setAttribute("aria-label", `vote ${d.name}`);
    btn.innerHTML = `
      <span class="crop" style="--bg-size:${size}; --bg-pos:${pos};"></span>
      <span class="num">${d.id}</span>
      <span class="label">${d.name}</span>
    `;
    btn.addEventListener("click", () => {
      sync.vote(d.id);
      btn.classList.remove("voted"); void btn.offsetWidth; btn.classList.add("voted");
      if (navigator.vibrate) navigator.vibrate(18);
    });
    grid.appendChild(btn);
  });
}

/* ============================================================ HOST VIEW */
if (isHost) {
  // -- QR -- points phones at the voter grid
  const voterUrl = location.origin + location.pathname + "?vote";
  document.getElementById("qr-url").textContent = voterUrl;
  function renderQR() {
    const host = document.getElementById("qr");
    host.innerHTML = "";
    if (typeof QRCode === "undefined") {
      // fallback: free QR image service
      const img = new Image();
      img.width = 160; img.height = 160;
      img.alt = "scan to vote";
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&color=3D2A14&bgcolor=FFF6D6&data=" + encodeURIComponent(voterUrl);
      host.appendChild(img);
      return;
    }
    new QRCode(host, {
      text: voterUrl,
      width: 160,
      height: 160,
      colorDark:  "#3D2A14",
      colorLight: "#FFF6D6",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }
  renderQR();

  document.getElementById("reset-btn").onclick = () => {
    if (confirm("reset all votes?")) sync.reset();
  };

  // -- physics pond --
  const canvas = document.getElementById("pond");
  const ctx    = canvas.getContext("2d");

  // preload the duck sprite once, then keep a per-duck cached canvas crop
  const sprite = new Image();
  sprite.src = "./ducks.png";

  const cropCache = {};   // id -> offscreen canvas with just that duck cell
  function getCrop(id) {
    if (cropCache[id]) return cropCache[id];
    if (!sprite.complete || !sprite.naturalWidth) return null;
    const cssRoot = getComputedStyle(document.documentElement);
    const gridTop = parseFloat(cssRoot.getPropertyValue("--grid-top")) / 100;
    const gridBot = parseFloat(cssRoot.getPropertyValue("--grid-bot")) / 100;
    const gH = 1 - gridTop - gridBot;
    const cellH = gH / 3;
    const cellW = 1 / 3;

    const row = Math.floor((id - 1) / 3);
    const col = (id - 1) % 3;

    const sx = col * cellW * sprite.naturalWidth;
    const sy = (gridTop + row * cellH) * sprite.naturalHeight;
    const sw = cellW * sprite.naturalWidth;
    const sh = cellH * sprite.naturalHeight;

    // size the offscreen canvas to the cell's longest side so we keep resolution,
    // then draw the WHOLE cell centered inside a circle (fit-contain, no clipping).
    const side = Math.max(sw, sh);
    const off = document.createElement("canvas");
    off.width = off.height = side;
    const octx = off.getContext("2d");

    // pond-water fill behind the duck so transparent letterbox blends in
    octx.save();
    octx.beginPath();
    octx.arc(side/2, side/2, side/2, 0, Math.PI*2);
    octx.closePath();
    octx.fillStyle = "#CDEAF6";
    octx.fill();
    octx.clip();

    // fit-contain the cell into a square, centered
    const scale = side / Math.max(sw, sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (side - dw) / 2;
    const dy = (side - dh) / 2;
    octx.drawImage(sprite, sx, sy, sw, sh, dx, dy, dw, dh);
    octx.restore();

    // crisp ink border
    octx.lineWidth = Math.max(2, side * 0.05);
    octx.strokeStyle = "#1A1304";
    octx.beginPath();
    octx.arc(side/2, side/2, side/2 - octx.lineWidth/2, 0, Math.PI*2);
    octx.stroke();
    cropCache[id] = off;
    return off;
  }

  // matter.js setup
  const { Engine, World, Bodies, Body, Runner, Events } = Matter;
  const engine = Engine.create({ gravity: { x: 0, y: 0 } });
  const world  = engine.world;

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  let dims = fitCanvas();
  let walls = [];
  function rebuildWalls() {
    walls.forEach(w => World.remove(world, w));
    const t = 60;
    walls = [
      Bodies.rectangle(dims.w/2, -t/2,        dims.w + 2*t, t, { isStatic: true }),
      Bodies.rectangle(dims.w/2, dims.h+t/2,  dims.w + 2*t, t, { isStatic: true }),
      Bodies.rectangle(-t/2, dims.h/2,        t, dims.h + 2*t,  { isStatic: true }),
      Bodies.rectangle(dims.w+t/2, dims.h/2,  t, dims.h + 2*t,  { isStatic: true }),
    ];
    World.add(world, walls);
  }
  rebuildWalls();

  // create one bubble per duck with a starting min radius
  const MIN_R = 26;
  const PX_PER_VOTE = 14;   // area-based growth: r = sqrt(MIN_R^2 + votes * PX_PER_VOTE^2)
  const bubbles = {};
  DUCKS.forEach((d, i) => {
    const angle = (i / DUCKS.length) * Math.PI * 2;
    const cx = dims.w/2 + Math.cos(angle) * Math.min(dims.w, dims.h) * 0.25;
    const cy = dims.h/2 + Math.sin(angle) * Math.min(dims.w, dims.h) * 0.25;
    const body = Bodies.circle(cx, cy, MIN_R, {
      restitution: 0.85,
      friction: 0.002,
      frictionAir: 0.025,
      density: 0.0012,
    });
    body.duckId = d.id;
    body.targetR = MIN_R;
    body.currentR = MIN_R;
    World.add(world, body);
    bubbles[d.id] = body;
  });

  // gentle ambient drift so the pond never goes static
  Events.on(engine, "beforeUpdate", () => {
    Object.values(bubbles).forEach(b => {
      const fx = (Math.random() - 0.5) * 0.00006 * b.mass;
      const fy = (Math.random() - 0.5) * 0.00006 * b.mass;
      Body.applyForce(b, b.position, { x: fx, y: fy });
      // smoothly approach target radius
      if (Math.abs(b.currentR - b.targetR) > 0.2) {
        const next = b.currentR + (b.targetR - b.currentR) * 0.08;
        const scale = next / b.currentR;
        Body.scale(b, scale, scale);
        b.currentR = next;
      }
    });
  });

  Runner.run(Runner.create(), engine);

  // render loop
  function draw() {
    // -- pond water background painted in canvas so we can dither it
    const grad = ctx.createRadialGradient(
      dims.w/2, dims.h*0.35, Math.min(dims.w,dims.h)*0.05,
      dims.w/2, dims.h*0.55, Math.max(dims.w,dims.h)*0.7
    );
    grad.addColorStop(0,    "#CDEAF6");
    grad.addColorStop(0.55, "#8FCEE6");
    grad.addColorStop(1,    "#5FAFD0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dims.w, dims.h);

    // 2-px pixel stipple dither over the water for retro feel
    ctx.fillStyle = "rgba(205, 234, 246, 0.55)";
    const step = 4;
    for (let y = 0; y < dims.h; y += step) {
      for (let x = ((y / step) % 2) * 2; x < dims.w; x += step) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const t = performance.now() / 1000;

    // -- cute pixelated waves: little "~" sprites tiled across the pond,
    //    drifting horizontally. two layers at different opacity/speed = parallax.
    //
    //  shape (each # is a 2x2 px block):
    //      . . # # . . . . # # . .
    //      # # . . # # # # . . # #
    //
    const P = 2;                  // pixel block size
    const waveShape = [
      [0,0,1,1,0,0,0,0,1,1,0,0],
      [1,1,0,0,1,1,1,1,0,0,1,1],
    ];
    const waveW = waveShape[0].length * P;   // 24px
    const waveH = waveShape.length    * P;   //  4px

    function drawWaves(spacingX, spacingY, speed, alpha, color) {
      ctx.fillStyle = color.replace("ALPHA", alpha);
      const offset = (t * speed) % spacingX;
      const rows = Math.ceil(dims.h / spacingY) + 1;
      for (let row = 0; row < rows; row++) {
        const y = row * spacingY;
        const rowShift = (row % 2) * (spacingX / 2);  // brick offset per row
        const cols = Math.ceil(dims.w / spacingX) + 2;
        for (let col = -1; col < cols; col++) {
          const x = col * spacingX + rowShift - offset;
          for (let py = 0; py < waveShape.length; py++) {
            for (let px = 0; px < waveShape[py].length; px++) {
              if (waveShape[py][px]) {
                ctx.fillRect(x + px * P, y + py * P, P, P);
              }
            }
          }
        }
      }
    }

    // back layer: bigger spacing, slower drift, lower opacity
    drawWaves(80, 56,  8,  "0.18", "rgba(255,255,255,ALPHA)");
    // front layer: tighter spacing, faster, brighter — slight vertical bob
    ctx.save();
    ctx.translate(0, Math.sin(t * 1.3) * 1);
    drawWaves(64, 40, 14, "0.32", "rgba(255,255,255,ALPHA)");
    ctx.restore();

    // soft lily-pad highlights for charm
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(dims.w*0.18, dims.h*0.82, 60, 12, -0.25, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(dims.w*0.84, dims.h*0.20, 70, 14, 0.18, 0, Math.PI*2);
    ctx.fill();

    // find current leader (most votes); ties → no crown
    let leaderId = null, leaderV = 0, tie = false;
    Object.values(bubbles).forEach(b => {
      const v = b.votes ?? 0;
      if (v > leaderV) { leaderV = v; leaderId = b.duckId; tie = false; }
      else if (v === leaderV && v > 0 && b.duckId !== leaderId) { tie = true; }
    });
    if (tie || leaderV === 0) leaderId = null;

    Object.values(bubbles).forEach(b => {
      const img = getCrop(b.duckId);
      const r = b.currentR;
      const isLeader = b.duckId === leaderId;

      // leader glow halo behind the bubble
      if (isLeader) {
        const pulse = 1 + Math.sin(t * 3) * 0.08;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        const grad = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.6 * pulse);
        grad.addColorStop(0, "rgba(255, 210, 63, 0.55)");
        grad.addColorStop(1, "rgba(255, 210, 63, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6 * pulse, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      if (img) {
        ctx.drawImage(img, -r, -r, r*2, r*2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI*2);
        ctx.fillStyle = "#FFD23F";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#3D2A14";
        ctx.stroke();
      }
      ctx.restore();

      // count badge
      ctx.save();
      ctx.translate(b.position.x + r * 0.65, b.position.y - r * 0.65);
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2);
      ctx.fillStyle = "#FFF6D6"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#3D2A14"; ctx.stroke();
      ctx.fillStyle = "#2A1B08";
      ctx.font = "bold 16px 'Shantell Sans', system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(b.votes ?? 0, 0, 1);
      ctx.restore();

      // tiny crown above the leader
      if (isLeader) {
        ctx.save();
        ctx.translate(b.position.x, b.position.y - r - 14);
        ctx.font = `${Math.max(22, r * 0.55)}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("♛", 0, 0);
        ctx.restore();
      }
    });

    requestAnimationFrame(draw);
  }
  draw();

  window.addEventListener("resize", () => {
    dims = fitCanvas();
    rebuildWalls();
  });

  // listen for vote changes
  sync.onVotes(votes => {
    DUCKS.forEach(d => {
      const v = votes[d.id] || 0;
      const b = bubbles[d.id];
      if (!b) return;
      const prev = b.votes ?? 0;
      b.votes = v;
      // area ∝ votes → r = sqrt(min^2 + v * PX_PER_VOTE^2), capped
      const maxR = Math.min(dims.w, dims.h) * 0.22;
      const r = Math.min(maxR, Math.sqrt(MIN_R*MIN_R + v * PX_PER_VOTE * PX_PER_VOTE));
      b.targetR = r;
      // little bounce when a new vote lands
      if (v > prev) {
        Body.applyForce(b, b.position, {
          x: (Math.random() - 0.5) * 0.04 * b.mass,
          y: (Math.random() - 0.5) * 0.04 * b.mass,
        });
      }
    });
  });
}
