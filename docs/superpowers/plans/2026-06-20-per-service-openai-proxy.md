# Per-Service OpenAI Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenAI/OpenRouter and AzureOpenAI streaming translation use request-local proxy selection so DeepL can stay direct while OpenAI-compatible sources use the configured proxy.

**Architecture:** Move OpenAI/AzureOpenAI streaming network transport to the main process. Renderer keeps payload construction and UI callback shape, while main process sends each streaming request with or without an HTTP proxy agent based on the source's `useProxy` and `agentConfig.proxyScope`.

**Tech Stack:** Electron main/preload IPC, Vue renderer TypeScript, Node `https` streaming requests, existing `https-proxy-agent`, existing `OpenAIStatusEnum` and `AgentTranslateCallbackVo`.

---

## File Structure

- Create: `src/main/service/channel/openai/OpenAIStreamRequest.ts`
  - Main-process OpenAI/AzureOpenAI streaming HTTP transport.
  - Builds request options, attaches request-local proxy agent when required, parses response chunks, and emits callback payloads.
- Create: `src/main/service/channel/openai/OpenAIStreamParser.ts`
  - Small parser for SSE `data:` frames so parsing can be tested without network.
- Create: `src/main/service/channel/openai/OpenAIProxy.ts`
  - Main-process helper for per-service proxy decision and proxy agent creation.
- Create: `src/common/channel/translate/QuoteProcessor.ts`
  - Shared quote-marker generator/filter previously duplicated in renderer OpenAI modules.
- Modify: `src/main/service/channel/TranslateChannel.ts`
  - Add IPC handlers for OpenAI and AzureOpenAI stream transport.
- Modify: `src/preload/index.ts`
  - Expose renderer-to-main methods for OpenAI/AzureOpenAI streaming requests.
- Modify: `src/preload/index.d.ts`
  - Type the new preload methods.
- Modify: `src/renderer/src/channel/OpenAIChannelRequest.ts`
  - Replace renderer `fetchEventSource` transport with main-process IPC call for streaming translation.
- Modify: `src/renderer/src/channel/AzureOpenAIChannelRequest.ts`
  - Same as OpenAI for Azure endpoint.
- Modify: `src/renderer/src/utils/proxyUtil.ts`
  - Remove or stop using session proxy helpers for OpenAI/AzureOpenAI streaming.
- Optional test files if the repo accepts plain TypeScript helper tests:
  - Create: `src/main/service/channel/openai/OpenAIStreamParser.spec.ts`
  - Create: `src/main/service/channel/openai/OpenAIProxy.spec.ts`

## Design Reference

- Spec: `docs/superpowers/specs/2026-06-20-per-service-openai-proxy-design.md`

## Task 1: Extract Shared Quote Processor

**Files:**
- Create: `src/common/channel/translate/QuoteProcessor.ts`
- Modify: `src/renderer/src/channel/OpenAIChannelRequest.ts`
- Modify: `src/renderer/src/channel/AzureOpenAIChannelRequest.ts`

- [x] **Step 1: Move the existing quote filtering implementation**

Move the current `QuoteProcessor` class from `OpenAIChannelRequest.ts` into
`src/common/channel/translate/QuoteProcessor.ts`.

Keep the behavior identical, including:

- generated `quoteStart` / `quoteEnd` marker format;
- buffering of partial start marker text across chunks;
- buffering of partial end marker text across chunks;
- `processText(text: string): string` public API.

- [x] **Step 2: Add a constructor path for existing marker state**

Main-process streaming must use the same quote markers that were embedded into the prompt in
the renderer. Add an optional constructor input:

```ts
interface QuoteProcessorState {
  quoteStart: string
  quoteEnd: string
}
```

When state is supplied, initialize the processor with those markers instead of generating new
ones.

- [x] **Step 3: Replace renderer-local classes with imports**

In both renderer OpenAI files, remove the local `QuoteProcessor` class and import the shared
one:

```ts
import { QuoteProcessor } from '../../../common/channel/translate/QuoteProcessor'
```

Remove now-unused `uuidv4` imports from those renderer files.

- [x] **Step 4: Return quote processor state from request builders**

Keep `buildOpenAIRequest(...)` returning `quoteProcessor`, but ensure callers can pass this
state to main process:

```ts
quoteProcessor: {
  quoteStart: quoteProcessor.quoteStart,
  quoteEnd: quoteProcessor.quoteEnd
}
```

If retaining the class instance in the return value is simpler for check requests, use a
separate serialized field such as `quoteProcessorState`.

- [x] **Step 5: Typecheck this slice**

Run: `npm run typecheck`

