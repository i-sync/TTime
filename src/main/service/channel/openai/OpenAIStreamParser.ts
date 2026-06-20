import { isNull, isNotNull } from '../../../../common/utils/validate'

export interface OpenAIStreamParseResult {
  contents: string[]
  errors: unknown[]
  done: boolean
  buffer: string
}

export const parseOpenAIStreamChunk = (buffer: string, chunk: string): OpenAIStreamParseResult => {
  const contents: string[] = []
  const errors: unknown[] = []
  let done = false
  const text = buffer + chunk
  const parts = text.split(/\r?\n\r?\n/)
  const nextBuffer = parts.pop() || ''

  parts.forEach((part) => {
    const dataLines = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, '').trim())

    dataLines.forEach((data) => {
      if (isNull(data)) {
        return
      }
      if (data === '[DONE]') {
        done = true
        return
      }
      try {
        const parsedData = JSON.parse(data)
        if (isNotNull(parsedData['error'])) {
          errors.push(parsedData)
          return
        }
        const content = parsedData['choices']?.[0]?.['delta']?.['content']
        if (isNotNull(content)) {
          contents.push(content)
        }
      } catch (err) {
        errors.push(err)
      }
    })
  })

  return {
    contents,
    errors,
    done,
    buffer: nextBuffer
  }
}
