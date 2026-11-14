'use strict';

/* MattStream - web client */

const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

const state = {
  items: [],
  progress: {},
  status: null,
  view: 'home',
  search: '',
  sort: 'added',
  derived: null,
  poll: null,
};

/* ---------------- tv remotes and touch ---------------- */

// Android TV, Fire TV, smart-TV browsers report themselves here.
const TV_UA = /(Android TV|Google TV|SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|AFT[0-9A-Z]|Fire ?TV|HbbTV|Roku|Viera|PhilipsTV|BombayTV|Opera TV)/i;

function detectTvMode() {
  try {
    const forced = new URLSearchParams(location.search).get('tv');
    if (forced === '1') return true;
    if (forced === '0') return false;
    const stored = localStorage.getItem('mattstream-tv');
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch (err) {
    /* private mode: fall through to detection */
  }
  if (TV_UA.test(navigator.userAgent)) return true;
  // A screen with no hover and no pointer at all is a remote, not a phone.
  return Boolean(window.matchMedia && window.matchMedia('(hover: none) and (pointer: none)').matches);
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusScope() {
  const playerLayer = $('#playerLayer');
  const dialogLayer = $('#dialogLayer');
  if (playerLayer && !playerLayer.hidden) return playerLayer;
  if (dialogLayer && !dialogLayer.hidden) return dialogLayer;
  return document.body;
}

function focusableInScope(includeOffscreen) {
  const scope = focusScope();
  return $$(FOCUSABLE, scope).filter((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (includeOffscreen) return true;
    return rect.bottom > 0 && rect.top < window.innerHeight + 40;
  });
}

function centre(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// TV browsers do not always report :focus reliably, so the focused element is
// tagged explicitly and the stylesheet draws the ring from that class.
function markFocused(node) {
  for (const previous of $$('.dpad-focus')) previous.classList.remove('dpad-focus');
  if (node && node.classList && !node.classList.contains('dpad-focus')) node.classList.add('dpad-focus');
}

// D-pad spatial navigation: pick the closest element in the pressed direction.
function moveFocus(direction) {
  const items = focusableInScope();
  if (!items.length) return;
  const active = document.activeElement;
  if (!active || !items.includes(active)) {
    // Start in the content, not in the header, the way a TV app should.
    const preferred =
      items.find((node) => node.classList.contains('card') || node.classList.contains('episode')) ||
      items.find((node) => node.closest('#main')) ||
      items[0];
    preferred.focus({ preventScroll: true });
    preferred.scrollIntoView({ block: 'nearest' });
    markFocused(preferred);
    return;
  }
  const from = centre(active.getBoundingClientRect());

  const nearest = (candidates) => {
    let best = null;
    let bestScore = Infinity;
    for (const node of candidates) {
      if (node === active) continue;
      const point = centre(node.getBoundingClientRect());
      const dx = point.x - from.x;
      const dy = point.y - from.y;
      let primary;
      let secondary;
      if (direction === 'left') {
        primary = -dx;
        secondary = Math.abs(dy);
      } else if (direction === 'right') {
        primary = dx;
        secondary = Math.abs(dy);
      } else if (direction === 'up') {
        primary = -dy;
        secondary = Math.abs(dx);
      } else {
        primary = dy;
        secondary = Math.abs(dx);
      }
      if (primary <= 4) continue;
      const score = primary + secondary * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  };

  // The next rail is often below the fold, so a press down must look past the
  // visible rows instead of trapping the remote on the current one.
  const best = nearest(items) || nearest(focusableInScope(true));
  if (!best) return;
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  markFocused(best);
}

function isTypingTarget(node) {
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

/* ---------------- helpers ---------------- */

async function api(pathname, options) {
  const opts = Object.assign({}, options);
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers);
  }
  const res = await fetch(pathname, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  if (!res.ok) throw new Error((data && data.error) || res.status + ' ' + res.statusText);
  return data;
}

function hueFor(text) {
  let hash = 0;
  const str = String(text || 'mattstream');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 360000;
  return hash % 360;
}

function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (!total) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours) return hours + 'h' + (minutes ? ' ' + minutes + 'm' : '');
  return Math.max(1, minutes) + 'm';
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return (hours ? hours + ':' + mm : String(minutes)) + ':' + ss;
}

function resolutionLabel(width, height) {
  if (!height) return '';
  if (height >= 2000) return '4K';
  if (height >= 1000) return '1080p';
  if (height >= 700) return '720p';
  if (height >= 400) return '480p';
  return height + 'p';
}

function codecLabel(codec) {
  if (!codec) return '';
  const map = {
    h264: 'H.264', hevc: 'HEVC', h265: 'H.265', av1: 'AV1', vp9: 'VP9', vp8: 'VP8',
    mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2', wmv3: 'WMV3', vc1: 'VC-1', theora: 'Theora',
    aac: 'AAC', ac3: 'AC-3', eac3: 'E-AC-3', dts: 'DTS', mp3: 'MP3', opus: 'Opus',
    flac: 'FLAC', vorbis: 'Vorbis', truehd: 'TrueHD', pcm_s16le: 'PCM',
  };
  return map[codec] || codec.toUpperCase();
}

const PLAYBACK_LABEL = {
  direct: 'Direct play',
  remux: 'Repackaged live',
  transcode: 'Live transcode',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function pill(text, variant) {
  return el('span', 'pill' + (variant ? ' is-' + variant : ''), text);
}

let toastTimer = null;
function toast(message, isError) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
}

/* ---------------- library derivation ---------------- */

function derive() {
  const movies = [];
  const shows = new Map();
  const episodes = [];

  for (const item of state.items) {
    if (item.kind === 'episode') {
      episodes.push(item);
      const key = (item.series || item.title || 'unknown').toLowerCase() + '|' + (item.libraryId || '');
      let show = shows.get(key);
      if (!show) {
        show = {
          key,
          name: item.series || item.title || 'Unknown series',
          episodes: [],
          seasons: new Map(),
          libraryId: item.libraryId,
        };
        shows.set(key, show);
      }
      show.episodes.push(item);
      const season = item.season || 1;
      if (!show.seasons.has(season)) show.seasons.set(season, []);
      show.seasons.get(season).push(item);
    } else {
      movies.push(item);
    }
  }

  const showList = [];
  for (const show of shows.values()) {
    show.episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    show.seasonNumbers = Array.from(show.seasons.keys()).sort((a, b) => a - b);
    for (const season of show.seasonNumbers) {
      show.seasons.get(season).sort((a, b) => a.episode - b.episode);
    }
    show.artItem = show.episodes.find((ep) => ep.posterPath) || show.episodes[0];
    show.backdropItem = show.episodes.find((ep) => ep.backdropPath) || show.artItem;
    show.addedAt = show.episodes.reduce((max, ep) => Math.max(max, ep.addedAt || 0), 0);
    const withYear = show.episodes.find((ep) => ep.year);
    show.year = withYear ? withYear.year : null;
    showList.push(show);
  }

  movies.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  showList.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  state.derived = { movies, shows: showList, episodes };
  return state.derived;
}

function progressFor(item) {
  const entry = state.progress[item.id];
  if (!entry || !entry.position) return null;
  const duration = entry.duration || item.duration || 0;
  if (!duration) return null;
  if (entry.position / duration > 0.96) return null;
  return { position: entry.position, duration, percent: Math.min(100, (entry.position / duration) * 100) };
}

/* ---------------- cards ---------------- */

function posterFallback(title, subtitle) {
  const wrap = el('div', 'poster-fallback');
  wrap.appendChild(el('strong', null, title));
  if (subtitle) wrap.appendChild(el('em', null, subtitle));
  return wrap;
}

function posterNode(artItem, title, options) {
  const opts = options || {};
  const poster = el('div', 'poster');
  poster.style.setProperty('--hue', hueFor(artItem && artItem.id ? artItem.id : title));
  if (artItem && artItem.posterPath) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = '/api/art/' + encodeURIComponent(artItem.id) + '?k=poster';
    img.addEventListener('error', () => {
      img.remove();
      poster.appendChild(posterFallback(title, opts.subtitle));
    });
    poster.appendChild(img);
  } else {
    poster.appendChild(posterFallback(title, opts.subtitle));
  }
  if (opts.badge) {
    poster.appendChild(el('span', 'poster-badge' + (opts.badgeClass ? ' ' + opts.badgeClass : ''), opts.badge));
  }
  if (opts.percent) {
    const bar = el('div', 'card-progress');
    const fill = el('i');
    fill.style.width = opts.percent + '%';
    bar.appendChild(fill);
    poster.appendChild(bar);
  }
  return poster;
}

function makeCard(opts) {
  const card = el('button', 'card');
  card.type = 'button';
  card.appendChild(posterNode(opts.artItem, opts.title, opts));
  card.appendChild(el('div', 'card-title', opts.title));
  if (opts.sub) card.appendChild(el('div', 'card-sub', opts.sub));
  card.addEventListener('click', opts.onClick);
  return card;
}

function railSection(title, subtitle, cards) {
  const section = el('section', 'rail');
  const head = el('div', 'rail-head');
  head.appendChild(el('h2', null, title));
  if (subtitle) head.appendChild(el('span', null, subtitle));
  section.appendChild(head);
  const track = el('div', 'rail-track');
  for (const card of cards) track.appendChild(card);
  section.appendChild(track);
  return section;
}

/* ---------------- views ---------------- */

function updateNav() {
  for (const button of $$('#nav button')) {
    button.classList.toggle('is-active', button.dataset.view === state.view && !state.search.trim());
  }
}

function emptyState() {
  const wrap = el('div', 'empty');
  const icon = el('div', 'empty-icon');
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 5a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9 1v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  wrap.appendChild(icon);

  const hasLibraries = Boolean(state.status && state.status.libraries && state.status.libraries.length);
  wrap.appendChild(el('h2', null, hasLibraries ? 'No videos found yet' : 'Welcome to MattStream'));
  wrap.appendChild(
    el(
      'p',
      null,
      hasLibraries
        ? 'MattStream looked through your folders and found nothing it can play yet. Add another folder, or drop some video files in and rescan.'
        : 'Point MattStream at the folders where your movies and shows live. It reads the files, gives them a proper shelf, and streams them to any screen in the house.'
    )
  );

  if (!hasLibraries) {
    const steps = el('ol', 'steps');
    steps.appendChild(el('li', null, 'Add the folder your videos are in, or pick individual files - MP4, MKV, AVI, MOV, WebM, WMV, anything.'));
    steps.appendChild(el('li', null, 'MattStream builds your shelf automatically, with artwork if you keep a poster.jpg beside the film.'));
    steps.appendChild(el('li', null, 'Watch here, or open the network address on your TV, phone or tablet.'));
    wrap.appendChild(steps);
  }

  const actions = el('div', 'hero-actions');
  actions.style.justifyContent = 'center';
  const addBtn = el('button', 'btn is-primary');
  addBtn.type = 'button';
  addBtn.textContent = hasLibraries ? 'Add more videos or folders' : 'Add videos or folders';
  addBtn.addEventListener('click', openFoldersDialog);
  actions.appendChild(addBtn);

  if (hasLibraries) {
    const rescan = el('button', 'btn is-ghost');
    rescan.type = 'button';
    rescan.textContent = 'Rescan folders';
    rescan.addEventListener('click', triggerScan);
    actions.appendChild(rescan);
  }
  wrap.appendChild(actions);
  return wrap;
}

function heroSection(item) {
  const isEpisode = item.kind === 'episode';
  const title = isEpisode ? item.series || item.title : item.title;
  const hero = el('section', 'hero');

  const bg = el('div', 'hero-bg');
  if (item.backdropPath || item.posterPath) {
    bg.style.backgroundImage =
      "url('/api/art/" + encodeURIComponent(item.id) + '?k=' + (item.backdropPath ? 'backdrop' : 'poster') + "')";
  } else {
    bg.style.background =
      'radial-gradient(90% 120% at 25% 10%, hsl(' + hueFor(item.id) + ' 65% 34%), #0a0a10 70%)';
  }
  hero.appendChild(bg);

  const inner = el('div', 'hero-inner');
  inner.appendChild(el('div', 'hero-kicker', 'Ready on MattStream'));
  inner.appendChild(el('h1', null, title || 'Untitled'));

  const meta = el('div', 'hero-meta');
  if (isEpisode) meta.appendChild(pill('S' + item.season + ' E' + item.episode));
  if (item.year) meta.appendChild(pill(String(item.year)));
  if (item.duration) meta.appendChild(pill(formatDuration(item.duration)));
  const res = resolutionLabel(item.width, item.height);
  if (res) meta.appendChild(pill(res));
  if (!isEpisode && item.container) meta.appendChild(pill(item.container.toUpperCase()));
  const watched = progressFor(item);
  if (watched) meta.appendChild(pill(Math.round(watched.percent) + '% watched', 'accent'));
  inner.appendChild(meta);

  const actions = el('div', 'hero-actions');
  const playBtn = el('button', 'btn is-primary');
  playBtn.type = 'button';
  playBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><span></span>';
  $('span', playBtn).textContent = watched ? 'Resume' : 'Play';
  playBtn.addEventListener('click', () => openPlayer(item, watched ? watched.position : null));
  actions.appendChild(playBtn);

  const infoBtn = el('button', 'btn is-ghost');
  infoBtn.type = 'button';
  infoBtn.textContent = 'More info';
  infoBtn.addEventListener('click', () => (isEpisode ? openShowByItem(item) : openMovieDialog(item)));
  actions.appendChild(infoBtn);
  inner.appendChild(actions);

  hero.appendChild(inner);
  return hero;
}

function viewHome() {
  const wrap = document.createDocumentFragment();
  if (!state.items.length) {
    wrap.appendChild(emptyState());
    return wrap;
  }

  const { movies, shows } = state.derived;

  const heroCandidates = movies.concat(shows.map((show) => show.episodes[0]));
  const hero =
    heroCandidates.find((item) => item.backdropPath) ||
    heroCandidates.find((item) => item.posterPath) ||
    heroCandidates[0];
  if (hero) wrap.appendChild(heroSection(hero));

  const watching = Object.keys(state.progress)
    .map((id) => ({ entry: state.progress[id], item: state.items.find((it) => it.id === id) }))
    .filter((row) => row.item && progressFor(row.item))
    .sort((a, b) => (b.entry.updated || 0) - (a.entry.updated || 0))
    .slice(0, 14);

  if (watching.length) {
    const cards = watching.map(({ item }) => {
      const watched = progressFor(item);
      const isEpisode = item.kind === 'episode';
      const left = formatDuration((watched.duration || 0) - watched.position);
      return makeCard({
        title: isEpisode ? item.series : item.title,
        sub: isEpisode ? 'S' + item.season + ' E' + item.episode + (left ? ' · ' + left + ' left' : '') : left + ' left',
        artItem: item,
        percent: watched.percent,
        onClick: () => openPlayer(item, watched.position),
      });
    });
    wrap.appendChild(railSection('Continue watching', watching.length + ' in progress', cards));
  }

  const recent = state.items.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 18);
  if (recent.length) {
    wrap.appendChild(
      railSection(
        'Recently added',
        'Fresh in your library',
        recent.map((item) => {
          const watched = progressFor(item);
          return makeCard({
            title: item.kind === 'episode' ? item.series : item.title,
            sub: item.kind === 'episode' ? 'S' + item.season + ' E' + item.episode : formatDuration(item.duration),
            artItem: item,
            percent: watched ? watched.percent : 0,
            onClick: () => (item.kind === 'episode' ? openShowByItem(item) : openMovieDialog(item)),
          });
        })
      )
    );
  }

  if (movies.length) {
    wrap.appendChild(
      railSection(
        'Movies',
        movies.length + ' film' + (movies.length === 1 ? '' : 's'),
        movies.slice(0, 18).map((item) => {
          const watched = progressFor(item);
          return makeCard({
            title: item.title,
            sub: [item.year, formatDuration(item.duration)].filter(Boolean).join(' · '),
            artItem: item,
            percent: watched ? watched.percent : 0,
            onClick: () => openMovieDialog(item),
          });
        })
      )
    );
  }

  if (shows.length) {
    wrap.appendChild(
      railSection(
        'Series',
        shows.length + ' show' + (shows.length === 1 ? '' : 's'),
        shows.slice(0, 18).map((show) =>
          makeCard({
            title: show.name,
            sub: show.episodes.length + ' episode' + (show.episodes.length === 1 ? '' : 's'),
            artItem: show.artItem,
            onClick: () => openShowDialog(show),
          })
        )
      )
    );
  }

  return wrap;
}

