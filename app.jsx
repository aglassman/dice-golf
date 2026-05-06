/* Dice Golf — main app */

const { useState, useEffect, useMemo, useRef, useCallback } = React;
const { generateHole, legalShotPath, hookShotPath, hookLanding, hookPossibleLandings, hookMaxSteps, validateHookAtAmount, shiftDir, applySlopes, waterDrop, pointToDirDist } = window.DiceGolf;
const DIRS = window.DiceGolf.dirNames;
const DIRV = window.DiceGolf.dirVectors;

const COURSE_NAMES = [
  'Hollow Pines Country Club',
  'Cedar Bluff Links',
  'Saltmarsh Dunes G.C.',
  'Old Mill & Co.',
  'Larkspur Hollow',
  'Wormwood Heights',
  'Tinder Creek Greens',
  'Ashbridge Commons',
];
function pickName(seed) { return COURSE_NAMES[seed % COURSE_NAMES.length]; }

const CLUBS = {
  driver:        { die: 8, fixed: null, label: 'Driver',    terrainMod: true,  overTreesAlways: true  },
  woods:         { die: 6, fixed: null, label: 'Woods',     terrainMod: true,  overTreesAlways: false },
  pitchingWedge: { die: 3, fixed: null, label: 'P. Wedge',  terrainMod: false, overTreesAlways: false },
  putter:        { die: 0, fixed: 1,   label: 'Putter',     terrainMod: false, overTreesAlways: false },
};
const CLUB_ORDER = ['driver', 'woods', 'pitchingWedge', 'putter'];

const DEFAULT_TWEAKS = {
  showHints: true,
  showCompass: true,
  difficulty: 'Standard',
  cellSize: 38,
};