Expected: imports resolve in both node and web TS configs.

- [x] **Step 6: Commit this slice**

```bash
git add src/common/channel/translate/QuoteProcessor.ts src/renderer/src/channel/OpenAIChannelRequest.ts src/renderer/src/channel/AzureOpenAIChannelRequest.ts
git commit -m "fix(translate): share openai quote processor"
```

## Task 2: Add Main-Process Proxy Decision Helper

**Files:**
- Create: `src/main/service/channel/openai/OpenAIProxy.ts`

- [x] **Step 1: Write the helper contract**

Create helper exports:

```ts
import createHttpsProxyAgent from 'https-proxy-agent'
import { YesNoEnum } from '../../../../common/enums/YesNoEnum'
import { ProxyScopeEnum } from '../../../../common/enums/ProxyScopeEnum'
import StoreService from '../../StoreService'
import { isNull } from '../../../../common/utils/validate'

export const shouldUseOpenAIProxy = (useProxy: string | undefined): boolean => {
  const agentConfig = StoreService.configGet('agentConfig')
  if (agentConfig?.proxyScope !== ProxyScopeEnum.PER_SERVICE) {
    return false
  }
  if (useProxy !== YesNoEnum.Y) {
    return false
  }
  return (
    !isNull(agentConfig) &&
    agentConfig.type === 1 &&
    !isNull(agentConfig.host) &&
    !isNull(agentConfig.port)
  )
}

export const createOpenAIProxyAgent = (useProxy: string | undefined) => {
  if (!shouldUseOpenAIProxy(useProxy)) {
    return undefined
  }
  const agentConfig = StoreService.configGet('agentConfig')
  return createHttpsProxyAgent({
    host: agentConfig.host,
    port: agentConfig.port
  })
}
```

- [x] **Step 2: Preserve global proxy behavior in this helper**

Confirm the helper returns an agent in global mode when proxy host/port are configured. After
OpenAI streaming moves to the main process, Electron window session proxy no longer applies to
that request, so the main-process transport must attach the configured proxy in global mode.

- [x] **Step 3: Typecheck this slice**

Run: `npm run typecheck:node`

Expected: either pass, or fail only on pre-existing unrelated issues. Fix type errors introduced by this task.

- [x] **Step 4: Commit this slice**

```bash
git add src/main/service/channel/openai/OpenAIProxy.ts
git commit -m "fix(translate): add openai per-service proxy helper"
```

## Task 3: Add SSE Parser Helper

**Files:**
- Create: `src/main/service/channel/openai/OpenAIStreamParser.ts`

- [x] **Step 1: Create parser result types**

```ts
export interface OpenAIStreamParseResult {
  contents: string[]
  errors: unknown[]
  done: boolean
  buffer: string
}
```

- [x] **Step 2: Implement chunk parser**

Implement `parseOpenAIStreamChunk(buffer: string, chunk: string): OpenAIStreamParseResult`.

Rules:

- append `chunk` to existing `buffer`;
- split completed SSE events on blank-line boundaries;
- keep the final incomplete event in `buffer`;
- for each `data:` line:
  - ignore empty data;
  - mark `done = true` for `[DONE]`;
  - parse JSON;
  - if JSON has `error`, add to `errors`;
  - if JSON has `choices[0].delta.content`, add content to `contents`.

- [x] **Step 3: Add a tiny local parser probe if no test runner is added**

If no existing test runner is available, create a temporary local check command in the plan execution notes rather than committing ad hoc scripts. Prefer keeping parser pure so it is easy to inspect and later test.

- [x] **Step 4: Typecheck this slice**

Run: `npm run typecheck:node`

Expected: introduced files typecheck.

- [x] **Step 5: Commit this slice**

```bash
git add src/main/service/channel/openai/OpenAIStreamParser.ts
git commit -m "fix(translate): add openai stream parser"
```

## Task 4: Add Main-Process OpenAI Stream Transport

**Files:**
- Create: `src/main/service/channel/openai/OpenAIStreamRequest.ts`
- Modify: `src/main/service/channel/openai/OpenAIProxy.ts`
- Modify: `src/main/service/channel/openai/OpenAIStreamParser.ts`

- [x] **Step 1: Define request input**

Create interfaces for the main-process stream call:

```ts
interface OpenAIStreamTranslatePayload {
  info: Record<string, any>
  data: Record<string, any>
  provider: 'openai' | 'azureOpenAI'
  quoteProcessorState: {
    quoteStart: string
    quoteEnd: string
  }
}
```

- [x] **Step 2: Build endpoint URL**

Implement:

