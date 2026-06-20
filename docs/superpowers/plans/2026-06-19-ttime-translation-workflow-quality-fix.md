# TTime Translation Workflow Quality Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the implementation gaps between `docs/ttime-optimization-analysis.md`, `temp/issues.txt`, and the current Phase 1-3 code, especially multi-OpenAI execution, per-source proxy behavior, OpenAI model configuration, and release version safety.

**Architecture:** Move translation execution from service-type identity to service-instance identity. Keep `type` as the channel router, but use `serviceId + requestId` for request planning, result routing, history, and UI ownership. Treat proxy behavior and release/version checks as explicit boundaries with testable guards.

**Tech Stack:** Electron, Vue 3, TypeScript, electron-vite, Element Plus, npm scripts.

## Execution Status - 2026-06-20

Implemented code/config/doc changes for Tasks 1-5. Automatic verification completed where the
repository/environment allows it:

- `npm run build`: passed.
- `git diff --check`: passed.
- Targeted ESLint on modified source files: 0 errors; existing `AutoUpdater.ts` warnings remain.
- `npm run typecheck`: passed.
- `NO_SANDBOX=1 timeout 25 npm run dev`: reached Electron app startup and startup API logs; command
  ended by timeout after the short verification window. The run also confirmed version check reports
  `0.9.16` as current and no update needed.

The real OpenAI/custom-model/per-source-proxy workflow matrix still requires manual verification
with valid service credentials and proxy configuration. Commit steps are left unchecked until the
repository owner explicitly chooses the final commit boundaries.

Commit boundary selected on 2026-06-20: repository owner requested committing the current staged
implementation as a single consolidated release-prep commit before post-release manual testing.

Local evidence collected on 2026-06-20 confirms the executable code paths for the manual matrix:

- Multi-OpenAI planning/rendering uses `serviceId` keyed requests, history rows, refs, and callback
  filtering.
- OpenAI preset/custom model state is separated in the UI and the request builder resolves
  `customModel` before dispatch.
- Proxy routing emits non-sensitive global/per-service/direct logs and stream proxy release is
  centralized.
- Package version is `0.9.16`; the local highest version tag is `v0.9.2`.

Additional startup fix made during verification: Linux tray icon loading now uses the existing
`public/icon-16x16.png` asset instead of missing `public/logo-16x16.png`.

---

## File Structure

- Modify `src/renderer/src/utils/translateExecutionUtil.ts`: build one request per service instance, not one request per service type.
- Modify `src/renderer/src/translate/components/Input.vue`: dispatch execution requests by service instance and preserve result state by `serviceId`.
- Modify `src/renderer/src/translate/components/channel/InputResultContentChannel.vue`: ignore callback payloads for other `serviceId/requestId`.
- Modify `src/renderer/src/translate/components/InputResultContent.vue`: keep channel refs keyed by `serviceId`; verify primary result lookup after execution model change.
- Modify `src/renderer/src/set/components/fun/serviceConfig/TranslateService.vue`: allow multiple OpenAI-compatible instances where required and replace mixed `allow-create` model entry with preset/custom split.
- Modify OpenAI service metadata defaults in `src/common/channel/translate/info/OpenAIInfo.ts` and related model enum/types if needed.
- Modify `src/renderer/src/utils/translateModeConfigUtil.ts`, `src/renderer/src/utils/proxyUtil.ts`, `src/renderer/src/channel/OpenAIChannelRequest.ts`, and `src/renderer/src/channel/AzureOpenAIChannelRequest.ts`: make per-source proxy behavior explicit and verifiable.
- Modify `src/main/service/AutoUpdater.ts`, `package.json`, and release metadata/workflow files as needed for version safety.
- Modify `docs/ttime-optimization-analysis.md`: update implementation status and known deviations after fixes.

## Task 1: Make Translation Execution Service-Instance Based

**Files:**
- Modify: `src/renderer/src/utils/translateExecutionUtil.ts`
- Modify: `src/renderer/src/translate/components/Input.vue`
- Modify: `src/renderer/src/translate/components/InputResultContent.vue`
- Modify: `src/renderer/src/translate/components/channel/InputResultContentChannel.vue`
- Modify: `src/renderer/src/set/components/fun/serviceConfig/TranslateService.vue`
- Test/verify: `npm run typecheck`

- [x] **Step 1: Add execution request type**

In `translateExecutionUtil.ts`, replace `requestMap: Map<string, TranslateRequestPayload>` with an array:

```ts
export type TranslateExecutionRequest = {
  serviceId: string
  serviceType: string
  payload: TranslateRequestPayload
}
```

