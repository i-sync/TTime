# Repository Guidelines

## Project Structure & Module Organization

TTime is an Electron + Vue + TypeScript desktop app. Main-process code lives in `src/main`, with services under `src/main/service`, translation/OCR channel implementations under `src/main/service/channel`, and utilities in `src/main/utils`. Preload bridges and declarations are in `src/preload`. Renderer entry HTML files are in `src/renderer`, while Vue UI code, assets, CSS, API helpers, and page modules are under `src/renderer/src`. Shared enums, classes, channel metadata, and utilities live in `src/common`. Static icons are in `public`, packaging resources are in `build`, and offline OCR model files are in `ocr`.

## Build, Test, and Development Commands

- `npm run npm-i-extend-modules-update`: install dependencies and run the native module update step.
- `npm run dev`: start the Electron Vite development app.
- `npm run build`: compile Electron Vite output.
- `npm run build:win`, `npm run build:win:portable`, `npm run build:mac`, `npm run build:linux`: package releases with `electron-builder`.
- `npm run start`: preview the built app.
- `npm run typecheck`: refresh modules, then run Node and web TypeScript checks.
- `npm run lint`: run ESLint with auto-fix.
- `npm run format`: run Prettier over the repository.

## Coding Style & Naming Conventions

Use 2-space indentation, LF endings, UTF-8, and final newlines as defined in `.editorconfig`. Prettier uses single quotes, no semicolons, `printWidth: 100`, and no trailing commas. ESLint extends Vue 3, recommended TypeScript, and Prettier rules; TypeScript functions should declare return types except where overridden. Follow existing PascalCase names such as `TranslateChannelFactory.ts`, enum names such as `TranslateServiceEnum.ts`, and source-specific naming such as `NiuTransChannel.ts`, `NiuTransRequest.ts`, and `NiuTransInfo.ts`.

## Testing Guidelines

No dedicated test suite is currently present. Before submitting changes, run `npm run typecheck`, `npm run lint`, and the relevant platform build. For UI or Electron behavior changes, verify manually with `npm run dev` and cover affected workflows, such as input translation, screenshot OCR, selected translation, or settings.

## Commit & Pull Request Guidelines

Recent commits use a Conventional Commit style such as `fix(ci): ...`, `ci: ...`, `docs: ...`, and `feat(translate): ...`; keep subjects concise and scoped when useful. Pull requests should describe the change, list verification commands, mention affected platforms, link related issues, and include screenshots or screen recordings for visible renderer changes.

## Security & Configuration Tips

Do not commit service credentials, API keys, signing identities, or local machine paths. Treat translation and OCR provider configuration as user data, and avoid logging sensitive request payloads or tokens.
