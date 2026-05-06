/* Dice Golf — hole generation + game rules
   Globals exposed on window:
     generateHole(seed, opts)
     legalShotPath(hole, from, dir, distance, opts)
     applySlopes(hole, pos)
     dirVectors, dirNames
*/

const dirVectors = {
  N:  { dx:  0, dy: -1 },
  NE: { dx:  1, dy: -1 },
  E:  { dx:  1, dy:  0 },
  SE: { dx:  1, dy:  1 },
  S:  { dx:  0, dy:  1 },
  SW: { dx: -1, dy:  1 },
  W:  { dx: -1, dy:  0 },
  NW: { dx: -1, dy: -1 },
};
const dirNames = ['N','NE','E','SE','S','SW','W','NW'];

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function inBounds(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function generateHole(seed, { w = 22, h = 14 } = {}) {
  const rand = rng(seed);
  const grid = Array.from({ length: h }, () => Array(w).fill(0));

  const teeSide = rand() < 0.5 ? 'left' : 'right';
  const tee = teeSide === 'left'
    ? { x: 1 + Math.floor(rand() * 2), y: 2 + Math.floor(rand() * (h - 4)) }
    : { x: w - 2 - Math.floor(rand() * 2), y: 2 + Math.floor(rand() * (h - 4)) };
  const cup = teeSide === 'left'
    ? { x: w - 2 - Math.floor(rand() * 2), y: 2 + Math.floor(rand() * (h - 4)) }
    : { x: 1 + Math.floor(rand() * 2), y: 2 + Math.floor(rand() * (h - 4)) };

  // Dogleg fairway — always bends, 2-3 waypoints
  const numWaypoints = 2 + Math.floor(rand() * 2);
  const ctrl = [tee];
  for (let wi = 1; wi <= numWaypoints; wi++) {
    const t = wi / (numWaypoints + 1);
    const baseX = tee.x + (cup.x - tee.x) * t;
    const baseY = tee.y + (cup.y - tee.y) * t;
    const perpX = -(cup.y - tee.y);
    const perpY = (cup.x - tee.x);
    const perpLen = Math.hypot(perpX, perpY) || 1;
    // Always bend — minimum 0.25 strength, alternating sides for S-curves
    const sign = (wi % 2 === 0) ? 1 : -1;
    const bendStr = sign * (0.25 + rand() * 0.4);
    ctrl.push({
      x: Math.round(Math.max(2, Math.min(w - 3, baseX + (perpX / perpLen) * Math.min(w, h) * bendStr))),
      y: Math.round(Math.max(2, Math.min(h - 3, baseY + (perpY / perpLen) * Math.min(w, h) * bendStr))),
    });
  }
  ctrl.push(cup);

  function paintFairway(x0, y0, x1, y1, width) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (true) {
      for (let oy = -width; oy <= width; oy++) {
        for (let ox = -width; ox <= width; ox++) {
          if (ox * ox + oy * oy <= width * width + 1) {
            const nx = x + ox, ny = y + oy;
            if (inBounds(grid, nx, ny)) grid[ny][nx] = 1;
          }
        }
      }
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx)  { err += dx; y += sy; }
    }
  }

  // Narrow fairways — width 1 for most segments, 1 near the green
  for (let i = 0; i < ctrl.length - 1; i++) {
    paintFairway(ctrl[i].x, ctrl[i].y, ctrl[i+1].x, ctrl[i+1].y, 1);
  }

  // Fairway crossings — 2-3 strips of water or sand that cut across the fairway
  const crossingCount = 2 + Math.floor(rand() * 2);
  for (let ci = 0; ci < crossingCount; ci++) {
    // Pick a point along the fairway path (avoid near tee and cup)
    const seg = 1 + Math.floor(rand() * (ctrl.length - 2)); // skip first/last segments
    const t = 0.3 + rand() * 0.4; // 30-70% along the segment
    const cx = Math.round(ctrl[seg - 1].x + (ctrl[seg].x - ctrl[seg - 1].x) * t);
    const cy = Math.round(ctrl[seg - 1].y + (ctrl[seg].y - ctrl[seg - 1].y) * t);
    if (Math.hypot(cx - tee.x, cy - tee.y) < 4) continue;
    if (Math.hypot(cx - cup.x, cy - cup.y) < 4) continue;
    // Direction of fairway at this point
    const fdx = ctrl[seg].x - ctrl[seg - 1].x;
    const fdy = ctrl[seg].y - ctrl[seg - 1].y;
    // Perpendicular direction for the crossing strip
    const pLen = Math.hypot(fdx, fdy) || 1;
    const px = -fdy / pLen, py = fdx / pLen;
    const code = rand() < 0.5 ? 3 : 2; // water or sand
    const stripLen = 2 + Math.floor(rand() * 2); // 2-3 cells wide
    for (let si = -stripLen; si <= stripLen; si++) {
      const sx = Math.round(cx + px * si);
      const sy = Math.round(cy + py * si);
      if (inBounds(grid, sx, sy) && grid[sy][sx] !== 5) {
        grid[sy][sx] = code;
      }
    }
  }

  // Re-ensure tee cell is fairway (crossings might overwrite it)
  grid[tee.y][tee.x] = 1;

  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      if (ox*ox + oy*oy <= 5) {
        const nx = cup.x + ox, ny = cup.y + oy;
        if (inBounds(grid, nx, ny)) grid[ny][nx] = 5;
      }
    }
  }

  // Collect fairway-adjacent cells for biased hazard placement
  const fairwayCells = [];
  for (let fy = 0; fy < h; fy++) {
    for (let fx = 0; fx < w; fx++) {
      if (grid[fy][fx] === 1) fairwayCells.push({ x: fx, y: fy });
    }
  }

  function placeBlob(code, sizeMin, sizeMax, avoid = []) {
    let attempts = 0;
    while (attempts++ < 60) {
      const cx = 2 + Math.floor(rand() * (w - 4));
      const cy = 1 + Math.floor(rand() * (h - 2));
      const size = sizeMin + Math.floor(rand() * (sizeMax - sizeMin + 1));
      if (Math.hypot(cx - tee.x, cy - tee.y) < 3) continue;
      if (Math.hypot(cx - cup.x, cy - cup.y) < 3) continue;
      let ok = true;
      const cells = [];
      for (let oy = -size; oy <= size; oy++) {
        for (let ox = -size; ox <= size; ox++) {
          const d = Math.hypot(ox, oy) + (rand() - 0.5) * 0.6;
          if (d <= size) {
            const nx = cx + ox, ny = cy + oy;
            if (!inBounds(grid, nx, ny)) continue;
            if (avoid.includes(grid[ny][nx])) { ok = false; }
            cells.push([nx, ny]);
          }
        }
      }
      if (!ok) continue;
      cells.forEach(([x,y]) => { if (grid[y][x] !== 1 && grid[y][x] !== 5) grid[y][x] = code; });
      return true;
    }
    return false;
  }

  // Place hazard near a random fairway cell (offset 2-4 cells away)
  function placeBlobNearFairway(code, sizeMin, sizeMax, avoid) {
    let attempts = 0;
    while (attempts++ < 40) {
      const fc = fairwayCells[Math.floor(rand() * fairwayCells.length)];
      const offDist = 2 + Math.floor(rand() * 3);
      const ang = rand() * Math.PI * 2;
      const cx = Math.round(fc.x + Math.cos(ang) * offDist);
      const cy = Math.round(fc.y + Math.sin(ang) * offDist);
      if (!inBounds(grid, cx, cy)) continue;
      if (Math.hypot(cx - tee.x, cy - tee.y) < 2) continue;
      if (Math.hypot(cx - cup.x, cy - cup.y) < 3) continue;
      const size = sizeMin + Math.floor(rand() * (sizeMax - sizeMin + 1));
      let ok = true;
      const cells = [];
      for (let oy = -size; oy <= size; oy++) {
        for (let ox = -size; ox <= size; ox++) {
          const d = Math.hypot(ox, oy) + (rand() - 0.5) * 0.6;
          if (d <= size) {
            const nx = cx + ox, ny = cy + oy;
            if (!inBounds(grid, nx, ny)) continue;
            if (avoid.includes(grid[ny][nx])) { ok = false; }
            cells.push([nx, ny]);
          }
        }
      }
      if (!ok) continue;
      cells.forEach(([x,y]) => { if (grid[y][x] !== 1 && grid[y][x] !== 5) grid[y][x] = code; });
      return true;
    }
    return false;
  }

  // Water — 4-7 blobs, mostly near fairway, bigger
  const waterCount = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < waterCount; i++) {
    if (rand() < 0.75) placeBlobNearFairway(3, 1, 3, [5, 1]);
    else placeBlob(3, 1, 3, [5]);
  }
  // Sand — 6-10 bunkers, heavily fairway-adjacent, bigger
  const bunkerCount = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < bunkerCount; i++) {
    if (rand() < 0.85) placeBlobNearFairway(2, 1, 3, [3, 5, 1]);
    else placeBlob(2, 1, 3, [3, 5]);
  }
  // Trees — 12-20 clusters lining the fairway
  const treeCount = 12 + Math.floor(rand() * 9);
  for (let i = 0; i < treeCount; i++) {
    let attempts = 0;
    while (attempts++ < 40) {
      // Bias near fairway
      let cx, cy;
      if (rand() < 0.7 && fairwayCells.length) {
        const fc = fairwayCells[Math.floor(rand() * fairwayCells.length)];
        const off = 2 + Math.floor(rand() * 3);
        const ang = rand() * Math.PI * 2;
        cx = Math.round(fc.x + Math.cos(ang) * off);
        cy = Math.round(fc.y + Math.sin(ang) * off);
      } else {
        cx = 1 + Math.floor(rand() * (w - 2));
        cy = 1 + Math.floor(rand() * (h - 2));
      }
      if (!inBounds(grid, cx, cy)) continue;
      if (grid[cy][cx] !== 0) continue;
      if (Math.hypot(cx - tee.x, cy - tee.y) < 2) continue;
      if (Math.hypot(cx - cup.x, cy - cup.y) < 3) continue;
      const cluster = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < cluster; k++) {
        const nx = cx + Math.floor((rand() - 0.5) * 4);
        const ny = cy + Math.floor((rand() - 0.5) * 4);
        if (inBounds(grid, nx, ny) && grid[ny][nx] === 0) grid[ny][nx] = 4;
      }
      break;
    }
  }

  // Rocks — 3-6 scattered on rough, some near fairway
  const rockCount = 3 + Math.floor(rand() * 4);
  for (let ri = 0; ri < rockCount; ri++) {
    let ra = 0;
    while (ra++ < 30) {
      let rx, ry;
      if (rand() < 0.6 && fairwayCells.length) {
        const fc = fairwayCells[Math.floor(rand() * fairwayCells.length)];
        const off = 1 + Math.floor(rand() * 3);
        const ang = rand() * Math.PI * 2;
        rx = Math.round(fc.x + Math.cos(ang) * off);
        ry = Math.round(fc.y + Math.sin(ang) * off);
      } else {
        rx = 2 + Math.floor(rand() * (w - 4));
        ry = 1 + Math.floor(rand() * (h - 2));
      }
      if (!inBounds(grid, rx, ry)) continue;
      if (grid[ry][rx] !== 0) continue;
      if (Math.hypot(rx - tee.x, ry - tee.y) < 3) continue;
      if (Math.hypot(rx - cup.x, ry - cup.y) < 3) continue;
      grid[ry][rx] = 6;
      break;
    }
  }

  const slopes = [];
  const slopeGroupCount = 2 + Math.floor(rand() * 3);
  const slopeDirs = ['N','E','S','W','NE','SE','SW','NW'];

  function perpOffsets(dir, width) {
    const v = dirVectors[dir];
    const px = -v.dy, py = v.dx;
    const offsets = [{ dx: 0, dy: 0 }];
    for (let i = 1; i <= Math.floor(width / 2); i++) {
      offsets.push({ dx: px * i, dy: py * i });
      offsets.push({ dx: -px * i, dy: -py * i });
    }
    return offsets;
  }

  let attempts = 0;
  let groupsPlaced = 0;
  while (groupsPlaced < slopeGroupCount && attempts++ < 80) {
    const x = 2 + Math.floor(rand() * (w - 4));
    const y = 1 + Math.floor(rand() * (h - 2));
    if (!(grid[y][x] === 0 || grid[y][x] === 1)) continue;
    if (x === tee.x && y === tee.y) continue;
    if (x === cup.x && y === cup.y) continue;
    if (slopes.find(s => s.x === x && s.y === y)) continue;
    const dir = slopeDirs[Math.floor(rand() * slopeDirs.length)];
    const v = dirVectors[dir];
    const nx = x + v.dx, ny = y + v.dy;
    if (inBounds(grid, nx, ny) && grid[ny][nx] === 3) continue;
    const width = rand() < 0.4 ? 1 : rand() < 0.7 ? 2 : 3;
    const offsets = perpOffsets(dir, width);
    offsets.forEach(off => {
      const sx = x + off.dx, sy = y + off.dy;
      if (!inBounds(grid, sx, sy)) return;
      if (grid[sy][sx] !== 0 && grid[sy][sx] !== 1) return;
      if (sx === tee.x && sy === tee.y) return;
      if (sx === cup.x && sy === cup.y) return;
      if (slopes.find(s => s.x === sx && s.y === sy)) return;
      const nsx = sx + v.dx, nsy = sy + v.dy;
      if (inBounds(grid, nsx, nsy) && grid[nsy][nsx] === 3) return;
      slopes.push({ x: sx, y: sy, dir });
    });
    groupsPlaced++;
  }

  // Green slopes — 2-4 slopes on green cells around the cup
  const greenCells = [];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      if (grid[gy][gx] === 5 && !(gx === cup.x && gy === cup.y)) {
        greenCells.push({ x: gx, y: gy });
      }
    }
  }
  const greenSlopeCount = 2 + Math.floor(rand() * 3);
  // Shuffle green cells
  for (let i = greenCells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [greenCells[i], greenCells[j]] = [greenCells[j], greenCells[i]];
  }
  let placed = 0;
  for (let gi = 0; gi < greenCells.length && placed < greenSlopeCount; gi++) {
    const gc = greenCells[gi];
    if (slopes.find(s => s.x === gc.x && s.y === gc.y)) continue;
    // Pick a direction — bias toward/away from the cup for interesting breaks
    const dxc = cup.x - gc.x, dyc = cup.y - gc.y;
    let dir;
    if (rand() < 0.4) {
      // Slope toward the cup
      const sx = Math.sign(dxc), sy = Math.sign(dyc);
      dir = Object.entries(dirVectors).find(([,v]) => v.dx === sx && v.dy === sy)?.[0];
    } else if (rand() < 0.5) {
      // Slope perpendicular to the cup — creates a break
      const perps = [];
      if (dxc !== 0 || dyc !== 0) {
        const sx = Math.sign(dxc), sy = Math.sign(dyc);
        // Rotate 90 degrees both ways
        perps.push(
          Object.entries(dirVectors).find(([,v]) => v.dx === -sy && v.dy === sx)?.[0],
          Object.entries(dirVectors).find(([,v]) => v.dx === sy && v.dy === -sx)?.[0]
        );
      }
      dir = perps.filter(Boolean)[Math.floor(rand() * perps.filter(Boolean).length)];
    } else {
      // Slope away from the cup
      const sx = -Math.sign(dxc), sy = -Math.sign(dyc);
      dir = Object.entries(dirVectors).find(([,v]) => v.dx === sx && v.dy === sy)?.[0];
    }
    if (!dir) dir = slopeDirs[Math.floor(rand() * slopeDirs.length)];
    const sv = dirVectors[dir];
    const snx = gc.x + sv.dx, sny = gc.y + sv.dy;
    if (inBounds(grid, snx, sny) && grid[sny][snx] === 3) continue;
    const gWidth = rand() < 0.5 ? 1 : 2;
    const gOffsets = perpOffsets(dir, gWidth);
    gOffsets.forEach(off => {
      const gsx = gc.x + off.dx, gsy = gc.y + off.dy;
      if (!inBounds(grid, gsx, gsy)) return;
      if (grid[gsy][gsx] !== 5) return;
      if (gsx === cup.x && gsy === cup.y) return;
      if (slopes.find(s => s.x === gsx && s.y === gsy)) return;
      slopes.push({ x: gsx, y: gsy, dir });
    });
    placed++;
  }

  grid[tee.y][tee.x] = 1;
  grid[cup.y][cup.x] = 5;

  return {
    w, h, grid, slopes, tee, cup, bigfoot: null,
    par: 6,
    seed,
  };
}

