// ============================================================
// FILE: hooks/useMessages.ts
// Realtime hook — fetches messages + subscribes to new inserts
// Usage: const messages = useMessages(questionId)
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMessages } from '@/queries/forms'
import type { Message } from '@/types'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'

export function useMessages(questionId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!questionId) return

    setLoading(true)

    // 1. Fetch existing messages
    getMessages(questionId)
      .then(data => {
        setMessages(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })

    // 2. Subscribe to new inserts via Realtime
    const channel = supabase
      .channel(`messages:question_id=eq.${questionId}`)
      .on<Message>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `question_id=eq.${questionId}`
        },
        (payload: RealtimePostgresInsertPayload<Message>) => {
          setMessages(prev => {
            // Avoid duplicates (optimistic updates may have already added this)
            const exists = prev.some(m => m.id === payload.new.id)
            return exists ? prev : [...prev, payload.new]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [questionId])

  return { messages, loading, error }
}
