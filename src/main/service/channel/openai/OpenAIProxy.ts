import createHttpsProxyAgent from 'https-proxy-agent'
import { YesNoEnum } from '../../../../common/enums/YesNoEnum'
import { ProxyScopeEnum } from '../../../../common/enums/ProxyScopeEnum'
import { isNull } from '../../../../common/utils/validate'
import StoreService from '../../StoreService'

export const shouldUseOpenAIProxy = (useProxy: string | undefined): boolean => {
  const agentConfig = StoreService.configGet('agentConfig')
  const hasProxyConfig =
    !isNull(agentConfig) &&
    agentConfig.type === 1 &&
    !isNull(agentConfig.host) &&
    !isNull(agentConfig.port)
  if (!hasProxyConfig) {
    return false
  }
  if (agentConfig?.proxyScope === ProxyScopeEnum.PER_SERVICE) {
    return useProxy === YesNoEnum.Y
  }
  return true
}

export const createOpenAIProxyAgent = (useProxy: string | undefined): unknown => {
  if (!shouldUseOpenAIProxy(useProxy)) {
    return undefined
  }
  const agentConfig = StoreService.configGet('agentConfig')
  return createHttpsProxyAgent({
    host: agentConfig.host,
    port: agentConfig.port
  })
}
