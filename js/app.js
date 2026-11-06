import { STYLES, CITIES, SEASONS, sceneUrl, hasScene, cityThumb, nearestScene } from './scenes.js';
import * as spotify from './spotify.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const view = $('view');

// ---------- Saved choices ----------
const SAVE = 'ws.ride';
const read = () => {
  try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; }
};
const write = () => {
  try { localStorage.setItem(SAVE, JSON.stringify(ride)); } catch {}
};
let ride = { style: 'pencil', city: 'Chicago', season: 'Autumn', mode: 'windowed', ...read() };
Object.assign(ride, nearestScene(ride));

// ---------- Theme ----------
function applyTheme() {
  const s = STYLES[ride.style];
  const r = document.documentElement.style;
  r.setProperty('--wall', s.wall);
  r.setProperty('--frame', s.frame);
  r.setProperty('--glass', s.glass);
  r.setProperty('--line', s.line);
  r.setProperty('--text', s.text);
  r.setProperty('--muted', s.muted);
  r.setProperty('--fade', s.fade);
  r.setProperty('--pole', s.pole);
  document.querySelector('meta[name="theme-color"]').content = s.wall;
  $('cityName').textContent = ride.city;
}

// ---------- The moving view ----------
const strips = [];
let phase = 0;        // 0..1 through one loop of the strip
let speed = 0;        // px per second, eased
const CRUISE = 16;    // px per second at full speed

function showScene() {
  const el = document.createElement('div');
  el.className = 'strip';
  const track = document.createElement('div');
  track.className = 'strip-track';
  el.appendChild(track);
  const img = new Image();
  img.decoding = 'async';
  img.alt = '';
  img.src = sceneUrl(ride.style, ride.city, ride.season);
  const s = { el, track, img, copies: 0 };
  img.onload = () => {
    fillCopies(s);
    view.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    const old = strips.splice(0, strips.length - 0);
    strips.push(s);
    setTimeout(() => old.forEach((o) => o.el.remove()), 1500);
  };
}

function tileWidth(s) {
  const h = view.clientHeight;
  return s.img.naturalWidth * (h / s.img.naturalHeight);
}

function fillCopies(s) {
  const need = Math.ceil(view.clientWidth / Math.max(1, tileWidth(s))) + 1;
  while (s.copies < need) {
    s.track.appendChild(s.copies === 0 ? s.img : s.img.cloneNode());
    s.copies++;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const target = musicPaused() ? 0 : CRUISE;
  speed += (target - speed) * Math.min(1, dt * 0.9);   // the train eases to a stop and away
  const s = strips[strips.length - 1];
  if (s) {
    const w = tileWidth(s);
    if (w > 0) phase = (phase + (speed * dt) / w) % 1;
    for (const st of strips) {
      const tw = tileWidth(st);
      st.track.style.transform = `translate3d(${-phase * tw}px,0,0)`;
    }
  }
  const t = now / 1000;
  const sway = speed / CRUISE;
  view.style.transform = `translate3d(0,${(Math.sin(t * 1.3) * 0.9 + Math.sin(t * 3.7) * 0.35) * sway}px,0)`;
  drawProgress();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => strips.forEach(fillCopies));

// A pole flicks past every few seconds.
function pole() {
  if (speed > CRUISE * 0.6 && !document.hidden) {
    const p = document.createElement('div');
    p.className = 'pole';
    view.appendChild(p);
    const w = view.clientWidth;
    p.animate(
      [{ transform: `translateX(${w + 30}px)` }, { transform: 'translateX(-60px)' }],
      { duration: 420, easing: 'linear' }
    ).onfinish = () => p.remove();
  }
  setTimeout(pole, 4000 + Math.random() * 5000);
}

// ---------- Controls visibility ----------
let hideTimer = 0;
function showControls() {
  app.classList.add('show-controls');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => app.classList.remove('show-controls'), 4000);
}
function toggleControls() {
  if (app.classList.contains('show-controls')) {
    clearTimeout(hideTimer);
    app.classList.remove('show-controls');
  } else showControls();
}

let down = null;
app.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
app.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x;
  const dy = e.clientY - down.y;
  down = null;
  if (e.target.closest('button')) return;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && spotify.isConnected()) {
    dx < 0 ? doControl(spotify.next) : doControl(spotify.previous);
    return;
  }
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) toggleControls();
});
setTimeout(() => app.classList.add('hint-done'), 8000);

// ---------- Full screen ----------
function setMode(mode) {
  ride.mode = mode;
  app.dataset.mode = mode;
  $('sizeBtn').setAttribute('aria-label', mode === 'full' ? 'Exit full screen' : 'Full screen');
  write();
  setTimeout(() => strips.forEach(fillCopies), 750);
}
$('sizeBtn').addEventListener('click', () => {
  const full = ride.mode !== 'full';
  setMode(full ? 'full' : 'windowed');
  const d = document;
  try {
    if (full && d.documentElement.requestFullscreen && !d.fullscreenElement) d.documentElement.requestFullscreen().catch(() => {});
    if (!full && d.fullscreenElement) d.exitFullscreen().catch(() => {});
  } catch {}
  showControls();
});

// ---------- Spotify ----------
let track = null;

function musicPaused() {
  return spotify.isConnected() && track ? !track.playing : false;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 3000);
}