function terrainAt(hole, x, y) {
  if (!inBounds(hole.grid, x, y)) return -1;
  return hole.grid[y][x];
}
function slopeAt(hole, x, y) {
  return hole.slopes.find(s => s.x === x && s.y === y) || null;
}

function bounceBack(hole, path, from) {
  for (let i = path.length - 2; i >= 0; i--) {
    const t = hole.grid[path[i].y][path[i].x];
    if (t !== 3 && t !== 4) return { x: path[i].x, y: path[i].y };
  }
  return from;
}

function legalShotPath(hole, from, dir, distance, { fromFairway, overTrees }) {
  const v = dirVectors[dir];
  const path = [];
  let x = from.x, y = from.y;
  for (let step = 1; step <= distance; step++) {
    x += v.dx; y += v.dy;
    if (!inBounds(hole.grid, x, y)) {
      return { ok: false, blockedReason: 'out_of_bounds', path };
    }
    const t = hole.grid[y][x];
    path.push({ x, y, terrain: t });
    const isLanding = (step === distance);
    if (t === 4 && !isLanding && !overTrees) {
      return { ok: false, blockedReason: 'tree_in_path', path };
    }
    if (t === 4 && isLanding) {
      const bp = bounceBack(hole, path, from);
      return { ok: true, path, landingTerrain: hole.grid[bp.y][bp.x], bounced: bp };
    }
    if (t === 6 && isLanding) {
      return { ok: true, path, landingTerrain: 6, ricochet: { x, y } };
    }
    if (t === 3 && isLanding) {
      return { ok: false, blockedReason: 'water_landing', path };
    }
  }
  const last = path[path.length - 1] || from;
  const landingTerrain = hole.grid[last.y][last.x];
  return { ok: true, path, landingTerrain };
}

