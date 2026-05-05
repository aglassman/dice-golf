/* Dice Golf — Course Creator */

const TERRAIN_NAMES = ['Rough', 'Fairway', 'Sand', 'Water', 'Tree', 'Green', 'Rock'];
const TERRAIN_COLORS = ['var(--rough)', 'var(--fairway)', 'var(--sand)', 'var(--water)', 'var(--tree)', 'var(--green)', 'var(--rock)'];
const DIR_NAMES = window.DiceGolf.dirNames;

function createBlankHole() {
  const w = 22, h = 13;
  const grid = Array.from({ length: h }, () => Array(w).fill(0));
  for (let y = 4; y <= 8; y++) grid[y][1] = 1;
  return {
    w, h, grid,
    slopes: [],
    tee: { x: 1, y: 6 },
    cup: { x: 20, y: 6 },
    bigfoot: null,
    par: 4,
    seed: 0,
    name: '',
  };
}

function exportCourse(name, holes, startingFocus) {
  const data = {
    v: 1,
    name,
    startingFocus: startingFocus ?? 3,
    holes: holes.map(h => ({
      grid: h.grid.map(r => r.join('')).join(''),
      slopes: h.slopes.map(s => [s.x, s.y, DIR_NAMES.indexOf(s.dir)]),
      tee: [h.tee.x, h.tee.y],
      cup: [h.cup.x, h.cup.y],
      bigfoot: h.bigfoot ? [h.bigfoot.x, h.bigfoot.y] : null,
      par: h.par,
      name: h.name || '',
    })),
  };
  return btoa(JSON.stringify(data));
}

function importCourse(b64) {
  const data = JSON.parse(atob(b64));
  if (data.v !== 1) throw new Error('Unknown format');
  return {
    name: data.name,
    startingFocus: data.startingFocus ?? 3,
    holes: data.holes.map(h => {
      const flat = h.grid.split('').map(Number);
      const grid = [];
      for (let y = 0; y < 13; y++) grid.push(flat.slice(y * 22, (y + 1) * 22));
      return {
        w: 22, h: 13, grid,
        slopes: h.slopes.map(([x, y, di]) => ({ x, y, dir: DIR_NAMES[di] })),
        tee: { x: h.tee[0], y: h.tee[1] },
        cup: { x: h.cup[0], y: h.cup[1] },
        bigfoot: h.bigfoot ? { x: h.bigfoot[0], y: h.bigfoot[1] } : null,
        par: h.par,
        seed: 0,
        name: h.name || '',
      };
    }),
  };
}

