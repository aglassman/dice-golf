/* Dice Golf — main app */

const { useState, useEffect, useMemo, useRef, useCallback } = React;
const { generateHole, legalShotPath, hookShotPath, hookLanding, hookPossibleLandings, hookMaxSteps, validateHookAtAmount, shiftDir, applySlopes, pointToDirDist } = window.DiceGolf;
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
  bigfootEnabled: true,
  cellSize: 38,
};

function App() {
  const [tweaks, setTweaks] = useState(DEFAULT_TWEAKS);
  const setTweak = useCallback((key, val) => {
    setTweaks(prev => ({ ...prev, [key]: val }));
  }, []);
  const difficulty = tweaks.difficulty;
  const mulligansMax = difficulty === 'Casual' ? 9 : difficulty === 'Tour' ? 3 : 6;

  const [seed, setSeed] = useState(() => 1024);
  const [holeIdx, setHoleIdx] = useState(0);
  const holeSeeds = useMemo(() => [seed, seed + 7919, seed + 15485, seed + 24593, seed + 32452, seed + 49157, seed + 65537, seed + 86939, seed + 99991], [seed]);

  const hole = useMemo(() => generateHole(holeSeeds[holeIdx], { w: 22, h: 13 }), [holeSeeds, holeIdx]);
  const courseName = useMemo(() => pickName(seed), [seed]);

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
  const [pickupFound, setPickupFound] = useState(false);
  const [hasPickup, setHasPickup] = useState(false);
  const [usePickupActive, setUsePickupActive] = useState(false);
  const [holeScores, setHoleScores] = useState([]);
  const [holeComplete, setHoleComplete] = useState(false);
  const [bigToast, setBigToast] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Welcome to ' + pickName(1024) + '. Pick a club to tee off.');

  useEffect(() => {
    setBall(hole.tee);
    setShots([]);
    setDie(null);
    setHasRerolled(false);
    setClub(null);
    setAimingDir(null);
    setHook(null);
    setHoverCell(null);
    setMulligansUsed(0);
    setPickupFound(false);
    setHasPickup(false);
    setUsePickupActive(false);
    setHoleComplete(false);
    setStatusMsg(`Hole ${holeIdx + 1} — Par ${hole.par}. Pick a club.`);
  }, [hole]);

  useEffect(() => {
    if (!tweaks.bigfootEnabled) return;
    if (hole.bigfoot && !pickupFound) {
      const d = Math.hypot(ball.x - hole.bigfoot.x, ball.y - hole.bigfoot.y);
      if (d <= 2.5) {
        setPickupFound(true);
        setHasPickup(true);
        setBigToast({ label: 'BONUS FOUND', value: '+1 Range', sub: 'use it on any future shot' });
        setTimeout(() => setBigToast(null), 2200);
      }
    }
  }, [ball, hole, tweaks.bigfootEnabled]);

  const ballTerrain = hole.grid[ball.y][ball.x];
  const fromFairway = ballTerrain === 1 || ballTerrain === 5;
  const fromSand = ballTerrain === 2;

  const clubSpec = club ? CLUBS[club] : null;

  const plannedDistance = useMemo(() => {
    if (!clubSpec) return null;
    if (clubSpec.fixed != null) return clubSpec.fixed + (usePickupActive ? 1 : 0);
    if (die == null) return null;
    let d = die;
    if (clubSpec.terrainMod) {
      if (fromFairway) d += 1;
      if (fromSand) d -= 1;
    }
    if (usePickupActive) d += 1;
    return Math.max(1, d);
  }, [clubSpec, die, fromFairway, fromSand, usePickupActive]);

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
    setDie(null);
    setAimingDir(null);
    setTimeout(() => rollDie(), 50);
  };

  const canReroll = shots.length === 0 && die != null && !hasRerolled && !rolling && clubSpec && clubSpec.fixed == null;

  const useMulligan = () => {
    const totalAvail = mulligansMax;
    if (mulligansUsed >= totalAvail) return;
    setMulligansUsed(m => m + 1);
    setDie(null);
    setClub(null);
    setAimingDir(null);
    setHook(null);
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
        // Bad luck — ball lands at the bend point instead
        const bendLand = hookLanding(ball, dir, plannedDistance, activeHook, 0);
        const bendCheck = validateHookAtAmount(hole, ball, dir, plannedDistance, activeHook, 0, { fromFairway, overTrees });
        if (!bendCheck.ok) {
          setStatusMsg(`Hook rolled ${actualHookAmount}/${max} — shot blocked! Pick another direction.`);
          return;
        }
        setStatusMsg(`Hook rolled ${actualHookAmount}/${max} — landed in hazard! Ball stops at bend.`);
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

    if (shotValidation.bounced) {
      treeHitPos = { ...landing };
      actualLanding = shotValidation.bounced;
      landing = actualLanding;
      bounceMsg = ' Hit a tree — bounced back!';
    } else if (landing.x === hole.cup.x && landing.y === hole.cup.y) {
      holedOut = true;
    } else if (crossedCup && overshootBy1) {
      holedOut = true;
      actualLanding = hole.cup;
    }

    let slopePath = [];
    if (!holedOut && !shotValidation.bounced) {
      const sl = applySlopes(hole, actualLanding);
      actualLanding = sl.finalPos;
      slopePath = sl.slopePath;
      if (actualLanding.x === hole.cup.x && actualLanding.y === hole.cup.y) holedOut = true;
    }

    const newShot = { from: ball, to: landing, slopePath, fresh: true, hook: activeHook, bendPos, treeHit: treeHitPos };
    setShots(s => [...s.map(x => ({ ...x, fresh: false })), newShot]);
    setBall(actualLanding);

    if (usePickupActive) {
      setHasPickup(false);
      setUsePickupActive(false);
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
      setBigToast({ label: 'IN THE CUP', value: `${strokes}`, sub: aceLabel });
      setTimeout(() => setBigToast(null), 2600);
      setHoleComplete(true);
      setHoleScores(prev => {
        const next = [...prev];
        next[holeIdx] = strokes;
        return next;
      });
      setStatusMsg(`Holed out in ${strokes}. ${aceLabel}.${hookMsg}`);
    } else {
      const t = hole.grid[actualLanding.y][actualLanding.x];
      const tname = ['the rough','the fairway','a sand trap','water','a tree','the green'][t] || 'the rough';
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
  };

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
    if (key === 'driver') return 'flies over trees';
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
          <div className="coords">{`Lat ${(38 + (seed % 7) + (seed % 100) / 100).toFixed(3)}°N · Long ${(94 + (seed % 11) + (seed % 100) / 100).toFixed(3)}°W`}</div>
        </div>
      </header>

      <div className="hole-strip">
        <div className="cell">
          <span className="k">Hole</span>
          <span className="v">{String(holeIdx + 1).padStart(2,'0')} <span style={{ color: 'var(--ink-mute)', fontSize: 14 }}>/ 09</span></span>
        </div>
        <div className="cell">
          <span className="k">Par</span>
          <span className="v">{hole.par}</span>
        </div>
        <div className="cell">
          <span className="k">Strokes</span>
          <span className="v mono">{shots.length}</span>
        </div>
        <div className="cell">
          <span className="k">Lie</span>
          <span className="v" style={{ fontSize: 17 }}>{['Rough','Fairway','Sand','—','—','Green'][ballTerrain] || 'Rough'}</span>
        </div>
        <div className="cell grow">
          <span className="k">Round Total</span>
          <span className="v score-pip">
            <span>{playedTotal || '—'}</span>
            {holeScores.filter(Boolean).length > 0 && (
              <span className={`badge ${overUnder < 0 ? 'under' : overUnder > 0 ? 'over' : 'even'}`}>
                {overUnder === 0 ? 'E' : (overUnder > 0 ? `+${overUnder}` : overUnder)}
              </span>
            )}
          </span>
        </div>
        <div className="cell">
          <button className="btn ghost" onClick={prevHole} disabled={holeIdx === 0}>‹ Prev</button>
        </div>
        <div className="cell">
          <button className="btn ghost" onClick={nextHole} disabled={holeIdx === 8}>Next ›</button>
        </div>
        <div className="cell">
          <button className="btn" onClick={newCourse}>New Course</button>
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
            pickupFound={pickupFound}
          />
          <div className="card" style={{ marginTop: 14 }}>
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
                {hasPickup && !usePickupActive && ' · +1 ready'}
                {usePickupActive && ' · +1 active'}
              </span>
            </div>

            {plannedDistance >= 2 && (
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
                !club ? (
                  <div className="clubs-compact">
                    {CLUB_ORDER.map(key => {
                      const spec = CLUBS[key];
                      const distLabel = spec.fixed != null ? String(spec.fixed) : `d${spec.die}`;
                      return (
                        <button key={key} className="club-compact" disabled={holeComplete} onClick={() => selectClub(key)}>
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
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-2)' }}>
                        {clubSpec.terrainMod && fromFairway && <span className="plus">+1 </span>}
                        {clubSpec.terrainMod && fromSand && <span className="minus">−1 </span>}
                        {usePickupActive && <span className="plus">+1 </span>}
                      </div>
                    </div>
                    {canReroll && (
                      <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 9 }} onClick={rerollDie}>Re-roll</button>
                    )}
                    {hasPickup && (
                      <button className={`btn ${usePickupActive ? 'primary' : 'ghost'}`}
                        style={usePickupActive ? { padding: '3px 8px', fontSize: 9, background: 'oklch(0.55 0.13 145)', borderColor: 'oklch(0.55 0.13 145)' } : { padding: '3px 8px', fontSize: 9 }}
                        onClick={() => setUsePickupActive(!usePickupActive)}>
                        {usePickupActive ? '+1 On' : 'Use +1'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{clubSpec.label}</div>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{plannedDistance}</div>
                      {usePickupActive && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'oklch(0.55 0.13 145)' }}>+1</div>}
                    </div>
                    {hasPickup && (
                      <button className={`btn ${usePickupActive ? 'primary' : 'ghost'}`}
                        style={usePickupActive ? { padding: '3px 8px', fontSize: 9, background: 'oklch(0.55 0.13 145)', borderColor: 'oklch(0.55 0.13 145)' } : { padding: '3px 8px', fontSize: 9 }}
                        onClick={() => setUsePickupActive(!usePickupActive)}>
                        {usePickupActive ? '+1 On' : 'Use +1'}
                      </button>
                    )}
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
                    <td className="label">Score</td>
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
                </tbody>
              </table>
            </div>
            <div className="statusline">
              <span className="blink" />
              <span>{statusMsg}</span>
            </div>
          </div>

          {holeComplete && (
            <div className="card" style={{ borderColor: 'var(--ink)' }}>
              <div className="card-header"><h3>Hole Complete</h3></div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 24, lineHeight: 1.1 }}>
                  Holed out in <strong>{shots.length}</strong>.
                </div>
                <div className="btn-row">
                  <button className="btn primary full" onClick={nextHole} disabled={holeIdx === 8}>
                    {holeIdx === 8 ? 'Round complete' : `Next: Hole ${holeIdx + 2} →`}
                  </button>
                </div>
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
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Bonus club pickup</span>
            <input type="checkbox" checked={tweaks.bigfootEnabled} onChange={e => setTweak('bigfootEnabled', e.target.checked)} />
          </label>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