- OpenAI endpoint: `(info.requestUrl || OpenAIModelEnum.REQUEST_URL) + '/v1/chat/completions'`
- Azure endpoint:
  `info.endpoint + '/openai/deployments/' + info.deploymentName + '/chat/completions?api-version=2023-05-15'`

Use `new URL(...)` so host/path/protocol are parsed by Node safely.

- [x] **Step 3: Implement streaming POST**

Use Node `https.request`:

- method `POST`;
- JSON body;
- `Content-Type: application/json`;
- OpenAI header `Authorization: Bearer ${info.appKey}`;
- Azure header `api-key: ${info.appKey}`;
- attach `agent: createOpenAIProxyAgent(info.useProxy)` only when helper returns an agent.

Do not log `appKey` or request body.

- [x] **Step 4: Preserve quote filtering before callbacks**

Create a `QuoteProcessor` in `OpenAIStreamRequest.translate(...)` using the serialized
`quoteProcessorState` supplied by the renderer.

For every parsed content delta:

```ts
const content = quoteProcessor.processText(rawContent)
```

Only emit `ING` when the filtered `content` is not empty. This preserves the current behavior
where generated quote sentinels are stripped before the UI sees streamed text, including when
sentinel text is split across stream chunks.

- [x] **Step 5: Emit callback payloads through existing main-process callback path**

Use `TranslateChannelFactory.channels[info.type + 'Channel']` and call:

- `channel.apiTranslateCallback(R.okD(new AgentTranslateCallbackVo(info, { code: START })))`
- `channel.apiTranslateCallback(R.okD(new AgentTranslateCallbackVo(info, { code: ING, content })))`
- `channel.apiTranslateCallback(R.okD(new AgentTranslateCallbackVo(info, { code: END })))`
- `channel.apiTranslateCallback(R.errorD(new AgentTranslateCallbackVo(info, { code: ERROR, error })))`

Import existing classes/enums:

- `AgentTranslateCallbackVo`
- `R`
- `OpenAIStatusEnum`
- `TranslateChannelFactory`

- [x] **Step 6: Guarantee terminal callback**

Ensure that:

- normal response end emits `END`;
- request error emits `ERROR`;
- non-2xx or non-event-stream response emits `ERROR`;
- parser errors emit `ERROR`;
- no path emits both `ERROR` and `END` for the same terminal failure.

- [x] **Step 7: Typecheck this slice**

Run: `npm run typecheck:node`

Expected: pass for introduced main-process files.

- [x] **Step 8: Commit this slice**

```bash
git add src/main/service/channel/openai/OpenAIStreamRequest.ts src/main/service/channel/openai/OpenAIProxy.ts src/main/service/channel/openai/OpenAIStreamParser.ts
git commit -m "fix(translate): stream openai requests in main process"
```

## Task 5: Add IPC Boundary

