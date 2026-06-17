import { getDefaultRolePrompt } from '../../../common/channel/translate/ModePromptDefaults'
import { cacheGet, cacheSet } from './cacheUtil'
import { isNull } from '../../../common/utils/validate'
import { YesNoEnum } from '../../../common/enums/YesNoEnum'
import { ProxyScopeEnum } from '../../../common/enums/ProxyScopeEnum'
import { getTranslateServiceMapByUse } from './translateServiceUtil'
import TranslateServiceEnum from '../../../common/enums/TranslateServiceEnum'

const CUSTOM_PROMPTS_KEY = 'customModePrompts'
const MODE_SERVICE_BINDINGS_KEY = 'modeServiceBindings'
const MODE_LANGUAGE_PAIRS_KEY = 'modeLanguagePairs'

export type CustomModePrompts = Record<string, { rolePrompt?: string }>
export type ModeServiceBindings = Record<string, string>
export type ModeLanguagePair = { inputLanguage: object; resultLanguage: object }
export type ModeLanguagePairs = Record<string, ModeLanguagePair>

export function getCustomModePrompts(): CustomModePrompts {
  const cached = cacheGet(CUSTOM_PROMPTS_KEY)
  return isNull(cached) ? {} : cached
}

export function setCustomModePrompts(prompts: CustomModePrompts): void {
  cacheSet(CUSTOM_PROMPTS_KEY, prompts)
}

export function getCustomRolePrompt(mode: string): string {
  const custom = getCustomModePrompts()[mode]?.rolePrompt
  if (!isNull(custom) && String(custom).trim() !== '') {
    return String(custom).trim()
  }
  return getDefaultRolePrompt(mode)
}

export function resetCustomRolePrompt(mode: string): void {
  const prompts = getCustomModePrompts()
  if (prompts[mode]) {
    delete prompts[mode]
    setCustomModePrompts(prompts)
  }
}

export function getModeServiceBindings(): ModeServiceBindings {
  const cached = cacheGet(MODE_SERVICE_BINDINGS_KEY)
  return isNull(cached) ? {} : cached
}

export function setModeServiceBinding(mode: string, serviceId: string): void {
  const bindings = getModeServiceBindings()
  if (isNull(serviceId) || serviceId === '') {
    delete bindings[mode]
  } else {
    bindings[mode] = serviceId
  }
  cacheSet(MODE_SERVICE_BINDINGS_KEY, bindings)
}

export function getBoundServiceForMode(mode: string): any | null {
  const serviceId = getModeServiceBindings()[mode]
  if (isNull(serviceId) || serviceId === '') {
    return null
  }
  const service = getTranslateServiceMapByUse().get(serviceId)
  return service ?? null
}

export function getModeLanguagePairs(): ModeLanguagePairs {
  const cached = cacheGet(MODE_LANGUAGE_PAIRS_KEY)
  return isNull(cached) ? {} : cached
}

export function saveCurrentModeLanguagePair(mode: string): void {
  const inputLanguage = cacheGet('inputLanguage')
  const resultLanguage = cacheGet('resultLanguage')
  if (isNull(inputLanguage) || isNull(resultLanguage)) {
    return
  }
  const pairs = getModeLanguagePairs()
  pairs[mode] = { inputLanguage, resultLanguage }
  cacheSet(MODE_LANGUAGE_PAIRS_KEY, pairs)
}

export function restoreModeLanguagePair(mode: string): boolean {
  const pair = getModeLanguagePairs()[mode]
  if (isNull(pair)) {
    return false
  }
  cacheSet('inputLanguage', pair.inputLanguage)
  cacheSet('resultLanguage', pair.resultLanguage)
  return true
}

export function isPerSourceProxyEnabled(): boolean {
  const agentConfig = cacheGet('agentConfig')
  return agentConfig?.proxyScope === ProxyScopeEnum.PER_SERVICE
}

export function shouldUseServiceProxy(useProxy: string | undefined): boolean {
  if (useProxy !== YesNoEnum.Y) {
    return false
  }
  if (!isPerSourceProxyEnabled()) {
    return false
  }
  return getProxyAgentConfig() !== null
}

export function getProxyAgentConfig(): { host: string; port: string } | null {
  const agentConfig = cacheGet('agentConfig')
  if (
    isNull(agentConfig) ||
    agentConfig.type !== 1 ||
    isNull(agentConfig.host) ||
    isNull(agentConfig.port)
  ) {
    return null
  }
  return { host: agentConfig.host, port: agentConfig.port }
}

export const PROXY_CAPABLE_SERVICE_TYPES = new Set([
  TranslateServiceEnum.OPEN_AI,
  TranslateServiceEnum.AZURE_OPEN_AI,
  TranslateServiceEnum.DEEP_L,
  TranslateServiceEnum.DEEP_L_BUILT_IN
])

export function isProxyConfigurableService(type: string): boolean {
  return PROXY_CAPABLE_SERVICE_TYPES.has(type)
}
