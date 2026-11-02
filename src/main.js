// Buddy — a dog (or Ghosty, a little ghost) that comes onto your screen to remind you
// to drink water and eat. Runs in the tray. Two modes: "normal" (reminders on) and "busy" (silent until
// it expires or until the next morning reset, whichever comes first).

const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { BREEDS } = require('./pets');
const { appsInCall, matchSharing, windowTitles } = require('./meeting');

const DEFAULT_SETTINGS = {
  water: { enabled: true, intervalMin: 45 },
  meals: [
    { name: 'Breakfast', time: '09:00', enabled: true },
    { name: 'Lunch', time: '13:00', enabled: true },
    { name: 'Snack', time: '17:00', enabled: true },
    { name: 'Dinner', time: '20:30', enabled: true },
  ],
  mealWindowMin: 90, // keep nudging about a meal for this long after its time
  morningReset: '06:00', // busy mode always switches back to normal at this time
  snoozeMin: 10,
  reminderTimeoutSec: 120, // the character leaves by itself if ignored (counts as a snooze)
  character: 'dog', // 'dog' (Buddy) or 'ghost' (Ghosty)
  names: {}, // your own names for the pets, e.g. { dog: 'Mochi' }; empty means the default name
  breed: 'beagle', // Buddy's look: a dog breed or a cat (see pets.js)
  sound: true,
  autoStart: true,
  pauseInCalls: true, // no reminders while your mic or camera is in use (Teams, Meet, Zoom, …)
};

const TICK_MS = 30 * 1000;

// Pet game: each character has its own water and food bars (0–100) that drain while you're at
// the computer, and only fill up when *you* drink or eat ("Drank it!" / "Ate it!").
const PET = {
  waterGain: 30,
  foodGain: 45,
  waterDrainPerMin: 100 / 180, // empty after ~3 hours without a drink
  foodDrainPerMin: 100 / 540, // empty after ~9 hours without a meal
  start: { water: 80, food: 80 },
};

// Each character has its own overlay page and window placement.
const CHARACTERS = {
  // Buddy sits in a small window flush with the bottom-right screen edge, so he can hide behind it.
  dog: {
    defaultName: 'Buddy',
    emoji: '🐶',
    page: 'dog.html',
    bounds: (wa) => ({ width: 440, height: 420, x: wa.x + wa.width - 440, y: wa.y + wa.height - 420 }),
  },
  // Ghosty flies across a full-width strip along the bottom of the screen.
  ghost: {
    defaultName: 'Ghosty',
    emoji: '👻',
    page: 'ghost.html',
    bounds: (wa) => ({ width: wa.width, height: 500, x: wa.x, y: wa.y + wa.height - 500 }),
  },
};

let settings;
let state;
let tray = null;
let overlayWin = null;
let settingsWin = null;
let callApps = []; // apps using your mic/camera, or screen sharing/presenting; non-empty means you're in a meeting
let fakeCall = null; // dev only: --calltest pretends an app is using the mic

// ---------- persistence ----------