function sortMovies(list) {
  const sorted = list.slice();
  if (state.sort === 'title') {
    sorted.sort((a, b) => (a.sortTitle || '').localeCompare(b.sortTitle || ''));
  } else if (state.sort === 'year') {
    sorted.sort((a, b) => (b.year || 0) - (a.year || 0) || (a.sortTitle || '').localeCompare(b.sortTitle || ''));
  } else {
    sorted.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return sorted;
}

function viewMovies() {
  const wrap = document.createDocumentFragment();
  const { movies } = state.derived;
  const head = el('div', 'section-head');
  head.appendChild(el('h1', null, 'Movies'));
  head.appendChild(el('span', 'count', movies.length + ' film' + (movies.length === 1 ? '' : 's')));
  const spacer = el('div', 'spacer');
  const select = el('select', 'control');
  for (const pair of [['added', 'Recently added'], ['title', 'Title A-Z'], ['year', 'Newest release']]) {
    const option = el('option', null, pair[1]);
    option.value = pair[0];
    if (state.sort === pair[0]) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    state.sort = select.value;
    render();
  });
  spacer.appendChild(select);
  head.appendChild(spacer);
  wrap.appendChild(head);

  if (!movies.length) {
    const note = el('p', null, 'No films yet. Episodes land under Series.');
    note.style.color = 'var(--muted)';
    wrap.appendChild(note);
    return wrap;
  }

  const grid = el('div', 'grid');
  for (const item of sortMovies(movies)) {
    const watched = progressFor(item);
    grid.appendChild(
      makeCard({
        title: item.title,
        sub: [item.year, formatDuration(item.duration)].filter(Boolean).join(' · '),
        artItem: item,
        percent: watched ? watched.percent : 0,
        onClick: () => openMovieDialog(item),
      })
    );
  }
  wrap.appendChild(grid);
  return wrap;
}

