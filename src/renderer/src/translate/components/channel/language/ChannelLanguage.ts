import {
  getTranslateServiceMapByUse,
  TranslateServiceBuilder
} from '../../../../utils/translateServiceUtil'
import {
  PSEUDO_LANGUAGE_NAMES,
  shouldFilterPseudoLanguages
} from '../../../../utils/translateModeUtil'

type LanguageService = { name: string; type: string; logo: string; languageType?: string }
type ChannelLanguage = {
  languageName: string
  languageType?: string
  serviceList: LanguageService[]
}

const languageMap = new Map<string, ChannelLanguage[]>()

// 获取所有翻译源对应可翻译语言
const channelModules = import.meta.glob('../../../../../../common/channel/translate/info/*.ts')
// 构建翻译语言
for (const modulePath in channelModules) {
  const moduleName = modulePath.split('/').pop().split('.')[0]
  const channelCode = moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace('Info', '')
  const module = (await channelModules[modulePath]()) as { default: { languageList: [] } }
  const languageList = module.default.languageList
  languageMap.set(channelCode, injectService(languageList, channelCode))
}

/**
 * 注入服务名称
 *
 * @param list 列表
 * @param serviceEnum 服务类型
 */
function injectService(list: ChannelLanguage[], serviceEnum: string): ChannelLanguage[] {
  return list.map((value) => {
    return {
      ...value,
      serviceList: [TranslateServiceBuilder.getInfoByService(serviceEnum)]
    }
  })
}

/**
 * 合并多个翻译支持的语言
 *
 * @param listArray 翻译支持语言数组
 */
const mergeLanguageList = (listArray: ChannelLanguage[][]): ChannelLanguage[] => {
  // 以翻译名称为key的集合
  const merged: Record<string, ChannelLanguage> = {}
  // 遍历所有翻译列表
  for (let i = 0; i < listArray.length; i++) {
    const list = listArray[i]
    for (let j = 0; j < list.length; j++) {
      const item = list[j]
      // 获取翻译语言类型
      const languageType = item.languageType
      // 获取翻译语言名称
      const languageName = item.languageName
      // 校验翻译语言是否已经存在集合中
      if (!merged[languageName]) {
        // 翻译语言还不在集合中则进行创建
        merged[languageName] = {
          languageName: item.languageName,
          serviceList: []
        }
      }
      // 翻译语言 已在集合中则遍历 翻译语言 中 已配置的 翻译源
      const serviceList = merged[languageName].serviceList
      for (let k = 0; k < item.serviceList.length; k++) {
        // 翻译源信息
        const service = item.serviceList[k]
        serviceList.push({
          name: service.name,
          type: service.type,
          logo: service.logo,
          languageType: languageType
        })
      }
    }
  }
  return Object.values(merged)
}

let languageList: ChannelLanguage[]
let languageListAll: ChannelLanguage[] = []

const buildMergedLanguageList = (): ChannelLanguage[] => {
  const languageArray: ChannelLanguage[][] = []
  const translateServiceMapData = getTranslateServiceMapByUse()
  for (const translateService of translateServiceMapData.values()) {
    languageArray.push(languageMap.get(translateService['type']) ?? [])
  }
  return mergeLanguageList(languageArray)
}

/**
 * 加载翻译支持的语言列表（选择器用，模式 UI 下过滤伪语言）
 */
const initLanguageList = (): ChannelLanguage[] => {
  languageListAll = buildMergedLanguageList()
  languageList = shouldFilterPseudoLanguages()
    ? languageListAll.filter((lang) => !PSEUDO_LANGUAGE_NAMES.includes(lang.languageName))
    : languageListAll
  return languageList
}

/**
 * 根据语言名称查询语言信息（查全量列表，兼容旧版伪语言配置）
 *
 * @param languageName 语言名称
 */
const findLanguageByLanguageName = (languageName): ChannelLanguage | undefined => {
  if (languageListAll.length === 0) {
    languageListAll = buildMergedLanguageList()
  }
  return languageListAll.find((language) => {
    return language.languageName === languageName
  })
}

export { initLanguageList, findLanguageByLanguageName }
