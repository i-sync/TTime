import * as http from 'http'
import * as https from 'https'
import { RequestOptions } from 'https'
import AgentTranslateCallbackVo from '../../../../common/class/AgentTranslateCallbackVo'
import R from '../../../../common/class/R'
import { OpenAIModelEnum } from '../../../../common/enums/OpenAIModelEnum'
import { OpenAIStatusEnum } from '../../../../common/enums/OpenAIStatusEnum'
import {
  QuoteProcessor,
  QuoteProcessorState
} from '../../../../common/channel/translate/QuoteProcessor'
import log from '../../../utils/log'
import TranslateChannelFactory from '../factory/TranslateChannelFactory'
import { createOpenAIProxyAgent, shouldUseOpenAIProxy } from './OpenAIProxy'
import { parseOpenAIStreamChunk } from './OpenAIStreamParser'

interface OpenAIStreamTranslatePayload {
  info: Record<string, any>
  data: Record<string, any>
  provider: 'openai' | 'azureOpenAI'
  quoteProcessorState: QuoteProcessorState
}

class OpenAIStreamRequest {
  static async translate(payload: OpenAIStreamTranslatePayload): Promise<void> {
    const { info, data, provider, quoteProcessorState } = payload
    const quoteProcessor = new QuoteProcessor(quoteProcessorState)
    let text = ''
    let buffer = ''
    let completed = false
    let failed = false

    OpenAIStreamRequest.callback(
      info,
      R.okD(
        new AgentTranslateCallbackVo(info, {
          code: OpenAIStatusEnum.START
        })
      )
    )

    return new Promise((resolve) => {
      const requestBody = JSON.stringify(data)
      const url = OpenAIStreamRequest.buildUrl(payload)
      const useProxy = shouldUseOpenAIProxy(info.useProxy)
      const options = OpenAIStreamRequest.buildRequestOptions(url, payload, requestBody)

      log.info(`[${provider}流式翻译事件] - 开始请求 : `, {
        endpoint: `${url.protocol}//${url.host}${url.pathname}`,
        useProxy
      })

      const request = OpenAIStreamRequest.createRequest(url, options, (response) => {
        const statusCode = response.statusCode || 0
        const contentType = response.headers['content-type'] || ''
        if (
          statusCode < 200 ||
          statusCode >= 300 ||
          !String(contentType).includes('text/event-stream')
        ) {
          completed = true
          let errorBody = ''
          response.on('data', (chunk) => {
            errorBody += chunk.toString()
          })
          response.on('end', () => {
            OpenAIStreamRequest.emitError(info, '连接失败')
            log.info(`[${provider}流式翻译事件] - error 连接失败 :`, {
              status: statusCode,
              statusText: response.statusMessage,
              response: errorBody
            })
            resolve()
          })
          return
        }

        response.on('data', (chunk) => {
          const parseResult = parseOpenAIStreamChunk(buffer, chunk.toString())
          buffer = parseResult.buffer
          parseResult.errors.forEach((error) => {
            completed = true
            failed = true
            OpenAIStreamRequest.emitError(info, error)
          })
          if (failed) {
            return
          }
          parseResult.contents.forEach((rawContent) => {
            const content = quoteProcessor.processText(rawContent)
            if (content === '') {
              return
            }
            text += content
            OpenAIStreamRequest.callback(
              info,
              R.okD(
                new AgentTranslateCallbackVo(info, {
                  code: OpenAIStatusEnum.ING,
                  content
                })
              )
            )
          })
          if (parseResult.done) {
            completed = true
          }
        })

        response.on('end', () => {
          if (!completed) {
            completed = true
          }
          if (!failed) {
            OpenAIStreamRequest.callback(
              info,
              R.okD(
                new AgentTranslateCallbackVo(info, {
                  code: OpenAIStatusEnum.END
                })
              )
            )
          }
          log.info(`[${provider}流式翻译事件] - 响应报文 : `, text)
          resolve()
        })
      })

      request.on('error', (err) => {
        completed = true
        failed = true
        log.info(`[${provider}流式翻译事件] - error {}`, err)
        OpenAIStreamRequest.emitError(info, err)
        resolve()
      })

      request.write(requestBody)
      request.end()
    })
  }

  private static buildUrl(payload: OpenAIStreamTranslatePayload): URL {
    const { info, provider } = payload
    if (provider === 'azureOpenAI') {
      return new URL(
        `${info.endpoint}/openai/deployments/${info.deploymentName}/chat/completions?api-version=2023-05-15`
      )
    }
    const requestUrl = info.requestUrl || OpenAIModelEnum.REQUEST_URL
    return new URL(`${requestUrl}/v1/chat/completions`)
  }

  private static buildRequestOptions(
    url: URL,
    payload: OpenAIStreamTranslatePayload,
    requestBody: string
  ): RequestOptions {
    const { info, provider } = payload
    const headers =
      provider === 'azureOpenAI'
        ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
            'api-key': `${info.appKey}`
          }
        : {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
            Authorization: `Bearer ${info.appKey}`
          }
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers
    }
    const agent = createOpenAIProxyAgent(info.useProxy)
    if (agent) {
      options.agent = agent as https.Agent
    }
    return options
  }

  private static createRequest(
    url: URL,
    options: RequestOptions,
    callback: (response: http.IncomingMessage) => void
  ): http.ClientRequest {
    return url.protocol === 'http:'
      ? http.request(options, callback)
      : https.request(options, callback)
  }

  private static callback(info, res): void {
    const channel = TranslateChannelFactory.channels[info.type + 'Channel']
    channel.apiTranslateCallback(res)
  }

  private static emitError(info, error): void {
    OpenAIStreamRequest.callback(
      info,
      R.errorD(
        new AgentTranslateCallbackVo(info, {
          code: OpenAIStatusEnum.ERROR,
          error
        })
      )
    )
  }
}

export default OpenAIStreamRequest