function applySlopes(hole, pos) {
  const slopePath = [];
  let cur = { ...pos };
  const visited = new Set([`${cur.x},${cur.y}`]);
  while (true) {
    const s = slopeAt(hole, cur.x, cur.y);
    if (!s) break;
    const v = dirVectors[s.dir];
    const nx = cur.x + v.dx, ny = cur.y + v.dy;
    if (!inBounds(hole.grid, nx, ny)) break;
    const t = hole.grid[ny][nx];
    if (t === 3) break;
    cur = { x: nx, y: ny };
    slopePath.push({ x: nx, y: ny });
    if (visited.has(`${cur.x},${cur.y}`)) break;
    visited.add(`${cur.x},${cur.y}`);
    const nextSlope = slopeAt(hole, cur.x, cur.y);
    if (nextSlope) {
      const nv = dirVectors[nextSlope.dir];
      if (nv.dx === -v.dx && nv.dy === -v.dy) break;
    }
    if (slopePath.length > 12) break;
  }
  return { finalPos: cur, slopePath };
}

function shiftDir(dir, hook) {
  const idx = dirNames.indexOf(dir);
  if (hook === 'right') return dirNames[(idx + 1) % 8];
  if (hook === 'left') return dirNames[(idx + 7) % 8];
  return dir;
}