function viewSeries() {
  const wrap = document.createDocumentFragment();
  const { shows } = state.derived;
  const head = el('div', 'section-head');
  head.appendChild(el('h1', null, 'Series'));
  head.appendChild(el('span', 'count', shows.length + ' show' + (shows.length === 1 ? '' : 's')));
  wrap.appendChild(head);

  if (!shows.length) {
    const note = el('p', null, 'No shows yet. Name files like "Show S01E02.mkv" and rescan.');
    note.style.color = 'var(--muted)';
    wrap.appendChild(note);
    return wrap;
  }

  const grid = el('div', 'grid');
  for (const show of shows) {
    const seasonCount = show.seasonNumbers.length;
    grid.appendChild(
      makeCard({
        title: show.name,
        sub: seasonCount + ' season' + (seasonCount === 1 ? '' : 's') + ' · ' + show.episodes.length + ' ep',
        artItem: show.artItem,
        onClick: () => openShowDialog(show),
      })
    );
  }
  wrap.appendChild(grid);
  return wrap;
}

function viewSearch() {
  const wrap = document.createDocumentFragment();
  const query = state.search.trim().toLowerCase();
  const { movies, shows, episodes } = state.derived;

  const matchedMovies = movies.filter((item) => (item.title || '').toLowerCase().includes(query));
  const matchedShows = shows.filter((show) => show.name.toLowerCase().includes(query));
  const looseEpisodes = episodes.filter(
    (item) =>
      (item.title || '').toLowerCase().includes(query) &&
      !matchedShows.some((show) => show.episodes.includes(item))
  );

  const head = el('div', 'section-head');
  head.appendChild(el('h1', null, 'Search'));
  head.appendChild(el('span', 'count', '"' + state.search.trim() + '"'));
  wrap.appendChild(head);

  if (!matchedMovies.length && !matchedShows.length && !looseEpisodes.length) {
    const note = el('p', null, 'Nothing in your library matches that yet.');
    note.style.color = 'var(--muted)';
    wrap.appendChild(note);
    return wrap;
  }

  const grid = el('div', 'grid');
  for (const show of matchedShows) {
    grid.appendChild(
      makeCard({
        title: show.name,
        sub: show.episodes.length + ' episodes',
        artItem: show.artItem,
        onClick: () => openShowDialog(show),
      })
    );
  }
  for (const item of matchedMovies) {
    const watched = progressFor(item);
    grid.appendChild(
      makeCard({
        title: item.title,
        sub: [item.year, formatDuration(item.duration)].filter(Boolean).join(' · '),
        artItem: item,
        percent: watched ? watched.percent : 0,
        onClick: () => openMovieDialog(item),
      })
    );
  }
  for (const item of looseEpisodes) {
    grid.appendChild(
      makeCard({
        title: item.series + ' · ' + item.title,
        sub: 'S' + item.season + ' E' + item.episode,
        artItem: item,
        onClick: () => openPlayer(item, null),
      })
    );
  }
  wrap.appendChild(grid);
  return wrap;
}

function render() {
  const main = $('#main');
  main.innerHTML = '';
  derive();
  const fragment = state.search.trim()
    ? viewSearch()
    : state.view === 'movies'
      ? viewMovies()
      : state.view === 'series'
        ? viewSeries()
        : viewHome();
  main.appendChild(fragment);
  updateNav();
  updateScanButton();
}

/* ---------------- dialogs ---------------- */

// Android TV's Back button is the browser back button, so overlays push a
// history entry and close themselves when it is pressed.
let closingFromPop = false;
// Set while we undo our own history entry, so the pop it causes does not close
// an overlay that has just been reopened (for example after a removal).
let suppressPop = false;

function pushBackGuard() {
  if (history.state && history.state.mattstream) return;
  try {
    history.pushState({ mattstream: true }, '');
  } catch (err) {
    /* history is unavailable in some embedded browsers */
  }
}

function releaseBackGuard() {
  if (closingFromPop) return;
  if (history.state && history.state.mattstream) {
    suppressPop = true;
    setTimeout(() => {
      suppressPop = false;
    }, 600);
    try {
      history.back();
    } catch (err) {
      suppressPop = false;
    }
  }
}

