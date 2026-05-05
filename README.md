# Dice Golf

A browser-based dice golf game with procedurally generated courses, polyhedral dice clubs, and strategic shot mechanics.

## How to Play

1. Open `index.html` in a browser (or serve with any static file server)
2. Pick a club from the compass center (click or numpad)
3. Roll the die by clicking it (or press the same numpad key again)
4. Click a compass direction to aim, click again to confirm
5. Get the ball in the cup in as few strokes as possible

## Clubs

| Club | Die | Terrain Modifiers | Over Trees | Hook |
|------|-----|-------------------|------------|------|
| Driver | d8 | +1 fairway, -1 sand | Always | Yes |
| Woods | d6 | +1 fairway, -1 sand | From fairway only | Yes |
| P. Wedge | d3 | None | Never | Yes |
| Putter | 1 (fixed) | None | Never | No |

## Mechanics

- **Hooks** &mdash; choose to hook left or right to curve your shot. The ball travels 2/3 straight then bends. Hook distance is random (0 to 2 steps), adding risk/reward. Available on all clubs except Putter.
- **Slopes** &mdash; small triangles on the board push the ball one cell in their direction after landing. Slopes can be 1-3 cells wide. Greens have multiple slopes for interesting putting.
- **Tree bounce** &mdash; landing on a tree bounces the ball back toward the tee to the first safe cell (and startles a bird).
- **Rock ricochet** &mdash; landing on a rock bounces the ball 1 cell in a random direction.
- **Water penalty** &mdash; landing in water costs +1 penalty stroke. Ball is dropped beside the water, moving back toward the tee on the x-axis until a safe cell is found.
- **Fairway crossings** &mdash; water or sand strips cut across fairways mid-hole, forcing carry shots or detours.
- **Focus** &mdash; starts at 0, earned by completing holes without using it (+1 per hole, max 3). Spend 1 Focus on any shot for +1 distance. You can go negative (min -2), becoming "Frustrated" (-1 to all die rolls per negative Focus point, minimum distance always 1). Focus carries over between holes.
- **Mulligans** &mdash; redo a shot (Casual: 9, Standard: 6, Tour: 3). Free re-roll available on tee shots.
- **Scorecard** &mdash; tracks all 9 holes. Round log records every shot with club, roll, modifiers, and hazards.

## Numpad Controls

The entire game can be played from the numpad. Click the `?` icon in the Club & Aim card for the visual reference.

| Phase | Keys | Action |
|-------|------|--------|
| Club select | `4` `5` `1` `2` | Driver, Woods, P.Wedge, Putter (matches 2x2 layout) |
| Roll | Same key / `Enter` | Roll the die |
| Aim | `7` `8` `9` `4` `6` `1` `2` `3` | 8 compass directions |
| Confirm | Same direction / `5` / `Enter` | Take the shot |
| Hook | `+` / `-` | Hook right / left |
| Focus | `.` | Toggle +1 focus |
| Mulligan | `*` | Take a mulligan |
| Back | `0` / `Esc` | Re-roll (tee) or back to club select |

## Terrain

| Terrain | Effect |
|---------|--------|
| Rough | No modifier (background) |
| Fairway | +1 to Woods/Driver, enables over-trees for Woods |
| Sand | -1 to Woods/Driver |
| Water | Cannot land (+1 penalty, ball dropped beside) |
| Trees | Ball bounces back to last safe cell |
| Rock | Ball ricochets 1 cell in random direction |
| Green | Putt to finish |

## Course Creator

Access via the `Creator` button in the topbar, or navigate to `#creator`.

- Paint terrain, place slopes, tee, cup with editing tools
- Hold **Space** over the board for quick tool picker
- Set par (3-6) and name for each hole
- **Generate** holes with configurable dogleg, length, hazards, fairway width, and slope density
- **Test** holes inline without leaving the editor
- **Export** courses as base64 strings to share with others
- **Import** shared courses and play them
- Set starting Focus for custom courses

## Running Locally

```
python3 -m http.server 8111
```

Then open http://localhost:8111.

## Project Structure

```
index.html    - Entry point, loads React/Babel from CDN
styles.css    - Full visual system (oklch palette, cartographic style)
game.js       - Hole generation, shot validation, slopes, hooks, ricochet
board.jsx     - SVG board renderer (terrain, trees, rocks, ball animation, bird)
app.jsx       - Game state, UI, clubs, dice, compass, scorecard, keyboard controls
creator.jsx   - Course editor with tools, generator, test mode, export/import
```

## Tech

Client-side only. React 18 + Babel (in-browser transform) with no build step. All rendering is SVG. Procedural generation uses a seeded PRNG (mulberry32) so courses are reproducible by seed. Hash-based routing (`#creator`, `#play`) for navigation.
