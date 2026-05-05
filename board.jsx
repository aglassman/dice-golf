/* Board renderer — SVG-based grid */

const TERRAIN = {
  ROUGH: 0, FAIRWAY: 1, SAND: 2, WATER: 3, TREE: 4, GREEN: 5,
};

const TERRAIN_FILL = {
  0: 'transparent',
  1: 'var(--fairway)',
  2: 'var(--sand)',
  3: 'var(--water)',
  4: 'transparent',
  5: 'var(--green)',
};

const ROUNDED_TERRAINS = new Set([1, 2, 3, 5]); // fairway, sand, water, green

function roundedCellPath(px, py, size, rTL, rTR, rBR, rBL) {
  return [
    `M ${px + rTL} ${py}`,
    `H ${px + size - rTR}`,
    rTR ? `A ${rTR} ${rTR} 0 0 1 ${px + size} ${py + rTR}` : `L ${px + size} ${py}`,
    `V ${py + size - rBR}`,
    rBR ? `A ${rBR} ${rBR} 0 0 1 ${px + size - rBR} ${py + size}` : `L ${px + size} ${py + size}`,
    `H ${px + rBL}`,
    rBL ? `A ${rBL} ${rBL} 0 0 1 ${px} ${py + size - rBL}` : `L ${px} ${py + size}`,
    `V ${py + rTL}`,
    rTL ? `A ${rTL} ${rTL} 0 0 1 ${px + rTL} ${py}` : `L ${px} ${py}`,
    'Z',
  ].join(' ');
}