function App({ customCourse }) {
  const [tweaks, setTweaks] = useState(DEFAULT_TWEAKS);
  const setTweak = useCallback((key, val) => {
    setTweaks(prev => ({ ...prev, [key]: val }));
  }, []);
  const difficulty = tweaks.difficulty;
  const mulligansMax = difficulty === 'Casual' ? 6 : difficulty === 'Tour' ? 1 : 3;

  const [seed, setSeed] = useState(() => 1024);
  const [holeIdx, setHoleIdx] = useState(0);
  const holeSeeds = useMemo(() => [seed, seed + 7919, seed + 15485, seed + 24593, seed + 32452, seed + 49157, seed + 65537, seed + 86939, seed + 99991], [seed]);

  const hole = useMemo(() => customCourse ? customCourse.holes[holeIdx] : generateHole(holeSeeds[holeIdx], { w: 22, h: 13 }), [holeSeeds, holeIdx, customCourse]);
  const courseName = useMemo(() => customCourse ? customCourse.name : pickName(seed), [seed, customCourse]);

  const [ball, setBall] = useState(hole.tee);
  const [shots, setShots] = useState([]);
  const [club, setClub] = useState(null);
  const [die, setDie] = useState(null);
  const [hasRerolled, setHasRerolled] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [aimingDir, setAimingDir] = useState(null);
  const [hook, setHook] = useState(null); // null | 'left' | 'right'
  const [hoverCell, setHoverCell] = useState(null);
  const [mulligansUsed, setMulligansUsed] = useState(0);
  const [focus, setFocus] = useState(() => customCourse?.startingFocus ?? 0);
  const [useFocusActive, setUseFocusActive] = useState(false);
  const [focusUsedThisHole, setFocusUsedThisHole] = useState(false);
  const [highlightedClub, setHighlightedClub] = useState(0);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [holeScores, setHoleScores] = useState([]);
  const [holeComplete, setHoleComplete] = useState(false);
  const [bigToast, setBigToast] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Welcome to ' + pickName(1024) + '. Pick a club to tee off.');
  const [roundLog, setRoundLog] = useState([]);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('dg-name') || 'Player 1');
  const [otherScores, setOtherScores] = useState([]);
  const [shareStr, setShareStr] = useState('');
  const [shareImport, setShareImport] = useState('');
  const [shareImportError, setShareImportError] = useState('');

  useEffect(() => {
    setBall(hole.tee);
    setShots([]);
    setDie(null);
    setHasRerolled(false);
    setClub(null);
    setAimingDir(null);
    setHook(null);
    setHoverCell(null);
    setUseFocusActive(false);
    setFocusUsedThisHole(false);
    setHoleComplete(false);
    setStatusMsg(`Hole ${holeIdx + 1} — Par ${hole.par}. Pick a club.`);
  }, [hole]);


  // Keyboard controls (numpad)
  useEffect(() => {
    const dirMap = {
      Numpad8: 'N', Numpad9: 'NE', Numpad6: 'E', Numpad3: 'SE',
      Numpad2: 'S', Numpad1: 'SW', Numpad4: 'W', Numpad7: 'NW',
    };
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Hole complete — 5/Enter for next hole
      if (holeComplete) {
        if (e.code === 'Numpad5' || e.code === 'NumpadEnter' || e.code === 'Enter') {
          e.preventDefault();
          nextHole();
        }
        return;
      }

      // Phase 1: Club selection — numpad matches 2x2 layout
      // 4=Driver  5=Woods
      // 1=P.Wedge 2=Putter
      if (!club) {
        const clubMap = { Numpad4: 0, Numpad5: 1, Numpad1: 2, Numpad2: 3 };
        if (clubMap[e.code] != null) {
          const ck = CLUB_ORDER[clubMap[e.code]];
          if (ck === 'driver' && !onTee) return;
          e.preventDefault();
          selectClub(ck);
          return;
        }
        return;
      }

      // Phase 2: Roll die (club selected, needs roll, no die yet)
      if (needsRoll && die == null && !rolling) {
        const clubMap = { Numpad4: 0, Numpad5: 1, Numpad1: 2, Numpad2: 3 };
        const pressedClub = clubMap[e.code] != null ? CLUB_ORDER[clubMap[e.code]] : null;
        if (e.code === 'NumpadEnter' || e.code === 'Enter' || pressedClub === club) {
          e.preventDefault();
          rollDie();
          return;
        }
        // Switch club
        if (pressedClub && pressedClub !== club) {
          if (pressedClub === 'driver' && !onTee) return;
          e.preventDefault();
          selectClub(pressedClub);
          return;
        }
        // Back
        if (e.code === 'Numpad0' || e.code === 'Escape') {
          e.preventDefault();
          setClub(null); setDie(null); setAimingDir(null); setHook(null);
          return;
        }
        return;
      }

      // Phase 3: Aiming (have distance)
      if (plannedDistance != null && !rolling) {
        // Direction keys
        if (dirMap[e.code]) {
          e.preventDefault();
          const d = dirMap[e.code];
          if (aimingDir === d) {
            if (ghost && ghost.legal) commitShot(d);
          } else {
            setAimingDir(d);
          }
          return;
        }

        // Confirm with 5/Enter
        if ((e.code === 'Numpad5' || e.code === 'NumpadEnter' || e.code === 'Enter') && aimingDir) {
          e.preventDefault();
          if (ghost && ghost.legal) commitShot();
          return;
        }

        // Hook toggle (numpad +/-)
        if (e.code === 'NumpadAdd' && plannedDistance >= 2 && club !== 'putter') {
          e.preventDefault();
          setHook(h => h === 'right' ? null : 'right');
          return;
        }
        if (e.code === 'NumpadSubtract' && plannedDistance >= 2 && club !== 'putter') {
          e.preventDefault();
          setHook(h => h === 'left' ? null : 'left');
          return;
        }

        // Focus toggle (NumpadDecimal / period)
        if ((e.code === 'NumpadDecimal' || e.code === 'Period') && focus > -2) {
          e.preventDefault();
          setUseFocusActive(v => !v);
          return;
        }

        // Re-roll (Numpad0 on tee only)
        if (e.code === 'Numpad0' && canReroll) {
          e.preventDefault();
          rerollDie();
          return;
        }
        // Back for fixed-distance clubs (putter) — no die to protect
        if ((e.code === 'Numpad0' || e.code === 'Escape') && clubSpec && clubSpec.fixed != null) {
          e.preventDefault();
          setClub(null); setDie(null); setAimingDir(null); setHook(null);
          return;
        }
      }

      // Mulligan (numpad * — available any time a club is selected)
      if (e.code === 'NumpadMultiply' && club && mullRemaining > 0 && !rolling) {
        e.preventDefault();
        useMulligan();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const ballTerrain = hole.grid[ball.y][ball.x];
  const fromFairway = ballTerrain === 1 || ballTerrain === 5;
  const fromSand = ballTerrain === 2;

  const onTee = shots.length === 0;
  const clubSpec = club ? CLUBS[club] : null;

  const frustration = focus < 0 ? focus : 0; // negative number
  const plannedDistance = useMemo(() => {
    if (!clubSpec) return null;
    if (clubSpec.fixed != null) return Math.max(1, clubSpec.fixed + (useFocusActive ? 1 : 0) + frustration);
    if (die == null) return null;
    let d = die;
    if (clubSpec.terrainMod) {
      if (fromFairway) d += 1;
      if (fromSand) d -= 1;
    }
    d += frustration; // apply frustration penalty
    if (useFocusActive) d += 1;
    return Math.max(1, d);
  }, [clubSpec, die, fromFairway, fromSand, useFocusActive, frustration]);

  const distanceRange = useMemo(() => {
    if (!clubSpec) return null;
    if (clubSpec.fixed != null) {
      const d = Math.max(1, clubSpec.fixed + (useFocusActive ? 1 : 0) + frustration);
      return [d, d];
    }
    let minD = 1 + (clubSpec.terrainMod && fromSand ? -1 : 0) + frustration + (useFocusActive ? 1 : 0);
    let maxD = clubSpec.die + (clubSpec.terrainMod && fromFairway ? 1 : 0) + frustration + (useFocusActive ? 1 : 0);
    return [Math.max(1, minD), Math.max(1, maxD)];
  }, [clubSpec, fromFairway, fromSand, frustration, useFocusActive]);

  const overTrees = club
    ? (CLUBS[club].overTreesAlways || (club === 'woods' && fromFairway))
    : false;

  const checkShot = (dir, h) => {
    if (plannedDistance == null) return null;
    return hookShotPath(hole, ball, dir, plannedDistance, h || null, { fromFairway, overTrees });
  };

  const hintCells = useMemo(() => {
    if (plannedDistance == null) return null;
    if (!aimingDir && !tweaks.showHints) return null;
    const cells = [];
    const hooks = plannedDistance >= 2 ? [null, 'left', 'right'] : [null];
    hooks.forEach(h => {
      DIRS.forEach(dir => {
        if (h) {
          const landings = hookPossibleLandings(ball, dir, plannedDistance, h);
          const isCurrentHook = (h || null) === (hook || null);
          landings.forEach(land => {
            const r = validateHookAtAmount(hole, ball, dir, plannedDistance, h, land.hookAmount, { fromFairway, overTrees });
            cells.push({ x: land.x, y: land.y, legal: !!r.ok, hook: h, dim: !isCurrentHook, hookAmount: land.hookAmount });
          });
        } else {
          const land = hookLanding(ball, dir, plannedDistance, null);
          const r = legalShotPath(hole, ball, dir, plannedDistance, { fromFairway, overTrees });
          const isCurrentHook = !hook;
          cells.push({ x: land.x, y: land.y, legal: !!r.ok, hook: null, dim: !isCurrentHook });
        }
      });
    });
    return cells;
  }, [ball, plannedDistance, hole, fromFairway, overTrees, aimingDir, tweaks.showHints, hook]);

  const ghost = useMemo(() => {
    if (!aimingDir || plannedDistance == null) return null;
    if (hook && plannedDistance >= 2) {
      const landings = hookPossibleLandings(ball, aimingDir, plannedDistance, hook);
      const fullLand = landings[landings.length - 1];
      const bendPos = { x: fullLand.bendX, y: fullLand.bendY };
      const anyLegal = landings.some(l => {
        const r = validateHookAtAmount(hole, ball, aimingDir, plannedDistance, hook, l.hookAmount, { fromFairway, overTrees });
        return r.ok;
      });
      return {
        from: ball,
        to: { x: fullLand.x, y: fullLand.y },
        legal: anyLegal,
        hook,
        bendPos,
        possibleLandings: landings,
      };
    }
    const r = checkShot(aimingDir, null);
    const land = hookLanding(ball, aimingDir, plannedDistance, null);
    return {
      from: ball,
      to: { x: land.x, y: land.y },
      legal: !!r?.ok,
      hook: null,
      bendPos: null,
    };
  }, [aimingDir, plannedDistance, ball, hook]);

  const selectClub = (key) => {
    if (club === key) {
      if (needsRoll && die == null && !rolling) rollDie();
      return;
    }
    const spec = CLUBS[key];
    setClub(key);
    setDie(null);
    setAimingDir(null);
    setHook(null);
    if (spec.fixed != null) {
      setStatusMsg(`${spec.label} — ${spec.fixed} space. Pick a direction.`);
    } else {
      setStatusMsg(`${spec.label} selected. Roll d${spec.die}.`);
    }
  };

  const rollDie = () => {
    if (rolling || !clubSpec || clubSpec.fixed != null) return;
    const dieSize = clubSpec.die;
    setRolling(true);
    setAimingDir(null);
    setHook(null);
    let ticks = 0;
    const interval = setInterval(() => {
      setDie(1 + Math.floor(Math.random() * dieSize));
      ticks++;
      if (ticks >= 8) {
        clearInterval(interval);
        const final = 1 + Math.floor(Math.random() * dieSize);
        setDie(final);
        setRolling(false);
        setStatusMsg(`Rolled ${final} on d${dieSize}. Pick a direction.`);
      }
    }, 55);
  };

  const rerollDie = () => {
    if (hasRerolled || shots.length > 0 || !clubSpec || clubSpec.fixed != null || die == null) return;
    setHasRerolled(true);
    setRoundLog(log => [...log, { type: 'reroll', hole: holeIdx + 1, club: clubSpec.label, prevRoll: die }]);
    setDie(null);
    setAimingDir(null);
    setTimeout(() => rollDie(), 50);
  };

  const canReroll = shots.length === 0 && die != null && !hasRerolled && !rolling && clubSpec && clubSpec.fixed == null;

  const useMulligan = () => {
    const totalAvail = mulligansMax;
    if (mulligansUsed >= totalAvail) return;
    setMulligansUsed(m => m + 1);
    setRoundLog(log => [...log, { type: 'mulligan', hole: holeIdx + 1 }]);
    setDie(null);
    setClub(null);
    setAimingDir(null);
    setHook(null);
    setUseFocusActive(false);
    setStatusMsg('Mulligan! Pick a new club.');
  };

  const commitShot = (dirOverride = null, hookOverride) => {
    const dir = dirOverride || aimingDir;
    const activeHook = hookOverride !== undefined ? hookOverride : hook;
    if (!dir || plannedDistance == null) return;

    // For hooks: randomly determine the hook amount
    let actualHookAmount = null;
    let bendPos = null;
    if (activeHook && plannedDistance >= 2) {
      const max = hookMaxSteps(plannedDistance);
      actualHookAmount = Math.floor(Math.random() * (max + 1));
      const rv = validateHookAtAmount(hole, ball, dir, plannedDistance, activeHook, actualHookAmount, { fromFairway, overTrees });
      const land = hookLanding(ball, dir, plannedDistance, activeHook, actualHookAmount);
      bendPos = { x: land.bendX, y: land.bendY };

      if (!rv.ok) {
        if (rv.blockedReason === 'water_landing') {
          const dropPos = waterDrop(hole, { x: land.x, y: land.y });
          const penaltyShot = { from: ball, to: { x: land.x, y: land.y }, slopePath: [], fresh: true, hook: activeHook, bendPos, treeHit: null };
          setShots(s => [...s.map(x => ({ ...x, fresh: false })), penaltyShot, { from: { x: land.x, y: land.y }, to: dropPos, slopePath: [], fresh: false, hook: null, bendPos: null, treeHit: null, penalty: true }]);
          setBall(dropPos);
          const mods = [];
          if (clubSpec.terrainMod && fromFairway) mods.push('+1 fairway');
          if (clubSpec.terrainMod && fromSand) mods.push('-1 sand');
          if (useFocusActive) mods.push('+1 focus');
          if (frustration < 0) mods.push(`${frustration} frustrated`);
          setRoundLog(log => [...log,
            { type: 'hit', hole: holeIdx + 1, stroke: shots.length + 1, club: clubSpec.label, die: die, dieSize: clubSpec.die, distance: plannedDistance, dir, hook: activeHook, hookAmount: actualHookAmount, mods: mods.length ? mods : null, bounced: false, hazard: 'water', result: 'water penalty' },
            { type: 'penalty', hole: holeIdx + 1, stroke: shots.length + 2 },
          ]);
          if (useFocusActive) { setFocus(f => Math.max(-2, f - 1)); setUseFocusActive(false); setFocusUsedThisHole(true); }
          setDie(null); setHasRerolled(false); setAimingDir(null); setHook(null); setClub(null);
          setStatusMsg(`Hook ${actualHookAmount}/${max} — in the water! +1 penalty. Ball dropped beside water.`);
          return;
        }
        // Other failures (OOB, tree in path) — fall back to bend point
        const bendCheck = validateHookAtAmount(hole, ball, dir, plannedDistance, activeHook, 0, { fromFairway, overTrees });
        if (!bendCheck.ok) {
          setStatusMsg(`Hook rolled ${actualHookAmount}/${max} — shot blocked! Pick another direction.`);
          return;
        }
        actualHookAmount = 0;
      }
    } else {
      const r = checkShot(dir, null);
      if (!r || !r.ok) {
        setStatusMsg('Illegal shot — pick another direction or take a mulligan.');
        return;
      }
    }

    const land = hookLanding(ball, dir, plannedDistance, activeHook, actualHookAmount);
    let landing = { x: land.x, y: land.y };
    if (!bendPos && activeHook && plannedDistance >= 2) {
      bendPos = { x: land.bendX, y: land.bendY };
    }
    const hookMsg = (activeHook && actualHookAmount != null) ? ` Hook ${actualHookAmount}/${hookMaxSteps(plannedDistance)}.` : '';

    const shotValidation = activeHook
      ? validateHookAtAmount(hole, ball, dir, plannedDistance, activeHook, actualHookAmount, { fromFairway, overTrees })
      : legalShotPath(hole, ball, dir, plannedDistance, { fromFairway, overTrees });
    const crossedCup = shotValidation.path?.some(p => p.x === hole.cup.x && p.y === hole.cup.y) || false;
    const overshootBy1 = (shotValidation.path?.length >= 1) && (() => {
      const idx = shotValidation.path.findIndex(p => p.x === hole.cup.x && p.y === hole.cup.y);
      if (idx < 0) return false;
      return idx === shotValidation.path.length - 2;
    })();

    let holedOut = false;
    let actualLanding = landing;
    let bounceMsg = '';
    let treeHitPos = null;

    // Chain bounces: rock→ricochet, tree→bounce back, water→drop. Detect loops.
    const bounceLog = [];
    const bouncePath = [];
    const visited = new Set();
    let pos = { ...actualLanding };
    let chainLimit = 10;

    function nearestFairway(from) {
      let best = null, bestDist = Infinity;
      for (let fy = 0; fy < hole.h; fy++)
        for (let fx = 0; fx < hole.w; fx++)
          if (hole.grid[fy][fx] === 1) {
            const d = Math.hypot(fx - from.x, fy - from.y);
            if (d < bestDist) { bestDist = d; best = { x: fx, y: fy }; }
          }
      return best || hole.tee;
    }

    while (chainLimit-- > 0) {
      const key = `${pos.x},${pos.y}`;
      if (visited.has(key)) {
        pos = nearestFairway(pos);
        bounceLog.push('loop→fairway');
        break;
      }
      visited.add(key);

      if (!window.DiceGolf.inBounds(hole.grid, pos.x, pos.y)) {
        pos = nearestFairway(landing);
        bounceLog.push('OOB→fairway');
        break;
      }

      const terrain = hole.grid[pos.y][pos.x];

      if (terrain === 6) {
        // Rock — ricochet random direction
        const DIRS_ALL = window.DiceGolf.dirNames;
        const DIRV_ALL = window.DiceGolf.dirVectors;
        const d = DIRS_ALL[Math.floor(Math.random() * 8)];
        const rv = DIRV_ALL[d];
        bounceLog.push(`rock→${d}`);
        bouncePath.push({ ...pos });
        pos = { x: pos.x + rv.dx, y: pos.y + rv.dy };
        continue;
      }
      if (terrain === 4) {
        if (!treeHitPos) treeHitPos = { ...pos };
        const DIRS_ALL = window.DiceGolf.dirNames;
        const DIRV_ALL = window.DiceGolf.dirVectors;
        const d = DIRS_ALL[Math.floor(Math.random() * 8)];
        const rv = DIRV_ALL[d];
        bounceLog.push(`tree→${d}`);
        bouncePath.push({ ...pos });
        pos = { x: pos.x + rv.dx, y: pos.y + rv.dy };
        continue;
      }
      if (terrain === 3) {
        const dp = waterDrop(hole, pos);
        bounceLog.push('water→drop');
        bouncePath.push({ ...pos });
        pos = dp;
        break;
      }
      // Safe terrain — stop
      break;
    }

    if (chainLimit <= 0) {
      pos = nearestFairway(pos);
      bounceLog.push('limit→fairway');
    }

    actualLanding = pos;
    if (bouncePath.length > 0) bouncePath.push({ ...pos });
    if (bounceLog.length > 0) {
      bounceMsg = ' ' + bounceLog.join(', ') + '!';
      const hasWater = bounceLog.some(b => b.startsWith('water'));
      if (hasWater) {
        // Water penalty stroke
        setShots(s => [...s, { from: ball, to: ball, slopePath: [], fresh: false, hook: null, bendPos: null, treeHit: null, penalty: true }]);
      }
    }

    if (actualLanding.x === hole.cup.x && actualLanding.y === hole.cup.y) {
      holedOut = true;
    } else if (!bounceLog.length && landing.x === hole.cup.x && landing.y === hole.cup.y) {
      holedOut = true;
    } else if (crossedCup && overshootBy1) {
      holedOut = true;
      actualLanding = hole.cup;
    }

    let slopePath = [];
    if (!holedOut) {
      const sl = applySlopes(hole, actualLanding);
      actualLanding = sl.finalPos;
      slopePath = sl.slopePath;
      if (actualLanding.x === hole.cup.x && actualLanding.y === hole.cup.y) holedOut = true;
    }

    const newShot = { from: ball, to: landing, slopePath, fresh: true, hook: activeHook, bendPos, treeHit: treeHitPos, bouncePath: bouncePath.length > 0 ? bouncePath : null };
    setShots(s => [...s.map(x => ({ ...x, fresh: false })), newShot]);
    setBall(actualLanding);

    const mods = [];
    if (clubSpec.terrainMod && fromFairway) mods.push('+1 fairway');
    if (clubSpec.terrainMod && fromSand) mods.push('-1 sand');
    if (useFocusActive) mods.push('+1 focus');
    if (frustration < 0) mods.push(`${frustration} frustrated`);
    const landTerrain = hole.grid[actualLanding.y]?.[actualLanding.x];
    const hazard = landTerrain === 2 ? 'sand' : landTerrain === 3 ? 'water' : shotValidation.ricochet ? 'rock' : null;
    setRoundLog(log => [...log, {
      type: 'hit',
      hole: holeIdx + 1,
      stroke: shots.length + 1,
      club: clubSpec.label,
      die: clubSpec.fixed != null ? null : die,
      dieSize: clubSpec.fixed != null ? null : clubSpec.die,
      distance: plannedDistance,
      dir,
      hook: activeHook,
      hookAmount: activeHook ? actualHookAmount : null,
      mods: mods.length ? mods : null,
      bounced: bounceLog.length > 0,
      hazard,
      result: bounceLog.length > 0 ? bounceLog.join(', ') : (actualLanding.x === hole.cup.x && actualLanding.y === hole.cup.y ? 'holed out' : null),
    }]);

    if (useFocusActive) {
      setFocus(f => Math.max(-2, f - 1));
      setUseFocusActive(false);
      setFocusUsedThisHole(true);
    }
    setDie(null);
    setHasRerolled(false);
    setAimingDir(null);
    setHook(null);
    setClub(null);

    if (holedOut) {
      const strokes = (shots.length + 1);
      const par = hole.par;
      const diff = strokes - par;
      const label = diff <= -3 ? 'ALBATROSS' :
                    diff === -2 ? 'EAGLE' :
                    diff === -1 ? 'BIRDIE' :
                    diff === 0 ? 'PAR' :
                    diff === 1 ? 'BOGEY' :
                    diff === 2 ? 'DOUBLE BOGEY' :
                    diff === 3 ? 'TRIPLE BOGEY' :
                    `+${diff}`;
      const aceLabel = strokes === 1 ? 'HOLE IN ONE' : label;
      const maxFocus = 3;
      let focusMsg = '';
      if (!focusUsedThisHole && !useFocusActive) {
        setFocus(f => Math.min(maxFocus, f + 1));
        focusMsg = ' +1 Focus!';
      }
      setBigToast({ label: 'IN THE CUP', value: `${strokes}`, sub: aceLabel + (focusMsg ? ` ${focusMsg}` : '') });
      setTimeout(() => setBigToast(null), 2600);
      setHoleComplete(true);
      setHoleScores(prev => {
        const next = [...prev];
        next[holeIdx] = strokes;
        return next;
      });
      setStatusMsg(`Holed out in ${strokes}. ${aceLabel}.${hookMsg}${focusMsg}`);
    } else {
      const t = hole.grid[actualLanding.y][actualLanding.x];
      const tname = ['the rough','the fairway','a sand trap','water','a tree','the green','a rock'][t] || 'the rough';
      setStatusMsg(`${hookMsg ? hookMsg.trim() + ' ' : ''}${bounceMsg ? bounceMsg.trim() + ' ' : ''}Ball lands in ${tname}${slopePath.length ? ' and rolls down a slope' : ''}.`);
    }
  };

  const onCellClick = (cell) => {
    if (plannedDistance == null) return;
    const dd = pointToDirDist(ball, cell);
    if (!dd) return;
    if (dd.dist === plannedDistance) {
      commitShot(dd.dir);
    } else {
      setStatusMsg(`That cell is ${dd.dist} away — your shot goes ${plannedDistance}.`);
    }
  };
  const onCellHover = (cell) => {
    if (!cell || plannedDistance == null) { setHoverCell(null); return; }
    setHoverCell(cell);
    const dd = pointToDirDist(ball, cell);
    if (dd && dd.dist === plannedDistance) {
      setAimingDir(dd.dir);
    }
  };

  const nextHole = () => {
    if (holeIdx < 8) setHoleIdx(holeIdx + 1);
  };
  const prevHole = () => {
    if (holeIdx > 0) setHoleIdx(holeIdx - 1);
  };
  const newCourse = () => {
    setSeed(s => s + Math.floor(Math.random() * 9000) + 100);
    setHoleIdx(0);
    setHoleScores([]);
    setRoundLog([]);
    setMulligansUsed(0);
    setFocus(customCourse?.startingFocus ?? 0);
    setOtherScores([]);
    setShareStr('');
  };

  const roundComplete = holeScores.filter(Boolean).length === 9;

  function exportRound() {
    const allHoles = Array.from({ length: 9 }, (_, i) =>
      customCourse ? customCourse.holes[i] : generateHole(holeSeeds[i], { w: 22, h: 13 })
    );
    const data = {
      v: 2,
      type: 'round',
      courseName,
      seed: customCourse ? null : seed,
      startingFocus: customCourse?.startingFocus ?? 0,
      holes: allHoles.map(h => ({
        grid: h.grid.map(r => r.join('')).join(''),
        slopes: h.slopes.map(s => [s.x, s.y, window.DiceGolf.dirNames.indexOf(s.dir)]),
        tee: [h.tee.x, h.tee.y],
        cup: [h.cup.x, h.cup.y],
        bigfoot: null,
        par: h.par,
        name: h.name || '',
      })),
      players: [
        { name: playerName, scores: holeScores },
        ...otherScores,
      ],
    };
    return btoa(JSON.stringify(data));
  }

  function importRound(b64) {
    const data = JSON.parse(atob(b64.trim()));
    if (data.v !== 2 || data.type !== 'round') throw new Error('Not a shared round');
    const holes = data.holes.map(h => {
      const flat = h.grid.split('').map(Number);
      const grid = [];
      for (let y = 0; y < 13; y++) grid.push(flat.slice(y * 22, (y + 1) * 22));
      return {
        w: 22, h: 13, grid,
        slopes: h.slopes.map(([x, y, di]) => ({ x, y, dir: window.DiceGolf.dirNames[di] })),
        tee: { x: h.tee[0], y: h.tee[1] },
        cup: { x: h.cup[0], y: h.cup[1] },
        bigfoot: null,
        par: h.par, seed: 0, name: h.name || '',
      };
    });
    window._customCourseData = { name: data.courseName, holes, startingFocus: data.startingFocus ?? 0 };
    setOtherScores(data.players || []);
    setHoleScores([]);
    setHoleIdx(0);
    setRoundLog([]);
    setMulligansUsed(0);
    setFocus(data.startingFocus ?? 0);
    setShareStr('');
    location.hash = '#play';
  }

  const totalAvail = mulligansMax;
  const mullRemaining = totalAvail - mulligansUsed;

  const aiming = plannedDistance != null;

  const playedTotal = holeScores.reduce((a, b) => a + (b || 0), 0);
  const playedPar = holeScores.reduce((a, b, i) => a + (b ? hole.par : 0), 0);
  const overUnder = playedTotal - playedPar;

  const needsRoll = clubSpec && clubSpec.fixed == null;
  const waitingForRoll = needsRoll && die == null;

  function clubNote(key) {
    const spec = CLUBS[key];
    if (key === 'driver') return 'tee only, over trees';
    if (key === 'woods') return fromFairway ? '+1, over trees' : fromSand ? '−1 sand' : 'standard';
    if (key === 'pitchingWedge') return 'no terrain mod';
    if (key === 'putter') return 'always 1';
    return '';
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span className="dot" /> Dice Golf · v1.0</div>
          <div className="brand-title">Dice <em>Golf</em></div>
        </div>
        <div className="course-meta">
          <div className="label">Course</div>
          <div className="name">{courseName}</div>
          <div className="coords">{customCourse ? 'Custom Course' : `Lat ${(38 + (seed % 7) + (seed % 100) / 100).toFixed(3)}°N · Long ${(94 + (seed % 11) + (seed % 100) / 100).toFixed(3)}°W`}</div>
          <div className="topbar-actions">
            <button className="topbar-btn" onClick={newCourse}>New Course</button>
            <a href="#creator" className="topbar-btn">Creator</a>
          </div>
        </div>
      </header>

      <div className="hole-strip">
        <div className="cell">
          <span className="k">{hole.name || 'Hole'}</span>
          <span className="v">{String(holeIdx + 1).padStart(2,'0')} <span className="v-sub">/ 09</span></span>
        </div>
        <div className="cell">
          <span className="k">Par</span>
          <span className="v">{hole.par}</span>
        </div>
        <div className="cell">
          <span className="k">Strokes</span>
          <span className="v">{shots.length}</span>
        </div>
        <div className="cell">
          <span className="k">Lie</span>
          <span className="v v-text">{['Rough','Fairway','Sand','—','—','Green','Rock'][ballTerrain] || 'Rough'}</span>
        </div>
        <div className="cell">
          <span className="k">{focus < 0 ? 'Frustrated' : 'Focus'}</span>
          <span className={`v ${focus < 0 ? 'v-neg' : focus > 0 ? 'v-pos' : ''}`}>{focus}</span>
        </div>
        <div className="cell grow">
          <span className="k">Total</span>
          <span className="v score-pip">
            <span>{playedTotal || '—'}</span>
            {holeScores.filter(Boolean).length > 0 && (
              <span className={`badge ${overUnder < 0 ? 'under' : overUnder > 0 ? 'over' : 'even'}`}>
                {overUnder === 0 ? 'E' : (overUnder > 0 ? `+${overUnder}` : overUnder)}
              </span>
            )}
          </span>
        </div>
        <div className="cell-nav-row">
          <div className="cell">
            <button className="btn ghost" onClick={prevHole} disabled={holeIdx === 0}>‹ Prev</button>
          </div>
          <div className="cell">
            <button className="btn ghost" onClick={nextHole} disabled={holeIdx === 8}>Next ›</button>
          </div>
        </div>
      </div>

      <div className="main">
        <div>
          <Board
            hole={hole}
            ball={ball}
            ghost={ghost}
            hintCells={hintCells}
            shots={shots}
            cell={tweaks.cellSize}
            onCellClick={onCellClick}
            onCellHover={onCellHover}
            hovered={hoverCell}
            showHints={tweaks.showHints}
            aiming={aiming}
            distanceRange={club && club !== 'putter' && die == null ? distanceRange : null}
          />
          <div className="card legend-card" style={{ marginTop: 14 }}>
            <div className="card-header">
              <h3>Legend</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>Terrain key</span>
            </div>
            <div className="legend">
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--rough)' }} /> Rough — no modifier</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--fairway)' }} /> Fairway — +1 (Woods/Driver)</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--sand)' }} /> Sand — −1 (Woods/Driver)</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--water)' }} /> Water — cannot land</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--tree)' }} /> Trees — cannot land or pass</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--rock)' }} /> Rock — ricochet random dir</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--green)' }} /> Green — putt to finish</div>
            </div>
          </div>
        </div>

        <aside className="panel">
          <div className="card">
            <div className="card-header">
              <h3>Club & Aim</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
                {fromFairway ? 'fairway' : fromSand ? 'sand' : 'rough'}
                {useFocusActive && ' · focus +1'}
                {frustration < 0 && ` · ${frustration} frustrated`}
              </span>
            </div>

            {plannedDistance >= 2 && club !== 'putter' && (
              <div style={{ padding: '8px 16px 0' }}>
                <div className="hook-toggle">
                  <button className={hook === 'left' ? 'active' : ''} onClick={() => setHook(hook === 'left' ? null : 'left')} disabled={!aiming || holeComplete}>
                    ↰ Hook L
                  </button>
                  <button className={!hook ? 'active' : ''} onClick={() => setHook(null)} disabled={!aiming || holeComplete}>
                    Straight
                  </button>
                  <button className={hook === 'right' ? 'active' : ''} onClick={() => setHook(hook === 'right' ? null : 'right')} disabled={!aiming || holeComplete}>
                    Hook R ↱
                  </button>
                </div>
              </div>
            )}

            <Compass
              aimingDir={aimingDir}
              onPick={(d) => {
                if (holeComplete || !aiming) return;
                if (aimingDir === d) {
                  if (ghost && ghost.legal) commitShot(d);
                } else {
                  setAimingDir(d);
                }
              }}
              disabled={!aiming || holeComplete}
              hintCells={hintCells}
              centerContent={
                holeComplete ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500, lineHeight: 1 }}>
                      {shots.length}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                      strokes
                    </div>
                    <button className="btn primary" style={{ padding: '8px 16px', fontSize: 11 }} onClick={nextHole} disabled={holeIdx === 8}>
                      {holeIdx === 8 ? 'Round Done' : `Hole ${holeIdx + 2} →`}
                    </button>
                  </div>
                ) : !club ? (
                  <div className="clubs-compact">
                    {CLUB_ORDER.map((key, i) => {
                      const spec = CLUBS[key];
                      const distLabel = spec.fixed != null ? String(spec.fixed) : `d${spec.die}`;
                      return (
                        <button key={key} className="club-compact" disabled={key === 'driver' && !onTee} onClick={() => selectClub(key)}>
                          <span className="club-compact-dist">{distLabel}</span>
                          <span className="club-compact-name">{spec.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : needsRoll && die == null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Die value={die} rolling={rolling} dieSize={clubSpec.die} clickable={!rolling && !holeComplete} onClick={rollDie} />
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                      {rolling ? 'rolling...' : `tap to roll d${clubSpec.die}`}
                    </div>
                    {clubSpec.terrainMod && fromSand && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, color: 'oklch(0.55 0.18 25)' }}>−1 sand</div>
                    )}
                    {clubSpec.terrainMod && fromFairway && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, color: 'oklch(0.5 0.13 145)' }}>+1 fairway</div>
                    )}
                    <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => { setClub(null); setDie(null); setAimingDir(null); }}>
                      ← Back
                    </button>
                  </div>
                ) : needsRoll && die != null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <Die value={die} rolling={rolling} dieSize={clubSpec.die} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>Distance</div>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{plannedDistance}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>
                        {clubSpec.terrainMod && fromFairway && <span style={{ color: 'oklch(0.5 0.13 145)', fontWeight: 600 }}>+1 fairway </span>}
                        {clubSpec.terrainMod && fromSand && <span style={{ color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>-1 sand </span>}
                        {useFocusActive && <span style={{ color: 'oklch(0.5 0.13 145)', fontWeight: 600 }}>+1 focus </span>}
                        {frustration < 0 && <span style={{ color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>{frustration} frustrated </span>}
                      </div>
                    </div>
                    {canReroll && (
                      <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 9 }} onClick={rerollDie}>Re-roll</button>
                    )}
                    <button className={`btn ${useFocusActive ? 'primary' : 'ghost'}`}
                      style={useFocusActive ? { padding: '3px 8px', fontSize: 9, background: 'oklch(0.55 0.13 145)', borderColor: 'oklch(0.55 0.13 145)' } : { padding: '3px 8px', fontSize: 9 }}
                      disabled={!useFocusActive && focus <= -2}
                      onClick={() => setUseFocusActive(!useFocusActive)}>
                      {useFocusActive ? 'Focus On (+1)' : focus <= -2 ? 'Max Frustrated' : `Use Focus (${focus})`}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{clubSpec.label}</div>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{plannedDistance}</div>
                      {useFocusActive && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'oklch(0.55 0.13 145)' }}>+1 focus</div>}
                      {frustration < 0 && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'oklch(0.55 0.18 25)' }}>{frustration} frustrated</div>}
                    </div>
                    <button className={`btn ${useFocusActive ? 'primary' : 'ghost'}`}
                      style={useFocusActive ? { padding: '3px 8px', fontSize: 9, background: 'oklch(0.55 0.13 145)', borderColor: 'oklch(0.55 0.13 145)' } : { padding: '3px 8px', fontSize: 9 }}
                      disabled={!useFocusActive && focus <= -2}
                      onClick={() => setUseFocusActive(!useFocusActive)}>
                      {useFocusActive ? 'Focus On (+1)' : focus <= -2 ? 'Max Frustrated' : `Use Focus (${focus})`}
                    </button>
                    <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => { setClub(null); setDie(null); setAimingDir(null); }}>
                      ← Back
                    </button>
                  </div>
                )
              }
            />

            {aimingDir && aiming && (
              <div style={{ padding: '0 16px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textAlign: 'center' }}>
                {ghost && ghost.legal
                  ? `Click ${aimingDir} again to confirm`
                  : ghost && !ghost.legal ? 'Illegal — pick another direction' : ''}
              </div>
            )}
            {!club && !holeComplete && (
              <div style={{ padding: '0 16px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textAlign: 'center' }}>
                Pick a club to begin
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button className="hotkey-info-btn" onClick={() => setShowHotkeys(!showHotkeys)}
                      title="Keyboard shortcuts">?</button>
              {showHotkeys && (
                <div className="hotkey-panel">
                  <div className="hotkey-title">Numpad Controls</div>
                  <div className="numpad-visual">
                    <div className="numpad-main">
                      <kbd className="nk">NW<b>7</b></kbd><kbd className="nk">N<b>8</b></kbd><kbd className="nk">NE<b>9</b></kbd>
                      <kbd className="nk">W<b>4</b></kbd><kbd className="nk nk-accent">OK<b>5</b></kbd><kbd className="nk">E<b>6</b></kbd>
                      <kbd className="nk">SW<b>1</b></kbd><kbd className="nk">S<b>2</b></kbd><kbd className="nk">SE<b>3</b></kbd>
                      <kbd className="nk nk-wide">back<b>0</b></kbd><kbd className="nk">fcs<b>.</b></kbd>
                    </div>
                    <div className="numpad-side">
                      <kbd className="nk nk-sm">mul<b>*</b></kbd>
                      <kbd className="nk nk-sm">hk L<b>−</b></kbd>
                      <kbd className="nk nk-sm">hk R<b>+</b></kbd>
                      <kbd className="nk nk-sm nk-tall nk-accent">GO<b>↵</b></kbd>
                    </div>
                  </div>
                  <div className="hotkey-section" style={{ marginTop: 8 }}>Club select (no club)</div>
                  <div className="numpad-clubs">
                    <kbd className="nk nk-club">DRV<b>4</b></kbd><kbd className="nk nk-club">WDS<b>5</b></kbd>
                    <kbd className="nk nk-club">WDG<b>1</b></kbd><kbd className="nk nk-club">PUT<b>2</b></kbd>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Mulligans</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
                {mullRemaining} left
              </span>
            </div>
            <div className="mulligans">
              <div className="mull-pips">
                {Array.from({ length: totalAvail }).map((_, i) => (
                  <div key={i} className={`mull-pip ${i < mulligansUsed ? 'used' : ''}`} />
                ))}
              </div>
              <button className="btn danger" onClick={useMulligan} disabled={mullRemaining <= 0 || holeComplete || rolling || !club}>
                Take Mulligan
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Scorecard</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>9 holes</span>
            </div>
            <div className="scorecard">
              <table>
                <thead>
                  <tr>
                    <th className="label">Hole</th>
                    {Array.from({ length: 9 }).map((_, i) => <th key={i}>{i+1}</th>)}
                    <th>Σ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="label">Par</td>
                    {Array.from({ length: 9 }).map((_, i) => <td key={i}>{6}</td>)}
                    <td>54</td>
                  </tr>
                  <tr>
                    <td className="label">{playerName}</td>
                    {Array.from({ length: 9 }).map((_, i) => {
                      const s = holeScores[i];
                      const isCur = i === holeIdx;
                      return (
                        <td key={i} className={isCur ? 'current' : (s ? 'played' : 'empty')}>
                          {isCur && !s ? shots.length : (s || '·')}
                        </td>
                      );
                    })}
                    <td>{playedTotal || '—'}</td>
                  </tr>
                  {otherScores.map((p, pi) => {
                    const pTotal = p.scores.reduce((a, b) => a + (b || 0), 0);
                    return (
                      <tr key={pi} style={{ opacity: 0.6 }}>
                        <td className="label">{p.name}</td>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <td key={i} className={p.scores[i] ? 'played' : 'empty'}>
                            {p.scores[i] || '·'}
                          </td>
                        ))}
                        <td>{pTotal || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="statusline">
              <span className="blink" />
              <span>{statusMsg}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Share</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
                {roundComplete ? 'round complete' : 'in progress'}
              </span>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>Name</span>
                <input type="text" value={playerName}
                  onChange={e => { setPlayerName(e.target.value); localStorage.setItem('dg-name', e.target.value); }}
                  style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11, border: '1px solid var(--paper-line)', borderRadius: 4, padding: '3px 6px', background: 'var(--paper)', color: 'var(--ink)' }}
                />
              </div>
              {roundComplete && (
                <>
                  <button className="btn primary full" onClick={() => setShareStr(exportRound())}>
                    Export Round
                  </button>
                  {shareStr && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <textarea readOnly value={shareStr} onClick={e => e.target.select()}
                        style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: 6, borderRadius: 5, border: '1px solid var(--paper-line)', background: 'var(--paper-2)', resize: 'vertical', minHeight: 50, color: 'var(--ink)' }} />
                      <button className="btn ghost" onClick={() => navigator.clipboard.writeText(shareStr)}>Copy</button>
                    </div>
                  )}
                </>
              )}
              <div style={{ borderTop: '1px solid var(--paper-line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <textarea placeholder="Paste a shared round..." value={shareImport}
                  onChange={e => { setShareImport(e.target.value); setShareImportError(''); }}
                  style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: 6, borderRadius: 5, border: '1px solid var(--paper-line)', background: 'var(--paper-2)', resize: 'vertical', minHeight: 40, color: 'var(--ink)' }} />
                <button className="btn ghost" disabled={!shareImport.trim()} onClick={() => {
                  try { importRound(shareImport); setShareImport(''); setShareImportError(''); }
                  catch(e) { setShareImportError('Invalid round data'); }
                }}>Import Round</button>
                {shareImportError && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'oklch(0.55 0.18 25)' }}>{shareImportError}</span>}
              </div>
            </div>
          </div>

          <div className="card legend-card-mobile" style={{ display: 'none' }}>
            <div className="card-header">
              <h3>Legend</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>Terrain key</span>
            </div>
            <div className="legend">
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--rough)' }} /> Rough — no modifier</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--fairway)' }} /> Fairway — +1 (Woods/Driver)</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--sand)' }} /> Sand — −1 (Woods/Driver)</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--water)' }} /> Water — cannot land</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--tree)' }} /> Trees — cannot land or pass</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--rock)' }} /> Rock — ricochet random dir</div>
              <div className="legend-item"><span className="legend-swatch" style={{ background: 'var(--green)' }} /> Green — putt to finish</div>
            </div>
          </div>

          {roundLog.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Round Log</h3>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>{roundLog.length} entries</span>
              </div>
              <div className="round-log">
                {roundLog.map((e, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-hole">H{e.hole}</span>
                    {e.type === 'hit' && (
                      <span className="log-detail">
                        <strong>#{e.stroke}</strong> {e.club}
                        {e.die != null && <> d{e.dieSize}→{e.die}</>}
                        {' '}= {e.distance} {e.dir}
                        {e.hook && <> hook {e.hook} ({e.hookAmount})</>}
                        {e.mods && <span className="log-mods"> [{e.mods.join(', ')}]</span>}
                        {e.bounced && <span className="log-hazard"> hit tree</span>}
                        {e.hazard === 'sand' && <span className="log-hazard"> in sand</span>}
                        {e.hazard === 'water' && <span className="log-hazard"> in water</span>}
                        {e.hazard === 'rock' && <span className="log-hazard"> ricochet</span>}
                        {e.result === 'holed out' && <span className="log-cup"> ⚑</span>}
                      </span>
                    )}
                    {e.type === 'mulligan' && (
                      <span className="log-detail log-special">Mulligan</span>
                    )}
                    {e.type === 'reroll' && (
                      <span className="log-detail log-special">Re-roll ({e.club}, was {e.prevRoll})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {bigToast && (
        <div className="bigtoast">
          <div className="card-toast">
            <div className="label">{bigToast.label}</div>
            <div className="value">{bigToast.value}</div>
            <div className="sub">{bigToast.sub}</div>
          </div>
        </div>
      )}

      <TweaksPanel tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

function Die({ value, rolling, dieSize = 6, clickable = false, onClick }) {
  const v = value != null ? value : null;
  const show = v != null;
  const txtProps = { fontFamily: 'var(--serif)', fontWeight: '600', fill: 'var(--ink)', textAnchor: 'middle', dominantBaseline: 'central' };
  const txtSmall = { ...txtProps, fontSize: '11', fontWeight: '500', fill: 'var(--ink-2)' };
  const face = { fill: 'var(--paper)', stroke: 'var(--ink)', strokeWidth: '1.5', strokeLinejoin: 'round' };
  const faceSide = { ...face, fill: 'var(--paper-2)' };
  const edge = { stroke: 'var(--ink)', strokeWidth: '1', strokeLinejoin: 'round', fill: 'none' };

  let svg;
  if (dieSize === 6) {
    const s1 = show ? (7 - v) : null;
    const s2 = show ? ([2,3,1,5,4,6][v - 1]) : null;
    svg = (
      <svg viewBox="0 0 84 84" width="84" height="84">
        <path d="M 42 10 L 74 26 L 42 42 L 10 26 Z" {...face} />
        <path d="M 42 42 L 74 26 L 74 58 L 42 74 Z" {...faceSide} />
        <path d="M 42 42 L 10 26 L 10 58 L 42 74 Z" {...faceSide} />
        <polyline points="42,10 74,26 74,58 42,74 10,58 10,26 42,10" {...edge} />
        <line x1="42" y1="42" x2="42" y2="74" {...edge} />
        <line x1="42" y1="42" x2="10" y2="26" {...edge} opacity="0.3" />
        <line x1="42" y1="42" x2="74" y2="26" {...edge} opacity="0.3" />
        {show && <text x="42" y="28" {...txtProps} fontSize="20">{v}</text>}
        {show && <text x="58" y="51" {...txtSmall}>{s1}</text>}
        {show && <text x="26" y="51" {...txtSmall}>{s2}</text>}
        {!show && <text x="42" y="28" {...txtProps} fontSize="16" fill="var(--ink-mute)">?</text>}
      </svg>
    );
  } else if (dieSize === 8) {
    const s1 = show ? ((v % 8) + 1) : null;
    const s2 = show ? (((v + 3) % 8) + 1) : null;
    const s3 = show ? (((v + 5) % 8) + 1) : null;
    svg = (
      <svg viewBox="0 0 84 84" width="84" height="84">
        <path d="M 42 4 L 80 42 L 42 80 L 4 42 Z" {...face} />
        <line x1="42" y1="4" x2="42" y2="80" {...edge} />
        <line x1="4" y1="42" x2="80" y2="42" {...edge} />
        <line x1="42" y1="4" x2="4" y2="42" {...edge} opacity="0.4" />
        <line x1="42" y1="4" x2="80" y2="42" {...edge} opacity="0.4" />
        <line x1="42" y1="80" x2="4" y2="42" {...edge} opacity="0.4" />
        <line x1="42" y1="80" x2="80" y2="42" {...edge} opacity="0.4" />
        {show && <text x="56" y="26" {...txtProps} fontSize="18">{v}</text>}
        {show && <text x="27" y="26" {...txtSmall}>{s1}</text>}
        {show && <text x="27" y="60" {...txtSmall}>{s2}</text>}
        {show && <text x="56" y="60" {...txtSmall}>{s3}</text>}
        {!show && <text x="56" y="26" {...txtProps} fontSize="16" fill="var(--ink-mute)">?</text>}
      </svg>
    );
  } else {
    const s1 = show ? ((v % 3) + 1) : null;
    const s2 = show ? (((v + 1) % 3) + 1) : null;
    svg = (
      <svg viewBox="0 0 84 84" width="84" height="84">
        <path d="M 42 6 L 78 76 L 6 76 Z" {...face} />
        <line x1="42" y1="6" x2="42" y2="76" {...edge} opacity="0.35" />
        <line x1="6" y1="76" x2="60" y2="41" {...edge} opacity="0.35" />
        <line x1="78" y1="76" x2="24" y2="41" {...edge} opacity="0.35" />
        {show && <text x="42" y="58" {...txtProps} fontSize="18">{v}</text>}
        {show && <text x="24" y="58" {...txtSmall} fontSize="10">{s1}</text>}
        {show && <text x="60" y="58" {...txtSmall} fontSize="10">{s2}</text>}
        {!show && <text x="42" y="55" {...txtProps} fontSize="16" fill="var(--ink-mute)">?</text>}
      </svg>
    );
  }

  return (
    <div className={`die ${rolling ? 'rolling' : ''} ${clickable ? 'clickable' : ''}`}
         onClick={clickable && onClick ? onClick : undefined}
         style={clickable ? { cursor: 'pointer' } : undefined}>
      {svg}
    </div>
  );
}

function Compass({ aimingDir, onPick, disabled, hintCells, centerContent }) {
  const positions = {
    N:  { left: '50%', top: '4%' },
    NE: { left: '88%', top: '16%' },
    E:  { left: '96%', top: '50%' },
    SE: { left: '88%', top: '84%' },
    S:  { left: '50%', top: '96%' },
    SW: { left: '12%', top: '84%' },
    W:  { left: '4%',  top: '50%' },
    NW: { left: '12%', top: '16%' },
  };
  const labels = { N:'N', NE:'↗', E:'E', SE:'↘', S:'S', SW:'↙', W:'W', NW:'↖' };
  const legalMap = {};
  if (hintCells) {
    DIRS.forEach((d, i) => { legalMap[d] = hintCells[i]?.legal; });
  }
  return (
    <div style={{ padding: '8px 12px 4px' }}>
      <div className="compass">
        <div className="compass-ring" />
        <div className="compass-ring inner" />
        <div className="compass-center">
          {centerContent}
        </div>
        {DIRS.map(d => (
          <button key={d}
            className={`dir ${aimingDir === d ? 'active' : ''}`}
            style={{
              ...positions[d],
              opacity: disabled ? 0.3 : (legalMap[d] === false ? 0.4 : 1),
              borderColor: legalMap[d] === false ? 'oklch(0.6 0.16 30)' : 'var(--ink)',
            }}
            disabled={disabled}
            onClick={() => onPick(d)}
            title={d + (legalMap[d] === false ? ' (illegal)' : '')}
          >
            {labels[d]}
          </button>
        ))}
      </div>
    </div>
  );
}

function TweaksPanel({ tweaks, setTweak }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 100,
          appearance: 'none',
          border: '1px solid var(--paper-line)',
          background: 'var(--paper)',
          borderRadius: 8,
          padding: '8px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {open ? '✕ Close' : '⚙ Tweaks'}
      </button>
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 52,
          right: 16,
          zIndex: 99,
          width: 280,
          background: 'var(--paper)',
          border: '1px solid var(--paper-line)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-md)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontFamily: 'var(--sans)',
          fontSize: 12,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Display
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Show landing hints</span>
            <input type="checkbox" checked={tweaks.showHints} onChange={e => setTweak('showHints', e.target.checked)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Show compass</span>
            <input type="checkbox" checked={tweaks.showCompass} onChange={e => setTweak('showCompass', e.target.checked)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Cell size: {tweaks.cellSize}px</span>
            <input type="range" min={28} max={48} step={2} value={tweaks.cellSize} onChange={e => setTweak('cellSize', Number(e.target.value))} />
          </label>

          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 4 }}>
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['Casual', 'Standard', 'Tour'].map(d => (
              <button key={d}
                onClick={() => setTweak('difficulty', d)}
                style={{
                  flex: 1,
                  appearance: 'none',
                  border: tweaks.difficulty === d ? '1.5px solid var(--ink)' : '1px solid var(--paper-line)',
                  background: tweaks.difficulty === d ? 'var(--ink)' : 'var(--paper)',
                  color: tweaks.difficulty === d ? 'var(--paper)' : 'var(--ink)',
                  borderRadius: 6,
                  padding: '6px 4px',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Router() {
  const [route, setRoute] = useState(location.hash || '');
  useEffect(() => {
    const handler = () => setRoute(location.hash || '');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (route === '#creator') return <window.CreatorApp />;

  let customCourse = null;
  if (window._customCourseData) {
    customCourse = window._customCourseData;
  }
  const match = route.match(/[?&]c=([^&]+)/);
  if (match) {
    try { customCourse = window.importCourse(match[1]); } catch(e) {}
  }

  return <App customCourse={customCourse} />;
}

window.Die = Die;
window.Compass = Compass;

ReactDOM.createRoot(document.getElementById('root')).render(<Router />);
