import React, { useEffect, useRef } from 'react';
import { Question, Form, User } from '../types';
import MessageBubble from './MessageBubble';
import ReplyBox from './ReplyBox';

interface ThreadViewProps {
  question: Question | null;
  form: Form | null;
  onSendReply: (questionId: string, content: string) => void;
  newMessageId?: string | null;
  user: User | null;
}

const STATUS_CONFIG = {
  answered: {
    label: 'Answered',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  unanswered: {
    label: 'Awaiting reply',
    bg: 'bg-amber-400/10',
    text: 'text-amber-400',
    border: 'border-amber-400/20',
  },
  'needs-clarification': {
    label: 'Follow-up needed',
    bg: 'bg-rose-400/10',
    text: 'text-rose-400',
    border: 'border-rose-400/20',
  },
} as const;

const ThreadView: React.FC<ThreadViewProps> = ({
  question,
  form,
  onSendReply,
  newMessageId,
  user,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [question?.messages.length, question?.id]);

  if (!user) return null;

  if (!question) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950/40">
        <div className="text-center">
          <div className="text-5xl text-zinc-800 mb-3">◈</div>
          <p className="font-mono text-[11px] text-zinc-700">
            Select a question to view the thread
          </p>
        </div>
      </div>
    );
  }

  const status = STATUS_CONFIG[question.status];
  const respondentInitial = (form?.respondentName?.[0] ?? 'R').toUpperCase();

  // Always derive a clean display name from email as fallback
  const cleanName = (raw: string, email: string) => {
    if (raw && raw.trim() && raw !== email) return raw;
    const part = email.split('@')[0];
    return part.charAt(0).toUpperCase() + part.slice(1).replace(/[._-]/g, ' ');
  };

  const replyName = isAdmin
    ? cleanName(user.name, user.email)
    : cleanName(form?.respondentName ?? '', form?.respondentEmail ?? user.email);

  const replyInitial = isAdmin
    ? (cleanName(user.name, user.email)[0] ?? 'A').toUpperCase()
    : respondentInitial;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/30">
      {/* Thread header */}
      <div className="px-6 py-3.5 border-b border-zinc-800 flex-shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-zinc-100 leading-snug">
              {question.title}
            </h2>
            {isAdmin && (
              <button
                title="Edit question (admin only)"
                className="flex-shrink-0 font-mono text-[9px] text-zinc-700 hover:text-zinc-400 transition-colors duration-100 px-1.5 py-0.5 rounded-sm border border-transparent hover:border-zinc-700"
              >
                edit
              </button>
            )}
          </div>
          <p className="font-mono text-[9px] text-zinc-600 mt-1">
            {form?.name} · {question.messages.length} messages · {question.lastActivity}
          </p>
        </div>
        <span
          className={`
            flex-shrink-0 px-2.5 py-1 rounded-sm
            font-mono text-[9px] font-medium border whitespace-nowrap
            ${status.bg} ${status.text} ${status.border}
          `}
        >
          {status.label}
        </span>
      </div>

      {/* Context card */}
      <div className="px-6 py-3 border-b border-zinc-800/50 flex-shrink-0">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-sm px-4 py-3">
          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-[.1em] mb-1.5">
            Question context
          </p>
          <p className="text-[12px] text-zinc-400 leading-[1.65]">
            {question.description || <span className="text-zinc-700 italic">No context provided</span>}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-[18px]">
        {question.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isNew={message.id === newMessageId}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply box */}
      <div className="px-6 pb-5 pt-3 flex-shrink-0 border-t border-zinc-800">
        <ReplyBox
          onSend={(content) => onSendReply(question.id, content)}
          respondentName={replyName}
          respondentInitial={replyInitial}
        />
      </div>
    </div>
  );
};

export default ThreadView;