Expected: `TranslateExecutionPlan` exposes `requests: TranslateExecutionRequest[]`.

- [x] **Step 2: Preserve service identity in payload**

When building each payload, include:

```ts
info.id = translateService.id
info.serviceId = translateService.id
info.serviceType = translateService.type
```

Expected: every callback can identify the exact configured translation source instance.

- [x] **Step 3: Remove same-type de-duplication**

Delete this logic:

```ts
if (requestMap.has(type)) {
  continue
}
requestMap.set(type, info)
```

Replace with `requests.push({ serviceId: translateService.id, serviceType: type, payload: info })`.

Expected: two enabled OpenAI services produce two execution requests.

- [x] **Step 4: Remove same-type service shutdown for OpenAI-compatible services**

In `TranslateService.vue`, inspect `serviceCloseOtherSameTypesInUse()` and its callers in `apiCheckTranslateCallbackEvent()` and `serviceUseStatusChange()`. Change the behavior so OpenAI-compatible services that need multiple configured instances are not mutually disabled.

At minimum, exempt these types from same-type shutdown:

```ts
TranslateServiceEnum.OPEN_AI
```

Only extend the exemption to `AZURE_OPEN_AI` if the product requirement is to allow multiple Azure deployments at once.

Expected: after validating or enabling one OpenAI service, existing enabled OpenAI services remain enabled.

- [x] **Step 5: Update empty and history handling**

In `Input.vue`, replace `plan.requestMap.size` checks with `plan.requests.length`. Build `TranslateServiceRecordVo` from `plan.requests`, using `request.serviceType` and `request.serviceId`.

When `plan.translateRecordVo` exists, cache the active request id before dispatching:

```ts
cacheSet('activeTranslateRequestId', plan.translateRecordVo.requestId)
```

Expected: translation history records one row per active service instance.

- [x] **Step 6: Dispatch by channel type, not map key**

In `Input.vue`, replace request dispatch with:

```ts
plan.requests.forEach((request) => {
  window.api.apiUniteTranslate(request.serviceType, request.payload)
})
```

Expected: channel routing still uses existing `type`, but no same-type instance is dropped.

- [x] **Step 7: Filter callbacks by delivered service identity**

In `InputResultContentChannel.vue`, at the start of the callback handler, ignore results whose payload does not belong to this channel. For stream callbacks from OpenAI/Azure/TTimeAI, the main-process channel converts results with `R.okCIT(...)`, so the renderer receives a `TranslateVo` in `res.data`. The delivered identity fields are `data.translateServiceId` and `data.requestId`.

```ts
const data = res.data
if (data?.translateServiceId && data.translateServiceId !== translateServiceThis.value.id) {
  return
}
```

Also use `requestId` when available to ignore late chunks from a previous translation request:

```ts
const activeRequestId = cacheGet('activeTranslateRequestId')
if (activeRequestId && data?.requestId && data.requestId !== activeRequestId) {
  return
}
```

For non-stream callbacks, use the same delivered fields when they are produced through `R.okIT(...)` / `R.okCIT(...)`. Only fall back to `data.id` or `data.request.id` for callbacks that still deliver raw `AgentTranslateCallbackVo` payloads.

Expected: two OpenAI result panels do not append each other's stream chunks.

- [x] **Step 8: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected: TypeScript passes or reports only pre-existing unrelated errors. Fix any errors introduced by this task.

Result: `npm run typecheck` passed on 2026-06-20.

- [ ] **Step 9: Manual verification**

Run:

```bash
npm run dev
```

Enable two OpenAI-compatible sources with different names/models. Trigger a translation mode that routes to AI.

Expected: both configured OpenAI services remain enabled, appear, and receive separate results.

Local evidence: `buildTranslateExecutionPlan()` now emits `requests[]` keyed by `serviceId`, the
result container stores refs by `serviceId`, stream callbacks filter on delivered
`data.translateServiceId` and `data.requestId`, and `TranslateService.vue` exempts OpenAI from
same-type shutdown. Live API confirmation still requires two valid OpenAI-compatible credentials.

- [x] **Step 10: Commit**

```bash
git add src/renderer/src/utils/translateExecutionUtil.ts src/renderer/src/translate/components/Input.vue src/renderer/src/translate/components/InputResultContent.vue src/renderer/src/translate/components/channel/InputResultContentChannel.vue src/renderer/src/set/components/fun/serviceConfig/TranslateService.vue
git commit -m "fix(translate): route results by service instance"
```

## Task 2: Split OpenAI Preset Model and Custom Model Input

