// ============================================================
// FILE: src/App.tsx
// ============================================================
import React, { useState, useCallback } from 'react';
import { useUser } from './hooks/useUser';
import { useFormThread } from './hooks/useFormThread';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import QuestionList from './components/QuestionList';
import ThreadView from './components/ThreadView';
import CreateFormModal from './components/CreateFormModal';

const FORM_ICONS = ['◈', '◉', '◎', '▣', '◆', '⬡', '⬟', '◐'];

function Dashboard() {
  const { user, logout, isAdmin } = useUser();
  const [lastNewMessageId, setLastNewMessageId] = useState<string | null>(null);
  const [isCreatingForm, setIsCreatingForm] = useState(false);
  const [iconCursor, setIconCursor] = useState(0);

  const {
    forms,
    visibleQuestions,
    allQuestions,
    selectedForm,
    selectedQuestion,
    selectedFormId,
    selectedQuestionId,
    activeTab,
    setActiveTab,
    selectForm,
    selectQuestion,
    sendReply,
    addForm,
    addQuestion,
    unreadCount,
    loadingForms,
  } = useFormThread();

  const handleSendReply = useCallback(
    async (questionId: string, content: string) => {
      const tempId = `m-${Date.now()}`;
      await sendReply(questionId, content);
      setLastNewMessageId(tempId);
      setTimeout(() => setLastNewMessageId(null), 500);
    },
    [sendReply]
  );

  // onConfirm receives the icon selected inside the modal
  const handleCreateForm = useCallback(
    async (name: string, respondentName: string, respondentEmail: string, icon: string) => {
      setIsCreatingForm(false);
      // Rotate the fallback icon cursor for next time
      setIconCursor((c) => (c + 1) % FORM_ICONS.length);
      await addForm(name, respondentName, respondentEmail, icon);
    },
    [addForm]
  );

  const handleAddQuestion = useCallback(
    async (title: string) => {
      if (selectedFormId) await addQuestion(selectedFormId, title);
    },
    [addQuestion, selectedFormId]
  );

  const visibleForms = isAdmin
    ? forms
    : forms.filter((f) => user?.assignedFormIds?.includes(f.id) || true);


  const allFormQuestions = allQuestions.filter((q) => q.formId === selectedFormId);

  if (loadingForms) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 bg-amber-400 flex items-center justify-center text-black font-bold text-[11px] font-mono rounded-sm animate-pulse">
            FT
          </div>
          <p className="font-mono text-[11px] text-zinc-500">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative z-10 h-screen flex overflow-hidden">
        <Sidebar
          forms={visibleForms}
          allQuestions={allQuestions}
          selectedFormId={selectedFormId ?? ''}
          onSelectForm={selectForm}
          unreadCount={unreadCount}
          user={user!}
          onLogout={logout}
          onCreateForm={isAdmin ? () => setIsCreatingForm(true) : undefined}
        />

        <QuestionList
          form={selectedForm}
          questions={visibleQuestions}
          allFormQuestions={allFormQuestions}
          selectedQuestionId={selectedQuestionId}
          activeTab={activeTab}
          onSelectQuestion={selectQuestion}
          onTabChange={setActiveTab}
          isAdmin={isAdmin}
          onAddQuestion={isAdmin ? handleAddQuestion : undefined}
        />

        <ThreadView
          question={selectedQuestion}
          form={selectedForm}
          onSendReply={handleSendReply}
          newMessageId={lastNewMessageId}
          user={user!}
        />
      </div>

      {/* Admin-only modal — outside the flex container so overflow:hidden doesn't clip it */}
      {isAdmin && isCreatingForm && (
        <CreateFormModal
          onConfirm={handleCreateForm}
          onClose={() => setIsCreatingForm(false)}
        />
      )}
    </>
  );
}

function App() {
  const { user, login, loading } = useUser();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-7 h-7 bg-amber-400 animate-pulse rounded-sm" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLogin={login} />;
  }

  return <Dashboard />;
}

export default App;