function closeDialog() {
  const layer = $('#dialogLayer');
  releaseBackGuard();
  layer.hidden = true;
  layer.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

function openDialog(dialog) {
  const layer = $('#dialogLayer');
  pushBackGuard();
  layer.innerHTML = '';
  layer.appendChild(dialog);
  layer.hidden = false;
  document.body.classList.add('no-scroll');
  const focusTarget = $('button, select, input', dialog);
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

function dialogShell(wide) {
  const dialog = el('div', 'dialog' + (wide ? ' is-wide' : ''));
  const close = el('button', 'dialog-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeDialog);
  dialog.appendChild(close);
  return dialog;
}

function metaPillsFor(item) {
  const meta = el('div', 'meta');
  if (item.kind === 'episode') meta.appendChild(pill('S' + item.season + ' E' + item.episode, 'accent'));
  if (item.year) meta.appendChild(pill(String(item.year)));
  if (item.duration) meta.appendChild(pill(formatDuration(item.duration)));
  const res = resolutionLabel(item.width, item.height);
  if (res) meta.appendChild(pill(res));
  if (item.playback === 'direct') meta.appendChild(pill('Plays natively', 'good'));
  else if (item.playback === 'remux') meta.appendChild(pill('Repackaged live'));
  else meta.appendChild(pill('Transcodes live'));
  return meta;
}

// Removes a video from the shelf only - the file on disk is never touched.
async function removeFromLibrary(item) {
  try {
    await api('/api/hide', { method: 'POST', body: { id: item.id } });
    closeDialog();
    await refreshLibrary();
    toast('Removed "' + (item.title || 'video') + '" from MattStream - the file is still on disk');
  } catch (err) {
    toast(err.message, true);
  }
}

// A destructive-looking button that needs a second click to commit.
function twoStepButton(initialLabel, confirmLabel, onConfirm) {
  const button = el('button', 'btn is-danger');
  button.type = 'button';
  button.textContent = initialLabel;
  let armed = false;
  let timer = null;

  const reset = () => {
    armed = false;
    clearTimeout(timer);
    button.textContent = initialLabel;
    button.classList.remove('is-armed');
  };

  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      button.classList.add('is-armed');
      timer = setTimeout(reset, 4000);
      return;
    }
    clearTimeout(timer);
    button.disabled = true;
    await onConfirm();
  });
  return button;
}

function detailRow(label, value, mono) {
  const row = el('div', 'detail-row');
  row.appendChild(el('span', null, label));
  row.appendChild(el('span', mono ? 'mono' : null, value || ''));
  return row;
}

function openMovieDialog(item) {
  const dialog = dialogShell(false);
  const watched = progressFor(item);

  const heroImg = el('div', 'dialog-hero');
  if (item.backdropPath || item.posterPath) {
    heroImg.style.backgroundImage =
      "url('/api/art/" + encodeURIComponent(item.id) + '?k=' + (item.backdropPath ? 'backdrop' : 'poster') + "')";
  } else {
    heroImg.style.background =
      'radial-gradient(90% 120% at 20% 0%, hsl(' + hueFor(item.id) + ' 60% 30%), #0d0d14 70%)';
  }
  dialog.appendChild(heroImg);

  const body = el('div', 'dialog-body');
  const head = el('div', 'dialog-head');

  const poster = el('div', 'dialog-poster');
  if (item.posterPath) {
    const img = document.createElement('img');
    img.src = '/api/art/' + encodeURIComponent(item.id) + '?k=poster';
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      poster.appendChild(posterFallback(item.title, ''));
    });
    poster.appendChild(img);
  } else {
    poster.appendChild(posterFallback(item.title, item.year ? String(item.year) : ''));
  }
  head.appendChild(poster);

  const titles = el('div', 'dialog-titles');
  titles.appendChild(el('h2', null, item.title));
  titles.appendChild(metaPillsFor(item));

  const actions = el('div', 'dialog-actions');
  const playBtn = el('button', 'btn is-primary');
  playBtn.type = 'button';
  playBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><span></span>';
  $('span', playBtn).textContent = watched ? 'Resume from ' + formatClock(watched.position) : 'Play';
  playBtn.addEventListener('click', () => openPlayer(item, watched ? watched.position : null));
  actions.appendChild(playBtn);

  if (watched) {
    const restart = el('button', 'btn is-ghost', 'Start over');
    restart.type = 'button';
    restart.addEventListener('click', () => openPlayer(item, 0));
    actions.appendChild(restart);
  }
  actions.appendChild(
    twoStepButton('Remove from MattStream', 'Remove? The file stays on disk', () => removeFromLibrary(item))
  );
  titles.appendChild(actions);
  head.appendChild(titles);
  body.appendChild(head);

  const info = el('div', 'detail-block');
  info.appendChild(el('h3', null, 'File'));
  const rows = el('div', 'detail-rows');
  rows.appendChild(detailRow('Format', (item.container || '').toUpperCase() || 'Unknown'));
  rows.appendChild(
    detailRow('Video', [codecLabel(item.videoCodec), item.width + '×' + item.height].filter(Boolean).join(' · ') || 'Unknown')
  );
  rows.appendChild(
    detailRow(
      'Audio',
      [codecLabel(item.audioCodec), item.audioChannels ? item.audioChannels + ' ch' : ''].filter(Boolean).join(' · ') || 'Unknown'
    )
  );
  rows.appendChild(detailRow('Size', item.sizeLabel));
  rows.appendChild(detailRow('Playback', PLAYBACK_LABEL[item.playback] || 'Direct play'));
  rows.appendChild(detailRow('Added', item.addedAt ? new Date(item.addedAt).toLocaleDateString() : ''));
  rows.appendChild(detailRow('Library', item.libraryName));
  info.appendChild(rows);
  const pathBlock = el('div', 'detail-rows');
  pathBlock.style.marginTop = '10px';
  pathBlock.appendChild(detailRow('Path', item.path, true));
  info.appendChild(pathBlock);
  body.appendChild(info);

  if (item.subtitles && item.subtitles.length) {
    const subs = el('div', 'detail-block');
    subs.appendChild(el('h3', null, 'Subtitles'));
    const list = el('div', 'detail-rows');
    for (const sub of item.subtitles) list.appendChild(detailRow(sub.label || 'Track ' + (sub.index + 1), sub.code || 'auto'));
    subs.appendChild(list);
    body.appendChild(subs);
  }

  dialog.appendChild(body);
  openDialog(dialog);
}

function episodeRow(item) {
  const wrap = el('div', 'episode-row');
  const row = el('button', 'episode');
  row.type = 'button';
  row.appendChild(el('div', 'episode-num', 'E' + item.episode));
  const info = el('div', 'episode-info');
  info.appendChild(el('strong', null, item.title || 'Episode ' + item.episode));
  info.appendChild(
    el('span', null, [formatDuration(item.duration), item.container ? item.container.toUpperCase() : ''].filter(Boolean).join(' · '))
  );
  const watched = progressFor(item);
  if (watched) {
    const bar = el('div', 'card-progress');
    const fill = el('i');
    fill.style.width = watched.percent + '%';
    bar.appendChild(fill);
    info.appendChild(bar);
  }
  row.appendChild(info);
  const play = el('div', 'episode-play');
  play.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  row.appendChild(play);
  row.addEventListener('click', () => openPlayer(item, watched ? watched.position : null));

  const remove = twoStepButton('×', 'Remove?', () => removeFromLibrary(item));
  remove.classList.add('episode-remove');
  remove.title = 'Remove this episode from MattStream (the file stays on disk)';

  wrap.appendChild(row);
  wrap.appendChild(remove);
  return wrap;
}