**Files:**
- Modify: `src/renderer/src/set/components/fun/serviceConfig/TranslateService.vue`
- Modify: `src/common/channel/translate/info/OpenAIInfo.ts`
- Modify: `src/common/enums/OpenAIModelEnum.ts` if the model list lives there
- Modify: request construction only if needed in `src/renderer/src/channel/OpenAIChannelRequest.ts`
- Test/verify: `npm run typecheck`

- [x] **Step 1: Define custom model sentinel**

Add a constant near the model list:

```ts
const CUSTOM_OPENAI_MODEL = '__custom__'
```

Expected: UI can distinguish "custom model" from a literal model name.

- [x] **Step 2: Remove mixed free input**

In the OpenAI model `<el-select>`, remove `allow-create` and `default-first-option`.

Expected: users can only choose known options or "自定义".

- [x] **Step 3: Add custom option and input**

Add an option labeled `自定义` with value `CUSTOM_OPENAI_MODEL`. Add a separate `<el-input>` shown only when `translateServiceThis.model === CUSTOM_OPENAI_MODEL`, bound to `translateServiceThis.customModel`.

Expected: model selection and model text entry are separate controls.

- [x] **Step 4: Persist custom model through service metadata**

In `OpenAIInfo.ts`, add `customModel` to `defaultInfo`:

```ts
defaultInfo: {
  model: 'gpt-3.5-turbo',
  customModel: '',
  requestUrl: 'https://api.openai.com',
  useProxy: 'N'
}
```

Expected: `translateServiceCheckAndSave()` copies `customModel` into the check payload, and `apiCheckTranslateCallbackEvent()` saves it through the existing `defaultInfo` key loop.

- [x] **Step 5: Add migration for existing custom values**

When selecting/loading a service, if `type === OPEN_AI`, `model` is not empty, and `model` is not in the known model list, move it to `customModel` and set `model = CUSTOM_OPENAI_MODEL`.

Expected: existing OpenRouter/Ollama configs keep working after UI change.

- [x] **Step 6: Resolve effective model before check/save/request**

Before validation and request payload construction, resolve:

```ts
const effectiveModel =
  info.model === CUSTOM_OPENAI_MODEL ? String(info.customModel || '').trim() : info.model
```

Use `effectiveModel` in the OpenAI request body. Reject empty custom model values during validation.

Expected: API receives the actual model name, not `__custom__`.

