import { cp, mkdir, rm, rename, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Builds the portable Windows app: MattStream.exe + the media server + the web
// UI + FFmpeg, zipped so it can be unzipped anywhere and double-clicked.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const stage = path.join(dist, 'MattStream-win32-x64');
const zipPath = path.join(dist, 'MattStream-Windows-x64.zip');

const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
if (!existsSync(electronDist)) {
  console.error('electron/dist is missing - run: npm install && node node_modules/electron/install.js');
  process.exit(1);
}

await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, 'resources', 'app'), { recursive: true });
await cp(electronDist, stage, { recursive: true });

const appDest = path.join(stage, 'resources', 'app');
for (const entry of ['electron', 'server', 'web', 'bin', 'package.json', 'README.md', 'icon.ico', 'start.bat', 'start.sh']) {
  const from = path.join(root, entry);
  if (!existsSync(from)) continue;
  await cp(from, path.join(appDest, entry), { recursive: true });
}

// The Electron binary is the app now.
const exeFrom = path.join(stage, 'electron.exe');
const exeTo = path.join(stage, 'MattStream.exe');
if (existsSync(exeFrom)) await rename(exeFrom, exeTo);

// A first-run convenience: double-click this, not the exe, if you like.
await cp(path.join(root, 'start.bat'), path.join(stage, 'Start MattStream.bat')).catch(() => {});

const ffmpeg = path.join(appDest, 'bin', 'ffmpeg.exe');
console.log('bundled FFmpeg:', existsSync(ffmpeg) ? 'yes' : 'NO (direct play only)');

await rm(zipPath, { force: true });
if (process.platform === 'win32') {
  // .NET's ZipFile writes real deflate entries and does not trip over the odd
  // timestamps inside the Electron tree, unlike Compress-Archive.
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `[System.IO.Compression.ZipFile]::CreateFromDirectory('${stage.replace(/'/g, "''")}', '${zipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $true)`,
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', zipPath, path.basename(stage)], { cwd: dist, stdio: 'inherit' });
}

const info = await stat(zipPath);
console.log(`built ${zipPath} (${(info.size / 1024 / 1024).toFixed(0)} MB)`);
