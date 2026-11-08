# anystreamsite

All your streaming sites in one window. Paste a site URL and it becomes a square tile in your library; click the tile and the service opens inside the app. No extra apps to install for each service, no browser tabs to hunt through.

Built for Windows, Android phones and Android TV from the same UI, and every release ships all three builds together.

## Download

Grab the latest build from the [releases page](https://github.com/matthewisley16-maker/anystreamsitefreebuff/releases).

| Build | File | For |
| --- | --- | --- |
| Windows | `anystreamsitev1.1-windows-x64-setup.exe` | Windows 10 and 11, 64-bit |
| Android phone / tablet | `anystreamsitev1.1-phone-v15.apk` | Android 6.0 and newer |
| Android TV | `anystreamsitev1.1-android-tv-v15.apk` | Android TV 6.0 and newer |

The Windows file name carries the version, the platform and the architecture, so you can tell at a glance which build you have. The APK names include the Android versionCode (15), which distinguishes this rebuilt package from the earlier v1.1 APKs.

## Features

- **Square poster tiles** — each site's icon artwork fills the whole tile, with the site name laid over the bottom of it
- **Any site by URL** — add Netflix, Hulu, YouTube, Twitch, iPlayer, a self-hosted server, anything
- **Real in-app viewer** — sites open in a proper browser view, not a restricted iframe, with back, forward, reload and exit controls
- **One view, real history** — links and pop-ups inside a site stay in that same view instead of opening a new window, so **Back** returns through the pages you just visited
- **Persistent sign-ins** — cookies are kept in an app profile, so you stay logged in between sessions
- **Your library stays put** — tiles, names, categories and custom icons are saved on the device
- **Three layouts** — Grid (poster tiles), Bold (larger posters) and Minimal (a compact list)
- **Three tile sizes** — Small, Medium and Large; Large uses tiles around 317 px wide with 172 px icons
- **Dark and light themes** with five accent colours
- **Start-up splash with an opening sound**, plus a soft tap sound on buttons and tiles
- **Launch animations**, switchable in Settings
- **Search** your library from the top bar
- **Storage controls** — clear cached pages, or clear cookies to sign out of every site
- **Remote friendly on TV** — native D-pad handling in the library and inside opened sites, a visible focus ring and extra large tiles; **OK** selects the highlighted tile, link or button

## Windows 10 / 11 (64-bit)

1. Download `anystreamsitev1.1-windows-x64-setup.exe`.
2. Run it. The installer is not code-signed, so SmartScreen may say "Windows protected your PC" — choose **More info**, then **Run anyway**.
3. It installs for the current user and adds a desktop shortcut and Start menu entry.
4. Open anystreamsite, paste a URL such as `netflix.com` into the box, and press **Add to library**.
5. Click a tile to open the site in the app. Use the bar at the top for back, forward, reload and exit.

## Android phone / tablet

1. Copy `anystreamsitev1.1-phone-v15.apk` to the device, or download it directly in the browser.
2. Open the file and allow installs from unknown sources when Android asks.
3. The APK is self-signed, so Play Protect may warn about an unknown developer. That is expected for a sideloaded build. If Android blocks the install, tap **More details**, then **Install anyway**; the manifest targets Android 14, so the "made for an older version" warning no longer applies.
4. Open the app, paste a site URL and add it. Two tiles sit per row on a normal handset.
5. Tap a tile to open the site full screen. Links stay in that view, and the back button walks your history before returning to the library.

## Android TV

1. Install `anystreamsitev1.1-android-tv-v15.apk`. The easiest routes are the **Downloader** app on the TV, or ADB from a computer:

   ```bash
   adb install anystreamsitev1.1-android-tv-v15.apk
   ```

2. anystreamsite appears in the TV launcher after installing.
3. Move around with the D-pad: left, right, up and down jump between tiles, and **OK** opens the highlighted site. Up from the tiles reaches the top bar, where you can select Settings or Add site. Down from the top bar lands on the **Paste a site URL** field; **Right** moves to **Add to library**, and **OK** on the URL field opens the keyboard.
4. Inside an opened site, the D-pad moves through links and buttons; **OK** activates the highlighted control, and the arrows scroll the page when there is nothing else in that direction.
5. If you already have the earlier v1.1 TV build, install this APK over it. Its versionCode is 15, so Android accepts it as an update without uninstalling first.
6. Inside a site, **Back** walks the site's history and returns to the library when the history is empty.

The TV build uses a compact 10-foot layout that scales from 720p through 4K, with larger tiles, focus outlines and no heavy blur effects, so it stays readable and smooth on low-power boxes. Links inside a site stay in the same view, and **Back** walks the site's history before returning to the library.

## Adding and managing sites

- Use the box at the top of the window, or the **Add site** button, to add a URL.
- Leave the name blank and the app derives one from the address; type a name to override it.
- Icons are fetched from the site's own favicon at 256 px. If a site's icon is wrong or missing, paste a custom icon URL in the **Custom icon URL** field.
- Hover a tile and use the pencil to edit it or the bin to remove it.
- Sites with no reachable icon fall back to a letter tile in the site's accent colour.

## Settings

Open Settings from the gear in the top bar.

- **Appearance** — dark or light
- **Accent colour** — default red, midnight, emerald, violet or sunset
- **Tile size** — Small, Medium or Large
- **Layout** — Grid, Bold or Minimal
- **Animations** — splash, launch and hover motion
- **Storage** — clear cached pages, or clear cookies and sign out of every site

Clearing cache keeps you signed in. Clearing cookies removes every sign-in, so you will need to log in again on each service.

## Where your data lives

Your library is stored locally in the app's profile on the device; it is not uploaded anywhere. Cookies for the sites you open live in the same profile, which is what keeps you signed in. Removing the app or clearing its data removes both.

## Build from source

### Windows

Requires Node.js 20 or newer.

```bash
npm install
npm start      # run from source
npm run dist   # build the installer into dist/
```

The installer name comes from `build.nsis.artifactName` in `package.json` and includes the version, platform and architecture.

### Android

The APK builds without Gradle. `android/build.sh` compiles the Java sources with `aapt2`, `javac`, `d8`, `zipalign` and `apksigner`, then injects the same `index.html` used by the desktop app into the APK assets.

You need:

- JDK 17
- Android SDK build-tools 34.0.0 and platform `android-34`

```bash
bash android/build.sh
```

APKs are written to `dist/android/` and signed with the keystore referenced by the build script. The phone and TV builds differ in manifest, layout, and the injected TV remote/focus and CSS layer; the TV build also packages a site D-pad controller.

## Known limitations

- **DRM playback** — Netflix and Hulu open and browse normally, but streaming playback needs Widevine, which the Windows build does not ship with. Playback on those services may not work there.
- **Unsigned builds** — the Windows installer has no code-signing certificate, and the APKs use a self-signed key. Both trigger warnings on first install.
- **Android WebView** — some services refuse to play DRM content inside a WebView. The app itself works, but playback support varies by service.
- **Local library** — there is no account or sync between devices; each device keeps its own library.

## Version

Current release: **v1.1** — Windows x64, Android phone and Android TV. This build retimes the intro sound to the logo, targets Android 14 so installs are not blocked as an old app, gives Android TV a native 10-foot layout, and fixes TV remote input with a native D-pad bridge, visible focus rings and OK/Enter selection. The TV APK is compile-time flagged as TV, so its native key handling cannot be skipped by a device feature check, and the controller tracks the highlighted element when Android drops DOM focus. Empty-library Add actions are focusable, the site-level controller makes the D-pad work inside opened sites, and the add form asks Android to keep the keyboard visible. The TV D-pad now stops on the hero URL field and its Add to library button instead of skipping straight to the tiles.
