# MattStream - working agreement

MattStream lives in `mattstream/`. It is its own app and must stay independent of the
streaming-sites browser at the repository root: never edit root app files to make MattStream work,
and never point MattStream at root code.

## Keep GitHub up to date, every time

Any change inside `mattstream/` (server, web UI, Electron shell, Android app, docs, CI) is only
finished once it is on GitHub. At the end of the turn:

1. `git add mattstream` (plus `.github/workflows/mattstream-builds.yml` when it changed)
2. commit with a short, specific message describing the change
3. `git push origin main`

Do not leave MattStream work uncommitted. Do not stage unrelated root-level files, `mattstream/data/`,
`mattstream/node_modules/`, or `mattstream/bin/ffmpeg.exe` (all ignored on purpose).

## Building the apps

- `mattstream/scripts/package-windows.mjs` builds the portable Windows app into
  `mattstream/dist/MattStream-Windows-x64.zip`.
- `.github/workflows/mattstream-builds.yml` builds that zip plus `MattStream-phone-release.apk` and
  `MattStream-tv-release.apk` on every push, and refreshes the `mattstream-latest` release page.
- The Android app is a client for the desktop server: it asks for the LAN address MattStream shows
  and runs the shelf in a WebView with D-pad, fullscreen video and hardware Back.
