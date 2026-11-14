# anystreamsite

All your streaming sites in one window. Paste a site URL and it becomes a square tile in your library; click the tile and the service opens inside the app. No extra apps to install for each service, no browser tabs to hunt through.

Built for Windows, Android phones and Android TV from the same UI.

## Download

Grab the Android build from the [v1.1.4 release](https://github.com/matthewisley16-maker/anystreamsitefreebuff/releases/tag/v1.1.4).

| Build | File | For |
| --- | --- | --- |
| Windows | `anystreamsitev1.1.2-windows-x64-setup.exe` | Windows 10 and 11, 64-bit |
| Android phone / tablet | `anystreamsitev1.1.4-phone.apk` | Android 6.0 and newer |
| Android TV | `anystreamsitev1.1.4-android-tv.apk` | Android TV 6.0 and newer |

The Windows file name carries its version, platform and architecture. The Android APK names carry the app version; this build is versionCode 27, so it installs as an update over the earlier v25 and v26 APKs.

## Features

- **Square poster tiles** — each site's icon artwork fills the whole tile, with the site name laid over the bottom of it
- **Any site by URL** — add Netflix, Hulu, YouTube, Twitch, iPlayer, a self-hosted server, anything
- **Real in-app viewer** — sites open in a proper browser view, not a restricted iframe, with back, forward, reload and exit controls
- **Self-updating Android builds** — the phone and TV APKs check the AnyStreamSite releases, ignore unrelated releases, download the matching signed APK, verify its signature, and open Android's installer
- **One view, real history** — links and pop-ups inside a site stay in that same view instead of opening a new window, so **Back** returns through the pages you just visited
- **Video downloads on Windows** — while a site is open, the site toolbar lists unencrypted HLS and direct MP4/WebM/FLV streams, lets you pick an available HLS quality (resolution/bitrate), saves them to your Downloads folder, and remuxes HLS into MP4 with the included FFmpeg engine. DRM, encrypted and live streams are not supported
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
- **Two TV site controls** — choose focus navigation or a D-pad-controlled mouse cursor inside opened sites. In focus mode, **Up** at the top of the page or **Menu** moves into the native Back / Forward / Reload / Exit bar; **Down** returns to the page. Hold **OK** for one second on a library tile to open its Edit / Remove menu.

## Windows 10 / 11 (64-bit)

1. Download `anystreamsitev1.1.2-windows-x64-setup.exe`.
2. Run it. The installer is not code-signed, so SmartScreen may say "Windows protected your PC" — choose **More info**, then **Run anyway**.
3. It installs for the current user and adds a desktop shortcut and Start menu entry.
4. Open anystreamsite, paste a URL such as `netflix.com` into the box, and press **Add to library**.
5. Click a tile to open the site in the app. Use the bar at the top for back, forward, reload and exit.

### Downloading videos (Windows)

1. Open a site, choose a movie or episode, and start playing it. Use the site's normal player and sign in there if the site asks.
2. When a downloadable stream is found, the **Downloads** button in the site toolbar shows a badge. Open it to see the detected HLS and direct video streams.
3. For HLS, choose a **quality** from the format selector beside the Download button. The selector lists the resolutions and bitrates advertised by the stream. Choose **Download**; HLS is combined and remuxed to MP4, while MP4/WebM/FLV files are saved as-is. Files go to your Windows **Downloads** folder. **Show in folder** opens the finished file.
4. Keep the site open and the video playing until detection finishes. A stream that expires, needs a different sign-in, or is DRM-protected will fail with a message in the drawer.

Only download media you have permission to keep. The downloader uses your current site session, but it does not bypass DRM, encrypted HLS, paywalls, or live-stream restrictions.

## Android phone / tablet

1. Copy `anystreamsitev1.1.4-phone.apk` to the device, or download it directly in the browser.
2. Open the file and allow installs from unknown sources when Android asks.
3. The APK is self-signed, so Play Protect may warn about an unknown developer. That is expected for a sideloaded build. If Android blocks the install, tap **More details**, then **Install anyway**; the manifest targets Android 14, so the "made for an older version" warning no longer applies.
4. Open the app, paste a site URL and add it. Two tiles sit per row on a normal handset.
5. Tap a tile to open the site full screen. Links stay in that view, and the back button walks your history before returning to the library.

## Android TV

1. Install `anystreamsitev1.1.4-android-tv.apk`. The easiest routes are the **Downloader** app on the TV, or ADB from a computer:

   ```bash
   adb install anystreamsitev1.1.4-android-tv.apk
   ```

2. anystreamsite appears in the TV launcher after installing.
3. Move around with the D-pad: left, right, up and down jump between tiles, and **OK** opens the highlighted site. Up from the tiles reaches the top bar, where you can select Settings or Add site. Down from the top bar lands on the **Paste a site URL** field; **Right** moves to **Add to library**, and **OK** on the URL field opens the keyboard. In **Settings → TV navigation**, choose **D-pad focus** or **Mouse cursor** for opened sites.
4. **Hold OK** on a tile to open its **Edit site / Remove site** menu. The menu also has a Remove confirmation.
5. Inside an opened site, **D-pad focus** moves through links and buttons, **OK** activates the highlighted control, and the page scrolls when focus has nowhere left to go. Press **Up at the very top of the page** or **Menu** to move into the native Back / Forward / Reload / Exit bar; use Left/Right and OK, then **Down** to return to the page. In **Mouse cursor** mode, the arrows move the dot and **OK** activates the hyperlink or control beneath it. A selected site text field opens the TV keyboard; the D-pad and OK then belong to the keyboard, and **Back** closes it.
6. **Back** closes the keyboard, an open site dialog or fullscreen video first. It then walks the site history; when there is no more history it returns to the library. At the library home screen, Back sends the app to the TV home screen instead of killing the task.
7. If you already have an earlier v1.1 TV build, install this APK over it. Its versionCode is 27, so Android accepts it as an update without uninstalling first.

The TV build uses a compact 10-foot layout that scales from 720p through 4K, with larger tiles, focus outlines and no heavy blur effects, so it stays readable and smooth on low-power boxes. Links inside a site stay in the same view, and **Back** walks the site's history before returning to the library.

## Android updates

Version 1.1.4 is the first Android build with the built-in updater, so install it once from this release. From then on, anystreamsite checks the latest GitHub release when it starts and shows an **Update available** dialog when a newer signed build exists. The check runs at most once every 12 hours.

You can also open **Settings → App update → Check for updates** at any time. The app downloads the correct phone or TV APK, verifies that it is the same package signed by the same key, and opens Android's package installer. Android still asks you to confirm the install; a sideloaded app cannot silently replace itself. Your library and website sign-ins are preserved across the update.

If Android says installs from anystreamsite are not allowed, choose **Open settings**, enable **Allow from this source**, and return to the app. It reopens the installer automatically.

The built-in services are tested to load in both the phone and TV APK. Playback still depends on the device and the service; DRM-protected services such as Netflix, Disney+, Hulu and Spotify require a WebView/device with Widevine support, and some accounts or regions may require a different sign-in flow.

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
- **TV navigation** — on Android TV, switch between D-pad focus and a D-pad-controlled mouse cursor inside opened sites
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

The installer name comes from `build.nsis.artifactName` in `package.json` and includes the version, platform and architecture. The Windows build copies the FFmpeg binary from `ffmpeg-static` into `resources/bin` at package time; its GPL license and source link are included alongside it.

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
- **Video download limits** — only unencrypted, on-demand HLS and direct MP4/WebM/FLV files are supported. Encrypted HLS (including AES-128), DRM-protected streams, and live streams are refused rather than bypassed. Some sites serve video in forms the app cannot see, such as cross-origin embedded players or canvas-rendered video.
- **Unsigned builds** — the Windows installer has no code-signing certificate, and the APKs use a self-signed key. Both trigger warnings on first install.
- **Android WebView** — some services refuse to play DRM content inside a WebView. The app itself works, but playback support varies by service. The Android builds use a normal Chrome browser profile and keep popup sign-ins in the same site view, but they cannot add Widevine to a device that does not provide it.
- **Local library** — there is no account or sync between devices; each device keeps its own library.

## Version

Current Android release: **v1.1.4** (versionCode **27**). This build adds the in-app updater, uses a standard Chrome user agent so streaming sites do not reject the Android WebView, enables mixed-content compatibility, and routes popup sign-in windows back through the main site view. The TV remote controls and the native Back/Forward/Reload/Exit toolbar from v1.1.3 are unchanged.

The Windows build remains **v1.1.2**.