function hookShotPath(hole, from, dir, distance, hook, { fromFairway, overTrees }) {
  if (!hook) return legalShotPath(hole, from, dir, distance, { fromFairway, overTrees });

  const straightSteps = Math.floor(distance * 2 / 3);
  const hookSteps = distance - straightSteps;

  if (straightSteps === 0) {
    const shifted = shiftDir(dir, hook);
    const r = legalShotPath(hole, from, shifted, distance, { fromFairway, overTrees });
    r.bendAt = 0;
    return r;
  }

  const v = dirVectors[dir];
  const path = [];
  let x = from.x, y = from.y;

  for (let step = 1; step <= straightSteps; step++) {
    x += v.dx; y += v.dy;
    if (!inBounds(hole.grid, x, y)) {
      return { ok: false, blockedReason: 'out_of_bounds', path, bendAt: straightSteps };
    }
    const t = hole.grid[y][x];
    path.push({ x, y, terrain: t });
    if (t === 4 && !overTrees) {
      return { ok: false, blockedReason: 'tree_in_path', path, bendAt: straightSteps };
    }
  }

  const hookDir = shiftDir(dir, hook);
  const hv = dirVectors[hookDir];

  for (let step = 1; step <= hookSteps; step++) {
    x += hv.dx; y += hv.dy;
    if (!inBounds(hole.grid, x, y)) {
      return { ok: false, blockedReason: 'out_of_bounds', path, bendAt: straightSteps };
    }
    const t = hole.grid[y][x];
    path.push({ x, y, terrain: t });
    const isLanding = (step === hookSteps);
    if (t === 4 && !isLanding && !overTrees) {
      return { ok: false, blockedReason: 'tree_in_path', path, bendAt: straightSteps };
    }
    if (t === 4 && isLanding) {
      const bp = bounceBack(hole, path, from);
      return { ok: true, path, landingTerrain: hole.grid[bp.y][bp.x], bendAt: straightSteps, bounced: bp };
    }
    if (t === 6 && isLanding) {
      return { ok: true, path, landingTerrain: 6, bendAt: straightSteps, ricochet: { x, y } };
    }
    if (t === 3 && isLanding) {
      return { ok: false, blockedReason: 'water_landing', path, bendAt: straightSteps };
    }
  }

  const last = path[path.length - 1] || from;
  const landingTerrain = hole.grid[last.y][last.x];
  return { ok: true, path, landingTerrain, bendAt: straightSteps };
}

