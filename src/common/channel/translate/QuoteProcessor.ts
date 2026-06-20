import { v4 as uuidv4 } from 'uuid'

interface QuoteProcessorState {
  quoteStart: string
  quoteEnd: string
}

class QuoteProcessor {
  private quote: string
  public quoteStart: string
  public quoteEnd: string
  private prevQuoteStartBuffer: string
  private prevQuoteEndBuffer: string

  constructor(state?: QuoteProcessorState) {
    this.quote =
      state?.quoteStart?.replace(/^</, '').replace(/>$/, '') ||
      uuidv4().replace(/-/g, '').slice(0, 4)
    this.quoteStart = state?.quoteStart || `<${this.quote}>`
    this.quoteEnd = state?.quoteEnd || `</${this.quote}>`
    this.prevQuoteStartBuffer = ''
    this.prevQuoteEndBuffer = ''
  }

  public processText(text: string): string {
    const deltas = text.split('')
    const targetPieces = deltas.map((delta) => this.processTextDelta(delta))
    return targetPieces.join('')
  }

  private processTextDelta(textDelta: string): string {
    if (textDelta === '') {
      return ''
    }
    if (textDelta.trim() === this.quoteEnd) {
      return ''
    }
    let result = textDelta
    // process quote start
    let quoteStartBuffer = this.prevQuoteStartBuffer
    let startIdx = 0
    for (let i = 0; i < textDelta.length; i++) {
      const char = textDelta[i]
      if (char === this.quoteStart[quoteStartBuffer.length]) {
        if (this.prevQuoteStartBuffer.length > 0) {
          if (i === startIdx) {
            quoteStartBuffer += char
            result = textDelta.slice(i + 1)
            startIdx += 1
          } else {
            result = this.prevQuoteStartBuffer + textDelta
            quoteStartBuffer = ''
            break
          }
        } else {
          quoteStartBuffer += char
          result = textDelta.slice(i + 1)
        }
      } else {
        if (quoteStartBuffer.length === this.quoteStart.length) {
          quoteStartBuffer = ''
          break
        }
        if (quoteStartBuffer.length > 0) {
          result = this.prevQuoteStartBuffer + textDelta
          quoteStartBuffer = ''
          break
        }
      }
    }
    this.prevQuoteStartBuffer = quoteStartBuffer
    textDelta = result
    // process quote end
    let quoteEndBuffer = this.prevQuoteEndBuffer
    let endIdx = 0
    for (let i = 0; i < textDelta.length; i++) {
      const char = textDelta[i]
      if (char === this.quoteEnd[quoteEndBuffer.length]) {
        if (this.prevQuoteEndBuffer.length > 0) {
          if (i === endIdx) {
            quoteEndBuffer += char
            result = textDelta.slice(i + 1)
            endIdx += 1
          } else {
            result = this.prevQuoteEndBuffer + textDelta
            quoteEndBuffer = ''
            break
          }
        } else {
          quoteEndBuffer += char
          result = textDelta.slice(0, textDelta.length - quoteEndBuffer.length)
        }
      } else {
        if (quoteEndBuffer.length === this.quoteEnd.length) {
          quoteEndBuffer = ''
          break
        }
        if (quoteEndBuffer.length > 0) {
          result = this.prevQuoteEndBuffer + textDelta
          quoteEndBuffer = ''
          break
        }
      }
    }
    this.prevQuoteEndBuffer = quoteEndBuffer
    return result
  }
}

export { QuoteProcessor }
export type { QuoteProcessorState }
