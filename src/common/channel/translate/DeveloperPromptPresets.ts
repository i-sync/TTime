import TranslateModeEnum from '../../enums/TranslateModeEnum'
import { getDefaultRolePrompt } from './ModePromptDefaults'

export function buildModePrompts(
  info,
  quoteProcessor: { quoteStart: string; quoteEnd: string }
): { rolePrompt: string; commandPrompt: string; contentPrompt: string } | null {
  const { quoteStart, quoteEnd } = quoteProcessor
  const languageType = info.languageType
  const languageResultType = info.languageResultType
  const content = info.translateContent
  const contentPrompt = `${quoteStart}${content}${quoteEnd}`

  const customRolePrompt = info.customRolePrompt
  if (info.translateMode === TranslateModeEnum.POLISH) {
    return {
      rolePrompt: customRolePrompt || getDefaultRolePrompt(TranslateModeEnum.POLISH),
      commandPrompt: `Polish this text in ${languageType}. Return polished text only. Only polish the text between ${quoteStart} and ${quoteEnd}.`,
      contentPrompt
    }
  }
  if (info.translateMode === TranslateModeEnum.COMPARE) {
    return {
      rolePrompt: customRolePrompt || getDefaultRolePrompt(TranslateModeEnum.COMPARE),
      commandPrompt: `Translate from ${languageType} to ${languageResultType}. Return translated text only. Only translate the text between ${quoteStart} and ${quoteEnd}.`,
      contentPrompt
    }
  }
  if (info.translateMode === TranslateModeEnum.TRANSLATE) {
    return {
      rolePrompt: customRolePrompt || getDefaultRolePrompt(TranslateModeEnum.TRANSLATE),
      commandPrompt: `Translate from ${languageType} to ${languageResultType}. Return translated text only. Only translate the text between ${quoteStart} and ${quoteEnd}.`,
      contentPrompt
    }
  }

  return null
}