function hookLanding(from, dir, distance, hook, hookAmount) {
  const straightSteps = Math.floor(distance * 2 / 3);
  const maxHookSteps = distance - straightSteps;
  const steps = hookAmount != null ? hookAmount : maxHookSteps;
  const v = dirVectors[dir];
  const bendX = from.x + v.dx * straightSteps;
  const bendY = from.y + v.dy * straightSteps;
  if (!hook || straightSteps === 0) {
    const shifted = hook ? shiftDir(dir, hook) : dir;
    const sv = dirVectors[shifted];
    return { x: from.x + sv.dx * distance, y: from.y + sv.dy * distance,
             bendX: from.x, bendY: from.y };
  }
  const hd = shiftDir(dir, hook);
  const hv = dirVectors[hd];
  return { x: bendX + hv.dx * steps, y: bendY + hv.dy * steps,
           bendX, bendY };
}

function hookMaxSteps(distance) {
  return Math.min(2, distance - Math.floor(distance * 2 / 3));
}

function hookPossibleLandings(from, dir, distance, hook) {
  if (!hook) {
    const l = hookLanding(from, dir, distance, null);
    return [{ ...l, hookAmount: 0 }];
  }
  const max = hookMaxSteps(distance);
  const landings = [];
  for (let h = 0; h <= max; h++) {
    const l = hookLanding(from, dir, distance, hook, h);
    landings.push({ ...l, hookAmount: h });
  }
  return landings;
}

