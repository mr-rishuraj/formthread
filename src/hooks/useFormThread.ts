// ============================================================
// FILE: src/hooks/useFormThread.ts
// Replaces mock data with live Supabase queries + realtime
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  getMyForms,
  getQuestions,
  getMessages,
  sendMessage,
  getParticipantInfo,
} from '../queries/forms';
import type { Form, Question, Message } from '../types';

export function useFormThread() {
  const [forms, setForms] = useState<Form[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'All' | 'Awaiting' | 'Answered'>('All');
  const [loadingForms, setLoadingForms] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // ── 1. Load forms on mount ───────────────────────────────
  useEffect(() => {
    setLoadingForms(true);
    getMyForms()
      .then(async (fetchedForms) => {
        // Enrich each form with respondent info from participants table
        const enriched = await Promise.all(
          fetchedForms.map(async (f) => {
            const info = await getParticipantInfo(f.id);
            return { ...f, ...info };
          })
        );
        setForms(enriched);
        if (enriched.length > 0) {
          setSelectedFormId(enriched[0].id);
        }
      })
      .finally(() => setLoadingForms(false));
  }, []);

  // ── 2. Load questions when selected form changes ─────────
  useEffect(() => {
    if (!selectedFormId) return;

    setLoadingQuestions(true);
    setQuestions([]);
    setSelectedQuestionId(null);

    getQuestions(selectedFormId)
      .then(async (fetchedQuestions) => {
        // Load messages for each question in parallel
        const withMessages = await Promise.all(
          fetchedQuestions.map(async (q) => {
            const messages = await getMessages(q.id);
            const lastMsg = messages[messages.length - 1];
            const status: Question['status'] =
              messages.length === 0
                ? 'unanswered'
                : lastMsg.role === 'respondent'
                ? 'answered'
                : 'unanswered';
            return {
              ...q,
              messages,
              status,
              unread: false,
              lastActivity: lastMsg
                ? lastMsg.timestamp
                : q.lastActivity,
            };
          })
        );

        setQuestions(withMessages);
        if (withMessages.length > 0) {
          setSelectedQuestionId(withMessages[0].id);
        }
      })
      .finally(() => setLoadingQuestions(false));
  }, [selectedFormId]);

  // ── 3. Realtime: subscribe to new messages ───────────────
  useEffect(() => {
    if (!selectedFormId) return;

    const channel = supabase
      .channel(`form-messages:${selectedFormId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            question_id: string;
            sender_id: string;
            content: string;
            created_at: string;
          };

          // Fetch sender info so we can map properly
          const { data: senderData } = await supabase
            .from('users')
            .select('email, role')
            .eq('id', newRow.sender_id)
            .single();

          const senderEmail = senderData?.email ?? '';
          const namePart = senderEmail.split('@')[0];
          const senderName =
            namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/[._-]/g, ' ');

          const newMessage: Message = {
            id: newRow.id,
            role: senderData?.role === 'admin' ? 'creator' : 'respondent',
            content: newRow.content,
            timestamp: new Date(newRow.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
            senderName,
            senderInitial: senderName[0]?.toUpperCase() ?? '?',
          };

          setQuestions((prev) =>
            prev.map((q) => {
              if (q.id !== newRow.question_id) return q;
              // Avoid duplicate if optimistic update already added it
              const exists = q.messages.some((m) => m.id === newRow.id);
              if (exists) return q;
              const updatedMessages = [...q.messages, newMessage];
              const lastMsg = updatedMessages[updatedMessages.length - 1];
              return {
                ...q,
                messages: updatedMessages,
                status: lastMsg.role === 'respondent' ? 'answered' : q.status,
                lastActivity: newMessage.timestamp,
                unread: q.id !== selectedQuestionId,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFormId, selectedQuestionId]);

  // ── Derived state ────────────────────────────────────────
  const selectedForm = forms.find((f) => f.id === selectedFormId) ?? null;

  const visibleQuestions = questions.filter((q) => {
    if (q.formId !== selectedFormId) return false;
    if (activeTab === 'Awaiting') return q.status === 'unanswered';
    if (activeTab === 'Answered') return q.status === 'answered';
    return true;
  });

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;

  // ── Actions ──────────────────────────────────────────────
  const selectForm = useCallback((formId: string) => {
    setSelectedFormId(formId);
    setActiveTab('All');
    setSelectedQuestionId(null);
  }, []);

  const selectQuestion = useCallback((questionId: string) => {
    setSelectedQuestionId(questionId);
    // Mark as read locally
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, unread: false } : q))
    );
  }, []);

  const sendReply = useCallback(
    async (questionId: string, content: string) => {
      if (!content.trim()) return;

      // Optimistic update — add message immediately before DB confirms
      const tempId = `temp-${Date.now()}`;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: userData } = await supabase
        .from('users')
        .select('email, role')
        .eq('id', user?.id)
        .single();

      const senderEmail = userData?.email ?? '';
      const namePart = senderEmail.split('@')[0];
      const senderName =
        namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/[._-]/g, ' ');

      const optimisticMessage: Message = {
        id: tempId,
        role: userData?.role === 'admin' ? 'creator' : 'respondent',
        content: content.trim(),
        timestamp: new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        senderName,
        senderInitial: senderName[0]?.toUpperCase() ?? '?',
      };

      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                messages: [...q.messages, optimisticMessage],
                status: 'answered' as const,
                lastActivity: 'Just now',
                unread: false,
              }
            : q
        )
      );

      // Persist to Supabase (realtime will broadcast to other clients)
      try {
        await sendMessage(questionId, content);
      } catch (err) {
        console.error('Failed to send message:', err);
        // Roll back optimistic update on failure
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId
              ? { ...q, messages: q.messages.filter((m) => m.id !== tempId) }
              : q
          )
        );
      }
    },
    []
  );

  const unreadCount = useCallback(
    (formId: string) =>
      questions.filter((q) => q.formId === formId && q.unread).length,
    [questions]
  );

  return {
    forms,
    visibleQuestions,
    allQuestions: questions,
    selectedForm,
    selectedQuestion,
    selectedFormId,
    selectedQuestionId,
    activeTab,
    setActiveTab,
    selectForm,
    selectQuestion,
    sendReply,
    unreadCount,
    loadingForms,
    loadingQuestions,
  };
}