function openShowDialog(show) {
  const dialog = dialogShell(false);
  const heroImg = el('div', 'dialog-hero');
  const art = show.backdropItem || show.artItem;
  if (art && (art.backdropPath || art.posterPath)) {
    heroImg.style.backgroundImage =
      "url('/api/art/" + encodeURIComponent(art.id) + '?k=' + (art.backdropPath ? 'backdrop' : 'poster') + "')";
  } else {
    heroImg.style.background =
      'radial-gradient(90% 120% at 20% 0%, hsl(' + hueFor(show.key) + ' 60% 30%), #0d0d14 70%)';
  }
  dialog.appendChild(heroImg);

  const body = el('div', 'dialog-body');
  const head = el('div', 'dialog-head');
  const poster = el('div', 'dialog-poster');
  if (show.artItem && show.artItem.posterPath) {
    const img = document.createElement('img');
    img.src = '/api/art/' + encodeURIComponent(show.artItem.id) + '?k=poster';
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      poster.appendChild(posterFallback(show.name, ''));
    });
    poster.appendChild(img);
  } else {
    poster.appendChild(posterFallback(show.name, show.episodes.length + ' episodes'));
  }
  head.appendChild(poster);

  const titles = el('div', 'dialog-titles');
  titles.appendChild(el('h2', null, show.name));
  const meta = el('div', 'meta');
  meta.appendChild(pill(show.seasonNumbers.length + ' season' + (show.seasonNumbers.length === 1 ? '' : 's')));
  meta.appendChild(pill(show.episodes.length + ' episode' + (show.episodes.length === 1 ? '' : 's')));
  if (show.artItem && show.artItem.width) meta.appendChild(pill(resolutionLabel(show.artItem.width, show.artItem.height)));
  titles.appendChild(meta);

  const resumable = show.episodes.find((ep) => progressFor(ep));
  const next = resumable || show.episodes[0];
  const actions = el('div', 'dialog-actions');
  const playBtn = el('button', 'btn is-primary');
  playBtn.type = 'button';
  playBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><span></span>';
  $('span', playBtn).textContent = resumable
    ? 'Resume S' + next.season + ' E' + next.episode
    : 'Play first episode';
  playBtn.addEventListener('click', () => {
    if (next) openPlayer(next, resumable ? progressFor(next).position : null);
  });
  actions.appendChild(playBtn);
  titles.appendChild(actions);
  head.appendChild(titles);
  body.appendChild(head);

  const block = el('div', 'detail-block');
  const tabs = el('div', 'season-tabs');
  const list = el('div', 'episode-list');

  const showSeason = (seasonNumber) => {
    list.innerHTML = '';
    for (const episode of show.seasons.get(seasonNumber) || []) list.appendChild(episodeRow(episode));
    for (const button of $$('button', tabs)) {
      button.classList.toggle('is-active', Number(button.dataset.season) === seasonNumber);
    }
  };

  for (const seasonNumber of show.seasonNumbers) {
    const button = el('button', null, 'Season ' + seasonNumber);
    button.type = 'button';
    button.dataset.season = String(seasonNumber);
    button.addEventListener('click', () => showSeason(seasonNumber));
    tabs.appendChild(button);
  }
  block.appendChild(tabs);
  block.appendChild(list);
  body.appendChild(block);
  dialog.appendChild(body);
  openDialog(dialog);

  showSeason(resumable ? resumable.season || 1 : show.seasonNumbers[0] || 1);
}

function openShowByItem(item) {
  const show = state.derived.shows.find((candidate) => candidate.episodes.includes(item));
  if (show) openShowDialog(show);
  else openMovieDialog(item);
}

/* ---------------- folders + server info ---------------- */

// Adds a folder, or one video file, to the library.
async function addLibraryPath(target) {
  const value = String(target || '').trim();
  if (!value) return;
  try {
    await api('/api/libraries', { method: 'POST', body: { path: value } });
    closeDialog();
    toast('Added "' + value + '" - scanning now');
    startPolling();
  } catch (err) {
    toast(err.message, true);
  }
}

const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" fill="currentColor"/></svg>';
const FILE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm8 1v4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 11.5v5l4-2.5z" fill="currentColor"/></svg>';

function fillBrowserList(container, data, onPickFile) {
  container.innerHTML = '';
  const entries = [];
  for (const show of data.shows || []) entries.push({ label: show, path: show });
  for (const dir of data.dirs || []) entries.push({ label: dir.name, path: dir.path });
  for (const file of data.files || []) {
    entries.push({ label: file.name, path: file.path, file: true, sizeLabel: file.sizeLabel });
  }

  if (!entries.length) {
    container.appendChild(el('div', 'browser-empty', 'No subfolders or video files here.'));
    return;
  }

  for (const entry of entries) {
    const button = el('button', 'browser-item' + (entry.file ? ' is-file' : ''));
    button.type = 'button';
    button.dataset.path = entry.path;
    button.innerHTML = entry.file ? FILE_ICON : FOLDER_ICON;
    button.appendChild(el('span', null, entry.label));
    const meta = el('span', 'entry-meta');
    if (entry.sizeLabel) meta.appendChild(el('span', null, entry.sizeLabel));
    meta.appendChild(el('span', 'entry-add', entry.file ? 'Choose' : 'Open'));
    button.appendChild(meta);

    button.addEventListener('click', () => {
      if (entry.file) {
        // Selecting a file puts its full path in the box, ready to add.
        if (onPickFile) onPickFile(entry);
        return;
      }
      loadBrowse(entry.path);
    });

    if (entry.file) button.addEventListener('dblclick', () => addLibraryPath(entry.path));
    container.appendChild(button);
  }
}

async function loadBrowse(targetPath) {
  const dialog = $('#dialogLayer .dialog');
  if (!dialog) return;
  const list = $('#browserList', dialog);
  const pathLabel = $('#browserPath', dialog);
  const upBtn = $('#browserUp', dialog);
  const addBtn = $('#browserAdd', dialog);
  const input = $('#manualPath', dialog);

  try {
    const data = await api('/api/browse?path=' + encodeURIComponent(targetPath || ''));
    fillBrowserList(list, data, (entry) => {
      if (input) {
        input.value = entry.path;
        input.focus();
      }
      for (const row of $$('.browser-item', list)) {
        row.classList.toggle('is-selected', row.dataset.path === entry.path);
      }
      addBtn.dataset.path = entry.path;
      addBtn.disabled = false;
      addBtn.textContent = 'Add this file';
    });
    pathLabel.textContent = data.path || 'This PC';
    pathLabel.title = data.path || '';
    upBtn.dataset.parent = data.parent || '';
    upBtn.disabled = !data.parent;
    addBtn.dataset.path = data.path || '';
    addBtn.disabled = !data.path;
    addBtn.textContent = 'Add this folder';
    if (input && data.path) input.value = data.path;
  } catch (err) {
    toast(err.message, true);
  }
}

