import { shouldUseServiceProxy, getProxyAgentConfig } from './translateModeConfigUtil'

interface AxiosProxyConfig {
  [key: string]: unknown
  proxy?: {
    host: string
    port: number
    protocol: string
  }
}

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
