# Build Windows exe From WSL With Docker

This document describes a local WSL workflow for building Windows `.exe` artifacts without
installing Node/npm dependencies directly on Windows.

Use this for local test packages before pushing a tag or waiting for GitHub Actions.

## Recommendation

Prefer Docker over installing Wine directly in WSL.

Reasons:

- the project already uses Electron Builder, whose Linux-to-Windows build path requires Wine;
- Docker keeps Wine, Node, Electron cache, and build tools out of the WSL host;
- it avoids most Windows npm/native build environment issues;
- it is close to Electron Builder's recommended local Docker workflow.

Important limitation: this project has native dependencies such as `sqlite3`, `uiohook-napi`,
`node-screenshots`, and `onnxruntime-node`. Cross-building must install Windows optional native
packages, not only Linux optional packages.

Reference:

- Electron Builder multi-platform build docs: https://www.electron.build/multi-platform-build

## Prerequisites

- WSL2.
- Docker Desktop with WSL integration enabled, or Docker Engine available inside WSL.
- Enough disk space for Docker images, `node_modules`, Electron cache, and `dist`.
- Run commands from the repository root.

Check Docker:

```bash
docker version
docker run --rm hello-world
```

## One-Shot Portable Build

Portable is the fastest local package to test.

```bash
mkdir -p ~/.cache/electron ~/.cache/electron-builder

docker run --rm -it \
  -e ELECTRON_CACHE=/root/.cache/electron \
  -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
  -e CSC_IDENTITY_AUTO_DISCOVERY=false \
  -v "$PWD":/project \
  -v ttime-node-modules:/project/node_modules \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  -w /project \
  electronuserland/builder:wine \
  /bin/bash -lc "npm install --ignore-scripts --include=optional --os=win32 --cpu=x64 && npx electron-builder install-app-deps && npm run build:win:portable"
```

Expected output:

- Windows `.exe` artifacts in `dist/`.
- For this repo, inspect with:

```bash
ls -la dist/*.exe
```

## Installer Build

To build the NSIS installer instead:

```bash
mkdir -p ~/.cache/electron ~/.cache/electron-builder

docker run --rm -it \
  -e ELECTRON_CACHE=/root/.cache/electron \
  -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
  -e CSC_IDENTITY_AUTO_DISCOVERY=false \
  -v "$PWD":/project \
  -v ttime-node-modules:/project/node_modules \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  -w /project \
  electronuserland/builder:wine \
  /bin/bash -lc "npm install --ignore-scripts --include=optional --os=win32 --cpu=x64 && npx electron-builder install-app-deps && npm run build:win"
```

## Build Both Installer and Portable

```bash
mkdir -p ~/.cache/electron ~/.cache/electron-builder

docker run --rm -it \
  -e ELECTRON_CACHE=/root/.cache/electron \
  -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
  -e CSC_IDENTITY_AUTO_DISCOVERY=false \
  -v "$PWD":/project \
  -v ttime-node-modules:/project/node_modules \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  -w /project \
  electronuserland/builder:wine \
  /bin/bash -lc "npm install --ignore-scripts --include=optional --os=win32 --cpu=x64 && npx electron-builder install-app-deps && npm run build:win && npm run build:win:portable"
```

## Copy exe to Windows for Testing

From WSL:

```bash
mkdir -p /mnt/c/Users/$USER/Desktop/TTime-local-build
cp dist/*.exe /mnt/c/Users/$USER/Desktop/TTime-local-build/
```

If `$USER` does not match your Windows username, replace the path manually.

You can also open the repository through Windows Explorer using the WSL share path:

```text
\\wsl$\Ubuntu\path\to\TTime\dist
```

The distro name may differ.

## Cache and Cleanup

The command uses:

- `ttime-node-modules` Docker volume for container-side dependencies;
- `~/.cache/electron`;
- `~/.cache/electron-builder`.

Reset container dependencies:

```bash
docker volume rm ttime-node-modules
```

Fix root-owned output files if needed:

```bash
sudo chown -R "$(id -u)":"$(id -g)" dist
```

## Troubleshooting

### `wine is required`

Use `electronuserland/builder:wine`. The plain `electronuserland/builder` image does not include
Wine.

### Native module build errors

If the app starts on Windows with:

```text
Cannot find module 'node-screenshots-win32-x64-msvc'
```

then the Docker build used Linux optional dependencies. Reset the dependency volume and rebuild
with the documented `npm install --include=optional --os=win32 --cpu=x64` command:

```bash
docker volume rm ttime-node-modules
```

Then rerun the Docker build.

Before packaging, you can confirm the Windows package exists inside the container:

```bash
docker run --rm -it \
  -v "$PWD":/project \
  -v ttime-node-modules:/project/node_modules \
  -w /project \
  electronuserland/builder:wine \
  /bin/bash -lc "test -d node_modules/node-screenshots-win32-x64-msvc && echo ok"
```

If the build fails in `sqlite3`, `uiohook-napi`, `node-screenshots`, `onnxruntime-node`, or
another native module, first reset the container dependency volume and rerun.

If it still fails, use the Windows GitHub Actions workflow or a Windows build machine. Docker
cross-builds cannot always replace a real Windows native dependency build.

### Download or cache failures

Remove Electron Builder cache and retry:

```bash
rm -rf ~/.cache/electron-builder
mkdir -p ~/.cache/electron-builder
```

### Permission errors in `dist`

Fix ownership:

```bash
sudo chown -R "$(id -u)":"$(id -g)" dist
```

## When To Use GitHub Actions Instead

Use `.github/workflows/release-windows.yml` when:

- Docker cross-build fails on native modules;
- you need a clean Windows runner verification;
- you are preparing a release artifact;
- local test packages are not enough evidence.

For this proxy feature, a local portable `.exe` built with this Docker workflow is enough for
manual OpenRouter/proxy behavior testing before publishing.
