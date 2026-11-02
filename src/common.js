// Shared helpers for the reminder overlays (dog.html, ghost.html).
// Loaded as a classic script, so these top-level names are visible to each page's own script.

const q = new URLSearchParams(location.search);
const kind = q.get('kind') || 'water';
const meal = q.get('meal') || 'Snack';
const snoozeMin = q.get('snooze') || '10';
const timeoutSec = Number(q.get('timeout') || 120);
const api = window.buddy || { respond() {}, setIgnoreMouse() {}, onLeave() {} }; // fallback for previewing in a browser

const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// The pet's own water/food bars (0–100). It only gets its share when you drink or eat.
const pet = { water: Number(q.get('water') ?? 80), food: Number(q.get('food') ?? 80) };
const petGain = { water: Number(q.get('waterGain') || 30), food: Number(q.get('foodGain') || 45) };
const petIsWeak = pet[kind] < 30; // the bar this reminder is about is running low
const NEED_ICON = { water: '💧', food: q.get('foodIcon') || '🍖' }; // cats get 🐟
const needIcon = NEED_ICON[kind];
let petName = 'Buddy';

// Builds the compact bubble, meant to be understood at a glance rather than read: an icon with a
// 2–3 word label, three icon buttons (tooltips explain them), and the pet's own bar as a thin strip
// along the bottom. The thought cloud over the pet shows what it wants (with a red "!" when low).
function fillBubble(defaultName) {
  petName = q.get('name') || defaultName;
  setLabel(kind === 'water' ? '💧' : '🍽️', kind === 'water' ? 'Water time!' : `${meal} time!`);
  $('done').textContent = '✓';
  $('done').title = kind === 'water' ? 'I drank water' : `I ate ${meal.toLowerCase()}`;
  $('snooze').textContent = `⏰ ${snoozeMin}m`;
  $('snooze').title = `Remind me in ${snoozeMin} minutes`;
  $('busy').textContent = '🔕';
  $('busy').title = 'No more reminders until tomorrow morning';

  const level = pet[kind] < 30 ? 'low' : 'ok';
  $('meters').className = `petbar petbar-${kind} ${level}`;
  $('meters').title = `${petName}'s ${kind}: ${Math.round(pet[kind])}%`;
  $('meters').innerHTML = `<div class="fill" style="width:${pet[kind]}%"></div><b class="gain"></b>`;
  $('thought').innerHTML = `<span>${needIcon}</span>${petIsWeak ? '<i class="bang">!</i>' : ''}`;
  if (petIsWeak) document.body.classList.add('weak');
}

function setLabel(icon, text) {
  $('icon').textContent = icon;
  $('title').textContent = text;
}

// Swaps the bubble to a short reaction (buttons removed), e.g. "Ahh! ❤️" or "No 💧 for me then…".
function react(icon, text) {
  setLabel(icon, text);
  document.querySelector('.row')?.remove();
}

const showThought = () => $('thought').classList.add('show');

// You drank/ate, so the pet gets its share: the bar fills with a "+N" and the cloud turns into a heart.
function feedPet() {
  const bar = $('meters');
  const next = Math.min(100, pet[kind] + petGain[kind]);
  bar.querySelector('.gain').textContent = `+${Math.round(next - pet[kind])}`;
  bar.className = `petbar petbar-${kind} fed`;
  $('thought').innerHTML = '<span>❤️</span>';
  $('thought').classList.add('fed');
  document.body.classList.remove('weak');
  requestAnimationFrame(() => { bar.querySelector('.fill').style.width = `${next}%`; });
}

// "Later" / 🔕: the pet won't drink/eat without you, so its bar greys out and the cloud breaks.
function petSkips() {
  $('meters').className = `petbar petbar-${kind} skipped`;
  $('thought').innerHTML = '<span>💔</span>';
}

// A word like "slurp!" or "nom!" that pops up at (x, y) inside `parent`, rises and fades.
function popText(parent, text, x, y) {
  const el = document.createElement('span');
  el.className = 'pop-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  parent.appendChild(el);
  el.animate([
    { transform: 'translateY(0) scale(.6)', opacity: 0 },
    { transform: 'translateY(-10px) scale(1)', opacity: 1, offset: 0.25 },
    { transform: 'translateY(-34px) scale(1)', opacity: 0 },
  ], { duration: 950, easing: 'ease-out' }).onfinish = () => el.remove();
}

// A sip or bite (an emoji) that flies from `from` into the pet's mouth at `to` and shrinks away.
function flyInto(parent, emoji, from, to, delay = 0) {
  const el = document.createElement('span');
  el.className = 'bite';
  el.textContent = emoji;
  parent.appendChild(el);
  el.animate([
    { transform: `translate(${from[0]}px, ${from[1]}px) scale(1)`, opacity: 0 },
    { opacity: 1, offset: 0.15 },
    { transform: `translate(${to[0]}px, ${to[1]}px) scale(.25)`, opacity: 0.9 },
  ], { duration: 650, delay, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'both' }).onfinish = () => el.remove();
}

// Clicks pass through the transparent parts of the window to whatever is underneath;
// only elements marked .hit catch the mouse.
function enableClickThrough() {
  document.querySelectorAll('.hit').forEach((el) => {
    el.addEventListener('mouseenter', () => api.setIgnoreMouse(false));
    el.addEventListener('mouseleave', () => api.setIgnoreMouse(true));
  });
}

// Little sounds made with WebAudio, so no sound files are needed.
// Each note: { freq, at, dur, to (end freq ratio), type, vibrato (Hz of wobble depth), volume }.
function playTones(notes) {
  if (q.get('sound') !== '1') return;
  try {
    const ctx = new AudioContext();
    notes.forEach(({ freq, at = 0, dur, to = 1, type = 'sine', vibrato = 0, volume = 0.18 }) => {
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * to, t + dur - 0.01);
      if (vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 6;
        depth.gain.value = vibrato;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + dur + 0.01);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.08, dur / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    });
  } catch {}
}