function generateConfigurableHole(opts = {}) {
  const {
    dogleg = 'medium',    // 'straight', 'mild', 'medium', 'sharp'
    length = 'medium',    // 'short', 'medium', 'long'
    hazards = 50,         // 0-100 percent
    fairwayWidth = 50,    // 0-100 narrow to wide
    slopeCount = 50,      // 0-100
  } = opts;

  const w = 22, h = 13;
  const { dirVectors, dirNames, inBounds } = window.DiceGolf;
  const seed = Date.now() + Math.floor(Math.random() * 100000);
  let s = seed >>> 0;
  const rand = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const grid = Array.from({ length: h }, () => Array(w).fill(0));

  const teeSide = rand() < 0.5 ? 'left' : 'right';
  const lenMult = length === 'short' ? 0.45 : length === 'long' ? 0.95 : 0.7;
  const xSpan = Math.round((w - 4) * lenMult);

  const tee = teeSide === 'left'
    ? { x: 1 + Math.floor(rand() * 2), y: 2 + Math.floor(rand() * (h - 4)) }
    : { x: w - 2 - Math.floor(rand() * 2), y: 2 + Math.floor(rand() * (h - 4)) };
  const cup = teeSide === 'left'
    ? { x: Math.min(w - 2, tee.x + xSpan + Math.floor(rand() * 2)), y: 2 + Math.floor(rand() * (h - 4)) }
    : { x: Math.max(1, tee.x - xSpan - Math.floor(rand() * 2)), y: 2 + Math.floor(rand() * (h - 4)) };

  const doglegStr = { straight: 0.05, mild: 0.25, medium: 0.45, sharp: 0.7 }[dogleg] || 0.45;
  const numWp = dogleg === 'straight' ? 1 : 2 + Math.floor(rand() * 2);
  const ctrl = [tee];
  for (let wi = 1; wi <= numWp; wi++) {
    const t = wi / (numWp + 1);
    const bx = tee.x + (cup.x - tee.x) * t;
    const by = tee.y + (cup.y - tee.y) * t;
    const px = -(cup.y - tee.y), py = (cup.x - tee.x);
    const pl = Math.hypot(px, py) || 1;
    const bend = (rand() - 0.5) * doglegStr * 2;
    ctrl.push({
      x: Math.round(Math.max(2, Math.min(w - 3, bx + (px / pl) * Math.min(w, h) * bend))),
      y: Math.round(Math.max(2, Math.min(h - 3, by + (py / pl) * Math.min(w, h) * bend))),
    });
  }
  ctrl.push(cup);

  const fwWidth = Math.max(1, Math.round(1 + (fairwayWidth / 100) * 1.5));
  function paintFw(x0, y0, x1, y1, width) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, cx = x0, cy = y0;
    while (true) {
      for (let oy = -width; oy <= width; oy++)
        for (let ox = -width; ox <= width; ox++)
          if (ox * ox + oy * oy <= width * width + 1) {
            const nx = cx + ox, ny = cy + oy;
            if (inBounds(grid, nx, ny)) grid[ny][nx] = 1;
          }
      if (cx === x1 && cy === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }
  for (let i = 0; i < ctrl.length - 1; i++) paintFw(ctrl[i].x, ctrl[i].y, ctrl[i + 1].x, ctrl[i + 1].y, fwWidth);

  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++)
      if (ox * ox + oy * oy <= 5) {
        const nx = cup.x + ox, ny = cup.y + oy;
        if (inBounds(grid, nx, ny)) grid[ny][nx] = 5;
      }

  const hazardMult = hazards / 50;
  const fairwayCells = [];
  for (let fy = 0; fy < h; fy++) for (let fx = 0; fx < w; fx++) if (grid[fy][fx] === 1) fairwayCells.push({ x: fx, y: fy });

  function placeBlob(code, sizeMin, sizeMax, avoid) {
    let a = 0;
    while (a++ < 50) {
      let cx, cy;
      if (rand() < 0.7 && fairwayCells.length) {
        const fc = fairwayCells[Math.floor(rand() * fairwayCells.length)];
        const off = 2 + Math.floor(rand() * 3);
        const ang = rand() * Math.PI * 2;
        cx = Math.round(fc.x + Math.cos(ang) * off); cy = Math.round(fc.y + Math.sin(ang) * off);
      } else { cx = 2 + Math.floor(rand() * (w - 4)); cy = 1 + Math.floor(rand() * (h - 2)); }
      if (!inBounds(grid, cx, cy) || Math.hypot(cx - tee.x, cy - tee.y) < 3 || Math.hypot(cx - cup.x, cy - cup.y) < 3) continue;
      const size = sizeMin + Math.floor(rand() * (sizeMax - sizeMin + 1));
      let ok = true; const cells = [];
      for (let oy = -size; oy <= size; oy++) for (let ox = -size; ox <= size; ox++) {
        if (Math.hypot(ox, oy) + (rand() - 0.5) * 0.6 <= size) {
          const nx = cx + ox, ny = cy + oy;
          if (!inBounds(grid, nx, ny)) continue;
          if (avoid.includes(grid[ny][nx])) ok = false;
          cells.push([nx, ny]);
        }
      }
      if (!ok) continue;
      cells.forEach(([x, y]) => { if (grid[y][x] !== 1 && grid[y][x] !== 5) grid[y][x] = code; });
      return;
    }
  }

  const waterN = Math.round((2 + rand() * 2) * hazardMult);
  for (let i = 0; i < waterN; i++) placeBlob(3, 1, 2, [5, 1]);
  const sandN = Math.round((3 + rand() * 3) * hazardMult);
  for (let i = 0; i < sandN; i++) placeBlob(2, 1, 2, [3, 5, 1]);
  const treeN = Math.round((6 + rand() * 6) * hazardMult);
  for (let i = 0; i < treeN; i++) {
    let a = 0;
    while (a++ < 30) {
      let cx, cy;
      if (rand() < 0.7 && fairwayCells.length) {
        const fc = fairwayCells[Math.floor(rand() * fairwayCells.length)];
        cx = Math.round(fc.x + (rand() - 0.5) * 6); cy = Math.round(fc.y + (rand() - 0.5) * 6);
      } else { cx = 1 + Math.floor(rand() * (w - 2)); cy = 1 + Math.floor(rand() * (h - 2)); }
      if (!inBounds(grid, cx, cy) || grid[cy][cx] !== 0) continue;
      if (Math.hypot(cx - tee.x, cy - tee.y) < 2 || Math.hypot(cx - cup.x, cy - cup.y) < 3) continue;
      const cl = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < cl; k++) {
        const nx = cx + Math.floor((rand() - 0.5) * 4), ny = cy + Math.floor((rand() - 0.5) * 4);
        if (inBounds(grid, nx, ny) && grid[ny][nx] === 0) grid[ny][nx] = 4;
      }
      break;
    }
  }
  const rockN = Math.round((1 + rand() * 2) * hazardMult);
  for (let i = 0; i < rockN; i++) {
    let a = 0;
    while (a++ < 30) {
      const rx = 2 + Math.floor(rand() * (w - 4)), ry = 1 + Math.floor(rand() * (h - 2));
      if (grid[ry][rx] !== 0 || Math.hypot(rx - tee.x, ry - tee.y) < 3 || Math.hypot(rx - cup.x, ry - cup.y) < 3) continue;
      grid[ry][rx] = 6; break;
    }
  }

  // Crossings
  if (hazards > 30 && ctrl.length > 2) {
    const seg = 1 + Math.floor(rand() * (ctrl.length - 2));
    const t = 0.3 + rand() * 0.4;
    const cx = Math.round(ctrl[seg - 1].x + (ctrl[seg].x - ctrl[seg - 1].x) * t);
    const cy = Math.round(ctrl[seg - 1].y + (ctrl[seg].y - ctrl[seg - 1].y) * t);
    if (Math.hypot(cx - tee.x, cy - tee.y) >= 4 && Math.hypot(cx - cup.x, cy - cup.y) >= 4) {
      const fdx = ctrl[seg].x - ctrl[seg - 1].x, fdy = ctrl[seg].y - ctrl[seg - 1].y;
      const pl = Math.hypot(fdx, fdy) || 1;
      const px = -fdy / pl, py = fdx / pl;
      const code = rand() < 0.5 ? 3 : 2;
      for (let si = -2; si <= 2; si++) {
        const sx = Math.round(cx + px * si), sy = Math.round(cy + py * si);
        if (inBounds(grid, sx, sy) && grid[sy][sx] !== 5) grid[sy][sx] = code;
      }
    }
  }

  grid[tee.y][tee.x] = 1;
  grid[cup.y][cup.x] = 5;

  // Slopes — sometimes wide (2-3 arrows perpendicular to slope direction)
  const slopes = [];
  const slopeGroupN = Math.round((2 + rand() * 3) * (slopeCount / 50));
  const slopeDirs = dirNames;

  function perpOff(dir, width) {
    const v = dirVectors[dir];
    const px = -v.dy, py = v.dx;
    const offs = [{ dx: 0, dy: 0 }];
    for (let i = 1; i <= Math.floor(width / 2); i++) {
      offs.push({ dx: px * i, dy: py * i });
      offs.push({ dx: -px * i, dy: -py * i });
    }
    return offs;
  }

  let sa = 0, sg = 0;
  while (sg < slopeGroupN && sa++ < 60) {
    const x = 2 + Math.floor(rand() * (w - 4)), y = 1 + Math.floor(rand() * (h - 2));
    if (!(grid[y][x] === 0 || grid[y][x] === 1 || grid[y][x] === 5)) continue;
    if ((x === tee.x && y === tee.y) || (x === cup.x && y === cup.y)) continue;
    if (slopes.find(s => s.x === x && s.y === y)) continue;
    const dir = slopeDirs[Math.floor(rand() * 8)];
    const v = dirVectors[dir];
    if (inBounds(grid, x + v.dx, y + v.dy) && grid[y + v.dy][x + v.dx] === 3) continue;
    const sw = rand() < 0.4 ? 1 : rand() < 0.7 ? 2 : 3;
    perpOff(dir, sw).forEach(off => {
      const sx = x + off.dx, sy = y + off.dy;
      if (!inBounds(grid, sx, sy)) return;
      if (grid[sy][sx] !== 0 && grid[sy][sx] !== 1 && grid[sy][sx] !== 5) return;
      if ((sx === tee.x && sy === tee.y) || (sx === cup.x && sy === cup.y)) return;
      if (slopes.find(s => s.x === sx && s.y === sy)) return;
      const nsx = sx + v.dx, nsy = sy + v.dy;
      if (inBounds(grid, nsx, nsy) && grid[nsy][nsx] === 3) return;
      slopes.push({ x: sx, y: sy, dir });
    });
    sg++;
  }
  // Green slopes — sometimes 2-wide
  const greenCells = [];
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++)
    if (grid[gy][gx] === 5 && !(gx === cup.x && gy === cup.y)) greenCells.push({ x: gx, y: gy });
  for (let i = greenCells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [greenCells[i], greenCells[j]] = [greenCells[j], greenCells[i]]; }
  const gsN = Math.min(greenCells.length, 2 + Math.floor(rand() * 2));
  for (let gi = 0; gi < gsN; gi++) {
    const gc = greenCells[gi];
    if (slopes.find(s => s.x === gc.x && s.y === gc.y)) continue;
    const dir = slopeDirs[Math.floor(rand() * 8)];
    const gw = rand() < 0.5 ? 1 : 2;
    perpOff(dir, gw).forEach(off => {
      const gsx = gc.x + off.dx, gsy = gc.y + off.dy;
      if (!inBounds(grid, gsx, gsy) || grid[gsy][gsx] !== 5) return;
      if (gsx === cup.x && gsy === cup.y) return;
      if (slopes.find(s => s.x === gsx && s.y === gsy)) return;
      slopes.push({ x: gsx, y: gsy, dir });
    });
  }

  const dist = Math.hypot(cup.x - tee.x, cup.y - tee.y);
  const par = dist < 8 ? 3 : dist < 13 ? 4 : dist < 17 ? 5 : 6;

  return { w, h, grid, slopes, tee, cup, bigfoot: null, par, seed: 0, name: '' };
}

