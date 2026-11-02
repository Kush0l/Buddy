# Buddy 🐶👻: a water and food reminder pet

Buddy lives in your system tray. When it's time to drink water or eat, your pet comes onto the screen with a small bubble you can understand at a glance. It never takes focus away from what you're doing, and clicks on the empty parts of its window go through to whatever is underneath.

Runs on Windows and macOS from the same code (Electron).

## Pick your reminder friend
- **Buddy** peeks out from the bottom-right edge of the screen, then hops in with its bowl. Choose its look in Settings:
  - Dogs: Beagle, Shih Tzu, Husky, Pug
  - Cats: Orange Tabby, Black Cat, Siamese
- **Ghosty** floats back and forth along the bottom of the screen while it reminds you, and stops when your mouse is on it.

You can rename either pet in Settings.

## The bubble
💧 **Water time!** (or 🍽️ **Lunch time!**) with three buttons:

| Button | What happens |
|---|---|
| **✓** | You drank or ate, so your pet does too: it eats from its bowl and its bar fills (+30 water / +45 food). |
| **⏰ 10m** | Snooze. Your pet gets sad ("No 💧 for me then…") and comes back in 10 minutes. |
| **🔕** | No more reminders until tomorrow morning. Buddy gives you puppy eyes; Ghosty gets angry. |

The thin bar at the bottom of the bubble is your pet's own water or food level. A thought cloud above the pet shows what it wants, with a red **!** when it's low.

## The pet game
Each pet has its own water and food bars. They drain slowly while you're at the computer (not while it's asleep, in Busy mode or in a meeting) and only fill up when *you* drink or eat. A pet with a low bar looks tired and asks more urgently. The tray menu shows its mood and how many drinks and meals you've had today.

## Modes
- **Normal**: reminders are on. Water every 45 minutes by default, plus Breakfast, Lunch, Snack and Dinner times.
- **Busy**: no reminders, from the tray for 30 min, 1 h, 2 h or until tomorrow morning, or with 🔕. Busy mode **always switches back to Normal at the morning reset time** (06:00 by default), even if the laptop slept or Buddy was closed.
- **In a meeting** (automatic, can be turned off in Settings): reminders pause while an app is using your microphone or camera (Teams, Google Meet, Zoom, …) or while you're sharing your screen or showing a slide show, and come back when it ends. Buddy only checks whether the mic or camera is on and reads open window titles; it never reads audio, video or window contents. Mic and camera detection is Windows-only.

## Run it
```
npm install
npm start
```

## Build an installer
```
npm run dist:win   # on Windows → dist/Buddy Setup <version>.exe + a portable exe
npm run dist:mac   # on a Mac   → dist/Buddy-<version>.dmg
```
Settings and your pets' progress are stored in the app's user-data folder (`settings.json`, `state.json`).

## Developer helpers
Pass these after `npm start --`:

| Flag | What it does |
|---|---|
| `--capture=out.png` | Shows a reminder and saves a screenshot of it. Combine with `--at=<ms>`, `--food`, `--ghost`, `--breed=<id>`, `--pet=<0-100>`, `--name=<name>`, `--click=done\|snooze\|busy`, or `--settings` to capture the settings window. |
| `--hittest` | Prints what a real mouse click would land on at each bubble button. |
| `--calltest` | Pretends a call starts mid-reminder and checks that reminders pause and come back. |
| `--windows` | Lists open window titles and marks the ones that count as screen sharing or presenting. |

## Project layout
| File | Purpose |
|---|---|
| `src/main.js` | Tray, scheduler, modes, pet game, settings storage |
| `src/meeting.js` | Meeting detection (mic/camera in use, screen sharing) |
| `src/pets.js` | Buddy's looks: dog breeds and cats, drawn as SVG (or from a picture) |
| `src/dog.html`, `src/ghost.html` | The two reminder overlays |
| `src/common.js`, `src/common.css` | Shared bubble, pet bar, sounds and effects |
| `src/settings.html` | Settings window |
| `src/assets/` | Pictures used by picture-based looks |

## Note on the Shih Tzu images
`src/assets/shihtzu.webp` and `src/assets/shihtzu-happy.webp` are edited from a WhatsApp sticker whose artist isn't known. Get permission from the artist, or replace these files, before publishing or distributing Buddy.