- [x] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run dev
```

Expected: preset model saves normally; custom model requires the custom input and sends the custom value.

Result: code path verified by lint/build and dev startup. Live preset/custom API requests still need
credentials for manual confirmation.

- [x] **Step 8: Commit**

```bash
git add src/renderer/src/set/components/fun/serviceConfig/TranslateService.vue src/common/channel/translate/info/OpenAIInfo.ts src/common/enums/OpenAIModelEnum.ts src/renderer/src/channel/OpenAIChannelRequest.ts
git commit -m "fix(openai): split preset and custom model settings"
```

Adjust the `git add` list to only include files actually changed.

## Task 3: Make Per-Source Proxy Behavior Testable and Correct

**Files:**
- Modify: `src/renderer/src/utils/proxyUtil.ts`
- Modify: `src/renderer/src/utils/translateModeConfigUtil.ts`
- Modify: `src/renderer/src/channel/OpenAIChannelRequest.ts`
- Modify: `src/renderer/src/channel/AzureOpenAIChannelRequest.ts`
- Modify: `src/main/utils/RequestUtil.ts` only if main-process behavior needs a guard
- Test/verify: `npm run typecheck`, manual proxy checks

- [x] **Step 1: Decide whether stream proxy can be request-local**

Inspect `@fortaine/fetch-event-source` usage and Electron constraints. Prefer a request-local implementation that does not call `window.api.agentUpdateEvent()` to mutate the whole session for one source.

If request-local stream proxy is practical, implement that path and remove the session-level temporary proxy toggle from per-source mode.

Expected: per-source proxy does not affect unrelated services or window requests.

Decision: retained Electron session proxy for stream requests and documented the boundary; release
handling and logs now make the retained behavior explicit.

- [x] **Step 2: Document any retained session boundary in code**

Add a short comment in `proxyUtil.ts` explaining whether stream requests use session proxy or request-local proxy. Keep the comment factual and temporary if the implementation remains session-based.

Expected: future maintainers do not assume per-request isolation where it does not exist.

- [x] **Step 3: Ensure proxy release happens once**

In OpenAI and Azure OpenAI stream requests, wrap `fetchEventSource` with `try/finally` or a small release helper so `disableSessionProxyAfterService(proxyWasEnabled)` cannot be skipped or called repeatedly across `onopen`, `onclose`, and `onerror`.

Expected: failed stream requests do not leave session proxy enabled.

- [x] **Step 4: Verify per-source activation condition**

In `translateModeConfigUtil.ts`, confirm `shouldUseServiceProxy(info.useProxy)` requires both:

```ts
agentConfig.proxyScope === ProxyScopeEnum.PER_SERVICE
info.useProxy === YesNoEnum.Y
```

Expected: per-source proxy does not activate when global mode is selected or source checkbox is off.

- [x] **Step 5: Add logging for proxy path**

Log only non-sensitive proxy path decisions, for example:

```ts
window.api.logInfoEvent('[OpenAI代理] 按源代理启用')
```

Do not log API keys or request bodies.

Expected: manual verification can distinguish global, per-source, and direct paths.

- [x] **Step 6: Add an executable proxy-state check**

Add or use logs that identify the proxy path for each stream request:

```text
[OpenAI代理] scope=per_service useProxy=Y enabled=true
[OpenAI代理] scope=per_service useProxy=N enabled=false
[OpenAI代理] scope=global session-managed
```

If using Electron session proxy is retained, also log when `window.api.agentUpdateEvent({ type: 0 })` restores direct mode.

Expected: an agent can verify proxy behavior from logs without packet inspection.

- [ ] **Step 7: Manual verification matrix**

Run:

```bash
npm run dev
```

Verify:

- Global proxy + OpenAI unchecked: OpenAI uses global proxy.
- Per-source proxy + OpenAI unchecked: OpenAI goes direct.
- Per-source proxy + OpenAI checked: OpenAI uses proxy.
- Per-source proxy + DeepL unchecked: DeepL goes direct.

Local evidence: `shouldUseServiceProxy()` only enables per-source proxy when global mode is
per-service and the source `useProxy` flag is `Y`; `proxyUtil.ts` logs global session-managed,
per-service enabled, disabled, and restored-direct paths. Live confirmation still requires an
actual proxy endpoint and real OpenAI/DeepL requests.

Expected: behavior matches the network settings text.

- [x] **Step 8: Commit**

```bash
git add src/renderer/src/utils/proxyUtil.ts src/renderer/src/utils/translateModeConfigUtil.ts src/renderer/src/channel/OpenAIChannelRequest.ts src/renderer/src/channel/AzureOpenAIChannelRequest.ts src/main/utils/RequestUtil.ts
git commit -m "fix(proxy): stabilize per-source stream proxy handling"
```

Adjust the `git add` list to only include files actually changed.

## Task 4: Fix Release Version Safety

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` if version changes there
- Modify: `src/main/service/AutoUpdater.ts`
- Modify: `.github/workflows/release-windows.yml` if tag/version guards are added
- Modify: `electron-builder.yml` release notes if this release is being prepared
- Test/verify: `npm run typecheck`

- [x] **Step 1: Choose the next valid version from an explicit source**

Check the latest already published version using at least one explicit source:

```bash
git tag --sort=-v:refname | head -20
```

If release tags are incomplete, also check GitHub Releases or the version API used by `TTimeRequest.getVersionInfo()`. If `0.9.15` exists, set the next version to `0.9.16` for a patch release or `0.10.0` for a larger workflow release.

Expected: no new artifact has a version lower than an already published version.

Result: local tags show `v0.9.2`; package metadata is now `0.9.16`.

- [x] **Step 2: Update package metadata**

Update `package.json` and `package-lock.json` version fields consistently.

Expected: `node -p "require('./package.json').version"` prints the intended version.

- [x] **Step 3: Add semantic version comparison guard before update event dispatch**

In `AutoUpdater.ts`, compare raw server `newVersion` and `thisVersion` before calling `checkUpdate()` or `forcedUpdate()`. Do this before `forcedUpdate()` decorates the version string with ` - 此版本须必更`.

Do not use string comparison. Add a semantic version helper that strips a leading `v`, ignores build/prerelease suffixes for the stable comparison, splits numeric segments, and compares each numeric segment:

```ts
function compareSemverLike(left: string, right: string): number {
  const normalize = (version: string): number[] =>
    String(version)
      .trim()
      .replace(/^v/i, '')
      .split(/[+-]/)[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)

  const leftParts = normalize(left)
  const rightParts = normalize(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index++) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) {
      return diff > 0 ? 1 : -1
    }
  }
  return 0
}
```

If `compareSemverLike(newVersion, thisVersion) <= 0`, send `UPDATE_NOT_AVAILABLE` and return.

Expected: a server-side stale version cannot prompt a downgrade.

- [x] **Step 4: Add workflow guard**

In `.github/workflows/release-windows.yml`, ensure tag releases match `package.json.version`. For tag `v0.9.16`, fail if package version is not `0.9.16`.

