"use client";

import { useState } from "react";
import type { PersonalSubtask, PersonalTask } from "@/types/personal-tasks";
import { URGENCY_LABELS, IMPORTANCE_LABELS } from "@/types/personal-tasks";
import { cn } from "@/lib/utils";

interface Props {
  /** Present when editing an existing task; absent when creating one. */
  task?:    PersonalTask;
  onSave:   (data: {
    title: string; description?: string; subtasks: PersonalSubtask[];
    urgency: 1 | 2 | 3; importance: 1 | 2 | 3; dueDate?: string;
  }) => Promise<void>;
  onClose:  () => void;
}

const LEVELS = [1, 2, 3] as const;

export default function TaskFormModal({ task, onSave, onClose }: Props) {
  const [title, setTitle]             = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [subtasks, setSubtasks]       = useState<PersonalSubtask[]>(task?.subtasks ?? []);
  const [newSubtask, setNewSubtask]   = useState("");
  const [urgency, setUrgency]         = useState<1 | 2 | 3>(task?.urgency ?? 2);
  const [importance, setImportance]   = useState<1 | 2 | 3>(task?.importance ?? 2);
  const [dueDate, setDueDate]         = useState(task?.dueDate ?? "");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  function addSubtask() {
    if (!newSubtask.trim()) return;
    setSubtasks((prev) => [...prev, { id: crypto.randomUUID(), text: newSubtask.trim(), done: false }]);
    setNewSubtask("");
  }

  function toggleSubtask(id: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        title:       title.trim(),
        description: description.trim() || undefined,
        subtasks,
        urgency,
        importance,
        dueDate:     dueDate || undefined,
      });
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-primary-dark border border-white/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-orbitron text-sm font-bold text-white tracking-widest uppercase">
            {task ? "Edit Task" : "New Task"}
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="field-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any extra detail…"
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Urgency</label>
              <div className="flex gap-2">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setUrgency(lvl)}
                    className={cn(
                      "flex-1 text-xs font-helvetica py-2 rounded-lg border transition-colors",
                      urgency === lvl ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-white/40 hover:text-white"
                    )}
                  >
                    {URGENCY_LABELS[lvl]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">Importance</label>
              <div className="flex gap-2">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setImportance(lvl)}
                    className={cn(
                      "flex-1 text-xs font-helvetica py-2 rounded-lg border transition-colors",
                      importance === lvl ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-white/40 hover:text-white"
                    )}
                  >
                    {IMPORTANCE_LABELS[lvl]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">Due Date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="field-label">Subtasks</label>
            <div className="space-y-1.5 mb-2">
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2 group">
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={() => toggleSubtask(s.id)}
                    className="w-4 h-4 accent-accent shrink-0"
                  />
                  <span className={cn("flex-1 text-sm font-helvetica", s.done ? "line-through text-white/30" : "text-white/70")}>
                    {s.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSubtask(s.id)}
                    className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                placeholder="Add a subtask…"
                className="input-field flex-1 text-sm"
              />
              <button type="button" onClick={addSubtask} disabled={!newSubtask.trim()} className="px-3 border border-white/10 text-white/50 hover:text-white rounded-lg text-sm font-helvetica transition-colors disabled:opacity-30">
                Add
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 font-helvetica">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-white/10 text-white/40 hover:text-white rounded-lg py-2.5 text-sm font-helvetica transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : task ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