function validateHookAtAmount(hole, from, dir, distance, hook, hookAmount, { fromFairway, overTrees }) {
  const straightSteps = Math.floor(distance * 2 / 3);
  const v = dirVectors[dir];
  const path = [];
  let x = from.x, y = from.y;

  for (let step = 1; step <= straightSteps; step++) {
    x += v.dx; y += v.dy;
    if (!inBounds(hole.grid, x, y)) return { ok: false, blockedReason: 'out_of_bounds', path };
    const t = hole.grid[y][x];
    path.push({ x, y, terrain: t });
    if (t === 4 && !overTrees) return { ok: false, blockedReason: 'tree_in_path', path };
  }

  if (hook && hookAmount > 0) {
    const hookDir = shiftDir(dir, hook);
    const hv = dirVectors[hookDir];
    for (let step = 1; step <= hookAmount; step++) {
      x += hv.dx; y += hv.dy;
      if (!inBounds(hole.grid, x, y)) return { ok: false, blockedReason: 'out_of_bounds', path };
      const t = hole.grid[y][x];
      path.push({ x, y, terrain: t });
      const isLanding = (step === hookAmount);
      if (t === 4 && !isLanding && !overTrees) return { ok: false, blockedReason: 'tree_in_path', path };
      if (t === 4 && isLanding) {
        const bp = bounceBack(hole, path, from);
        return { ok: true, path, landingTerrain: hole.grid[bp.y][bp.x], bounced: bp };
      }
      if (t === 6 && isLanding) return { ok: true, path, landingTerrain: 6, ricochet: { x, y } };
      if (t === 3 && isLanding) return { ok: false, blockedReason: 'water_landing', path };
    }
  } else if (!hook || hookAmount === 0) {
    const t = (x >= 0 && y >= 0 && inBounds(hole.grid, x, y)) ? hole.grid[y][x] : -1;
    if (t === 4) {
      const bp = bounceBack(hole, path, from);
      return { ok: true, path, landingTerrain: hole.grid[bp.y][bp.x], bounced: bp };
    }
    if (t === 6) return { ok: true, path, landingTerrain: 6, ricochet: { x, y } };
    if (t === 3) return { ok: false, blockedReason: 'water_landing', path };
  }

  return { ok: true, path, landingTerrain: hole.grid[y]?.[x] };
}

