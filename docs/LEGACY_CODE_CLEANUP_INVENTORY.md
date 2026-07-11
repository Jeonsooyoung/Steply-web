# Steply Legacy Code Cleanup Inventory

Date: 2026-07-11

This inventory records the cleanup evidence gathered after the integration audit. It is intentionally conservative: files are removed only when runtime references, route reachability, scripts, and asset URL references show no active use.

## Categories

| Category | Meaning | Default action |
| --- | --- | --- |
| A | Confirmed active in current production or supported development flow | Keep |
| B | Confirmed duplicate with one canonical active implementation | Remove only after references migrate |
| C | Confirmed unreachable from routes, imports, dynamic imports, scripts, string references, and runtime assets | Remove |
| D | Obsolete compatibility code | Keep unless stored data compatibility is proven safe |
| E | Development-only or demo/debug support | Keep or gate explicitly |
| F | Uncertain usage | Keep and document |

## Inventory

| File or symbol | Category | Current references | Runtime reachability | Proposed action | Evidence | Risk | Tests before removal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `client/src/routes/*` and `client/src/routes/steplyRoutes.js` | A | Imported by `App.jsx`; `matchSteplyRoute()` selects `/display/*` and `/camera/*` | Active display and phone routes | Keep | 33 routes found, duplicate path count 0 | High | Full browser route audit, session flow, camera routes |
| Root dashboard components in `client/src/components/*Panel.jsx` | A/E | Imported directly by `App.jsx` | Active at `/`, `?screen=...`, and QR gated flow | Keep | Static imports in `App.jsx`; demo mode drives review states | Medium | Root route smoke, demo URL checks, QR gate |
| `client/src/components/foundation/SteplyDesignSystem.jsx` | A | Imported by route screen modules | Active in `/display/*` flow | Keep | Used by route screens and visual states | High | Display flow screenshots |
| Legacy analyzer modules in `client/src/pose/*Analyzer.js` | A/D | Imported by `movementAnalyzers.js`, worker, and checks | Active MediaPipe worker path | Keep | Clinical checks and worker imports depend on them | High | Pose, balance, chair, replay checks |
| Structured pipeline modules in `client/src/pipeline/**` | A/D | Used by worker, adapters, checks, and UI view models | Active current/compatibility pipeline | Keep | `npm run check` validates these modules | High | Full clinical regression |
| `legacy*Adapter.js` modules | D | Imported by dashboard hook and checks | Stored-data and structured-pipeline compatibility | Keep | Compatibility adapters bridge legacy result shapes | High | Stored data, persistence, clinical checks |
| `client/src/data/demoHistory.js`, `client/src/data/demoProfile.js`, `client/src/data/serviceModels.js` | E | Imported by root dashboard, reports, and demo paths | Development/demo and empty-state support | Keep | Demo mode is gated by `?demoUi=1` or `?screen=`; not used for normal saved clinical output | Medium | Root dashboard and report demo checks |
| Debug query tools `debugPose`, `poseDebug`, `debugAgent`, `agentDebug` | E | Read in `AnalysisPanel.jsx` and `ResultPanel.jsx` | Explicit query/localStorage gated only | Keep | Normal route audit shows no debug panels without flags | Medium | Browser audit without debug flags |
| `public/index.html` | D/F | Used by server fallback when `dist/index.html` does not exist | Possible production fallback before build | Keep | `src/config/env.js` selects `public` if `dist` is absent | Medium | `npm start` without `dist` fallback |
| `public/models/*.task` | D/F | Not imported by Vite, but served by server fallback public dir | Possible model fallback when `dist` is absent | Keep | Root `public` is still server fallback | High | MediaPipe startup without Vite build |
| `client/public/wasm/*` and `client/src/vendor/mediapipe/wasm/*` | A | Generated/copied by `prepare-mediapipe-assets.js`; loaded by worker | Active MediaPipe runtime assets | Keep | Build/check copy and worker URL probing depend on them | High | Pose worker boot and quality checks |
| `client/public/images/exercises/*.png` | C | No imports, no filename refs, no `/images/exercises` URL refs | Not reachable by current UI or scripts | Removed | `rg` found no references outside the files; route UI uses CSS/HTML demos instead | Low | Build, route audit, exercise screens |
| `typescript` package dependency | C | Only `package.json`/lockfile references | No TS source, no `tsconfig`, no tsc script | Removed | `find` found no `.ts`, `.tsx`, or `tsconfig*.json`; `npm ls typescript` showed only top-level package | Low | Build, checks, dependency install |
| `ProfileSidebar.jsx`, `demoAnalysis.js`, `recommendationExercises.js` | C | Runtime refs removed; stale documentation refs only | Not reachable | Already removed in current working tree | `rg` shows no runtime references; only docs mention old paths | Low | Build and root route checks |
| CSS duplicate selectors in `responsive.css` and screen CSS | F | Applied by responsive breakpoints and state classes | Active responsive overrides | Keep | Duplicate selector scan found mostly breakpoint overrides, not redundant identical rules | Medium | Visual comparison at all target sizes |
| Generated `artifacts/**` screenshots and validation JSON | E | Not imported by runtime | Development evidence only | Keep | Useful validation records; not shipped by Vite app | Low | None unless packaging artifacts |

## Removal Evidence Commands

```sh
find . -path './node_modules' -prune -o \( -name '*.ts' -o -name '*.tsx' -o -name 'tsconfig*.json' \) -print
rg -n "typescript|tsc|\.ts|\.tsx|tsconfig" package.json package-lock.json vite.config.js client src scripts README.md docs --glob '!artifacts/**' --glob '!**/vendor/**'
npm ls typescript --all
for f in client/public/images/exercises/*.png; do b=$(basename "$f"); rg -n --fixed-strings "$b" client/src src scripts package.json client/index.html vite.config.js server.js public client/public --glob '!client/public/images/exercises/**' --glob '!**/vendor/**'; done
rg -n "images/exercises|/images/|exercise.*\.png|thumbnail.*png|demo.*png" client/src src scripts package.json client/index.html vite.config.js server.js public client/public --glob '!client/public/images/exercises/**' --glob '!**/vendor/**'
```