async function openFoldersDialog() {
  const dialog = dialogShell(true);
  const section = el('div', 'dialog-section');
  section.appendChild(el('h2', null, 'Your library'));
  section.appendChild(
    el(
      'p',
      'hint',
      'Add whole folders, or individual video files - both work. MattStream only reads what you add here, and files stay where they are: nothing is copied or uploaded. Removing a video from the shelf never deletes the file.'
    )
  );

  const list = el('div', 'lib-list');
  const libraries = (state.status && state.status.libraries) || [];
  if (!libraries.length) list.appendChild(el('div', 'browser-empty', 'Nothing added yet.'));
  for (const library of libraries) {
    const row = el('div', 'lib-row');
    const icon = library.kind === 'file'
      ? '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm8 1v4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 11.5v5l4-2.5z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" fill="currentColor"/></svg>';
    row.innerHTML = '<span class="lib-icon' + (library.kind === 'file' ? ' is-file' : '') + '">' + icon + '</span>';
    const info = el('div', 'lib-info');
    info.appendChild(el('strong', null, library.name));
    info.appendChild(el('span', null, library.path));
    row.appendChild(info);
    const count = (state.items || []).filter((item) => item.libraryId === library.id).length;
    row.appendChild(el('span', 'lib-count', count === 1 ? '1 video' : count + ' videos'));
    const remove = twoStepButton('Remove', 'Remove?', async () => {
      try {
        await api('/api/libraries/' + encodeURIComponent(library.id), { method: 'DELETE' });
        await refreshLibrary();
        closeDialog();
        openFoldersDialog();
        toast('Removed "' + library.name + '" from MattStream - the files are still on disk');
      } catch (err) {
        toast(err.message, true);
        remove.disabled = false;
        remove.textContent = 'Remove';
        remove.classList.remove('is-armed');
      }
    });
    row.appendChild(remove);
    list.appendChild(row);
  }
  section.appendChild(list);

  const hiddenItems = (state.status && state.status.hidden) || [];
  if (hiddenItems.length) {
    section.appendChild(el('h3', null, 'Removed from your shelf'));
    section.appendChild(el('p', 'hint', 'These are still on your disk. Restore one to put it back on the shelf.'));
    const hiddenList = el('div', 'lib-list');
    for (const entry of hiddenItems) {
      const row = el('div', 'lib-row');
      const icon = el('span', 'lib-icon is-file');
      icon.innerHTML = FILE_ICON;
      row.appendChild(icon);
      const info = el('div', 'lib-info');
      info.appendChild(el('strong', null, entry.title || entry.path));
      info.appendChild(el('span', null, entry.path));
      row.appendChild(info);
      const restore = el('button', 'icon-btn', 'Restore');
      restore.type = 'button';
      restore.addEventListener('click', async () => {
        restore.disabled = true;
        try {
          await api('/api/unhide', { method: 'POST', body: { path: entry.path } });
          await refreshLibrary();
          closeDialog();
          openFoldersDialog();
          toast('Put "' + (entry.title || entry.path) + '" back on the shelf');
        } catch (err) {
          toast(err.message, true);
          restore.disabled = false;
        }
      });
      row.appendChild(restore);
      hiddenList.appendChild(row);
    }
    section.appendChild(hiddenList);
  }

  section.appendChild(el('h3', null, 'Add folders or videos'));
  section.appendChild(
    el(
      'p',
      'hint',
      'Click a folder to open it. Click a video file and its path drops into the box below - press Add, or double-click the file to add it straight away.'
    )
  );
  const browseWrap = el('div', 'browser');
  const bar = el('div', 'browser-bar');
  const upBtn = el('button', 'icon-btn', '↑ Up');
  upBtn.type = 'button';
  upBtn.id = 'browserUp';
  bar.appendChild(upBtn);
  const pathLabel = el('div', 'browser-path', 'This PC');
  pathLabel.id = 'browserPath';
  bar.appendChild(pathLabel);
  browseWrap.appendChild(bar);

  const browserList = el('div', 'browser-list');
  browserList.id = 'browserList';
  browseWrap.appendChild(browserList);

  const footer = el('div', 'browser-actions');
  const addHere = el('button', 'btn is-primary', 'Add this folder');
  addHere.type = 'button';
  addHere.id = 'browserAdd';
  footer.appendChild(addHere);
  const addManual = el('button', 'btn is-ghost', 'Add typed path');
  addManual.type = 'button';
  footer.appendChild(addManual);
  browseWrap.appendChild(footer);
  section.appendChild(browseWrap);

  const manual = document.createElement('input');
  manual.className = 'path-input';
  manual.id = 'manualPath';
  manual.placeholder = 'Or type a path: D:\\Movies or D:\\Movies\\film.mkv';
  manual.spellcheck = false;
  manual.style.marginTop = '10px';
  section.appendChild(manual);

  upBtn.addEventListener('click', () => loadBrowse(upBtn.dataset.parent || ''));
  addHere.addEventListener('click', () => addLibraryPath(addHere.dataset.path));
  addManual.addEventListener('click', () => addLibraryPath(manual.value.trim()));
  manual.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addLibraryPath(manual.value.trim());
    }
  });

  const addressBox = el('div', 'addr-box');
  addressBox.appendChild(el('h3', null, 'Watch from your TV, phone or tablet'));
  addressBox.appendChild(
    el('p', null, 'Open one of these addresses on any device on the same Wi-Fi. Leave the MattStream server window running while you watch.')
  );
  const addresses = el('div', 'addr-list');
  const urls = (state.status && state.status.lanUrls) || [];
  if (urls.length) for (const url of urls) addresses.appendChild(el('span', 'addr', url));
  else addresses.appendChild(el('span', 'addr', 'http://localhost:' + ((state.status && state.status.port) || 8096)));
  addressBox.appendChild(addresses);
  if (state.status && state.status.ffmpeg === false) {
    const warn = el(
      'p',
      null,
      'FFmpeg was not found, so only browser-native MP4 and WebM files will play. Put ffmpeg.exe in the mattstream\\bin folder to unlock every format.'
    );
    warn.style.color = '#ffb3c1';
    addressBox.appendChild(warn);
  }
  section.appendChild(addressBox);

  dialog.appendChild(section);
  openDialog(dialog);
  loadBrowse('');
}

/* ---------------- scanning ---------------- */

function updateScanButton() {
  const button = $('#scanBtn');
  if (!button) return;
  const scanning = Boolean(state.status && state.status.scanning);
  button.classList.toggle('is-busy', scanning);
  const label = $('span', button);
  if (!label) return;
  if (scanning) {
    const progress = state.status.scanTotal ? ' ' + state.status.scanDone + '/' + state.status.scanTotal : '';
    label.textContent = 'Scanning' + progress;
  } else {
    label.textContent = 'Rescan';
  }
}

function stopPolling() {
  if (state.poll) {
    clearInterval(state.poll);
    state.poll = null;
  }
}

function startPolling() {
  if (state.poll) return;
  state.poll = setInterval(async () => {
    try {
      const status = await api('/api/status');
      state.status = status;
      updateScanButton();
      if (!status.scanning) {
        stopPolling();
        await refreshLibrary();
      }
    } catch (err) {
      stopPolling();
    }
  }, 1500);
}