const dataFile = (name) => path.join(app.getPath('userData'), name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(dataFile(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(dataFile(name), JSON.stringify(value, null, 2));
}

function loadSettings() {
  const saved = readJson('settings.json', {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    water: { ...DEFAULT_SETTINGS.water, ...(saved.water || {}) },
    meals: Array.isArray(saved.meals) ? saved.meals : DEFAULT_SETTINGS.meals,
    names: { ...(saved.names || {}) },
  };
}

const MAX_NAME_LENGTH = 16;

// The name you gave this pet, or its default (Buddy / Ghosty).
function petNameOf(characterId) {
  const character = CHARACTERS[characterId] || CHARACTERS.dog;
  return (settings.names[characterId] || '').trim() || character.defaultName;
}

// Buddy shows as a cat in the tray when you picked a cat look.
function petEmoji(characterId) {
  if (characterId === 'dog' && BREEDS[settings.breed]?.species === 'cat') return '🐱';
  return (CHARACTERS[characterId] || CHARACTERS.dog).emoji;
}

// Menu labels treat "&" as a keyboard-shortcut marker on Windows, so show it literally.
const menuText = (text) => text.replace(/&/g, '&&');

const saveState = () => writeJson('state.json', state);

// ---------- time helpers ----------

function atTime(base, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function nextMorning(now) {
  let t = atTime(now, settings.morningReset);
  if (t <= now) t = atTime(now + 24 * 3600 * 1000, settings.morningReset);
  return t;
}

const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA'); // YYYY-MM-DD

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------- modes ----------

function setNormal() {
  state.mode = 'normal';
  state.busyUntil = null;
  saveState();
  refreshTray();
}

function setBusy(durationMin) {
  const now = Date.now();
  const morning = nextMorning(now);
  state.mode = 'busy';
  state.busyUntil = durationMin ? Math.min(now + durationMin * 60000, morning) : morning;
  saveState();
  refreshTray();
  if (overlayWin) overlayWin.webContents.send('overlay:leave');
}

// ---------- scheduler ----------

function dueReminder(now) {
  const today = dayKey(now);
  if (state.mealsDone.date !== today) state.mealsDone = { date: today, names: [] };

  for (const meal of settings.meals) {
    if (!meal.enabled || !meal.time) continue;
    const start = atTime(now, meal.time);
    const inWindow = now >= start && now < start + settings.mealWindowMin * 60000;
    const snoozed = (state.mealSnoozedUntil[meal.name] || 0) > now;
    if (inWindow && !snoozed && !state.mealsDone.names.includes(meal.name)) {
      return { kind: 'food', meal: meal.name };
    }
  }

  if (settings.water.enabled && now >= state.nextWaterAt) return { kind: 'water' };
  return null;
}

// ---------- pet game ----------

const activePet = () => state.pets[settings.character] || state.pets.dog;

function resetTodayIfNeeded(now) {
  if (state.today.date !== dayKey(now)) state.today = { date: dayKey(now), drinks: 0, meals: 0 };
}

// Drains the active pet's bars. Only counts up to a minute per tick, so time the computer
// spent asleep (or in busy mode, or in a call) doesn't starve the pet.
function drainPet(now) {
  const minutes = Math.min(1, Math.max(0, (now - (state.lastDrainAt || now)) / 60000));
  state.lastDrainAt = now;
  if (state.mode === 'busy' || callApps.length) return;
  const pet = activePet();
  pet.water = Math.max(0, pet.water - minutes * PET.waterDrainPerMin);
  pet.food = Math.max(0, pet.food - minutes * PET.foodDrainPerMin);
}

function petMood(pet) {
  const low = Math.min(pet.water, pet.food);
  if (low >= 60) return 'happy 😊';
  if (low >= 30) return 'okay 🙂';
  return pet.water < pet.food ? 'thirsty 🥺' : 'hungry 🥺';
}

let ticking = false;

async function tick() {
  if (ticking) return; // the call check is async; don't let ticks overlap
  ticking = true;
  try {
    const now = Date.now();
    if (state.mode === 'busy' && now >= state.busyUntil) setNormal();
    resetTodayIfNeeded(now);
    callApps = settings.pauseInCalls ? (fakeCall || await appsInCall()) : [];
    drainPet(now);
    saveState();
    refreshTray();
    // A call started while your pet was visiting: it slips away without snoozing, so whatever it
    // wanted is still due and comes right back once the call ends.
    if (callApps.length && overlayWin) overlayWin.webContents.send('overlay:leave', 'call');
    if (state.mode === 'busy' || callApps.length || overlayWin) return;
    const reminder = dueReminder(now);
    if (reminder) showReminder(reminder);
  } finally {
    ticking = false;
  }
}

function handleResponse(reminder, action) {
  if (action === 'call') return; // stepped aside for a call: leave the reminder due
  const now = Date.now();
  const snoozeUntil = now + settings.snoozeMin * 60000;

  if (reminder.kind === 'water') {
    state.nextWaterAt = action === 'done' ? now + settings.water.intervalMin * 60000 : snoozeUntil;
  } else if (action === 'done') {
    state.mealsDone.names.push(reminder.meal);
  } else {
    state.mealSnoozedUntil[reminder.meal] = snoozeUntil;
  }

  // You drank or ate, so your pet gets its share too.
  if (action === 'done') {
    const pet = state.pets[reminder.character] || activePet();
    resetTodayIfNeeded(now);
    if (reminder.kind === 'water') {
      pet.water = Math.min(100, pet.water + PET.waterGain);
      state.today.drinks++;
    } else {
      pet.food = Math.min(100, pet.food + PET.foodGain);
      state.today.meals++;
    }
  }
  saveState();
  refreshTray();
  if (action === 'busy') setBusy(null);
}

// ---------- reminder overlay ----------

function showReminder(reminder, characterId = settings.character) {
  const character = CHARACTERS[characterId] || CHARACTERS.dog;
  const pet = state.pets[characterId] || activePet();
  reminder = { ...reminder, character: characterId };
  const { workArea } = screen.getPrimaryDisplay();
  overlayWin = new BrowserWindow({
    ...character.bounds(workArea),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  overlayWin.loadFile(path.join(__dirname, character.page), {
    query: {
      kind: reminder.kind,
      meal: reminder.meal || '',
      sound: settings.sound ? '1' : '0',
      timeout: String(settings.reminderTimeoutSec),
      snooze: String(settings.snoozeMin),
      water: String(Math.round(pet.water)),
      food: String(Math.round(pet.food)),
      waterGain: String(PET.waterGain),
      foodGain: String(PET.foodGain),
      name: petNameOf(characterId),
      breed: settings.breed,
      foodIcon: petEmoji(characterId) === '🐱' ? '🐟' : '🍖',
    },
  });
  overlayWin.once('ready-to-show', () => overlayWin.showInactive()); // never steal focus from your work
  overlayWin.reminder = reminder;
  const win = overlayWin;
  win.on('closed', () => {
    if (overlayWin === win) overlayWin = null;
  });
}

ipcMain.on('overlay:respond', (_e, action) => {
  if (!overlayWin) return;
  const { reminder } = overlayWin;
  overlayWin.close();
  overlayWin = null;
  handleResponse(reminder, action);
});

ipcMain.on('overlay:ignore-mouse', (_e, ignore) => {
  if (overlayWin) overlayWin.setIgnoreMouseEvents(ignore, { forward: true });
});

// ---------- settings window ----------

function openSettings() {
  if (settingsWin) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 480,
    height: Math.min(880, screen.getPrimaryDisplay().workArea.height), // scrolls on short screens
    resizable: false,
    title: 'Buddy settings',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:save', (_e, next) => {
  const intervalChanged = next.water.intervalMin !== settings.water.intervalMin;
  const names = {};
  for (const id of Object.keys(CHARACTERS)) {
    const name = String(next.names?.[id] || '').trim().slice(0, MAX_NAME_LENGTH);
    if (name && name !== CHARACTERS[id].defaultName) names[id] = name;
  }
  const breed = BREEDS[next.breed] ? next.breed : 'beagle';
  settings = { ...settings, ...next, names, breed };
  writeJson('settings.json', settings);
  if (intervalChanged) {
    state.nextWaterAt = Date.now() + settings.water.intervalMin * 60000;
    saveState();
  }
  applyAutoStart();
  refreshTray();
  tick(); // apply changes such as the in-call switch right away
  if (settingsWin) settingsWin.close();
});

function applyAutoStart() {
  if (!app.isPackaged) return; // don't register the dev electron.exe as a login item
  // The portable .exe unpacks itself to a temp folder on every run; register the real file instead.
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  app.setLoginItemSettings({ openAtLogin: settings.autoStart, ...(portableExe && { path: portableExe }) });
}

// ---------- tray ----------

// Draws a paw-print icon in code so the app ships without image assets.
function pawIcon(rgb) {
  const size = 32;
  const shapes = [
    { cx: 16, cy: 21, rx: 8, ry: 7 }, // main pad
    { cx: 7, cy: 12, rx: 3.4, ry: 4.2 },
    { cx: 12.5, cy: 6.5, rx: 3.4, ry: 4.2 },
    { cx: 19.5, cy: 6.5, rx: 3.4, ry: 4.2 },
    { cx: 25, cy: 12, rx: 3.4, ry: 4.2 },
  ];
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4; // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (shapes.some((s) => ((px - s.cx) / s.rx) ** 2 + ((py - s.cy) / s.ry) ** 2 <= 1)) hits++;
        }
      }
      const a = Math.round((hits / (ss * ss)) * 255);
      const i = (y * size + x) * 4; // BGRA, premultiplied
      buf[i] = Math.round((rgb[2] * a) / 255);
      buf[i + 1] = Math.round((rgb[1] * a) / 255);
      buf[i + 2] = Math.round((rgb[0] * a) / 255);
      buf[i + 3] = a;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
}

const ICONS = {};

function refreshTray() {
  if (!tray) return;
  const busy = state.mode === 'busy';
  const inCall = !busy && callApps.length > 0;
  const status = busy
    ? `Busy until ${fmtTime(state.busyUntil)}`
    : inCall ? `In a meeting (${callApps.join(', ')}) — reminders paused 🎧` : 'Normal — reminders on';
  const pet = activePet();
  const currentName = petNameOf(settings.character);
  const petLine = `${currentName} is ${petMood(pet)}  ·  💧 ${Math.round(pet.water)}%  🍖 ${Math.round(pet.food)}%`;
  const todayLine = `Today you had ${state.today.drinks} drinks and ${state.today.meals} meals`;
  const loginLabel = process.platform === 'darwin' ? 'Open at login' : 'Start with Windows';

  tray.setImage(busy ? ICONS.busy : inCall ? ICONS.call : ICONS.normal);
  tray.setToolTip(`Buddy · ${status}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: menuText(`${petEmoji(settings.character)} ${status}`), enabled: false },
      { label: menuText(petLine), enabled: false },
      { label: todayLine, enabled: false },
      { type: 'separator' },
      { label: 'Normal mode', type: 'radio', checked: !busy, click: setNormal },
      {
        label: busy ? '● Busy mode' : 'Busy mode',
        submenu: [
          { label: 'For 30 minutes', click: () => setBusy(30) },
          { label: 'For 1 hour', click: () => setBusy(60) },
          { label: 'For 2 hours', click: () => setBusy(120) },
          { label: `Until tomorrow morning (${settings.morningReset})`, click: () => setBusy(null) },
        ],
      },
      { type: 'separator' },
      { label: 'Remind me now: water', click: () => !overlayWin && showReminder({ kind: 'water' }) },
      { label: 'Remind me now: food', click: () => !overlayWin && showReminder({ kind: 'food', meal: 'Snack' }) },
      {
        label: menuText(`Reminder friend: ${currentName}`),
        submenu: Object.entries(CHARACTERS).map(([id, c]) => ({
          label: menuText(`${petEmoji(id)} ${petNameOf(id)}`),
          type: 'radio',
          checked: settings.character === id,
          click: () => {
            settings.character = id;
            writeJson('settings.json', settings);
            refreshTray();
          },
        })),
      },
      { type: 'separator' },
      { label: 'Settings…', click: openSettings },
      {
        label: loginLabel,
        type: 'checkbox',
        checked: settings.autoStart,
        click: (item) => {
          settings.autoStart = item.checked;
          writeJson('settings.json', settings);
          applyAutoStart();
        },
      },
      { type: 'separator' },
      { label: 'Quit Buddy', click: () => app.quit() },
    ])
  );
}

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openSettings);
  app.on('window-all-closed', () => {}); // keep running in the tray

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock.hide();
    if (process.platform === 'win32') app.setAppUserModelId('io.buddy.reminder');

    settings = loadSettings();
    const now = Date.now();
    state = {
      mode: 'normal',
      busyUntil: null,
      mealsDone: { date: dayKey(now), names: [] },
      mealSnoozedUntil: {},
      today: { date: dayKey(now), drinks: 0, meals: 0 },
      ...readJson('state.json', {}),
      nextWaterAt: now + settings.water.intervalMin * 60000, // fresh water timer each launch
      lastDrainAt: now,
    };
    state.pets = {
      dog: { ...PET.start, ...(state.pets?.dog || {}) },
      ghost: { ...PET.start, ...(state.pets?.ghost || {}) },
    };
    saveState();

    ICONS.normal = pawIcon([38, 166, 154]);
    ICONS.busy = pawIcon([229, 72, 77]);
    ICONS.call = pawIcon([124, 108, 240]);
    tray = new Tray(ICONS.normal);
    tray.on('click', () => tray.popUpContextMenu());
    applyAutoStart();
    refreshTray();

    tick();
    setInterval(tick, TICK_MS);
    // Catch up immediately after the laptop wakes or is unlocked (e.g. the morning reset).
    powerMonitor.on('resume', tick);
    powerMonitor.on('unlock-screen', tick);

    // Dev helper: `npm start -- --capture=out.png [--at=ms] [--food] [--ghost] [--click=snooze]` shows a
    // reminder and saves a screenshot; --click presses that bubble button once the character has arrived.
    // With --settings it captures the settings window instead.
    const capture = process.argv.find((a) => a.startsWith('--capture='));
    if (capture) {
      const at = process.argv.find((a) => a.startsWith('--at='));
      const click = process.argv.find((a) => a.startsWith('--click='));
      const reminder = { kind: process.argv.includes('--food') ? 'food' : 'water', meal: 'Lunch' };
      const characterId = process.argv.includes('--ghost') ? 'ghost' : 'dog';
      const petLevel = process.argv.find((a) => a.startsWith('--pet=')); // e.g. --pet=20 to see a tired pet
      if (petLevel) state.pets[characterId] = { water: Number(petLevel.split('=')[1]), food: Number(petLevel.split('=')[1]) };
      const nameArg = process.argv.find((a) => a.startsWith('--name=')); // e.g. --name=Mochi (not saved)
      if (nameArg) settings.names[characterId] = nameArg.split('=')[1];
      const breedArg = process.argv.find((a) => a.startsWith('--breed=')); // e.g. --breed=shihtzu (not saved)
      if (breedArg) settings.breed = breedArg.split('=')[1];
      if (process.argv.includes('--settings')) openSettings();
      else showReminder(reminder, characterId);
      if (click) {
        const id = click.split('=')[1];
        setTimeout(() => overlayWin.webContents.executeJavaScript(`document.getElementById('${id}').click()`), 4500);
      }
      // --hittest: once the character has arrived, print what a real mouse click would land on at the
      // centre of each bubble button (element.click() above skips that check).
      if (process.argv.includes('--hittest')) {
        setTimeout(async () => {
          const hits = await overlayWin.webContents.executeJavaScript(`['done', 'snooze', 'busy'].map((id) => {
            const r = document.getElementById(id).getBoundingClientRect();
            const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return id + ' -> ' + (el.closest('button')?.id || el.tagName);
          }).join(', ')`);
          console.log(`hittest: ${hits}`);
        }, 4500);
      }
      setTimeout(async () => {
        const img = await (settingsWin || overlayWin).webContents.capturePage();
        fs.writeFileSync(capture.split('=')[1], img.toPNG());
        app.quit();
      }, at ? Number(at.split('=')[1]) : 5500);
    }

    // Helper: `npm start -- --windows` prints the open window titles and which ones count as screen
    // sharing or presenting. Run it while sharing in a meeting app to check (or extend) the patterns.
    if (process.argv.includes('--windows')) {
      windowTitles().then((titles) => {
        console.log(`windows: ${titles.length}`);
        for (const title of titles) console.log(`  ${matchSharing([title]).length ? '✓ sharing' : '·'}  ${title}`);
        app.quit();
      });
    }

    // Dev helper: `npm start -- --calltest` shows a reminder, then pretends a call starts, and prints
    // whether the pet stepped aside without snoozing and whether a new reminder stays away.
    if (process.argv.includes('--calltest')) {
      showReminder({ kind: 'water' });
      const timerBefore = state.nextWaterAt;
      setTimeout(() => { fakeCall = ['TestCall']; tick(); }, 4500); // a call starts while the pet is visiting
      setTimeout(() => {
        console.log(`calltest: in call ${JSON.stringify(callApps)}; pet ${overlayWin ? 'STILL VISIBLE' : 'left'}; ` +
          `water timer ${timerBefore === state.nextWaterAt ? 'not snoozed' : 'SNOOZED'}`);
        state.nextWaterAt = 0; // a reminder falls due mid-call
        tick();
      }, 6800);
      setTimeout(async () => {
        console.log(`calltest: reminder due mid-call ${overlayWin ? 'WAS SHOWN' : 'held back'}`);
        fakeCall = null; // the call ends
        await tick();
        console.log(`calltest: call ended; reminder ${overlayWin ? 'back on screen' : 'NOT shown'}`);
        app.quit();
      }, 8500);
    }
  });
}
