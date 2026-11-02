// Detects when you're in a call or meeting (Teams, Google Meet, Zoom, …) or presenting, so reminders
// can wait. Two signals:
//  1. Which apps are using your microphone or camera right now. Windows keeps this per app for its
//     mic/camera privacy indicator: an app is using the device while its LastUsedTimeStart is set and
//     LastUsedTimeStop is 0. Only that on/off record is read, never any audio or video.
//  2. Screen sharing or presenting with mic and camera off: meeting apps show tell-tale windows while
//     you share (Chrome/Edge's "… is sharing your screen" bar, Teams/Zoom sharing toolbars, PowerPoint's
//     slide show). Only open window titles are read, never what's in the windows.
// The mic/camera signal is Windows-only; on other systems only the window titles are checked.

const { execFile } = require('child_process');
const { desktopCapturer } = require('electron');

const STORE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore';

// "…\NonPackaged\C:#Program Files#Google#Chrome#Application#chrome.exe" → "chrome",
// "…\MSTeams_8wekyb3d8bbwe" → "MSTeams".
function appName(key) {
  return key.split('\\').pop().split('#').pop().replace(/\.exe$/i, '').replace(/_[a-z0-9]{13}$/i, '');
}

// Picks the apps currently using the device out of `reg query <store>\<device> /s` output.
function parseInUse(stdout) {
  const apps = [];
  let key = null;
  let start = 0n;
  let stop = null;
  const flush = () => {
    if (key && start > 0n && stop === 0n) apps.push(appName(key));
  };
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      flush();
      key = line.trim();
      start = 0n;
      stop = null;
      continue;
    }
    const m = line.match(/^\s+(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-f]+)/i);
    if (m && m[1] === 'LastUsedTimeStart') start = BigInt(m[2]);
    if (m && m[1] === 'LastUsedTimeStop') stop = BigInt(m[2]);
  }
  flush();
  return apps;
}

function appsUsing(device) {
  return new Promise((resolve) => {
    execFile('reg', ['query', `${STORE}\\${device}`, '/s'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      resolve(err ? [] : parseInUse(stdout));
    });
  });
}

// Window titles that mean you're sharing your screen or presenting, and how to describe each.
const SHARING_WINDOWS = [
  { label: 'sharing your screen', test: /is sharing (your|a|this|the|an?) ?(entire )?(screen|window|tab|application)/i }, // Chrome / Edge bar
  { label: 'sharing in Teams', test: /sharing (control bar|toolbar)|presenter toolbar/i },
  { label: 'sharing in Zoom', test: /share toolbar|you are screen sharing/i },
  { label: 'presenting slides', test: /^PowerPoint Slide Show|Slide Show - /i },
];
const OWN_WINDOWS = /^(Buddy|Ghosty|Buddy settings)$/;

// Which of the given window titles show you're sharing or presenting (deduplicated labels).
function matchSharing(titles) {
  const found = new Set();
  for (const title of titles) {
    if (OWN_WINDOWS.test(title)) continue;
    for (const { label, test } of SHARING_WINDOWS) if (test.test(title)) found.add(label);
  }
  return [...found];
}

// Titles of the open (visible, not minimised) windows. No images are captured.
async function windowTitles() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    return sources.map((s) => s.name);
  } catch {
    return [];
  }
}

// What says you're busy in a call right now: apps using your mic or camera, and any screen sharing or
// presenting. Empty when you're free.
async function appsInCall() {
  const [mic, camera, titles] = await Promise.all([
    process.platform === 'win32' ? appsUsing('microphone') : [],
    process.platform === 'win32' ? appsUsing('webcam') : [],
    windowTitles(),
  ]);
  return [...new Set([...mic, ...camera, ...matchSharing(titles)])];
}

module.exports = { appsInCall, parseInUse, matchSharing, windowTitles };
