# Per-Service OpenAI Proxy Design

## Goal

Implement reliable per-translation-service proxy behavior for OpenAI-compatible streaming
translation requests, so a user can keep DeepL direct while routing OpenAI/OpenRouter through
the configured HTTP proxy.

## Current Problem

The renderer currently sends OpenAI and AzureOpenAI streaming requests with
`fetchEventSource`. When a source has `useProxy = Y` in per-service proxy mode, the renderer
calls `window.api.agentUpdateEvent(...)` to temporarily update the Electron window session
proxy before starting the request.

That design is unreliable because Electron session proxy updates are asynchronous and
window-scoped:

- the streaming request can start before `session.setProxy(...)` has taken effect;
- the session proxy applies to the whole window, not one request;
- concurrent direct and proxied translation requests can affect each other.

Global proxy works more often because the window session is configured before requests begin.
Per-service proxy needs request-local proxy selection instead.

## Approved Approach

Move OpenAI and AzureOpenAI streaming translation transport from the renderer to the main
process. The main process will create each HTTP(S) request with or without an HTTP proxy agent
based on that translation source's `useProxy` value and the global network `proxyScope`.

This keeps proxy selection local to the request and avoids changing the Electron window
session during translation.

## Scope

In scope:

- OpenAI streaming translation requests, including OpenAI-compatible providers such as
  OpenRouter when configured through the OpenAI source.
- AzureOpenAI streaming translation requests.
- Per-service proxy mode behavior for those two streaming request types.
- Keeping the current renderer callback contract so result rendering remains unchanged.
- Verification that DeepL can remain direct while OpenAI/OpenRouter uses the proxy.

Out of scope:

- Rewriting every translation provider to run in the main process.
- Adding SOCKS proxy support.
- Adding per-service proxy credentials support.
- Changing the network settings UI beyond copy adjustments if needed.
- Changing OpenAI prompt construction, quote processing semantics, or model selection.

## User-Facing Behavior

When network settings are set to `按翻译源配置`:

- a translation source with `useProxy = Y` uses the configured proxy for its own request;
- a translation source with `useProxy = N` uses direct networking for its own request;
- DeepL with `useProxy = N` remains direct even if OpenAI/OpenRouter with `useProxy = Y`
  runs at the same time;
- OpenAI/OpenRouter no longer requires global proxy to work.

When network settings are set to `全局代理`:

- existing global proxy behavior remains unchanged;
- the per-source `useProxy` checkbox remains inactive by design.

## Architecture

### Renderer

Renderer OpenAI and AzureOpenAI request modules remain responsible for:

- building request payloads and prompts;
- creating the same quote marker state used today by `QuoteProcessor`;
- receiving streamed chunks from main-process IPC callbacks;
- preserving the existing `AgentTranslateCallbackVo` response shape.

Renderer modules stop owning actual streaming network transport for OpenAI/AzureOpenAI.
Instead they call new IPC methods such as:

- `apiOpenAIStreamTranslate(info, data)`
- `apiAzureOpenAIStreamTranslate(info, data)`

The main process streams back status and content through an IPC callback channel.

### Main Process

The main process owns OpenAI-compatible streaming HTTP transport:

- builds the final endpoint URL from the existing `info` fields;
- chooses request-local proxy behavior from `info.useProxy` plus stored `agentConfig`;
- sends a streaming POST request;
- parses server-sent event chunks;
- filters streamed deltas with the same quote marker behavior currently provided by
  `QuoteProcessor.processText(...)`;
- emits `START`, `ING`, `END`, and `ERROR` callback payloads compatible with current renderer
  expectations.

Proxy selection is request-local:

- if `agentConfig.proxyScope === PER_SERVICE`, `info.useProxy === Y`, and proxy host/port are
  configured, attach an HTTP proxy agent to this request;
- if `agentConfig.proxyScope === PER_SERVICE` and `info.useProxy !== Y`, do not attach a proxy;
- if global proxy mode is enabled, attach the configured proxy to the main-process OpenAI request
  so existing global proxy behavior is preserved after moving transport out of the renderer.

### Request Utility

Add a small main-process proxy helper instead of reusing window-session proxy helpers:

- `shouldUsePerServiceProxy(useProxy): boolean`
- `createPerServiceProxyAgent(useProxy): Agent | undefined`

These helpers must not call `session.setProxy`.

## Data Flow

OpenAI/OpenRouter translation in per-service mode:

1. User enables `使用代理` on the OpenAI translation source.
2. Renderer builds the same OpenAI request payload it builds today.
3. Renderer passes the request payload plus quote marker state to main-process streaming
   translation IPC.
4. Main process reads `agentConfig`.
5. Main process attaches a proxy agent only for this request.
6. Main process streams chunks, applies quote-marker filtering, and emits existing callback
   payloads.
7. Renderer updates the existing translation UI from the same callback shape.

DeepL direct translation in per-service mode:

1. User leaves `使用代理` off for DeepL.
2. DeepL continues using its existing direct request path.
3. No Electron session proxy change is made by OpenAI/AzureOpenAI streaming requests.

## Error Handling

Network and API errors should keep the current user-visible behavior:

- OpenAI API error frames are converted to `OpenAIStatusEnum.ERROR`.
- stream close emits `OpenAIStatusEnum.END`.
- connection failures produce the current generic connection failure behavior where possible.
- quote marker sentinels generated for prompt isolation are not shown in translated output,
  including when marker text is split across multiple stream chunks.
- errors are logged in the main process with enough context to know whether the request was
  proxied, without logging API keys or request payload contents.

The main process must always send a terminal `ERROR` or `END` callback for a started request.

## Testing Strategy

Because the repository currently has no dedicated test suite, implementation should add focused
unit tests or small testable helpers where practical:

- proxy decision helper tests for global mode, per-service direct, per-service proxied, and
  missing proxy config;
- streaming parser tests for SSE chunks with normal content, `[DONE]`, and API error frames.
- quote filtering tests where start/end marker text is split across multiple stream chunks.

Manual verification remains required:

- configure network mode as `按翻译源配置`;
- configure proxy host/port;
- set DeepL `使用代理 = N`;
- configure OpenAI source with OpenRouter endpoint and `使用代理 = Y`;
- verify OpenAI/OpenRouter succeeds without enabling global proxy;
- verify DeepL still succeeds direct;
- run concurrent direct/proxied translation if the UI supports triggering it.

Run before handoff:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Risks

- Streaming transport in main process must preserve current callback timing and payload shape,
  or the renderer can show incomplete status.
- `@fortaine/fetch-event-source` is browser-oriented; implementation may need Node-compatible
  streaming with the existing runtime dependencies or a small dependency addition.
- Moving OpenAI streaming to the main process means Electron's window session proxy no longer
  covers those requests. The design attaches the configured proxy in global mode inside the
  main-process transport to preserve existing global proxy behavior.

## Acceptance Criteria

- In per-service proxy mode, OpenAI/OpenRouter with `useProxy = Y` uses the configured proxy
  without enabling global proxy.
- In per-service proxy mode, DeepL with `useProxy = N` does not use that proxy.
- OpenAI/AzureOpenAI streaming no longer calls `window.api.agentUpdateEvent(...)` as part of
  each request.
- No implementation path temporarily changes the Electron window session proxy to satisfy
  OpenAI/AzureOpenAI per-service requests.
- Existing quote-marker filtering semantics are preserved, so generated sentinel tags are not
  displayed to users.
- Typecheck, lint, and build complete successfully or any environment blocker is documented.