Expected: CI cannot publish mismatched tags and package versions.

- [x] **Step 5: Check release notes and update records**

Review `electron-builder.yml` `releaseInfo.releaseNotes` and any update-record source used by the release process. Update stale notes if this build is being released; otherwise explicitly document that release notes are out of scope for this patch.

Expected: installer metadata and update prompt text do not describe an unrelated old release.

- [x] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm run build
```

If a small comparator helper is added, manually exercise it with versions:

```text
0.9.16 > 0.9.15
0.10.0 > 0.9.15
0.9.2 < 0.9.15
```

Expected: no downgrade update prompt path remains.

Result: `npm run typecheck` and `npm run build` passed on 2026-06-20. Manual semver checks
confirmed `0.9.16 > 0.9.15`, `0.10.0 > 0.9.15`, and `0.9.2 < 0.9.15`.

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json src/main/service/AutoUpdater.ts .github/workflows/release-windows.yml electron-builder.yml
git commit -m "fix(release): prevent downgrade update prompts"
```

Adjust the `git add` list to only include files actually changed.

## Task 5: Reconcile the Optimization Analysis Document

**Files:**
- Modify: `docs/ttime-optimization-analysis.md`
- Test/verify: read-through only

- [x] **Step 1: Update document status**

Change the header from "实施完成版" to a status that reflects the audit and fixes, such as "实施审计与修正版".

Expected: the document no longer overstates current completion.

- [x] **Step 2: Add implementation deviation notes**

Add a short section covering the four audited deviations:

- OpenAI model selection was initially mixed via `allow-create`; fixed by preset/custom split.
- Translation execution originally de-duplicated by `type`; fixed by service-instance execution.
- Per-source proxy has explicit stream-request behavior and verification.
- Release version must be monotonic and guarded locally.

Expected: future contributors understand why these changes exist.

- [x] **Step 3: Update acceptance checklist**

Replace any stale `[x]` entries that were only partially true with either fixed confirmation or a note describing the remaining boundary.

Expected: checklist matches implemented behavior.

- [x] **Step 4: Verify consistency**

Search the document for stale claims:

```bash
rg "allow-create|按源|0\\.9\\.2|已完成|requestMap|type" docs/ttime-optimization-analysis.md
```

Expected: remaining claims are accurate and intentional.

Result: stale implementation terms remain only in this execution plan as historical instructions;
`docs/ttime-optimization-analysis.md` reflects the corrected implementation and known proxy
boundary.

- [x] **Step 5: Commit**

```bash
git add docs/ttime-optimization-analysis.md
git commit -m "docs: reconcile translation workflow implementation status"
```

## Final Verification

- [x] Run:

```bash
npm run typecheck
npm run lint
```

Result: `npm run typecheck` passed on 2026-06-20. The repository `npm run lint` script is
destructive because it runs ESLint with `--fix`, so it was not used on the dirty worktree.
Equivalent non-writing ESLint checks were run instead:

- Targeted ESLint on changed source files: 0 errors, with existing `AutoUpdater.ts` warnings.
- Full non-writing ESLint: fails on pre-existing repository-wide errors, including
  `modules-update.ts`, `node_modules_update`, and old renderer utilities.

- [x] Run the app:

```bash
npm run dev
```

Result: `NO_SANDBOX=1 timeout 25 npm run dev` reached Electron app startup and startup API logs in
this root environment. The command ended by timeout after the short verification window.

- [ ] Verify these user workflows:

- Add OpenAI with a preset model.
- Add OpenAI with a custom OpenRouter/Ollama model.
- Enable two OpenAI-compatible services and confirm both render separate results.
- Use 润色, 对照, 翻译 modes.
- Use 润色 + 对照 dual output.
- Use per-source proxy with OpenAI enabled and DeepL direct.
- Confirm the app version is higher than the previous published version.

Local evidence covered:

- Preset/custom OpenAI model paths are separated and `buildOpenAIRequest()` resolves the effective
  model before dispatch.
- Multi-instance OpenAI routing is service-instance based rather than service-type based.
- 润色, 对照, 翻译, and 润色+对照 modes are represented in `translateModeUtil.ts` and
  `translateExecutionUtil.ts`, including partial dual-output messages.
- Package version is `0.9.16`, above the local published tag evidence `v0.9.2`, and update dispatch
  now uses numeric semver comparison.

Live workflow confirmation still requires valid OpenAI-compatible credentials and proxy
configuration.

- [x] Commit final fixes if verification finds issues:

```bash
git add <changed-files>
git commit -m "fix: address translation workflow verification issues"
```
