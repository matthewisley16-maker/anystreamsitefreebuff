# AnyStreamSite - working agreement

AnyStreamSite lives at the repository root: `index.html`, `electron/`, `android/`, and `scripts/`.

MattStream is a separate application in its own repository:
https://github.com/matthewisley16-maker/MattStream

Do not build, release, or add production workflows for MattStream in this repository. A
`mattstream/` copy may exist locally, but it is not part of AnyStreamSite and must not be used by
the root app. Keep any MattStream work in the separate MattStream repository.

## Android releases

- Build from `android/build.sh`; it writes the signed phone and TV APKs to `dist/android/`.
- Bump `versionCode` and `versionName` in both manifests before a release.
- Publish release assets to this repository with `anystreamsite` in their names.
- Keep the in-app updater pointed only at AnyStreamSite assets; it must ignore releases from other
  projects.

## GitHub

Root-level AnyStreamSite changes are complete when they are committed and pushed to `origin main`.
Do not stage unrelated MattStream changes or generated build output.