async function triggerScan() {
  try {
    await api('/api/scan', { method: 'POST' });
    state.status = Object.assign({}, state.status, { scanning: true, scanDone: 0, scanTotal: 0 });
    updateScanButton();
    startPolling();
    toast('Looking through your folders...');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- player ---------------- */

const player = {
  item: null,
  mode: 'direct',
  offset: 0,
  duration: 0,
  video: null,
  root: null,
  timer: null,
  hideTimer: null,
  dragging: false,
  restarting: false,
  subtitle: 'off',
};

function bufferEnd(video) {
  if (!video || !video.buffered || !video.buffered.length) return 0;
  return video.buffered.end(video.buffered.length - 1);
}

function absoluteTime() {
  if (!player.video) return 0;
  return player.offset + (player.video.currentTime || 0);
}

function setSpinner(visible) {
  const spinner = $('.player-spinner', player.root);
  if (spinner) spinner.classList.toggle('is-visible', Boolean(visible));
}

function playerError(message) {
  const root = player.root;
  if (!root) return;
  let box = $('.player-error', root);
  if (!message) {
    if (box) box.remove();
    return;
  }
  if (!box) {
    box = el('div', 'player-error');
    root.appendChild(box);
  }
  box.textContent = message;
}

function applySubtitleTrack() {
  const video = player.video;
  if (!video) return;
  for (let i = 0; i < video.textTracks.length; i += 1) video.textTracks[i].mode = 'disabled';
  if (player.subtitle !== 'off') {
    const track = video.textTracks[Number(player.subtitle)];
    if (track) track.mode = 'showing';
  }
}

function showTapToPlay() {
  const root = player.root;
  if (!root || $('.tap-play', root)) return;
  const tap = el('button', 'tap-play');
  tap.type = 'button';
  tap.innerHTML =
    '<svg viewBox="0 0 24 24" width="36" height="36"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><span>Tap to play</span>';
  tap.addEventListener('click', () => {
    tap.remove();
    if (player.video) player.video.play().catch(() => {});
  });
  root.appendChild(tap);
}

function attachSource(position) {
  const video = player.video;
  const start = Math.max(0, Math.floor(position || 0));
  player.offset = player.mode === 'direct' ? 0 : start;
  player.restarting = true;
  const url =
    player.mode === 'direct'
      ? '/api/stream/' + encodeURIComponent(player.item.id)
      : '/api/play/' + encodeURIComponent(player.item.id) + '?t=' + start;

  playerError(null);
  setSpinner(true);
  video.src = url;
  video.load();

  const onMetadata = () => {
    video.removeEventListener('loadedmetadata', onMetadata);
    player.restarting = false;
    if (!player.duration && Number.isFinite(video.duration)) player.duration = video.duration;
    if (player.mode === 'direct' && start > 0) {
      try {
        video.currentTime = start;
      } catch (err) {}
    }
    applySubtitleTrack();
    // Some mobile and TV browsers refuse programmatic autoplay: offer a tap.
    video.play().catch(() => showTapToPlay());
    updateTimeUi();
  };
  video.addEventListener('loadedmetadata', onMetadata);
}

function updateTimeUi() {
  const video = player.video;
  if (!video || !player.root) return;
  const duration = player.duration || (Number.isFinite(video.duration) ? video.duration : 0);
  const current = Math.min(absoluteTime(), duration || absoluteTime());
  const percent = duration ? Math.min(100, (current / duration) * 100) : 0;

  const played = $('.seek-played', player.root);
  const buffered = $('.seek-buf', player.root);
  const range = $('.seek-range', player.root);
  const timeLabel = $('.time-display', player.root);

  if (played) played.style.width = percent + '%';
  if (buffered) {
    const bufPercent = duration ? Math.min(100, ((player.offset + bufferEnd(video)) / duration) * 100) : 0;
    buffered.style.width = Math.max(percent, bufPercent) + '%';
  }
  if (range && !player.dragging) range.value = String(Math.round(percent * 10));
  if (timeLabel) timeLabel.textContent = formatClock(current) + ' / ' + formatClock(duration);
}

function seekTo(target) {
  const video = player.video;
  if (!video) return;
  const duration = player.duration || (Number.isFinite(video.duration) ? video.duration : 0);
  const goal = duration ? Math.max(0, Math.min(duration - 1, target)) : Math.max(0, target);
  player.dragging = false;

  if (player.mode === 'direct') {
    try {
      video.currentTime = goal;
    } catch (err) {}
  } else {
    const end = player.offset + bufferEnd(video);
    if (goal >= player.offset + 0.2 && goal <= end - 0.6) {
      video.currentTime = goal - player.offset;
    } else {
      attachSource(goal);
    }
  }
  updateTimeUi();
}

function togglePlay() {
  const video = player.video;
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

function setPlayIcon() {
  const button = $('.ctrl-play', player.root);
  if (!button) return;
  const paused = !player.video || player.video.paused;
  button.innerHTML = paused
    ? '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  button.setAttribute('aria-label', paused ? 'Play' : 'Pause');
}

function wakeControls() {
  const root = player.root;
  if (!root) return;
  root.classList.remove('idle');
  clearTimeout(player.hideTimer);
  player.hideTimer = setTimeout(() => {
    if (player.video && !player.video.paused) root.classList.add('idle');
  }, 2800);
}

async function saveProgress() {
  if (!player.item || !player.video) return;
  const position = absoluteTime();
  if (!Number.isFinite(position) || position < 1) return;
  const duration = player.duration || (Number.isFinite(player.video.duration) ? player.video.duration : 0);
  try {
    await api('/api/progress/' + encodeURIComponent(player.item.id), {
      method: 'POST',
      body: { position: Math.floor(position), duration: Math.floor(duration || 0) },
    });
    state.progress[player.item.id] = { position, duration, updated: Date.now() };
  } catch (err) {
    /* progress is a nicety - never interrupt playback over it */
  }
}

function closePlayer() {
  if (!player.item) return;
  saveProgress();
  clearInterval(player.timer);
  clearTimeout(player.hideTimer);
  document.removeEventListener('keydown', onPlayerKey);
  const video = player.video;
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const layer = $('#playerLayer');
  releaseBackGuard();
  layer.hidden = true;
  layer.innerHTML = '';
  document.body.classList.remove('no-scroll');
  player.item = null;
  player.video = null;
  player.root = null;
  render();
}

function onPlayerKey(event) {
  if (!player.item) return;
  const key = event.key;
  if (key === ' ' || key === 'k' || key === 'K') {
    event.preventDefault();
    togglePlay();
  } else if (key === 'ArrowRight') {
    event.preventDefault();
    seekTo(absoluteTime() + 10);
  } else if (key === 'ArrowLeft') {
    event.preventDefault();
    seekTo(absoluteTime() - 10);
  } else if (key === 'ArrowUp') {
    event.preventDefault();
    player.video.volume = Math.min(1, player.video.volume + 0.1);
  } else if (key === 'ArrowDown') {
    event.preventDefault();
    player.video.volume = Math.max(0, player.video.volume - 0.1);
  } else if (key === 'f' || key === 'F') {
    toggleFullscreen();
  } else if (key === 'm' || key === 'M') {
    player.video.muted = !player.video.muted;
  } else if (key === 'Enter') {
    // OK on a TV remote: play/pause, unless a control is focused.
    const active = document.activeElement;
    if (!active || active.tagName !== 'BUTTON') {
      event.preventDefault();
      togglePlay();
    }
  }
  wakeControls();
}

function toggleFullscreen() {
  const root = player.root;
  if (!root) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
}

function openPlayer(item, startAt) {
  if (!item) return;
  if (player.item) closePlayer();

  const resume = progressFor(item);
  let start = 0;
  if (typeof startAt === 'number' && startAt >= 0) start = startAt;
  else if (resume) start = resume.position;

  player.item = item;
  player.mode = item.playback || 'direct';
  player.duration = item.duration || (resume ? resume.duration : 0) || 0;
  player.subtitle = 'off';
  player.dragging = false;

  const layer = $('#playerLayer');
  pushBackGuard();
  layer.innerHTML = '';
  layer.hidden = false;
  document.body.classList.add('no-scroll');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  const root = el('div', 'player');
  player.root = root;

  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  player.video = video;
  root.appendChild(video);

  for (const sub of item.subtitles || []) {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.label || 'Track ' + (sub.index + 1);
    track.srclang = sub.code || 'und';
    track.src = '/api/subtitles?i=' + encodeURIComponent(item.id) + '&s=' + sub.index;
    video.appendChild(track);
  }

  const top = el('div', 'player-top');
  const close = el('button', 'ctrl');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close player');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.4 5l5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z" fill="currentColor"/></svg>';
  close.addEventListener('click', closePlayer);
  top.appendChild(close);

  const titleWrap = el('div', 'player-title');
  titleWrap.appendChild(el('strong', null, item.kind === 'episode' ? item.series : item.title));
  titleWrap.appendChild(
    el('span', null, item.kind === 'episode' ? 'S' + item.season + ' E' + item.episode + ' · ' + item.title : '')
  );
  top.appendChild(titleWrap);
  top.appendChild(
    el('span', 'badge' + (player.mode === 'direct' ? ' is-direct' : ''), PLAYBACK_LABEL[player.mode] || 'Direct play')
  );
  root.appendChild(top);

  const controls = el('div', 'player-controls');
  const seekbar = el('div', 'seekbar');
  const rail = el('div', 'seek-rail');
  rail.appendChild(el('div', 'seek-buf'));
  rail.appendChild(el('div', 'seek-played'));
  seekbar.appendChild(rail);
  const hover = el('div', 'seek-hover', '0:00');
  seekbar.appendChild(hover);

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'seek-range';
  range.min = '0';
  range.max = '1000';
  range.step = '1';
  range.value = '0';
  range.setAttribute('aria-label', 'Seek');
  seekbar.appendChild(range);

  seekbar.addEventListener('mousemove', (event) => {
    const rect = rail.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    hover.textContent = formatClock(ratio * (player.duration || 0));
    hover.style.left = Math.max(18, Math.min(rect.width - 18, event.clientX - rect.left)) + 'px';
  });
  range.addEventListener('input', () => {
    player.dragging = true;
    const preview = (Number(range.value) / 1000) * (player.duration || 0);
    const played = $('.seek-played', root);
    if (played) played.style.width = Number(range.value) / 10 + '%';
    const timeLabel = $('.time-display', root);
    if (timeLabel) timeLabel.textContent = formatClock(preview) + ' / ' + formatClock(player.duration);
  });
  range.addEventListener('change', () => {
    player.dragging = false;
    seekTo((Number(range.value) / 1000) * (player.duration || 0));
  });
  controls.appendChild(seekbar);

  const row = el('div', 'controls-row');
  const playButton = el('button', 'ctrl ctrl-play');
  playButton.type = 'button';
  playButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  playButton.addEventListener('click', togglePlay);
  row.appendChild(playButton);

  const back10 = el('button', 'ctrl');
  back10.type = 'button';
  back10.setAttribute('aria-label', 'Back 10 seconds');
  back10.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z" fill="currentColor"/></svg>';
  back10.addEventListener('click', () => seekTo(absoluteTime() - 10));
  row.appendChild(back10);

  const fwd10 = el('button', 'ctrl');
  fwd10.type = 'button';
  fwd10.setAttribute('aria-label', 'Forward 10 seconds');
  fwd10.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5V2l5 4-5 4V7a5 5 0 105 5h2a7 7 0 11-7-7z" fill="currentColor"/></svg>';
  fwd10.addEventListener('click', () => seekTo(absoluteTime() + 10));
  row.appendChild(fwd10);

  row.appendChild(el('span', 'time-display', '0:00 / ' + formatClock(player.duration)));

  const volume = el('div', 'volume');
  const muteButton = el('button', 'ctrl');
  muteButton.type = 'button';
  muteButton.setAttribute('aria-label', 'Mute');
  muteButton.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" fill="currentColor"/></svg>';
  muteButton.addEventListener('click', () => {
    video.muted = !video.muted;
  });
  volume.appendChild(muteButton);
  const volumeRange = document.createElement('input');
  volumeRange.type = 'range';
  volumeRange.min = '0';
  volumeRange.max = '100';
  volumeRange.value = '100';
  volumeRange.setAttribute('aria-label', 'Volume');
  volumeRange.addEventListener('input', () => {
    video.volume = Number(volumeRange.value) / 100;
    video.muted = video.volume === 0;
  });
  volume.appendChild(volumeRange);
  row.appendChild(volume);
  row.appendChild(el('div', 'spacer'));

  if ((item.subtitles || []).length) {
    const subSelect = el('select', 'sub-select');
    subSelect.setAttribute('aria-label', 'Subtitles');
    const off = el('option', null, 'Subtitles off');
    off.value = 'off';
    subSelect.appendChild(off);
    for (const sub of item.subtitles) {
      const option = el('option', null, sub.label || 'Track ' + (sub.index + 1));
      option.value = String(sub.index);
      subSelect.appendChild(option);
    }
    subSelect.value = 'off';
    subSelect.addEventListener('change', () => {
      player.subtitle = subSelect.value;
      applySubtitleTrack();
    });
    row.appendChild(subSelect);
  }

  const fullscreenButton = el('button', 'ctrl');
  fullscreenButton.type = 'button';
  fullscreenButton.setAttribute('aria-label', 'Fullscreen');
  fullscreenButton.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" fill="currentColor"/></svg>';
  fullscreenButton.addEventListener('click', toggleFullscreen);
  row.appendChild(fullscreenButton);

  controls.appendChild(row);
  root.appendChild(controls);
  root.appendChild(el('div', 'player-spinner'));
  layer.appendChild(root);

  video.addEventListener('timeupdate', updateTimeUi);
  video.addEventListener('progress', updateTimeUi);
  video.addEventListener('play', () => {
    setPlayIcon();
    wakeControls();
  });
  video.addEventListener('pause', () => {
    setPlayIcon();
    wakeControls();
  });
  video.addEventListener('waiting', () => setSpinner(true));
  video.addEventListener('playing', () => {
    setSpinner(false);
    setPlayIcon();
  });
  video.addEventListener('canplay', () => setSpinner(false));
  video.addEventListener('ended', () => {
    const duration = player.duration || absoluteTime();
    saveProgress().then(() => {
      state.progress[item.id] = { position: duration, duration, updated: Date.now() };
      setTimeout(closePlayer, 400);
    });
  });
  video.addEventListener('error', () => {
    setSpinner(false);
    playerError(
      player.mode === 'transcode'
        ? 'This file could not be transcoded. Check the MattStream console for the FFmpeg message.'
        : 'This video could not be played. Try rescanning, or check that the file still exists.'
    );
  });
  video.addEventListener('seeking', () => {
    if (player.restarting || player.mode === 'direct' || player.dragging) return;
    const goal = absoluteTime();
    const end = player.offset + bufferEnd(video);
    if (goal > end - 0.6 || goal < player.offset - 0.2) attachSource(goal);
  });

  root.addEventListener('mousemove', wakeControls);
  root.addEventListener('touchstart', wakeControls, { passive: true });
  root.addEventListener('click', (event) => {
    if (event.target === video) {
      togglePlay();
      wakeControls();
    }
  });

  document.addEventListener('keydown', onPlayerKey);
  attachSource(start);
  setPlayIcon();
  wakeControls();
  player.timer = setInterval(saveProgress, 5000);
}

/* ---------------- wiring ---------------- */

async function refreshLibrary() {
  try {
    const results = await Promise.all([api('/api/library'), api('/api/progress'), api('/api/status')]);
    state.items = results[0].items || [];
    state.progress = results[1] || {};
    state.status = results[2];
    render();
    if (state.status && state.status.scanning) startPolling();
  } catch (err) {
    toast('Could not reach the MattStream server: ' + err.message, true);
  }
}

async function boot() {
  for (const button of $$('[data-view]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      state.view = button.dataset.view;
      state.search = '';
      $('#search').value = '';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  let searchTimer = null;
  $('#search').addEventListener('input', (event) => {
    const value = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = value;
      render();
    }, 120);
  });

  $('#scanBtn').addEventListener('click', triggerScan);
  $('#foldersBtn').addEventListener('click', openFoldersDialog);

  $('#dialogLayer').addEventListener('click', (event) => {
    if (event.target === $('#dialogLayer')) closeDialog();
  });

  document.addEventListener('keydown', (event) => {
    // Back on a TV remote arrives as Escape, Backspace or a dedicated back key.
    const isBack =
      event.key === 'Escape' ||
      event.key === 'GoBack' ||
      event.key === 'BrowserBack' ||
      event.key === 'XF86Back' ||
      event.keyCode === 4 ||
      (event.key === 'Backspace' && !isTypingTarget(event.target));

    if (isBack) {
      if (player.item) {
        event.preventDefault();
        closePlayer();
        return;
      }
      if (!$('#dialogLayer').hidden) {
        event.preventDefault();
        closeDialog();
      }
      return;
    }

    if (player.item) return; // the player handles its own keys

    const directions = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const direction = directions[event.key];
    if (!direction) return;

    // In a text field, left/right belong to the caret.
    if (isTypingTarget(event.target) && (direction === 'left' || direction === 'right')) return;

    event.preventDefault();
    document.body.classList.add('dpad');
    moveFocus(direction);
  });

  // Tabbing or clicking should keep the ring in step with real focus.
  document.addEventListener('focusin', (event) => {
    if (document.body.classList.contains('dpad') || document.body.classList.contains('is-tv')) {
      markFocused(event.target);
    }
  });

  // The TV Back button also arrives as a history pop.
  window.addEventListener('popstate', () => {
    if (suppressPop) {
      suppressPop = false;
      return;
    }
    closingFromPop = true;
    try {
      if (player.item) closePlayer();
      else if (!$('#dialogLayer').hidden) closeDialog();
    } finally {
      closingFromPop = false;
    }
  });

  document.body.classList.toggle('is-tv', detectTvMode());

  window.addEventListener('beforeunload', () => {
    if (player.item) saveProgress();
  });

  await refreshLibrary();
}

boot();
