import { TranslateContentSourceEnum } from '../../../common/enums/TranslateContentSourceEnum'
import TranslateModeEnum from '../../../common/enums/TranslateModeEnum'
import { YesNoEnum } from '../../../common/enums/YesNoEnum'
import { cacheGet } from './cacheUtil'
import { isEnglish } from './languageUtil'
import { setTranslateMode } from './translateModeUtil'

export type ExternalContentEntryResult = {
  modeChanged: boolean
  targetMode: string
}

/**
 * 根据外部内容来源决定是否切换为对照模式
 */
export function applyModeForExternalContent(
  content: string,
  source: string
): ExternalContentEntryResult {
  const currentMode = cacheGet('translateMode') ?? TranslateModeEnum.DEFAULT
  let targetMode = currentMode

  if (
    source === TranslateContentSourceEnum.CHOICE &&
    cacheGet('choiceTranslateCompareMode') !== YesNoEnum.N
  ) {
    targetMode = TranslateModeEnum.COMPARE
  } else if (
    source === TranslateContentSourceEnum.CLIPBOARD &&
    cacheGet('clipboardEnglishCompareMode') !== YesNoEnum.N &&
    isEnglish(content)
  ) {
    targetMode = TranslateModeEnum.COMPARE
  }

  if (targetMode !== currentMode) {
    setTranslateMode(targetMode)
    return { modeChanged: true, targetMode }
  }
  return { modeChanged: false, targetMode: currentMode }
}
