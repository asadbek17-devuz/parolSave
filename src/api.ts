import type { Result } from '../shared/types'

type ResultWithWarning<T> = Result<T> & { warning?: unknown }

export async function unwrap<T>(
  promise: Promise<Result<T>>,
  onWarning?: (message: string) => void,
): Promise<T> {
  const result = (await promise) as ResultWithWarning<T>
  if (!result.ok) {
    throw new Error(result.error)
  }
  if (onWarning && typeof result.warning === 'string' && result.warning.length > 0) {
    onWarning(result.warning)
  }
  return result.data
}

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "Noma'lum xatolik yuz berdi"
}

export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text)
    return
  }

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.className = 'clipboard-helper'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  if (!copied) {
    throw new Error('Clipboardga yozib bolmadi')
  }
}