function Board({
  hole, ball, ghost, hintCells, shots, slopeAnim,
  cell = 36, onCellClick, onCellHover, hovered,
  showHints = true, aiming = false, pickupFound = false,
}) {
  const W = hole.w * cell;
  const H = hole.h * cell;
  const R = cell * 0.3;

  const [animBall, setAnimBall] = React.useState(null);
  const [bird, setBird] = React.useState(null);
  const animRef = React.useRef(null);
  const shotCountRef = React.useRef(0);

  React.useEffect(() => {
    if (shots.length === 0) { shotCountRef.current = 0; return; }
    if (shots.length === shotCountRef.current) return;
    shotCountRef.current = shots.length;

    const s = shots[shots.length - 1];
    const fx = s.from.x * cell + cell / 2, fy = s.from.y * cell + cell / 2;
    const treeHit = s.treeHit;
    const hitX = treeHit ? treeHit.x * cell + cell / 2 : null;
    const hitY = treeHit ? treeHit.y * cell + cell / 2 : null;
    const tx = s.to.x * cell + cell / 2, ty = s.to.y * cell + cell / 2;
    const bend = s.bendPos;
    const slope = s.slopePath || [];

    const pts = [];

    // Phase 1: fly to tree (or to landing if no tree hit)
    const destX = treeHit ? hitX : tx;
    const destY = treeHit ? hitY : ty;
    if (bend) {
      const bx = bend.x * cell + cell / 2, by = bend.y * cell + cell / 2;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        pts.push([(1-t)*(1-t)*fx + 2*(1-t)*t*bx + t*t*destX, (1-t)*(1-t)*fy + 2*(1-t)*t*by + t*t*destY]);
      }
    } else {
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push([fx + (destX - fx) * t, fy + (destY - fy) * t]);
      }
    }

    // Phase 2: if tree hit, pause at tree then bounce back to landing
    let treeIdx = -1;
    if (treeHit) {
      treeIdx = pts.length - 1;
      // Hold at tree for a few frames
      for (let i = 0; i < 6; i++) pts.push([hitX, hitY]);
      // Bounce back to actual landing
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        pts.push([hitX + (tx - hitX) * t, hitY + (ty - hitY) * t]);
      }
    }

    // Phase 3: slope rolls
    slope.forEach(p => {
      const px = p.x * cell + cell / 2, py = p.y * cell + cell / 2;
      const [lx, ly] = pts[pts.length - 1];
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        pts.push([lx + (px - lx) * t, ly + (py - ly) * t]);
      }
    });

    if (animRef.current) cancelAnimationFrame(animRef.current);
    setBird(null);
    const dur = treeHit ? 800 + slope.length * 200 : 500 + slope.length * 200;
    let t0 = null;
    let birdSpawned = false;
    const step = (ts) => {
      if (t0 === null) t0 = ts;
      const raw = Math.min(1, (ts - t0) / dur);
      const ease = 1 - (1 - raw) * (1 - raw) * (1 - raw);
      const fi = ease * (pts.length - 1);
      const i = Math.min(Math.floor(fi), pts.length - 2);
      const f = fi - i;
      const ax = pts[i][0] + (pts[i+1][0] - pts[i][0]) * f;
      const ay = pts[i][1] + (pts[i+1][1] - pts[i][1]) * f;
      setAnimBall([ax, ay]);

      if (treeHit && !birdSpawned && i >= treeIdx) {
        birdSpawned = true;
        const birdStartX = hitX;
        const birdStartY = hitY - cell * 0.3;
        const ang = Math.random() * Math.PI * 2;
        const dist = cell * 4 + Math.random() * cell * 2;
        const birdDx = Math.cos(ang) * dist;
        const birdDy = Math.sin(ang) * dist;
        setBird({ startX: birdStartX, startY: birdStartY, dx: birdDx, dy: birdDy, t0: ts });
        setTimeout(() => setBird(null), 2000);
      }

      if (raw < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
        setAnimBall(null);
      }
    };
    setAnimBall([fx, fy]);
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; } };
  }, [shots.length, cell]);

  function isBackground(x, y) {
    if (x < 0 || y < 0 || y >= hole.h || x >= hole.w) return true;
    const t = hole.grid[y][x];
    return t === 0 || t === 4; // rough or tree
  }

  // SVG grid lines (drawn in SVG so they align with the terrain)
  const gridLines = [];
  for (let i = 0; i <= hole.w; i++) {
    gridLines.push(
      <line key={`gv-${i}`} x1={i * cell} y1={0} x2={i * cell} y2={H}
            stroke="var(--grid-line)" strokeWidth="1" />
    );
  }
  for (let i = 0; i <= hole.h; i++) {
    gridLines.push(
      <line key={`gh-${i}`} x1={0} y1={i * cell} x2={W} y2={i * cell}
            stroke="var(--grid-line)" strokeWidth="1" />
    );
  }

  const cells = [];
  for (let y = 0; y < hole.h; y++) {
    for (let x = 0; x < hole.w; x++) {
      const t = hole.grid[y][x];
      const px = x * cell, py = y * cell;

      if (ROUNDED_TERRAINS.has(t)) {
        const topBg = isBackground(x, y - 1);
        const bottomBg = isBackground(x, y + 1);
        const leftBg = isBackground(x - 1, y);
        const rightBg = isBackground(x + 1, y);

        const rTL = (topBg && leftBg) ? R : 0;
        const rTR = (topBg && rightBg) ? R : 0;
        const rBR = (bottomBg && rightBg) ? R : 0;
        const rBL = (bottomBg && leftBg) ? R : 0;

        cells.push(
          <path
            key={`c-${x}-${y}`}
            d={roundedCellPath(px, py, cell, rTL, rTR, rBR, rBL)}
            fill={TERRAIN_FILL[t]}
          />
        );
      } else {
        cells.push(
          <rect
            key={`c-${x}-${y}`}
            x={px} y={py}
            width={cell} height={cell}
            fill={TERRAIN_FILL[t]}
          />
        );
      }
    }
  }

  const waterPatterns = [];
  for (let y = 0; y < hole.h; y++) {
    for (let x = 0; x < hole.w; x++) {
      if (hole.grid[y][x] === 3) {
        const cx = x * cell + cell / 2;
        const cy = y * cell + cell / 2;
        waterPatterns.push(
          <g key={`wp-${x}-${y}`} stroke="var(--water-2)" strokeWidth="1" strokeLinecap="round" opacity="0.6">
            <path d={`M ${cx-cell*0.3} ${cy-cell*0.1} q ${cell*0.15} -${cell*0.08} ${cell*0.3} 0 q ${cell*0.15} ${cell*0.08} ${cell*0.3} 0`} fill="none" />
            <path d={`M ${cx-cell*0.25} ${cy+cell*0.15} q ${cell*0.12} -${cell*0.06} ${cell*0.25} 0 q ${cell*0.12} ${cell*0.06} ${cell*0.25} 0`} fill="none" />
          </g>
        );
      }
    }
  }

  const sandStipples = [];
  for (let y = 0; y < hole.h; y++) {
    for (let x = 0; x < hole.w; x++) {
      if (hole.grid[y][x] === 2) {
        const px = x * cell, py = y * cell;
        const seed = (x * 73 + y * 131) % 1000;
        const dots = [
          [seed % 7 / 7, (seed >> 3) % 11 / 11],
          [(seed >> 5) % 13 / 13, (seed >> 7) % 5 / 5],
          [(seed >> 2) % 11 / 11, (seed >> 4) % 7 / 7],
          [(seed >> 6) % 9 / 9, (seed >> 8) % 13 / 13],
        ];
        dots.forEach(([fx, fy], i) => {
          sandStipples.push(
            <circle key={`sd-${x}-${y}-${i}`}
              cx={px + fx * cell} cy={py + fy * cell} r="0.7"
              fill="oklch(0.55 0.05 60 / 0.5)" />
          );
        });
      }
    }
  }

  const greenRings = [];
  for (let y = 0; y < hole.h; y++) {
    for (let x = 0; x < hole.w; x++) {
      if (hole.grid[y][x] === 5) {
        const px = x * cell, py = y * cell;
        greenRings.push(
          <circle key={`gr-${x}-${y}-1`} cx={px + cell*0.25} cy={py + cell*0.25} r="0.6" fill="oklch(0.5 0.07 138 / 0.4)" />,
          <circle key={`gr-${x}-${y}-2`} cx={px + cell*0.75} cy={py + cell*0.65} r="0.6" fill="oklch(0.5 0.07 138 / 0.4)" />
        );
      }
    }
  }

  const trees = [];
  for (let y = 0; y < hole.h; y++) {
    for (let x = 0; x < hole.w; x++) {
      if (hole.grid[y][x] === 4) {
        const cx = x * cell + cell / 2;
        const bot = y * cell + cell * 0.92;
        const s = cell * 0.38;
        const variant = (x * 53 + y * 97) % 4;
        const trunkW = cell * 0.06;
        const trunkTop = bot - cell * 0.55;
        const branchY = bot - cell * 0.4;

        const trunk = (
          <>
            <line x1={cx} y1={bot} x2={cx} y2={trunkTop}
                  stroke="oklch(0.3 0.04 55)" strokeWidth={trunkW * 2} strokeLinecap="round" />
            <line x1={cx} y1={branchY} x2={cx - cell * 0.1} y2={branchY - cell * 0.1}
                  stroke="oklch(0.3 0.04 55)" strokeWidth={trunkW * 1.3} strokeLinecap="round" />
            <line x1={cx} y1={branchY + cell * 0.08} x2={cx + cell * 0.09} y2={branchY - cell * 0.04}
                  stroke="oklch(0.3 0.04 55)" strokeWidth={trunkW * 1.3} strokeLinecap="round" />
          </>
        );

        let canopy;
        if (variant === 0) {
          const cy = bot - cell * 0.62;
          canopy = (
            <>
              <ellipse cx={cx} cy={cy} rx={s} ry={s * 0.9} fill="var(--tree)" />
              <ellipse cx={cx + s * 0.1} cy={cy - s * 0.15} rx={s * 0.65} ry={s * 0.6} fill="var(--tree-2)" opacity="0.35" />
            </>
          );
        } else if (variant === 1) {
          const cy = bot - cell * 0.65;
          canopy = (
            <>
              <ellipse cx={cx} cy={cy} rx={s * 0.78} ry={s * 1.1} fill="var(--tree)" />
              <ellipse cx={cx + s * 0.08} cy={cy - s * 0.2} rx={s * 0.5} ry={s * 0.7} fill="var(--tree-2)" opacity="0.3" />
            </>
          );
        } else if (variant === 2) {
          const tipY = bot - cell * 0.92;
          const midY = bot - cell * 0.55;
          canopy = (
            <path d={`M ${cx} ${tipY} L ${cx + s * 0.7} ${midY} L ${cx + s * 0.45} ${midY}
                       L ${cx + s * 0.85} ${bot - cell * 0.3} L ${cx - s * 0.85} ${bot - cell * 0.3}
                       L ${cx - s * 0.45} ${midY} L ${cx - s * 0.7} ${midY} Z`}
                  fill="var(--tree-2)" />
          );
        } else {
          const cy = bot - cell * 0.62;
          const r = s * 0.42;
          canopy = (
            <>
              <circle cx={cx - r * 0.7} cy={cy + r * 0.3} r={r} fill="var(--tree)" />
              <circle cx={cx + r * 0.7} cy={cy + r * 0.3} r={r} fill="var(--tree)" />
              <circle cx={cx} cy={cy - r * 0.3} r={r * 1.05} fill="var(--tree)" />
              <circle cx={cx + r * 0.3} cy={cy - r * 0.15} r={r * 0.7} fill="var(--tree-2)" opacity="0.3" />
            </>
          );
        }

        trees.push(
          <g key={`tr-${x}-${y}`}>
            {trunk}
            {canopy}
          </g>
        );
      }
    }
  }

  const slopes = hole.slopes.map((s, i) => {
    const cx = s.x * cell + cell / 2;
    const cy = s.y * cell + cell / 2;
    const v = window.DiceGolf.dirVectors[s.dir];
    const sz = cell * 0.22;
    const ang = Math.atan2(v.dy, v.dx) * 180 / Math.PI;
    return (
      <g key={`sl-${i}`} transform={`translate(${cx} ${cy}) rotate(${ang})`}>
        <polygon points={`${sz},0 ${-sz*0.6},${-sz*0.6} ${-sz*0.6},${sz*0.6}`}
                 fill="var(--ink-2)" opacity="0.55" />
      </g>
    );
  });

  const hints = (showHints && hintCells) ? hintCells.map((c, i) => (
    <rect key={`h-${i}`}
      x={c.x * cell + 3} y={c.y * cell + 3}
      width={cell - 6} height={cell - 6}
      fill="none"
      stroke={c.legal ? 'var(--ink)' : 'oklch(0.6 0.16 30)'}
      strokeDasharray={c.dim ? '1 3' : '2 3'}
      strokeWidth={c.dim ? '0.8' : '1.2'}
      opacity={c.dim ? 0.3 : 0.7}
      rx="3"
    />
  )) : [];

  const shotLines = [];
  const shotMarks = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const x1 = s.from.x * cell + cell / 2;
    const y1 = s.from.y * cell + cell / 2;
    const x2 = s.to.x * cell + cell / 2;
    const y2 = s.to.y * cell + cell / 2;

    if (s.hook && s.bendPos) {
      const bx = s.bendPos.x * cell + cell / 2;
      const by = s.bendPos.y * cell + cell / 2;
      shotLines.push(
        <path key={`sln-${i}`}
          d={`M ${x1} ${y1} Q ${bx} ${by} ${x2} ${y2}`}
          stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" fill="none"
          className={s.fresh ? 'shot-line' : 'shot-line'}
        />
      );
    } else {
      const len = Math.hypot(x2 - x1, y2 - y1);
      shotLines.push(
        <line key={`sln-${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round"
          className={s.fresh ? 'shot-line animating' : 'shot-line'}
          style={s.fresh ? { '--len': len } : null}
        />
      );
    }
    if (i < shots.length - 1) {
      shotMarks.push(
        <circle key={`sm-${i}`} cx={x2} cy={y2} r="3.2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4" />
      );
    }
    if (s.slopePath && s.slopePath.length) {
      let lx = x2, ly = y2;
      s.slopePath.forEach((p, j) => {
        const nx = p.x * cell + cell / 2;
        const ny = p.y * cell + cell / 2;
        shotLines.push(
          <line key={`slp-${i}-${j}`} x1={lx} y1={ly} x2={nx} y2={ny}
                stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3" />
        );
        lx = nx; ly = ny;
      });
    }
  }

  let ghostEl = null;
  if (ghost) {
    const x1 = ghost.from.x * cell + cell / 2;
    const y1 = ghost.from.y * cell + cell / 2;
    const x2 = ghost.to.x * cell + cell / 2;
    const y2 = ghost.to.y * cell + cell / 2;
    const color = ghost.legal ? 'var(--ink)' : 'oklch(0.6 0.16 30)';

    let pathEl;
    if (ghost.hook && ghost.bendPos) {
      const bx = ghost.bendPos.x * cell + cell / 2;
      const by = ghost.bendPos.y * cell + cell / 2;
      pathEl = (
        <path d={`M ${x1} ${y1} Q ${bx} ${by} ${x2} ${y2}`}
              stroke={color} strokeWidth="2" strokeDasharray="4 4"
              strokeLinecap="round" fill="none" opacity="0.7" />
      );
    } else {
      pathEl = (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth="2" strokeDasharray="4 4"
              strokeLinecap="round" opacity="0.7" />
      );
    }

    const landingCircles = [];
    if (ghost.possibleLandings && ghost.possibleLandings.length > 1) {
      ghost.possibleLandings.forEach((l, i) => {
        const lx = l.x * cell + cell / 2;
        const ly = l.y * cell + cell / 2;
        landingCircles.push(
          <circle key={`gl-${i}`} cx={lx} cy={ly} r={i === ghost.possibleLandings.length - 1 ? 6 : 4}
                  fill="none" stroke={color}
                  strokeWidth={i === ghost.possibleLandings.length - 1 ? 1.4 : 1}
                  strokeDasharray="2 2" opacity={0.5 + (i / ghost.possibleLandings.length) * 0.3} />
        );
      });
    } else {
      landingCircles.push(
        <circle key="gl-0" cx={x2} cy={y2} r="6"
                fill="none" stroke={color}
                strokeWidth="1.4" strokeDasharray="2 2" />
      );
    }

    ghostEl = (
      <g>
        {pathEl}
        {landingCircles}
      </g>
    );
  }

  const teeMark = (
    <g transform={`translate(${hole.tee.x * cell + cell/2} ${hole.tee.y * cell + cell/2})`}>
      <circle r="9" fill="var(--paper)" stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="2 2" />
      <text textAnchor="middle" dominantBaseline="central"
            fontFamily="var(--mono)" fontSize="9" fontWeight="600"
            fill="var(--ink-2)" letterSpacing="0.1em">T</text>
    </g>
  );

  const cupX = hole.cup.x * cell + cell / 2;
  const cupY = hole.cup.y * cell + cell / 2;
  const flagMark = (
    <g>
      <circle cx={cupX} cy={cupY} r="4.5" fill="var(--ink)" />
      <line x1={cupX} y1={cupY} x2={cupX} y2={cupY - cell * 0.7}
            stroke="var(--ink)" strokeWidth="1.4" />
      <path d={`M ${cupX} ${cupY - cell * 0.7} l ${cell*0.32} ${cell*0.08} l -${cell*0.32} ${cell*0.16} z`}
            fill="var(--flag)" stroke="var(--flag-2)" strokeWidth="0.8" />
    </g>
  );

  let pickupMark = null;
  if (hole.bigfoot && !pickupFound) {
    const bx = hole.bigfoot.x * cell + cell / 2;
    const by = hole.bigfoot.y * cell + cell / 2;
    pickupMark = (
      <g transform={`translate(${bx} ${by})`}>
        <circle r="10" fill="oklch(0.55 0.13 145 / 0.15)" stroke="oklch(0.55 0.13 145)" strokeWidth="1.2" strokeDasharray="2 2" />
        <text textAnchor="middle" dominantBaseline="central" fontSize="12" fontFamily="var(--mono)" fontWeight="600" fill="oklch(0.55 0.13 145)">+1</text>
      </g>
    );
  }

  const ballX = animBall ? animBall[0] : ball.x * cell + cell / 2;
  const ballY = animBall ? animBall[1] : ball.y * cell + cell / 2;
  const ballEl = (
    <g>
      <circle cx={ballX} cy={ballY} r="6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" />
      <circle cx={ballX - 1.5} cy={ballY - 1.5} r="1.4" fill="oklch(0.85 0.02 82)" />
    </g>
  );

  let hoverEl = null;
  if (hovered && aiming) {
    hoverEl = (
      <rect x={hovered.x * cell} y={hovered.y * cell} width={cell} height={cell}
            fill="oklch(0.22 0.025 240 / 0.04)"
            stroke="var(--ink-2)" strokeWidth="1" pointerEvents="none" />
    );
  }

  const clickOverlay = aiming ? (
    <g>
      {Array.from({ length: hole.h }).map((_, y) =>
        Array.from({ length: hole.w }).map((__, x) => (
          <rect key={`co-${x}-${y}`}
            x={x * cell} y={y * cell} width={cell} height={cell}
            fill="transparent"
            onMouseEnter={() => onCellHover && onCellHover({ x, y })}
            onClick={() => onCellClick && onCellClick({ x, y })}
            style={{ cursor: 'crosshair' }} />
        ))
      )}
    </g>
  ) : null;

  return (
    <div className="canvas-wrap" style={{ '--cell': `${cell}px` }}>
      <span className="corner-mark tl">N ↑</span>
      <span className="corner-mark tr">{hole.w} × {hole.h}</span>
      <span className="corner-mark bl">PAR {hole.par}</span>
      <span className="corner-mark br">SEED {hole.seed.toString(36).toUpperCase()}</span>
      <svg className={`svg-board ${aiming ? 'aiming' : ''}`}
           viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
           onMouseLeave={() => onCellHover && onCellHover(null)}>
        {gridLines}
        {cells}
        {waterPatterns}
        {sandStipples}
        {greenRings}
        {trees}
        {slopes}
        {hints}
        {shotLines}
        {shotMarks}
        {ghostEl}
        {teeMark}
        {flagMark}
        {pickupMark}
        {ballEl}
        {bird && <Bird key={bird.t0} startX={bird.startX} startY={bird.startY} dx={bird.dx} dy={bird.dy} />}
        {hoverEl}
        {clickOverlay}
      </svg>
    </div>
  );
}

function Bird({ startX, startY, dx, dy }) {
  const [pos, setPos] = React.useState({ x: startX, y: startY, scale: 1, opacity: 0.8, wing: 0 });
  const ref = React.useRef(null);

  React.useEffect(() => {
    let t0 = null;
    const dur = 1800;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      const raw = Math.min(1, (ts - t0) / dur);
      const ease = raw;
      const wing = Math.sin(raw * Math.PI * 6) * 4;
      setPos({
        x: startX + dx * ease,
        y: startY + dy * ease - Math.sin(raw * Math.PI) * 30,
        scale: 1 + raw * 1.2,
        opacity: 0.85 * (1 - raw * raw),
        wing,
      });
      if (raw < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, []);

  return (
    <g transform={`translate(${pos.x} ${pos.y}) scale(${pos.scale})`} opacity={pos.opacity}>
      <path d={`M 0 0 Q -4 ${-3 + pos.wing} -8 ${pos.wing * 0.5}`} stroke="var(--ink)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d={`M 0 0 Q 4 ${-3 + pos.wing} 8 ${pos.wing * 0.5}`} stroke="var(--ink)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle r="1.8" fill="var(--ink)" />
    </g>
  );
}

window.Board = Board;
