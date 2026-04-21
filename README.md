# FISHING MASTER: FSM POND CHALLENGE

A polished HTML5 Canvas fishing game where fish use a true Finite State Machine (FSM) to decide how they swim, notice bait, approach, bite, struggle, escape, or get caught.

This project is designed to satisfy an academic browser-game assignment requiring **Canvas rendering**, **event handling**, **finite state machines**, and a clean **modular JavaScript architecture**.

## Features

- **Full Canvas game**: all gameplay and UI are drawn on a single responsive `<canvas>`.
- **Fish AI with FSM**: each fish runs its own FSM with `enter / update / exit`.
- **Active player skill loop**: cast, react during bite windows, reel while managing line tension.
- **Progression**: score + time increases level; fish become more challenging.
- **HUD**: score, level, fish caught, fail count, bait indicator, tension meter, sound state.
- **Menus**: Main Menu, Pause Menu (Esc), Game Over screen.
- **Audio system**: background music + SFX with safe fallbacks (game still runs if files are missing).
- **Particles**: ripples and splashes for bite/catch feedback.

## Controls

- **Mouse Move**: aim rod direction
- **Left Mouse Down (hold)**: charge cast (when not cast)
- **Left Mouse Up**: release cast
- **Left Mouse Down (hold while hooked)**: reel
- **Click**: UI buttons; also hook-set assist during bite window
- **Mouse Wheel**: adjust cast power
- **Right Click**: cancel a cast (prevents the browser context menu)
- **Space**: hook set during BITE state (timing window)
- **1 / 2 / 3**: switch bait type
- **Esc**: pause / resume
- **R**: restart

## Implemented JavaScript Events (Assignment List)

This game implements and uses (at least) these event types:

- **load**: initialize the game on page load (`window.addEventListener("load", ...)`)
- **resize**: responsive canvas resize + layout recalculation
- **keydown**: pause (Esc), restart (R), bait switching (1/2/3), hook set (Space)
- **keyup**: handled for action release and expandability
- **click**: canvas UI buttons, in-game actions
- **mousemove**: aim rod, hover feedback for buttons
- **mousedown**: start cast charge / start reel
- **mouseup**: release cast / stop reel force
- **wheel**: adjust cast power
- **contextmenu**: right-click action + prevents default menu
- **focus**: handled (keeps pause unless user resumes)
- **blur**: auto-pause when window loses focus
- **custom events** (via `EventTarget` + `CustomEvent`):
  - `gameStart`
  - `fishCaught`
  - `fishEscaped`
  - `levelUp`
  - `gameOver`
- **requestAnimationFrame**: main game loop
- **setInterval**: timed fish spawning and ambient pond effects

## FSM Explanation

Each fish owns an `FSM` instance (`js/fsm.js`). The FSM:

- Stores a map of states by name
- Holds the current state name
- Calls:
  - `enter(owner, prevStateName, data)`
  - `update(owner, deltaTime)`
  - `exit(owner, nextStateName)`
- Allows clean transitions with `fsm.setState("STATE_NAME")`

### Fish State Design (Behavior Summary)

- **SWIM**: random wandering; avoids boundaries; default behavior.
- **NOTICE_BAIT**: fish becomes interested; slows and focuses on bait.
- **APPROACH**: cautious movement toward bait with circling to create suspense.
- **BITE**: fish bites for a short timing window; player must react.
- **HOOKED**: fish struggles; player reels while controlling line tension.
- **ESCAPE_ATTEMPT**: aggressive erratic movement; last chance to recover.
- **CAUGHT**: awards score, plays effects, fish despawns.

## FSM State Transition Table

| Current State   | Condition                          | Next State        | Action                    |
|----------------|------------------------------------|-------------------|---------------------------|
| SWIM           | baitDistance < detectionRadius     | NOTICE_BAIT       | Focus on bait             |
| NOTICE_BAIT    | baitStillValid && closeEnough      | APPROACH          | Move toward bait          |
| NOTICE_BAIT    | baitMovedAway or timerExpired      | SWIM              | Lose interest             |
| APPROACH       | distanceToBait < biteRange         | BITE              | Start bite timer          |
| APPROACH       | baitNoLongerValid or tooFar        | SWIM              | Disengage                 |
| BITE           | playerHooksInTime                  | HOOKED            | Attach fish to hook       |
| BITE           | timerExpired                       | ESCAPE_ATTEMPT    | Aggressive escape         |
| HOOKED         | reelSuccess && inCatchZone         | CAUGHT            | Award score               |
| HOOKED         | struggleEscalates or poor reeling  | ESCAPE_ATTEMPT    | Try to break free         |
| ESCAPE_ATTEMPT | recoverySuccess                    | HOOKED            | Resume struggle           |
| ESCAPE_ATTEMPT | escapeCompleted                    | SWIM              | Return to pond            |

## Technologies Used

- **HTML5 Canvas**
- **JavaScript (ES6 modules, classes, const/let)**
- **CSS**
- **Web Audio API** (with safe fallbacks)

## File Structure

```text
/game
  /assets
    /images
    /sounds
  /js
    main.js
    game.js
    input.js
    player.js
    fish.js
    enemy.js
    fsm.js
    ui.js
    audio.js
    utils.js
  /css
    style.css
  index.html
  README.md
```

## How to Run Locally

Because ES6 modules are used, you should run a small local server.

### Option A: VS Code / Cursor Live Server

- Open the `game/` folder
- Run Live Server on `game/index.html`

### Option B: Python (if installed)

From the repository root:

```bash
cd game
python -m http.server 8080
```

Then open `http://localhost:8080`.
