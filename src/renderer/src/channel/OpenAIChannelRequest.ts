import { isNull } from '../../../common/utils/validate'
import { OpenAIModelEnum } from '../../../common/enums/OpenAIModelEnum'
import { buildModePrompts } from '../../../common/channel/translate/DeveloperPromptPresets'
import { QuoteProcessor } from '../../../common/channel/translate/QuoteProcessor'

class OpenAIChannelRequest {
  static buildOpenAIRequest(
    info,
    isCheckRequest
  ): { data: object; quoteProcessor: QuoteProcessor } {
    const languageType = info.languageType
    const languageResultType = info.languageResultType
    const model =
      info.model === OpenAIModelEnum.CUSTOM ? String(info.customModel ?? '').trim() : info.model
    const quoteProcessor = new QuoteProcessor()
    const modePrompts = buildModePrompts(info, quoteProcessor)
    let rolePrompt =
      'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.'
    let commandPrompt = `Translate from ${languageType} to ${languageResultType}. Return translated text only. Only translate the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
    let contentPrompt = `${quoteProcessor.quoteStart}${info.translateContent}${quoteProcessor.quoteEnd}`
    if (modePrompts) {
      rolePrompt = modePrompts.rolePrompt
      commandPrompt = modePrompts.commandPrompt
      contentPrompt = modePrompts.contentPrompt
    } else if (languageResultType === '文字润色') {
      rolePrompt =
        "You are a professional text summarizer, you can only summarize the text, don't interpret it."
      commandPrompt = `Please polish this text in ${languageType}. Only polish the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
    } else if (languageResultType === '总结') {
      rolePrompt =
        "You are a professional text summarizer, you can only summarize the text, don't interpret it."
      commandPrompt = `Please summarize this text in the most concise language and must use ${languageType} language! Only summarize the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
      contentPrompt = `${quoteProcessor.quoteStart}${info.translateContent}${quoteProcessor.quoteEnd}`
    } else if (languageResultType === '分析') {
      rolePrompt = 'You are a professional translation engine and grammar analyzer.'
      commandPrompt = `Please translate this text to ${languageType} and explain the grammar in the original text using ${languageType}. Only analyze the text between ${quoteProcessor.quoteStart} and ${quoteProcessor.quoteEnd}.`
      contentPrompt = `${quoteProcessor.quoteStart}${info.translateContent}${quoteProcessor.quoteEnd}`
    } else if (languageResultType === '解释代码') {
      rolePrompt =
        'You are a code explanation engine that can only explain code but not interpret or translate it. Also, please report bugs and errors (if any).'
      commandPrompt = `explain the provided code, regex or script in the most concise language and must use ${languageType} language! You may use Markdown. If the content is not code, return an error message. If the code has obvious errors, point them out.`
      contentPrompt = '```\n' + info.translateContent + '\n```'
    }
    return {
      data: {
        model,
        // 控制随机性：随着 temperature 接近 0 ，重复提交的内容，返回的结果将变得具有确定性和重复性
        // 一个介于 0 和 1 之间的值 可以为0.1这样的小数
        // 每次提交相同的内容时 按照 0 - 1 的概率返回不同的答案
        // 我们这里默认为 0 ，重复提交相同的内容返回同样的结果
        temperature: 0,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 1,
        presence_penalty: 1,
        messages: [
          { role: 'system', content: rolePrompt },
          { role: 'user', content: commandPrompt },
          { role: 'user', content: contentPrompt }
        ],
        stream: !isCheckRequest
      },
      quoteProcessor
    }
  }

  /**
   * OpenAI - 翻译
   *
   * @param info            翻译信息
   */
  static openaiTranslate = async (info): Promise<void> => {
    const isCheckRequest = false
    const { data, quoteProcessor } = OpenAIChannelRequest.buildOpenAIRequest(info, isCheckRequest)
    if (isNull(info.requestUrl)) {
      info.requestUrl = OpenAIModelEnum.REQUEST_URL
    }
    await window.api.apiOpenAIStreamTranslate({
      provider: 'openai',
      info,
      data,
      quoteProcessorState: {
        quoteStart: quoteProcessor.quoteStart,
        quoteEnd: quoteProcessor.quoteEnd
      }
    })
  }

  /**
   * OpenAI - 翻译
   *
   * @param info 翻译信息
   */
  static openaiCheck = (info): void => {
    const isCheckRequest = true
    const { data } = OpenAIChannelRequest.buildOpenAIRequest(info, isCheckRequest)
    if (isNull(info.requestUrl)) {
      info.requestUrl = OpenAIModelEnum.REQUEST_URL
    }
    window.api.apiOpenAICheckTranslate({
      provider: 'openai',
      info,
      data
    })
  }
}

export { OpenAIChannelRequest }
