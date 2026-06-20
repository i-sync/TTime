import { cacheGet } from './cacheUtil'
import {
  isPerSourceProxyEnabled,
  shouldUseServiceProxy,
  getProxyAgentConfig
} from './translateModeConfigUtil'

interface AxiosProxyConfig {
  [key: string]: unknown
  proxy?: {
    host: string
    port: number
    protocol: string
  }
}

let sessionProxyRefCount = 0

export type SessionProxyRelease = () => void

/**
 * 为 axios 请求注入按源代理（仅在「按翻译源配置代理」模式下生效）
 */
export function applyServiceProxyToAxiosConfig(
  config: AxiosProxyConfig,
  useProxy: string | undefined
): void {
  if (!shouldUseServiceProxy(useProxy)) {
    return
  }
  const agent = getProxyAgentConfig()
  if (!agent) {
    return
  }
  config.proxy = {
    host: agent.host,
    port: Number(agent.port),
    protocol: 'http'
  }
}

/**
 * 流式 AI 请求当前仍走 Electron session 代理。按源模式下仅对启用代理的源临时开启，
 * 并通过引用计数减少并发请求之间的互相影响；这不是 request-local 代理。
 * @returns 本次请求是否启用了 session 代理（供结束时配对释放）
 */
export function enableSessionProxyForService(useProxy: string | undefined): boolean {
  if (!shouldUseServiceProxy(useProxy)) {
    const agentConfig = cacheGet('agentConfig')
    const scope = isPerSourceProxyEnabled() ? 'per_service' : 'global'
    if (scope === 'global' && agentConfig?.type === 1) {
      window.api.logInfoEvent('[按源代理] scope=global session-managed')
      return false
    }
    window.api.logInfoEvent(
      `[按源代理] scope=${scope} type=${agentConfig?.type ?? 0} useProxy=${
        useProxy ?? 'N'
      } enabled=false`
    )
    return false
  }
  sessionProxyRefCount++
  if (sessionProxyRefCount === 1) {
    window.api.logInfoEvent('[按源代理] scope=per_service useProxy=Y enabled=true')
    window.api.agentUpdateEvent(cacheGet('agentConfig'))
  }
  return true
}

/**
 * 释放本次请求占用的 session 代理（引用计数归零后才恢复直连）
 */
export function disableSessionProxyAfterService(proxyWasEnabled: boolean): void {
  if (!proxyWasEnabled || !isPerSourceProxyEnabled()) {
    return
  }
  sessionProxyRefCount = Math.max(0, sessionProxyRefCount - 1)
  if (sessionProxyRefCount === 0) {
    window.api.logInfoEvent('[按源代理] scope=per_service restored=direct')
    window.api.agentUpdateEvent({ type: 0 })
  }
}

export function createSessionProxyRelease(useProxy: string | undefined): SessionProxyRelease {
  const proxyWasEnabled = enableSessionProxyForService(useProxy)
  let released = false
  return (): void => {
    if (released) {
      return
    }
    released = true
    disableSessionProxyAfterService(proxyWasEnabled)
  }
}