function CreatorApp() {
  const [courseName, setCourseName] = React.useState('Custom Course');
  const [startingFocus, setStartingFocus] = React.useState(3);
  const [holes, setHoles] = React.useState(() => Array.from({ length: 9 }, createBlankHole));
  const [activeHole, setActiveHole] = React.useState(0);
  const [tool, setTool] = React.useState('paint');
  const [terrain, setTerrain] = React.useState(1);
  const [slopeDir, setSlopeDir] = React.useState('N');
  const [brushSize, setBrushSize] = React.useState(1);
  const [hovered, setHovered] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const [exportStr, setExportStr] = React.useState('');
  const [importStr, setImportStr] = React.useState('');
  const [importError, setImportError] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [showGen, setShowGen] = React.useState(false);
  const [genOpts, setGenOpts] = React.useState({ dogleg: 'medium', length: 'medium', hazards: 50, fairwayWidth: 50, slopeCount: 50 });
  const [ctrlPicker, setCtrlPicker] = React.useState(null);
  const mousePos = React.useRef({ x: 0, y: 0 });
  const mouseOverBoard = React.useRef(false);

  React.useEffect(() => {
    const move = (e) => { mousePos.current = { x: e.clientX, y: e.clientY }; };
    const down = (e) => {
      if (e.code === 'Space' && !testing && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (ctrlPicker) {
          setCtrlPicker(null);
        } else if (mouseOverBoard.current) {
          setCtrlPicker({ x: mousePos.current.x, y: mousePos.current.y });
        }
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('keydown', down);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('keydown', down);
    };
  }, [ctrlPicker, testing]);

  const hole = holes[activeHole];

  function updateHole(fn) {
    setHoles(prev => {
      const next = [...prev];
      const h = JSON.parse(JSON.stringify(next[activeHole]));
      fn(h);
      next[activeHole] = h;
      return next;
    });
  }

  function paintCell(cx, cy) {
    updateHole(h => {
      const offsets = brushSize === 1
        ? [[0, 0]]
        : [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
      offsets.forEach(([ox, oy]) => {
        const nx = cx + ox, ny = cy + oy;
        if (ny >= 0 && ny < h.h && nx >= 0 && nx < h.w) {
          h.grid[ny][nx] = terrain;
        }
      });
    });
  }

  function handleCellAction(cell) {
    switch (tool) {
      case 'paint':
        paintCell(cell.x, cell.y);
        break;
      case 'slope':
        updateHole(h => {
          const idx = h.slopes.findIndex(s => s.x === cell.x && s.y === cell.y);
          if (idx >= 0) {
            if (h.slopes[idx].dir === slopeDir) h.slopes.splice(idx, 1);
            else h.slopes[idx].dir = slopeDir;
          } else {
            h.slopes.push({ x: cell.x, y: cell.y, dir: slopeDir });
          }
        });
        break;
      case 'tee':
        updateHole(h => {
          h.tee = { x: cell.x, y: cell.y };
          if (h.grid[cell.y][cell.x] === 0) h.grid[cell.y][cell.x] = 1;
        });
        break;
      case 'cup':
        updateHole(h => {
          h.cup = { x: cell.x, y: cell.y };
          h.grid[cell.y][cell.x] = 5;
        });
        break;
      case 'eraser':
        updateHole(h => {
          h.grid[cell.y][cell.x] = 0;
          h.slopes = h.slopes.filter(s => !(s.x === cell.x && s.y === cell.y));
          if (h.bigfoot && h.bigfoot.x === cell.x && h.bigfoot.y === cell.y) h.bigfoot = null;
        });
        break;
    }
  }

  function handleCellClick(cell) {
    handleCellAction(cell);
  }

  function handleCellMouseDown(cell) {
    if (tool === 'paint' || tool === 'eraser') {
      setDragging(true);
      handleCellAction(cell);
    }
  }

  function handleCellHover(cell) {
    setHovered(cell);
    if (dragging && cell && (tool === 'paint' || tool === 'eraser')) {
      handleCellAction(cell);
    }
  }

  React.useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  function doExport() {
    setExportStr(exportCourse(courseName, holes, startingFocus));
  }

  function doImport() {
    try {
      const result = importCourse(importStr.trim());
      setCourseName(result.name);
      setStartingFocus(result.startingFocus ?? 3);
      setHoles(result.holes);
      setActiveHole(0);
      setImportError('');
    } catch (e) {
      setImportError('Invalid course data');
    }
  }

  function playCourse() {
    window._customCourseData = { name: courseName, holes, startingFocus };
    location.hash = '#play';
  }

  function testHole() {
    setTesting(true);
  }

  const tools = [
    { id: 'paint', label: 'Paint' },
    { id: 'slope', label: 'Slope' },
    { id: 'tee', label: 'Tee' },
    { id: 'cup', label: 'Cup' },
    { id: 'eraser', label: 'Eraser' },
  ];

  const slopeDirPositions = {
    N: { left: '50%', top: '8%' }, NE: { left: '82%', top: '18%' },
    E: { left: '92%', top: '50%' }, SE: { left: '82%', top: '82%' },
    S: { left: '50%', top: '92%' }, SW: { left: '18%', top: '82%' },
    W: { left: '8%', top: '50%' }, NW: { left: '18%', top: '18%' },
  };
  const slopeLabels = { N: 'N', NE: '↗', E: 'E', SE: '↘', S: 'S', SW: '↙', W: 'W', NW: '↖' };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span className="dot" /> Dice Golf · Creator</div>
          <div className="brand-title">Course <em>Creator</em></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="text" value={courseName} onChange={e => setCourseName(e.target.value)}
            style={{
              fontFamily: 'var(--serif)', fontSize: 17, fontStyle: 'italic', fontWeight: 500,
              border: '1px solid var(--paper-line)', borderRadius: 6, padding: '6px 12px',
              background: 'var(--paper)', color: 'var(--ink)', width: 220,
            }}
          />
          <a href="#game" style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            ← Back to Game
          </a>
        </div>
      </header>

      <div className="hole-strip">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="cell" style={{ cursor: 'pointer', background: i === activeHole ? 'oklch(0.95 0.04 80)' : undefined }}
               onClick={() => { setActiveHole(i); setTesting(false); }}>
            <span className="k">{holes[i].name || `Hole ${i + 1}`}</span>
            <span className="v" style={{ fontSize: 14 }}>Par {holes[i].par}</span>
          </div>
        ))}
        <div className="cell">
          {testing
            ? <button className="btn" onClick={() => setTesting(false)}>← Edit</button>
            : <button className="btn primary" onClick={testHole}>Test Hole ▶</button>
          }
        </div>
      </div>

      {testing ? (
        <HoleTester hole={hole} holeIdx={activeHole} onBack={() => setTesting(false)} />
      ) : (
      <div className="main">
        <div onMouseEnter={() => { mouseOverBoard.current = true; }} onMouseLeave={() => { mouseOverBoard.current = false; }}>
          <Board
            hole={hole}
            ball={hole.tee}
            ghost={null}
            hintCells={null}
            shots={[]}
            cell={36}
            onCellClick={handleCellClick}
            onCellHover={handleCellHover}
            onCellMouseDown={handleCellMouseDown}
            hovered={hovered}
            showHints={false}
            aiming={true}
          />
        </div>

        <aside className="panel">
          <div className="card">
            <div className="card-header">
              <h3>Tools</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>{tool}</span>
            </div>
            <div className="editor-tools">
              {tools.map(t => (
                <button key={t.id}
                  className={`btn ${tool === t.id ? 'primary' : 'ghost'}`}
                  onClick={() => setTool(t.id)}>
                  {t.label}
                </button>
              ))}
              <button className={`btn ${showGen ? 'primary' : ''}`}
                      style={{ borderColor: 'oklch(0.5 0.13 145)', color: showGen ? 'var(--paper)' : 'oklch(0.5 0.13 145)', background: showGen ? 'oklch(0.5 0.13 145)' : 'var(--paper)' }}
                      onClick={() => setShowGen(!showGen)}>
                Generate
              </button>
            </div>
          </div>

          {showGen && (
            <div className="card">
              <div className="card-header">
                <h3>Generate Hole</h3>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>randomize</span>
              </div>
              <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', width: 60, flexShrink: 0 }}>Dogleg</span>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {['straight', 'mild', 'medium', 'sharp'].map(v => (
                      <button key={v} className={`btn ${genOpts.dogleg === v ? 'primary' : 'ghost'}`}
                              style={{ flex: 1, padding: '3px 4px', fontSize: 9 }}
                              onClick={() => setGenOpts(o => ({ ...o, dogleg: v }))}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', width: 60, flexShrink: 0 }}>Length</span>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {['short', 'medium', 'long'].map(v => (
                      <button key={v} className={`btn ${genOpts.length === v ? 'primary' : 'ghost'}`}
                              style={{ flex: 1, padding: '3px 4px', fontSize: 9 }}
                              onClick={() => setGenOpts(o => ({ ...o, length: v }))}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <span>Hazards</span><span>{genOpts.hazards}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="10" value={genOpts.hazards}
                         onChange={e => setGenOpts(o => ({ ...o, hazards: +e.target.value }))}
                         style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <span>Fairway Width</span><span>{genOpts.fairwayWidth}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="10" value={genOpts.fairwayWidth}
                         onChange={e => setGenOpts(o => ({ ...o, fairwayWidth: +e.target.value }))}
                         style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <span>Slopes</span><span>{genOpts.slopeCount}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="10" value={genOpts.slopeCount}
                         onChange={e => setGenOpts(o => ({ ...o, slopeCount: +e.target.value }))}
                         style={{ width: '100%' }} />
                </div>
                <div className="btn-row">
                  <button className="btn primary full" onClick={() => {
                    const newHole = generateConfigurableHole(genOpts);
                    setHoles(prev => { const next = [...prev]; next[activeHole] = newHole; return next; });
                  }}>
                    Generate Hole {activeHole + 1}
                  </button>
                  <button className="btn ghost" onClick={() => {
                    const newHoles = Array.from({ length: 9 }, () => generateConfigurableHole(genOpts));
                    setHoles(newHoles);
                  }}>
                    All 9
                  </button>
                </div>
              </div>
            </div>
          )}

          {tool === 'paint' && (
            <div className="card">
              <div className="card-header">
                <h3>Terrain</h3>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
                  brush {brushSize}x
                </span>
              </div>
              <div className="terrain-palette">
                {TERRAIN_NAMES.map((name, i) => (
                  <button key={i}
                    className={`terrain-btn ${terrain === i ? 'active' : ''}`}
                    onClick={() => setTerrain(i)}>
                    <span className="terrain-swatch" style={{ background: TERRAIN_COLORS[i] }} />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
              <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 6 }}>
                <button className={`btn ${brushSize === 1 ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setBrushSize(1)}>1x1</button>
                <button className={`btn ${brushSize === 3 ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setBrushSize(3)}>3x3</button>
              </div>
            </div>
          )}

          {tool === 'slope' && (
            <div className="card">
              <div className="card-header"><h3>Slope Direction</h3></div>
              <div style={{ padding: '8px 12px' }}>
                <div className="compass" style={{ maxWidth: 180, margin: '0 auto' }}>
                  <div className="compass-ring" />
                  <div className="compass-center" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>
                    {slopeDir}
                  </div>
                  {DIR_NAMES.map(d => (
                    <button key={d}
                      className={`dir ${slopeDir === d ? 'active' : ''}`}
                      style={{ ...slopeDirPositions[d], width: 28, height: 28, fontSize: 9 }}
                      onClick={() => setSlopeDir(d)}>
                      {slopeLabels[d]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><h3>Course Settings</h3></div>
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-3)', textTransform: 'uppercase', flexShrink: 0 }}>Starting Focus</span>
              <input
                type="number" min="0" max="9" value={startingFocus}
                onChange={e => setStartingFocus(Math.max(0, Math.min(9, parseInt(e.target.value) || 0)))}
                style={{
                  width: 52, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 500,
                  border: '1px solid var(--paper-line)', borderRadius: 5, padding: '4px 8px',
                  background: 'var(--paper)', color: 'var(--ink)', textAlign: 'center',
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Hole Settings</h3></div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-3)', textTransform: 'uppercase', flexShrink: 0 }}>Name</span>
                <input
                  type="text" value={hole.name || ''} placeholder={`Hole ${activeHole + 1}`}
                  onChange={e => updateHole(h => { h.name = e.target.value; })}
                  style={{
                    flex: 1, fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic',
                    border: '1px solid var(--paper-line)', borderRadius: 5, padding: '4px 8px',
                    background: 'var(--paper)', color: 'var(--ink)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>Par</span>
                {[3, 4, 5, 6].map(p => (
                  <button key={p}
                    className={`btn ${hole.par === p ? 'primary' : 'ghost'}`}
                    style={{ padding: '4px 10px', minWidth: 32 }}
                    onClick={() => updateHole(h => { h.par = p; })}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Export / Import</h3></div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="btn-row">
                <button className="btn primary" style={{ flex: 1 }} onClick={doExport}>Export</button>
                <button className="btn" style={{ flex: 1 }} onClick={playCourse}>Play Course</button>
              </div>
              {exportStr && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <textarea
                    readOnly value={exportStr}
                    style={{
                      fontFamily: 'var(--mono)', fontSize: 10, padding: 8, borderRadius: 6,
                      border: '1px solid var(--paper-line)', background: 'var(--paper-2)',
                      resize: 'vertical', minHeight: 60, color: 'var(--ink)',
                    }}
                    onClick={e => e.target.select()}
                  />
                  <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(exportStr); }}>Copy to Clipboard</button>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--paper-line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <textarea
                  placeholder="Paste course data here..."
                  value={importStr} onChange={e => { setImportStr(e.target.value); setImportError(''); }}
                  style={{
                    fontFamily: 'var(--mono)', fontSize: 10, padding: 8, borderRadius: 6,
                    border: '1px solid var(--paper-line)', background: 'var(--paper-2)',
                    resize: 'vertical', minHeight: 50, color: 'var(--ink)',
                  }}
                />
                <button className="btn ghost" onClick={doImport} disabled={!importStr.trim()}>Import</button>
                {importError && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'oklch(0.55 0.18 25)' }}>{importError}</span>}
              </div>
            </div>
          </div>
        </aside>
      </div>
      )}

      {ctrlPicker && (
        <div className="ctrl-picker" style={{ left: ctrlPicker.x, top: ctrlPicker.y }}>
          {TERRAIN_NAMES.map((name, i) => (
            <button key={i}
              className={`ctrl-picker-btn ${terrain === i && tool === 'paint' ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); setTool('paint'); setTerrain(i); setCtrlPicker(null); }}>
              <span className="terrain-swatch" style={{ background: TERRAIN_COLORS[i], width: 12, height: 12 }} />
              {name}
            </button>
          ))}
          <div className="ctrl-picker-divider" />
          <button className={`ctrl-picker-btn ${tool === 'slope' ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); setTool('slope'); setCtrlPicker(null); }}>Slope</button>
          <button className={`ctrl-picker-btn ${tool === 'tee' ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); setTool('tee'); setCtrlPicker(null); }}>Tee</button>
          <button className={`ctrl-picker-btn ${tool === 'cup' ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); setTool('cup'); setCtrlPicker(null); }}>Cup</button>
          <button className={`ctrl-picker-btn ${tool === 'eraser' ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); setTool('eraser'); setCtrlPicker(null); }}>Eraser</button>
        </div>
      )}
    </div>
  );
}

function HoleTester({ hole, holeIdx, onBack }) {
  const Die = window.Die;
  const Compass = window.Compass;
  const { legalShotPath, hookShotPath, hookLanding, hookPossibleLandings, hookMaxSteps,
          validateHookAtAmount, shiftDir, applySlopes, pointToDirDist } = window.DiceGolf;
  const DIRS = window.DiceGolf.dirNames;
  const DIRV = window.DiceGolf.dirVectors;
  const CLUBS = {
    driver:        { die: 8, fixed: null, label: 'Driver',    terrainMod: true,  overTreesAlways: true  },
    woods:         { die: 6, fixed: null, label: 'Woods',     terrainMod: true,  overTreesAlways: false },
    pitchingWedge: { die: 3, fixed: null, label: 'P. Wedge',  terrainMod: false, overTreesAlways: false },
    putter:        { die: 0, fixed: 1,   label: 'Putter',     terrainMod: false, overTreesAlways: false },
  };
  const CLUB_ORDER = ['driver', 'woods', 'pitchingWedge', 'putter'];

  const [ball, setBall] = React.useState(hole.tee);
  const [shots, setShots] = React.useState([]);
  const [club, setClub] = React.useState(null);
  const [die, setDie] = React.useState(null);
  const [rolling, setRolling] = React.useState(false);
  const [aimingDir, setAimingDir] = React.useState(null);
  const [hook, setHook] = React.useState(null);
  const [hoverCell, setHoverCell] = React.useState(null);
  const [holeComplete, setHoleComplete] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState(`Testing Hole ${holeIdx + 1}. Pick a club.`);

  const ballTerrain = hole.grid[ball.y]?.[ball.x] ?? 0;
  const fromFairway = ballTerrain === 1 || ballTerrain === 5;
  const fromSand = ballTerrain === 2;
  const clubSpec = club ? CLUBS[club] : null;
  const needsRoll = clubSpec && clubSpec.fixed == null;

  const plannedDistance = React.useMemo(() => {
    if (!clubSpec) return null;
    if (clubSpec.fixed != null) return clubSpec.fixed;
    if (die == null) return null;
    let d = die;
    if (clubSpec.terrainMod) { if (fromFairway) d += 1; if (fromSand) d -= 1; }
    return Math.max(1, d);
  }, [clubSpec, die, fromFairway, fromSand]);

  const overTrees = club ? (CLUBS[club].overTreesAlways || (club === 'woods' && fromFairway)) : false;
  const aiming = plannedDistance != null;

  const hintCells = React.useMemo(() => {
    if (!plannedDistance) return null;
    const cells = [];
    const hooks = plannedDistance >= 2 && club !== 'pitchingWedge' ? [null, 'left', 'right'] : [null];
    hooks.forEach(h => {
      if (h) {
        DIRS.forEach(dir => {
          hookPossibleLandings(ball, dir, plannedDistance, h).forEach(land => {
            const r = validateHookAtAmount(hole, ball, dir, plannedDistance, h, land.hookAmount, { fromFairway, overTrees });
            cells.push({ x: land.x, y: land.y, legal: !!r.ok, hook: h, dim: (h || null) !== (hook || null) });
          });
        });
      } else {
        DIRS.forEach(dir => {
          const land = hookLanding(ball, dir, plannedDistance, null);
          const r = legalShotPath(hole, ball, dir, plannedDistance, { fromFairway, overTrees });
          cells.push({ x: land.x, y: land.y, legal: !!r.ok, hook: null, dim: !!hook });
        });
      }
    });
    return cells;
  }, [ball, plannedDistance, hole, fromFairway, overTrees, hook]);

  const ghost = React.useMemo(() => {
    if (!aimingDir || !plannedDistance) return null;
    if (hook && plannedDistance >= 2) {
      const landings = hookPossibleLandings(ball, aimingDir, plannedDistance, hook);
      const full = landings[landings.length - 1];
      return { from: ball, to: { x: full.x, y: full.y }, legal: true, hook, bendPos: { x: full.bendX, y: full.bendY }, possibleLandings: landings };
    }
    const land = hookLanding(ball, aimingDir, plannedDistance, null);
    const r = legalShotPath(hole, ball, aimingDir, plannedDistance, { fromFairway, overTrees });
    return { from: ball, to: { x: land.x, y: land.y }, legal: !!r?.ok, hook: null, bendPos: null };
  }, [aimingDir, plannedDistance, ball, hook]);

  function selectClub(key) { setClub(key); setDie(null); setAimingDir(null); setHook(null); }

  function rollDie() {
    if (rolling || !clubSpec || clubSpec.fixed != null) return;
    setRolling(true); setAimingDir(null);
    let ticks = 0;
    const iv = setInterval(() => {
      setDie(1 + Math.floor(Math.random() * clubSpec.die));
      if (++ticks >= 8) { clearInterval(iv); setDie(1 + Math.floor(Math.random() * clubSpec.die)); setRolling(false); }
    }, 55);
  }

  function commitShot(dirOverride) {
    const dir = dirOverride || aimingDir;
    if (!dir || !plannedDistance) return;

    let actualHookAmount = null;
    let bendPos = null;
    const activeHook = hook;

    if (activeHook && plannedDistance >= 2) {
      const max = hookMaxSteps(plannedDistance);
      actualHookAmount = Math.floor(Math.random() * (max + 1));
      const rv = validateHookAtAmount(hole, ball, dir, plannedDistance, activeHook, actualHookAmount, { fromFairway, overTrees });
      if (!rv.ok) { actualHookAmount = 0; }
      const land = hookLanding(ball, dir, plannedDistance, activeHook, actualHookAmount);
      bendPos = { x: land.bendX, y: land.bendY };
    } else {
      const r = legalShotPath(hole, ball, dir, plannedDistance, { fromFairway, overTrees });
      if (!r || !r.ok) { setStatusMsg('Illegal shot.'); return; }
    }

    const land = hookLanding(ball, dir, plannedDistance, activeHook, actualHookAmount);
    let landing = { x: land.x, y: land.y };
    const sv = activeHook
      ? validateHookAtAmount(hole, ball, dir, plannedDistance, activeHook, actualHookAmount, { fromFairway, overTrees })
      : legalShotPath(hole, ball, dir, plannedDistance, { fromFairway, overTrees });

    let actualLanding = landing;
    let treeHitPos = null;
    if (sv.bounced) { treeHitPos = { ...landing }; actualLanding = sv.bounced; landing = actualLanding; }

    let holedOut = landing.x === hole.cup.x && landing.y === hole.cup.y;
    let slopePath = [];
    if (!holedOut && !sv.bounced) {
      const sl = applySlopes(hole, actualLanding);
      actualLanding = sl.finalPos; slopePath = sl.slopePath;
      if (actualLanding.x === hole.cup.x && actualLanding.y === hole.cup.y) holedOut = true;
    }

    setShots(s => [...s.map(x => ({ ...x, fresh: false })), { from: ball, to: landing, slopePath, fresh: true, hook: activeHook, bendPos, treeHit: treeHitPos }]);
    setBall(actualLanding);
    setDie(null); setAimingDir(null); setHook(null); setClub(null);

    if (holedOut) {
      setHoleComplete(true);
      setStatusMsg(`Holed out in ${shots.length + 1}!`);
    } else {
      const t = hole.grid[actualLanding.y][actualLanding.x];
      const tname = ['the rough','the fairway','a sand trap','water','a tree','the green'][t] || 'the rough';
      setStatusMsg(`Ball in ${tname}.${sv.bounced ? ' Tree bounce!' : ''}`);
    }
  }

  function reset() { setBall(hole.tee); setShots([]); setDie(null); setClub(null); setAimingDir(null); setHook(null); setHoleComplete(false); setStatusMsg('Reset. Pick a club.'); }

  return (
    <div className="main">
      <div>
        <Board hole={hole} ball={ball} ghost={ghost} hintCells={hintCells} shots={shots}
               cell={36} onCellClick={c => {
                 if (!plannedDistance) return;
                 const dd = pointToDirDist(ball, c);
                 if (!dd) return;
                 if (dd.dist === plannedDistance) {
                   if (aimingDir === dd.dir) commitShot(dd.dir);
                   else setAimingDir(dd.dir);
                 }
               }}
               onCellHover={c => { setHoverCell(c); if (c && plannedDistance) { const dd = pointToDirDist(ball, c); if (dd && dd.dist === plannedDistance) setAimingDir(dd.dir); } }}
               hovered={hoverCell} showHints={true} aiming={aiming} />
      </div>
      <aside className="panel">
        <div className="card">
          <div className="card-header">
            <h3>Test: Hole {holeIdx + 1}</h3>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
              {fromFairway ? 'fairway' : fromSand ? 'sand' : 'rough'}
            </span>
          </div>

          {plannedDistance >= 2 && club !== 'pitchingWedge' && (
            <div style={{ padding: '8px 16px 0' }}>
              <div className="hook-toggle">
                <button className={hook === 'left' ? 'active' : ''} onClick={() => setHook(hook === 'left' ? null : 'left')} disabled={!aiming}>↰ Hook L</button>
                <button className={!hook ? 'active' : ''} onClick={() => setHook(null)} disabled={!aiming}>Straight</button>
                <button className={hook === 'right' ? 'active' : ''} onClick={() => setHook(hook === 'right' ? null : 'right')} disabled={!aiming}>Hook R ↱</button>
              </div>
            </div>
          )}

          <Compass
            aimingDir={aimingDir}
            onPick={d => {
              if (holeComplete || !aiming) return;
              if (aimingDir === d && ghost?.legal) commitShot(d);
              else setAimingDir(d);
            }}
            disabled={!aiming || holeComplete}
            hintCells={hintCells}
            centerContent={
              holeComplete ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>{shots.length}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>strokes</div>
                  <button className="btn" style={{ fontSize: 10, padding: '5px 10px' }} onClick={reset}>Play Again</button>
                  <button className="btn ghost" style={{ fontSize: 9, padding: '3px 8px' }} onClick={onBack}>← Edit</button>
                </div>
              ) : !club ? (
                <div className="clubs-compact">
                  {CLUB_ORDER.map(key => (
                    <button key={key} className="club-compact" onClick={() => selectClub(key)}>
                      <span className="club-compact-dist">{CLUBS[key].fixed != null ? String(CLUBS[key].fixed) : `d${CLUBS[key].die}`}</span>
                      <span className="club-compact-name">{CLUBS[key].label}</span>
                    </button>
                  ))}
                </div>
              ) : needsRoll && die == null ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <Die value={die} rolling={rolling} dieSize={clubSpec.die} clickable={!rolling} onClick={rollDie} />
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    {rolling ? 'rolling...' : `tap d${clubSpec.die}`}
                  </div>
                  <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => { setClub(null); setDie(null); }}>← Back</button>
                </div>
              ) : needsRoll && die != null ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Die value={die} rolling={rolling} dieSize={clubSpec.die} />
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{plannedDistance}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase' }}>dist</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 500, lineHeight: 1 }}>{plannedDistance}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase' }}>{clubSpec.label}</div>
                  <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => { setClub(null); }}>← Back</button>
                </div>
              )
            }
          />
          {aimingDir && aiming && !holeComplete && (
            <div style={{ padding: '0 16px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textAlign: 'center' }}>
              {ghost?.legal ? `Click ${aimingDir} again to confirm` : 'Illegal direction'}
            </div>
          )}
        </div>

        <div className="card">
          <div className="statusline">
            <span className="blink" />
            <span>{statusMsg}</span>
          </div>
        </div>

        <div className="btn-row" style={{ padding: '0' }}>
          <button className="btn ghost full" onClick={reset}>Reset Ball</button>
          <button className="btn full" onClick={onBack}>← Back to Editor</button>
        </div>
      </aside>
    </div>
  );
}

window.CreatorApp = CreatorApp;
window.importCourse = importCourse;