**Files:**
- Modify: `src/main/service/channel/TranslateChannel.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [x] **Step 1: Add main IPC handler**

In `TranslateChannel.ts`, import `OpenAIStreamRequest` and add:

```ts
ipcMain.handle('api-openai-stream-translate', async (_event, payload) => {
  return OpenAIStreamRequest.translate(payload)
})
```

The handler must return the Promise so `ipcRenderer.invoke(...)` can observe synchronous and
early async failures.

- [x] **Step 2: Add preload method**

In `src/preload/index.ts`, expose:

```ts
const apiOpenAIStreamTranslate = (payload): Promise<void> => {
  return ipcRenderer.invoke('api-openai-stream-translate', payload)
}
```

Add it to the exposed `api` object.

- [x] **Step 3: Add preload typing**

In `src/preload/index.d.ts`, add:

```ts
apiOpenAIStreamTranslate(payload: object): Promise<void>
```

- [x] **Step 4: Typecheck this slice**

Run: `npm run typecheck`

Expected: new API is visible to renderer.

- [x] **Step 5: Commit this slice**

```bash
git add src/main/service/channel/TranslateChannel.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "fix(translate): add openai stream ipc"
```

## Task 6: Switch Renderer OpenAI/AzureOpenAI to Main Transport

**Files:**
- Modify: `src/renderer/src/channel/OpenAIChannelRequest.ts`
- Modify: `src/renderer/src/channel/AzureOpenAIChannelRequest.ts`
- Modify: `src/renderer/src/utils/proxyUtil.ts`

- [x] **Step 1: Remove renderer session proxy usage from OpenAI**

In `OpenAIChannelRequest.ts`:

- remove `fetchEventSource` import;
- remove `EventStreamContentType` import if only used by streaming transport;
- remove `createSessionProxyRelease` import;
- keep the prompt/payload behavior unchanged;
- in `openaiTranslate`, build `{ data, quoteProcessorState }` and call:

```ts
await window.api.apiOpenAIStreamTranslate({
  provider: 'openai',
  info,
  data,
  quoteProcessorState
})
```

Do not emit duplicate `START`; main process will emit it.

- [x] **Step 2: Remove renderer session proxy usage from AzureOpenAI**

Apply the same pattern with:

```ts
await window.api.apiOpenAIStreamTranslate({
  provider: 'azureOpenAI',
  info,
  data,
  quoteProcessorState
})
```

- [x] **Step 3: Keep check requests unchanged**

Leave `openaiCheck` paths alone for now. They are non-streaming axios calls and currently follow existing request behavior. If check requests also need per-service proxy later, handle that as a separate scoped change.

- [x] **Step 4: Clean up unused session proxy helpers**

If `createSessionProxyRelease`, `enableSessionProxyForService`, and
`disableSessionProxyAfterService` become unused, remove them from `proxyUtil.ts`.

Keep `applyServiceProxyToAxiosConfig` because DeepL uses it.

- [x] **Step 5: Typecheck renderer**

Run: `npm run typecheck:web`

Expected: no unused imports or missing preload typings.

- [x] **Step 6: Commit this slice**

```bash
git add src/renderer/src/channel/OpenAIChannelRequest.ts src/renderer/src/channel/AzureOpenAIChannelRequest.ts src/renderer/src/utils/proxyUtil.ts
git commit -m "fix(translate): use main transport for openai streams"
```

## Task 7: Verification

**Files:**
- No required file changes unless verification finds issues.

- [x] **Step 1: Run full typecheck**

Run: `npm run typecheck`

Expected: pass.

- [x] **Step 2: Run lint**

Run: `npm run lint`

Expected: pass. Review any auto-fixes before committing.

- [x] **Step 3: Run build**

Run: `npm run build`

Expected: pass.

- [ ] **Step 4: Manual behavior check**

Run: `npm run dev`

Manual steps:

- set network mode to `按翻译源配置`;
- configure HTTP proxy host/port;
- set DeepL `使用代理 = N`;
- configure OpenAI with OpenRouter endpoint and `使用代理 = Y`;
- verify OpenAI/OpenRouter succeeds without global proxy;
- verify DeepL succeeds direct;
- trigger both paths close together if practical and confirm no session proxy switching logs appear for OpenAI streaming.

- [ ] **Step 5: Inspect logs**

Expected:

- OpenAI stream logs show whether request-local proxy was used;
- logs do not include API keys or prompt/request body;
- no per-request `agentUpdateEvent` is used by OpenAI/AzureOpenAI streaming.

- [x] **Step 6: Verify quote marker filtering**

Use an OpenAI-compatible test response, or temporarily instrument parser-level checks, to
confirm the UI does not display generated quote marker tags such as `<abcd>` or `</abcd>` even
when the model streams marker characters in separate chunks.

- [x] **Step 7: Final commit**

```bash
git status --short
git add <verification-related changed files if any>
git commit -m "fix(translate): isolate openai per-source proxy"
```

## Notes For Implementer

- Do not use Electron `session.setProxy(...)` to satisfy OpenAI/AzureOpenAI per-service requests.
- Do not change DeepL request behavior except preserving its existing axios proxy helper.
- Avoid adding dependencies unless Node 20/Electron 20 constraints make `https.request` impractical.
- Treat OpenRouter as an OpenAI-compatible endpoint through the existing OpenAI source settings.
- Do not log credentials, API keys, full prompts, or full request payloads.
- If the main-process stream implementation becomes large, keep parsing and proxy decision logic in separate helpers as planned.

## Execution Notes

- 2026-06-20: Implemented main-process OpenAI/AzureOpenAI stream transport with request-local proxy agent selection, shared quote filtering, IPC/preload bridge, and renderer handoff.
- 2026-06-20: Addressed review P1 by applying `QuoteProcessor.processText(...)` in main-process streaming before `ING` callbacks, including split marker chunks.
- 2026-06-20: Addressed review P2 by returning `OpenAIStreamRequest.translate(payload)` from the IPC handler.
- 2026-06-20: Verified locally with `npm run lint`, `npm exec eslint -- . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts,.vue`, `npm run typecheck`, `npm run build`, and a `tsx` quote/SSE parser probe.
- 2026-06-20: Committed implementation as `7c252cd fix(translate): isolate openai per-source proxy`; slice commit checkpoints are covered by that final commit.
- Not completed locally: live `npm run dev` manual behavior check against real OpenRouter/API credentials plus a configured proxy.
