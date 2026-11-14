# MattStream

Your own movie platform. Add the folders where your videos live - or single files - and MattStream turns them into
a browsable shelf with posters, films, seasons and episodes, then streams them to this computer, your TV, your
phone or a tablet on the same network.

It plays **any format**. MP4, MKV, AVI, MOV, WMV, FLV, TS, MPEG, WebM, VOB and more. Files the browser can play
directly are served as-is with full instant seeking; anything else is repackaged or transcoded live by the FFmpeg
engine that ships with the app.

MattStream is its own app and shares nothing with any other project: its own folder, its own data, its own port.

---

## Get it onto your other devices

Every push to `main` builds all three apps and drops them on the repository's **mattstream-latest**
release page (`Releases` on GitHub):

| File | What it is |
| --- | --- |
| `MattStream-Windows-x64.zip` | The desktop app. Unzip anywhere and run `MattStream.exe` - no installer, keeps its data in `resources\app\data`. |
| `MattStream-phone-release.apk` | Android phone or tablet app. |
| `MattStream-tv-release.apk` | Android TV, Fire TV and Google TV app. |

On Android, install the APK ("Install unknown apps" has to be allowed for your browser or file
manager once), open it and type the address the desktop app shows in its **Library** dialog, for example
`192.168.1.24:8096`. It is remembered from then on, and the app runs the shelf full-screen with D-pad
support, hardware Back and fullscreen video. If the address is wrong, it says so and asks again.

The Android apps are clients - the desktop app has to be running to serve the films.

Build them yourself with `node scripts/package-windows.mjs` (Windows zip) or
`cd android && gradle assembleRelease` (APKs, needs a JDK 17 and the Android SDK).

---

## Start it

Double-click the **MattStream** icon on your desktop, or find it in the Start menu. It opens as its own window -
no browser tab, no address bar, no console window - and the media server starts inside the app.

Press **Add videos or folders**, then either open a folder and press **Add this folder** to take everything inside
it, or click a video file - its full path lands in the box below, and **Add this file** takes just that one
(double-clicking a file adds it straight away). MattStream scans in the background - 24 films take a couple of
seconds once the metadata cache is warm - and your shelf appears.

Closing the app window stops the server, so keep the app open while a TV or phone is watching.

From a terminal the app is `npm start`. The same code still runs headless as a plain web server:

```bash
npm start                          # the desktop app
node server/index.js               # server only, http://localhost:8096
node server/index.js --port=8200   # server only, on another port
```

`start.bat` opens the app too, and falls back to the browser version if Electron is missing.

### Requirements

Nothing to install - everything is bundled in this folder:

- `node_modules/electron` is the desktop runtime. If it is ever deleted, run `npm install` to restore it.
- FFmpeg, which does the transcoding, lives at `bin/ffmpeg.exe`.
- Node.js 18+ is only needed for the headless server mode above; the desktop app carries its own.

---

## Watching from a TV, phone or tablet

Open the **Library** dialog in the app: it lists the network addresses for this computer, for example
`http://192.168.1.24:8096`. Type one of those into any browser on the same Wi-Fi.

- **Android phone or tablet, iPhone, iPad** - same address. The shelf reflows to a narrow single column, tap
targets are enlarged, and the player scrubs with a finger. Add it to the home screen (Chrome: menu → *Add to Home
screen*) and it opens full-screen with no browser bars; everything it needs is bundled, so it works offline over
Wi-Fi with no install from a store.
- **Android TV, Fire TV, Google TV** - type the address into the TV's browser, or cast from a phone browser's Cast
menu. The TV layout switches on by itself for TV, console and set-top browsers: bigger type, wider posters, more
spacing and an always-visible focus ring. Add `?tv=1` to the address to force it on in a browser that is not
detected, or `?tv=0` to force it off.
- **Remote control** - the arrow keys or D-pad move a highlighted focus ring around the shelf; **OK/Enter** opens
the highlighted film or episode, and plays or pauses once the player is open; **Back** (or `Esc`) closes the
player or the info panel. Focus enters at the shelf, not the header, so a remote never has to hunt for it.
- **Autoplay** - a phone may refuse to start a video with sound until the page has been touched; when that
happens a **Tap to play** button appears over the film.
- The app must stay open on this computer while another device watches - the server runs inside the app.
- The server listens on all network interfaces, so it is reachable from other devices; it is not exposed to the
  internet unless you forward the port yourself.
- Everyone on that address shares the same library and the same watch progress.

---

## What it does with your files

**Titles.** File names are read the way releases are named, so you do not need to rename anything:

| File name | Shows up as |
| --- | --- |
| `The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv` | **The Matrix** (1999) |
| `Big Movie 2021.mp4` | **Big Movie** (2021) |
| `Show.S01E02.The.Title.1080p.mkv` | **Show** · Season 1, Episode 2, "The Title" |
| `Show - 1x02 - The Title.avi` | **Show** · Season 1, Episode 2, "The Title" |
| `Show/Season 2/Episode 04.mkv` | **Show** · Season 2, Episode 4 |

Episodes found with the same show name are grouped into one series with season tabs.

**Artwork.** No internet metadata service and no account. Drop these images next to the video and MattStream uses
them:

- `poster.jpg` / `folder.jpg` / `cover.jpg` - the tall tile (posters look best around 2:3, e.g. 600×900)
- `fanart.jpg` / `backdrop.jpg` / `background.jpg` - the wide banner behind the hero and detail views

