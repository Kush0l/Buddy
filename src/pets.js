// Looks for Buddy, your pet friend: a few dog breeds and cats. Most looks are drawn on the same
// skeleton (same groups and ids: #hopper, #tail, #head, #earL/#earR, #look, #brows, #tongue, …),
// so all of dog.html's animations (peeking, lapping, sad, puppy eyes) work for each of them.
// A look can instead be a picture (see imageArt). Loaded as a classic script by the pages, and
// required by main.js for the list of looks.

const BREEDS = {
  beagle: {
    label: 'Beagle', species: 'dog', fur: '#e0a96d', light: '#f7e1c0', ear: '#8a5a33', ears: 'floppy', tail: 'dog', tailColor: '#c98a4b',
    head: '<ellipse cx="118" cy="63" rx="14" ry="13" fill="#c98a4b"/>',
  },
  shihtzu: {
    label: 'Shih Tzu', species: 'dog',
    // Your sticker (with the sign removed): a happy-face version for normal and eating, and the
    // original pout for sad moments. Placed so the dog is centred in the 200×200 box with its paws on
    // the ground. Points are in that box: eye centres and sizes (for blinks and tears), the eyelid fur
    // colour, what it tilts around, its mouth, and the neck band where the head layer fades into the
    // body layer (so the head can dip on its own).
    image: {
      src: 'assets/shihtzu-happy.webp', sadSrc: 'assets/shihtzu.webp', x: -35.2, y: -65, size: 266.2,
      eyes: [[74.8, 56.2], [123.9, 56.2]], eyeSize: [8.6, 9.2], lid: '#7a6f5c', origin: '100px 190px',
      mouth: [100, 84], neck: [100, 113],
    },
  },
  husky: {
    label: 'Husky', species: 'dog', fur: '#7f8a97', light: '#f4f6f8', ear: '#66707c', earInner: '#f4f6f8',
    ears: 'pointy', tail: 'fluffyCurl', iris: '#3d9bff',
    head: '<path d="M60 82 Q62 62 78 60 Q90 66 100 54 Q110 66 122 60 Q138 62 140 82 Q140 106 100 114 Q60 106 60 82 Z" fill="#f4f6f8"/>',
  },
  pug: {
    label: 'Pug', species: 'dog', fur: '#e6c697', light: '#f0dab4', ear: '#3b2f2a', ears: 'fold', tail: 'curl', muzzle: '#5e4738',
    head: '<path d="M84 44 Q100 39 116 44 M88 51 Q100 47 112 51" stroke="#b88f5c" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  },
  tabby: {
    label: 'Orange Tabby', species: 'cat', fur: '#f2a24f', light: '#fde7cc', ear: '#f2a24f', earInner: '#ffb3c1', iris: '#8bc34a',
    head: `<path d="M88 36 L92 49 M100 32 L100 47 M112 36 L108 49 M59 70 L70 72 M58 79 L69 79 M141 70 L130 72 M142 79 L131 79"
                 stroke="#c8722b" stroke-width="3.5" stroke-linecap="round" fill="none"/>`,
    body: `<path d="M62 138 Q70 144 68 154 M138 138 Q130 144 132 154 M60 152 Q66 156 66 164 M140 152 Q134 156 134 164"
                 stroke="#c8722b" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  },
  blackcat: {
    label: 'Black Cat', species: 'cat', fur: '#2f2b36', light: '#4a4554', ear: '#2f2b36', earInner: '#ff9fb2',
    iris: '#f2c94c', line: '#d9d2e3', whisker: '#d9d2e3',
  },
  siamese: {
    label: 'Siamese', species: 'cat', fur: '#f4e8d6', light: '#fbf5ec', ear: '#6b4a38', earInner: '#c9a48c',
    tailColor: '#6b4a38', paw: '#6b4a38', iris: '#4aa8ff', muzzle: '#8a6650', nose: '#4a3428',
    head: '<ellipse cx="100" cy="90" rx="25" ry="20" fill="#8a6650" opacity=".85"/>',
  },
};

// Left-side shapes; the right side is mirrored from these.
const EARS = {
  floppy: 'M68 46 Q38 50 42 98 Q58 110 72 84 Z',
  pointy: 'M62 54 L64 14 L92 38 Z',
  fold: 'M62 44 Q48 40 48 58 Q58 60 70 50 Z',
  cat: 'M60 56 L62 16 L94 40 Z',
};
const EAR_INNER = 'M67 48 L66 26 L85 40 Z';

const TAILS = {
  dog: { d: 'M138 156 Q176 142 170 104', width: 13 },
  fluffyCurl: { d: 'M138 154 Q184 146 172 114 Q164 96 150 108', width: 15 },
  curl: { d: 'M140 152 Q168 146 163 127 Q158 114 147 123 Q141 132 155 134', width: 10 },
  cat: { d: 'M138 162 Q186 158 176 118 Q170 94 186 86', width: 9 },
};

// Mirrors every x coordinate (x → 200 − x) inside the d="…" attributes of an SVG snippet.
const mirror = (svg) => svg.replace(/d="([^"]+)"/g, (_, d) =>
  `d="${d.replace(/(-?\d*\.?\d+)[ ,](-?\d*\.?\d+)/g, (__, x, y) => `${200 - Number(x)} ${y}`)}"`);

function eye(b, cx) {
  if (!b.iris) {
    return `<g class="eye"><ellipse cx="${cx}" cy="66" rx="6" ry="7" fill="#2b1d10"/><circle cx="${cx + 2}" cy="63.5" r="2" fill="#fff"/></g>`;
  }
  const pupil = b.species === 'cat'
    ? `<ellipse cx="${cx}" cy="66" rx="2" ry="6" fill="#1b1410"/>`
    : `<circle cx="${cx}" cy="66.5" r="3.4" fill="#1b1410"/>`;
  return `<g class="eye"><ellipse cx="${cx}" cy="66" rx="7" ry="8" fill="${b.iris}"/>${pupil}<circle cx="${cx + 2.4}" cy="62.5" r="2" fill="#fff"/></g>`;
}

// A teardrop starting at (x, y): solid blue with a darker outline and a shine, so it shows up on
// light fur too. Hidden until dog.html's CSS animates it for sad moments.
function tear(id, x, y, size = 1) {
  const w = 4 * size;
  const h = 10 * size;
  return `<g id="${id}" opacity="0">
          <path d="M${x} ${y} Q${x + w} ${y + h * 0.7} ${x + w} ${y + h} A${w} ${w} 0 0 1 ${x - w} ${y + h} Q${x - w} ${y + h * 0.7} ${x} ${y} Z"
                fill="#4aa3ff" stroke="#1f6fc8" stroke-width="${0.8 * size}"/>
          <circle cx="${x - w * 0.35}" cy="${y + h * 0.85}" r="${1.1 * size}" fill="#fff" opacity=".85"/>
        </g>`;
}

// A look drawn from a picture instead of shapes. The picture is used twice: a head layer that fades
// out across the neck band, over a body layer cut off at the top of that band. At rest they line up
// exactly; when eating, only the head dips (the body underneath hides the seam). It also gets the
// whole-body animations (peek, hop, tilt, droop, shiver), blinking eyelids drawn over its eyes, a
// tongue for lapping, and tears and wet streaks for sad moments, but not ear wiggles or a wagging tail.
// Eyelids start collapsed (scale 0) and the rest at opacity 0, so a still preview looks like the picture.
function imageArt(b) {
  const img = b.image;
  const [rx, ry] = img.eyeSize;
  const [mx, my] = img.mouth;
  const [neckTop, neckBottom] = img.neck;
  const picture = (src, attrs) => `<image href="${src}" x="${img.x}" y="${img.y}" width="${img.size}" height="${img.size}" ${attrs}/>`;
  const lids = img.eyes.map(([x, y]) => `
          <g class="lid" transform="scale(1 0)">
            <ellipse cx="${x}" cy="${y}" rx="${rx + 0.8}" ry="${ry + 0.6}" fill="${img.lid}"/>
            <path d="M${x - rx} ${y + 2} Q${x} ${y + 6.5} ${x + rx} ${y + 2}" stroke="#2b2420" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          </g>`).join('');
  const streaks = img.eyes.map(([x, y]) =>
    `<path class="streak" opacity="0" d="M${x} ${y + ry - 1} Q${x + 1.5} ${y + ry + 9} ${x} ${y + ry + 20}" stroke="#5fb0ff" stroke-width="2.6" stroke-linecap="round" fill="none"/>`).join('');
  return `
    <g id="hopper">
      <defs>
        <linearGradient id="imgNeckFade" gradientUnits="userSpaceOnUse" x1="0" y1="${neckTop}" x2="0" y2="${neckBottom}">
          <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
        </linearGradient>
        <mask id="imgHeadMask" maskUnits="userSpaceOnUse" x="-150" y="-150" width="500" height="500">
          <rect x="-150" y="-150" width="500" height="500" fill="url(#imgNeckFade)"/>
        </mask>
        <clipPath id="imgBodyClip"><rect x="-150" y="${neckTop}" width="500" height="300"/></clipPath>
      </defs>
      <ellipse cx="${mx}" cy="195" rx="50" ry="5" fill="rgba(0,0,0,.12)"/>
      <g id="head" style="transform-origin: ${img.origin}">
        ${picture(img.src, 'clip-path="url(#imgBodyClip)"')}
        <g id="imgHead" style="transform-origin: ${mx}px ${neckTop}px">
          ${img.sadSrc ? picture(img.sadSrc, 'mask="url(#imgHeadMask)"') : ''}
          ${picture(img.src, 'class="happyFace" mask="url(#imgHeadMask)"')}
          <path id="imgTongue" opacity="0" d="M${mx - 4.5} ${my + 1} Q${mx - 4.5} ${my + 11} ${mx} ${my + 11} Q${mx + 4.5} ${my + 11} ${mx + 4.5} ${my + 1} Z" fill="#ff7b8a" stroke="#e05a6c" stroke-width=".6"/>
          ${lids}
          ${streaks}
          ${tear('tear', img.eyes[0][0], img.eyes[0][1] + ry - 1, 1.4)}
          ${tear('tear2', img.eyes[1][0], img.eyes[1][1] + ry - 1, 1.4)}
        </g>
        <ellipse class="hitbox" cx="100" cy="104" rx="64" ry="94" fill="transparent"/>
      </g>
    </g>`;
}

// The part of the 200×200 box to show in Settings: the face for drawn looks, everything for pictures.
const previewBox = (breedId) => (BREEDS[breedId]?.image ? '-6 -6 212 212' : '28 6 144 132');

// The whole animal as SVG markup for a 0 0 200 200 viewBox. Hidden expressions (brows, frown, tears,
// puppy eyes) start at opacity 0; dog.html's CSS fades them in for sad/puppy moments.
function petArt(breedId) {
  const b = BREEDS[breedId] || BREEDS.beagle;
  if (b.image) return imageArt(b);
  const cat = b.species === 'cat';
  const line = b.line || '#2b1d10';
  const muzzle = b.muzzle || b.light;
  const tail = TAILS[cat ? 'cat' : b.tail];
  const ear = `<path d="${EARS[cat ? 'cat' : b.ears]}" fill="${b.ear}"/>${b.earInner ? `<path d="${EAR_INNER}" fill="${b.earInner}"/>` : ''}`;

  const snout = cat
    ? `<ellipse cx="91" cy="94" rx="11" ry="9" fill="${muzzle}"/><ellipse cx="109" cy="94" rx="11" ry="9" fill="${muzzle}"/>`
    : `<ellipse cx="100" cy="95" rx="24" ry="18" fill="${muzzle}"/>`;
  const nose = cat
    ? `<path d="M94 85 L106 85 L100 92 Z" fill="${b.nose || '#ff8fa3'}" stroke="${b.nose || '#ff8fa3'}" stroke-width="2" stroke-linejoin="round"/>`
    : `<ellipse cx="100" cy="87" rx="9" ry="6.5" fill="${b.nose || '#2b1d10'}"/><ellipse cx="97" cy="85" rx="2.6" ry="1.6" fill="#fff" opacity=".5"/>`;
  const mouth = cat
    ? { smile: 'M100 92 V96 M92 96 Q96 101 100 96 Q104 101 108 96', frown: 'M100 92 V96 M93 103 Q100 97 107 103',
        tongue: 'M96 98 Q96 108 100 108 Q104 108 104 98 Z' }
    : { smile: 'M100 93 V99 M89 98 Q94.5 104 100 99 Q105.5 104 111 98', frown: 'M100 93 V99 M90 106 Q100 98 110 106',
        tongue: 'M94 100 Q94 116 100 116 Q106 116 106 100 Z' };
  const whiskers = cat
    ? `<path d="M86 92 L60 87 M86 96 L60 98 M114 92 L140 87 M114 96 L140 98" stroke="${b.whisker || '#8a7766'}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`
    : '';

  return `
    <g id="hopper">
      <ellipse cx="100" cy="195" rx="50" ry="5" fill="rgba(0,0,0,.12)"/>
      <g id="tail"><path d="${tail.d}" stroke="${b.tailColor || b.fur}" stroke-width="${tail.width}" fill="none" stroke-linecap="round"/></g>
      <ellipse cx="100" cy="150" rx="46" ry="40" fill="${b.fur}"/>
      <ellipse cx="100" cy="160" rx="26" ry="27" fill="${b.light}"/>
      ${b.body || ''}
      <rect x="71" y="160" width="21" height="33" rx="10.5" fill="${b.fur}"/>
      <rect x="108" y="160" width="21" height="33" rx="10.5" fill="${b.fur}"/>
      <ellipse cx="81.5" cy="191" rx="13" ry="6.5" fill="${b.paw || b.light}"/>
      <ellipse cx="118.5" cy="191" rx="13" ry="6.5" fill="${b.paw || b.light}"/>
      <path d="M64 114 Q100 134 136 114" stroke="#e5484d" stroke-width="9" fill="none" stroke-linecap="round"/>
      <circle cx="100" cy="131" r="7" fill="#ffd166" stroke="#d4a017" stroke-width="2"/>
      <g id="head">
        <g id="earL">${ear}</g>
        <g id="earR">${mirror(ear)}</g>
        <circle cx="100" cy="72" r="42" fill="${b.fur}"/>
        ${b.head || ''}
        ${snout}
        <g id="look">${eye(b, 84)}${eye(b, 116)}</g>
        <g id="puppyEyes" opacity="0">
          <ellipse cx="84" cy="67" rx="9" ry="10" fill="#2b1d10"/>
          <ellipse cx="116" cy="67" rx="9" ry="10" fill="#2b1d10"/>
          <circle cx="87.5" cy="62.5" r="3.6" fill="#fff"/><circle cx="80.5" cy="71" r="1.8" fill="#fff"/>
          <circle cx="119.5" cy="62.5" r="3.6" fill="#fff"/><circle cx="112.5" cy="71" r="1.8" fill="#fff"/>
          <path d="M77 74 Q84 79 91 74 M109 74 Q116 79 123 74" stroke="#9fd3ff" stroke-width="2" fill="none" stroke-linecap="round"/>
        </g>
        <g id="brows" opacity="0" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round">
          <path d="M74 55 Q82 53 91 48"/><path d="M109 48 Q118 53 126 55"/>
        </g>
        ${tear('tear', 80, 74)}
        ${tear('tear2', 120, 76)}
        <circle cx="73" cy="85" r="5.5" fill="#ff8f9c" opacity=".45"/>
        <circle cx="127" cy="85" r="5.5" fill="#ff8f9c" opacity=".45"/>
        <path id="tongue" d="${mouth.tongue}" fill="#ff7b8a"/>
        ${nose}
        <path id="smile" d="${mouth.smile}" stroke="${line}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path id="frown" opacity="0" d="${mouth.frown}" stroke="${line}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        ${whiskers}
      </g>
    </g>`;
}

if (typeof module !== 'undefined') module.exports = { BREEDS };