function renderTrack(prev) {
  const connected = spotify.isConnected();
  app.classList.toggle('no-spotify', !connected);
  $('connectBtn').hidden = connected || !spotify.isConfigured();
  $('idle').hidden = !connected || Boolean(track);
  $('track').hidden = !track;
  $('signoutBtn').hidden = !connected;
  app.classList.toggle('paused', musicPaused());
  $('playBtn').setAttribute('aria-label', musicPaused() ? 'Play' : 'Pause');
  if (!track) return;
  const changed = !prev || prev.id !== track.id;
  const paint = () => {
    $('trackTitle').textContent = track.title;
    $('trackArtist').textContent = track.artist;
    if (track.art) $('trackArt').src = track.art;
    $('trackArt').hidden = !track.art;
  };
  if (changed && prev) {
    const el = $('track');
    el.classList.remove('swap');
    void el.offsetWidth;
    el.classList.add('swap');
    setTimeout(paint, 380);
  } else paint();
}

function drawProgress() {
  const bar = $('progress');
  if (!track || !track.duration) { bar.style.width = '0'; return; }
  const ms = track.progress + (track.playing ? Date.now() - track.at : 0);
  bar.style.width = `${Math.min(100, (ms / track.duration) * 100)}%`;
}

async function poll() {
  if (!spotify.isConnected() || document.hidden) return;
  try {
    const prev = track;
    track = await spotify.nowPlaying();
    renderTrack(prev);
  } catch {
    // Network blip: keep what we had.
  }
}
setInterval(poll, 5000);

async function doControl(fn) {
  showControls();
  const err = await fn();
  if (err) toast(err);
  setTimeout(poll, 450);
}
$('prevBtn').addEventListener('click', () => doControl(spotify.previous));
$('nextBtn').addEventListener('click', () => doControl(spotify.next));
$('playBtn').addEventListener('click', () => {
  if (track) { track.playing = !track.playing; track.progress += track.playing ? 0 : Date.now() - track.at; track.at = Date.now(); renderTrack(track); }
  doControl(musicPaused() ? spotify.pause : spotify.play);
});
$('connectBtn').addEventListener('click', () => spotify.connect());
$('signoutBtn').addEventListener('click', () => {
  spotify.disconnect();
  track = null;
  renderTrack(null);
  closePicker();
});

// ---------- Picker ----------
let draft = null;

function openPicker() {
  draft = { style: ride.style, city: ride.city, season: ride.season };
  renderPicker();
  document.body.classList.add('picking');
  $('sheet').setAttribute('aria-hidden', 'false');
}
function closePicker() {
  document.body.classList.remove('picking');
  $('sheet').setAttribute('aria-hidden', 'true');
}

function pressBtn(label, on, disabled, click) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.disabled = disabled;
  b.addEventListener('click', click);
  if (label) b.textContent = label;
  return b;
}

function renderPicker() {
  $('summary').textContent = `${draft.city} · ${draft.season}`;

  const cities = $('cities');
  cities.replaceChildren(...CITIES.map((c) => {
    const b = pressBtn('', draft.city === c, !cityThumb(c), () => {
      Object.assign(draft, nearestScene({ ...draft, city: c }));
      renderPicker();
    });
    const img = document.createElement('img');
    img.src = cityThumb(c) || '';
    img.alt = '';
    const name = document.createElement('span');
    name.textContent = c;
    b.append(img, name);
    return b;
  }));

  const anyStyle = (season) => Object.keys(STYLES).some((st) => hasScene(st, draft.city, season));
  $('seasons').replaceChildren(...SEASONS.map((s) =>
    pressBtn(s, draft.season === s, !anyStyle(s), () => {
      Object.assign(draft, nearestScene({ ...draft, season: s }));
      renderPicker();
    })
  ));

  $('styles').replaceChildren(...Object.entries(STYLES).map(([id, st]) => {
    const b = pressBtn('', draft.style === id, !hasScene(id, draft.city, draft.season), () => {
      draft.style = id;
      renderPicker();
    });
    const dot = document.createElement('i');
    dot.style.background = `linear-gradient(135deg, ${st.swatch[0]} 50%, ${st.swatch[1]} 50%)`;
    const name = document.createElement('span');
    name.textContent = st.name;
    b.append(dot, name);
    return b;
  }));
}

$('cityBtn').addEventListener('click', openPicker);
$('backdrop').addEventListener('click', closePicker);
$('rideBtn').addEventListener('click', () => {
  const changed = draft.style !== ride.style || draft.city !== ride.city || draft.season !== ride.season;
  Object.assign(ride, draft);
  write();
  closePicker();
  if (changed) { applyTheme(); showScene(); }
});

// ---------- Keep the screen awake ----------
let lock = null;
async function stayAwake() {
  try {
    if ('wakeLock' in navigator && !lock && !document.hidden) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    }
  } catch {}
}
addEventListener('pointerdown', stayAwake, { once: false, passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { stayAwake(); poll(); }
});

// ---------- Start ----------
(async () => {
  try { await spotify.handleRedirect(); } catch { toast('Spotify sign-in didn’t finish. Try again.'); }
  applyTheme();
  setMode(ride.mode);
  showScene();
  renderTrack(null);
  poll();
  requestAnimationFrame(frame);
  setTimeout(pole, 3000);
})();