Put one set in the show folder and every season inside it inherits them. For films, keep the image in the same
folder as the file. Anything without artwork gets a generated poster with its title, so the shelf never looks
broken.

**Subtitles.** `.srt`, `.vtt`, `.ass` and `.ssa` tracks sitting next to the video are offered in the player menu.
`.srt` and `.ass` are converted to WebVTT on the fly. Name them `Movie.en.srt` or `Movie.forced.srt` to get a
language label.

**Watch progress.** Playback position is stored per file, so **Continue watching** and per-episode progress bars
survive restarts. Finishing a film removes it from the row.

---

## Playback: why "any format" works

Each file is probed with FFmpeg when it is scanned, and MattStream picks the cheapest way to get it on screen:

| Decision | When | What happens |
| --- | --- | --- |
| **Direct play** | MP4/MOV/WebM with H.264, VP8, VP9 or AV1 video and AAC/MP3/Opus/Vorbis audio | Served over HTTP with byte ranges - instant start, instant seeking, no CPU cost |
| **Repackaged live** | H.264 video in another container (for example MKV) | Stream is copied, not re-encoded, into fragmented MP4 - seconds of CPU, no quality loss |
| **Live transcode** | Anything else (AVI, WMV, FLV, MPEG-2, HEVC, VC-1, DTS audio...) | Re-encoded live to H.264/AAC on the fly, downscaled to 1080p only if the source is bigger |

Seeking a repackaged or transcoded stream restarts FFmpeg at that point, so the scrub bar stays responsive
without waiting for a full conversion. The badge in the player tells you which mode a film is using.

Transcoding uses CPU. One 1080p stream is comfortable on a modern desktop; several at once on a small server will
feel it.

---

## Managing the library

- **Library** - add whole folders or individual video files, and see the network address for other devices. Every
  added folder or file is listed with how many videos it contributes and a **Remove** button: press it once and it
  arms (the label changes to *Remove?*), press again and the entry leaves MattStream. Nothing is deleted from disk,
  and the shelf updates straight away. A single added file is listed on its own, and still picks up a `poster.jpg` or
  `.srt` from its own folder.
- **Remove a video** - in a film's info panel, or on any episode row, remove it from the shelf. **The file is never
  deleted** - it simply moves to *Removed from your shelf*, where you can restore it at any time.
- **Rescan** - pick up new files. Removing an entry drops it from the shelf but never touches your files.
- **Search** - filters films, shows and episode titles as you type.
- **Movies** - sort by recently added, title or release year.
- **Series** - season tabs, episode list with a Play button and progress per episode.

Adding a folder or a file is also possible with a typed path if the browser cannot reach a network drive - paste
either `D:\Movies` or `D:\Movies\The Matrix 1999.mkv` into the path box.

---

## Keyboard shortcuts (player)

| Key | Action |
| --- | --- |
| `Space` / `K` | Play or pause |
| `←` / `→` | Back or forward 10 seconds |
| `↑` / `↓` | Volume |
| `F` | Fullscreen |
| `M` | Mute |
| `Esc` | Close the player |

On a TV or phone, the same controls work from the remote: **←/→** seek 10 seconds, **↑/↓** change the volume,
**OK/Enter** plays or pauses, and **Back** closes the player and then the info panel.

---

## Where your data lives

```
mattstream/
  data/
    config.json     library folders and port
    library.json    the scanned index (deleted and rebuilt on rescan)
    probes.json     cached FFmpeg metadata, keyed by path + size + modified time
    progress.json   watch positions
```

Everything is local to this folder. Nothing is uploaded, no account is needed, and no metadata is fetched from the
internet. Delete `data/` to start fresh.

## Project layout

```
mattstream/
  electron/main.js       the desktop app: window, icons, lifecycle
  android/               Android phone + Android TV apps (Gradle, WebView client)
  scripts/package-windows.mjs  builds the portable Windows zip
  start.bat / start.sh   launchers
  create-shortcut.ps1    recreates the desktop + Start menu shortcuts and icon.ico
  icon.ico               app icon, generated by that script
  bin/ffmpeg.exe         the transcoding engine (GPL, license alongside)
  server/
    index.js             HTTP server, streaming, transcoding, API
    scan.js              folder walk, file-name parsing, artwork, subtitles
    media.js             FFmpeg discovery, probing, playback decisions
    store.js             JSON persistence
  web/
    index.html, app.js, styles.css, icon.svg, manifest.webmanifest
```

The server itself has no npm dependencies - only Electron, the desktop shell, is installed.

## If something does not play

- **Only MP4/WebM play, everything else errors** - FFmpeg is missing. Check that `bin/ffmpeg.exe` exists (or that
  `ffmpeg` is on PATH) and restart the server; the start-up banner says whether FFmpeg was found.
- **A file is missing from the shelf** - names shorter than 4 KB and anything containing the word `sample` are
  skipped on purpose. Hidden folders, `.git`, `node_modules` and system folders are not scanned.
- **A film shows the wrong title** - rename it `Title (Year).mkv`; the year in brackets settles the parse.
- **Playback stutters on a transcode** - the machine is CPU-bound. Try the file's native format or a lower-resolution
  copy; direct-play files are always smooth.
- **Another device cannot connect** - check both are on the same network and that Windows Firewall allowed Node.js
  on private networks the first time it asked.

## Licence

MattStream's own code is MIT. The bundled FFmpeg build is GPLv3 - see `bin/FFMPEG-LICENSE.txt`.