function waterDrop(hole, waterPos) {
  const dir = waterPos.x >= hole.tee.x ? -1 : 1;
  for (let x = waterPos.x + dir; x >= 0 && x < hole.w; x += dir) {
    const t = hole.grid[waterPos.y][x];
    if (t !== 2 && t !== 3 && t !== 4 && t !== 6) return { x, y: waterPos.y };
  }
  for (let dy = -1; dy <= 1; dy += 2) {
    const ny = waterPos.y + dy;
    if (ny < 0 || ny >= hole.h) continue;
    for (let x = waterPos.x + dir; x >= 0 && x < hole.w; x += dir) {
      const t = hole.grid[ny][x];
      if (t !== 2 && t !== 3 && t !== 4 && t !== 6) return { x, y: ny };
    }
  }
  return hole.tee;
}

function pointToDirDist(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (!(dx === 0 || dy === 0 || adx === ady)) return null;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const dir = Object.entries(dirVectors).find(([,v]) => v.dx === sx && v.dy === sy)?.[0];
  if (!dir) return null;
  const dist = Math.max(adx, ady);
  return { dir, dist };
}

window.DiceGolf = {
  generateHole, legalShotPath, hookShotPath, hookLanding, hookPossibleLandings,
  hookMaxSteps, validateHookAtAmount, shiftDir,
  applySlopes, waterDrop, pointToDirDist,
  terrainAt, slopeAt, dirVectors, dirNames, inBounds,
};
