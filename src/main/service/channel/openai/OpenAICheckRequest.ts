import * as http from 'http'
import * as https from 'https'
import { RequestOptions } from 'https'
import AgentTranslateCallbackVo from '../../../../common/class/AgentTranslateCallbackVo'
import R from '../../../../common/class/R'
import { OpenAIModelEnum } from '../../../../common/enums/OpenAIModelEnum'
import log from '../../../utils/log'
import TranslateChannelFactory from '../factory/TranslateChannelFactory'
import { createOpenAIProxyAgent, shouldUseOpenAIProxy } from './OpenAIProxy'

interface OpenAICheckTranslatePayload {
  info: Record<string, any>
  data: Record<string, any>
  provider: 'openai' | 'azureOpenAI'
}

const CHECK_REQUEST_TIMEOUT = 15000

class OpenAICheckRequest {
  static async translate(payload: OpenAICheckTranslatePayload): Promise<void> {
    const { info, data, provider } = payload

    return new Promise((resolve) => {
      let settled = false
      const requestBody = JSON.stringify(data)
      const url = OpenAICheckRequest.buildUrl(payload)
      const useProxy = shouldUseOpenAIProxy(info.useProxy)
      const options = OpenAICheckRequest.buildRequestOptions(url, payload, requestBody)
      const finish = (callback?: () => void): void => {
        if (settled) {
          return
        }
        settled = true
        callback?.()
        resolve()
      }

      log.info(`[${provider}翻译校验密钥事件] - 开始请求 : `, {
        endpoint: `${url.protocol}//${url.host}${url.pathname}`,
        useProxy
      })

      const request = OpenAICheckRequest.createRequest(url, options, (response) => {
        let responseBody = ''
        response.on('data', (chunk) => {
          responseBody += chunk.toString()
        })
        response.on('end', () => {
          try {
            const body = responseBody === '' ? {} : JSON.parse(responseBody)
            const statusCode = response.statusCode || 0
            if (statusCode < 200 || statusCode >= 300 || body['error']) {
              finish(() => {
                OpenAICheckRequest.emitError(
                  info,
                  OpenAICheckRequest.toErrorMessage(body['error'] || body || '连接失败')
                )
              })
              return
            }
            finish(() => {
              OpenAICheckRequest.callback(info, R.okD(new AgentTranslateCallbackVo(info, body)))
            })
          } catch (err) {
            finish(() => {
              OpenAICheckRequest.emitError(info, OpenAICheckRequest.toErrorMessage(err))
            })
          }
        })
      })

      request.setTimeout(CHECK_REQUEST_TIMEOUT, () => {
        finish(() => {
          OpenAICheckRequest.emitError(info, `timeout of ${CHECK_REQUEST_TIMEOUT}ms exceeded`)
        })
        request.destroy()
      })

      request.on('error', (err) => {
        log.info(`[${provider}翻译校验密钥事件] - error {}`, err)
        finish(() => {
          OpenAICheckRequest.emitError(info, OpenAICheckRequest.toErrorMessage(err))
        })
      })

      request.write(requestBody)
      request.end()
    })
  }

  private static buildUrl(payload: OpenAICheckTranslatePayload): URL {
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
    payload: OpenAICheckTranslatePayload,
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
    channel.apiTranslateCheckCallback(res)
  }

  private static emitError(info, error: string): void {
    OpenAICheckRequest.callback(info, R.errorD(new AgentTranslateCallbackVo(info, error)))
  }

  private static toErrorMessage(error): string {
    if (typeof error === 'string') {
      return error
    }
    if (error?.message) {
      return error.message
    }
    if (error?.error?.message) {
      return error.error.message
    }
    try {
      return JSON.stringify(error)
    } catch {
      return '连接失败'
    }
  }
}

export default OpenAICheckRequest
