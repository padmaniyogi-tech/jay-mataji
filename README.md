# 🏏 Super Over Blitz

A complete, offline, mobile-first cricket timing game in **one `index.html` file** — HTML5 Canvas + vanilla JavaScript, zero external libraries, zero asset files (all art, sound and juice are generated in code). Open it and play.

## Run it

- **Desktop:** double-click `index.html` (works from `file://`), or serve the folder and open it.
- **Mobile:** open the same file in the browser, or `adb reverse tcp:8080 tcp:8080` against a local server for a phone test.
- No build step, no dependencies, ~106 KB total.

## How to play

Tap (or click / press SPACE) at the exact moment the ball reaches the bat — the shrinking ring turns green at the perfect instant.

| Timing | Result |
|---|---|
| Perfect | **SIX** 🚀 |
| Good | **FOUR** |
| Slightly off | 1–2 runs |
| Way off | dot ball — or **OUT** |
| No shot played | **BOWLED** |

Read the cue pill before each delivery: FAST ⚡ · SLOW 🐌 · SWING 🌊 · SPIN 🌀 (deviates late) · BOUNCER ⬆️ · YORKER 🎯.

**Modes:** Super Over (6-ball chase) · Endless Survival (3 wickets, difficulty ramps) · Daily Challenge (date-seeded — same for everyone, changes at midnight) · 50 Levels with 3-star ratings.

## Testing checklist

1. First launch → tutorial (3 slides) → daily reward modal (claim +20 coins).
2. Super Over: chase the target; win with a six to see slow-motion → confetti → result screen.
3. Result screen: **Play Again** (one tap restarts), **Double coins** (3s fake rewarded ad), **Share** (Web Share → clipboard fallback).
4. Endless: lose 3 wickets → extra-life offer (rewarded ad or free for Premium); score milestones every 25 runs.
5. Levels: 3 stars = win with 2+ balls to spare; level N+1 unlocks on any win.
6. Shop: buy a bat / trail / stadium with coins; equip; try buying with too few coins.
7. Premium (₹99 stub — no real money): removes interstitials, unlocks all bats + stadiums + rainbow trail, 2× coins. Interstitial stub fires after every 3rd match for non-premium.
8. Settings: English/हिन्दी toggle (whole UI re-renders), sound, festival theme (Classic / Diwali / IPL Night), reset progress.
9. Pause (⏸ / ESC / backgrounding the tab), mute, spacebar play, pinch/scroll does not zoom the game.

## What to tweak (search `TWEAK` in the code)

- `LVL` (SECTION 4) — the whole difficulty curve: travel time, timing windows, miss→OUT chance, level targets.
- `BALL_TYPES` — per-delivery speed / window / wicket-risk multipliers.
- Coin economy lines in `Game.endMatch` (runs, six/four bonuses, win bonus, combo bonus, daily bonus).
- Daily-login streak payouts in `UI.showDailyReward`.
- Shop prices in `BATS` / `TRAILS` / `STADIUMS`, starting coins in `Storage.defaults`.

## Monetization stubs (clearly marked `⚠️ MONETIZATION STUBS`)

- `showInterstitialAd(onDone)` / `showRewardedAd(onReward)` — fake 3-second ads so the full flow is testable in-browser. Swap the bodies for a real SDK (AdMob via Capacitor, or AdSense-H5 for a TWA) keeping the signatures.
- Premium = a single `isPremium` flag in localStorage; `Shop.buyPremium()` is the stub purchase to replace with Razorpay / Play Billing.

## Architecture (comment banners in the file)

`UTILS → STORAGE → I18N → DATA → AUDIO → ADS → SHOP → GAME → RENDER → UI → INPUT/BOOT`

Progress persists in `localStorage` (always try/catch-wrapped). Perf: crowd pre-rendered offscreen, particles capped at ~330, DPR capped at 2, no per-frame filters — built to hold 60 fps on low-end Androids. Ready to wrap as-is with Capacitor or a Trusted Web Activity.
