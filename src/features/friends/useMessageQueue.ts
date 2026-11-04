import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { errorMessage } from '../../lib/errors'
import { uploadBlob } from '../../lib/uploadBlob'
import type { Attachment } from './Composer'

export type PendingMessage = {
  id: string
  text: string
  attachment: Attachment | null
  status: 'sending' | 'failed'
  error?: string
}

/**
 * What makes sending feel instant: a message appears the moment it's sent and
 * stays on screen until the server has it.
 *
 * Kept as local state, rather than a Convex optimistic update, because a photo
 * has to be uploaded before the mutation can even start, and a failed message
 * has to survive with its text and photo intact so it can be retried; an
 * optimistic update is rolled back and gone the moment its mutation fails.
 *
 * Convex resolves a mutation only after its result is in the query results, so
 * removing the entry on success swaps it for the real message without a flicker.
 */
export function useMessageQueue(toUserId: Id<'users'>) {
  const sendMessage = useMutation(api.messages.send)
  const generateUploadUrl = useMutation(api.messages.generateMessagePhotoUploadUrl)
  const [pending, setPending] = useState<PendingMessage[]>([])
  // Sends run one at a time, so a slow photo can't let the text typed after it
  // overtake it in the conversation.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const nextId = useRef(0)

  const deliver = useCallback(
    (message: PendingMessage) => {
      queue.current = queue.current.then(async () => {
        try {
          let image: { storageId: Id<'_storage'>; width: number; height: number } | undefined
          if (message.attachment) {
            const storageId = await uploadBlob(() => generateUploadUrl({}), message.attachment.blob)
            image = {
              storageId,
              width: message.attachment.width,
              height: message.attachment.height,
            }
          }
          const result = await sendMessage({ toUserId, text: message.text, image })
          if (!result.ok) throw new ConvexError(result.error)
          if (message.attachment) URL.revokeObjectURL(message.attachment.url)
          setPending((all) => all.filter((m) => m.id !== message.id))
        } catch (err) {
          setPending((all) =>
            all.map((m) =>
              m.id === message.id
                ? { ...m, status: 'failed', error: errorMessage(err, 'Not sent.') }
                : m,
            ),
          )
        }
      })
    },
    [generateUploadUrl, sendMessage, toUserId],
  )

  const send = useCallback(
    (text: string, attachment: Attachment | null) => {
      const message: PendingMessage = {
        id: `pending-${nextId.current++}`,
        text,
        attachment,
        status: 'sending',
      }
      setPending((all) => [...all, message])
      deliver(message)
    },
    [deliver],
  )

  const retry = useCallback(
    (id: string) => {
      const message = pending.find((m) => m.id === id)
      if (!message) return
      setPending((all) =>
        all.map((m) => (m.id === id ? { ...m, status: 'sending', error: undefined } : m)),
      )
      deliver(message)
    },
    [deliver, pending],
  )

  const discard = useCallback((id: string) => {
    setPending((all) => {
      const message = all.find((m) => m.id === id)
      if (message?.attachment) URL.revokeObjectURL(message.attachment.url)
      return all.filter((m) => m.id !== id)
    })
  }, [])

  // Moving to another friend's chat keeps this component mounted with a new id.
  useEffect(() => {
    setPending([])
  }, [toUserId])

  return { pending, send, retry, discard }
}
