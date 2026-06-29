"use client";

import { useEffect, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  useDroppable, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyTasks, createTask, updateTask, deleteTask, applyReorder,
} from "@/lib/personal-tasks-service";
import {
  TASK_STATUS_COLUMNS, TASK_STATUS_LABELS, URGENCY_STYLES, IMPORTANCE_STYLES,
  URGENCY_LABELS, IMPORTANCE_LABELS, formatTaskDate,
} from "@/types/personal-tasks";
import type { PersonalTask, TaskStatus, PersonalSubtask } from "@/types/personal-tasks";
import TaskFormModal from "@/components/personal-tasks/TaskFormModal";
import { cn } from "@/lib/utils";

function Spinner() {
  return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
}

function columnTasks(tasks: PersonalTask[], status: TaskStatus): PersonalTask[] {
  return tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
}

function TaskCard({
  task, onEdit, onDelete, onToggleSubtask,
}: {
  task: PersonalTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggleSubtask: (subtaskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const doneCount = task.subtasks.filter((s) => s.done).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="surface-card p-4 cursor-grab active:cursor-grabbing space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-white font-helvetica flex-1">{task.title}</p>
        <div className="flex gap-1 shrink-0">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onEdit} className="text-white/20 hover:text-white text-xs">Edit</button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onDelete} className="text-white/20 hover:text-red-400 text-xs">Delete</button>
        </div>
      </div>

      {task.description && <p className="text-xs text-white/40 font-helvetica line-clamp-2">{task.description}</p>}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border font-helvetica", URGENCY_STYLES[task.urgency])}>
          Urgency: {URGENCY_LABELS[task.urgency]}
        </span>
        <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border font-helvetica", IMPORTANCE_STYLES[task.importance])}>
          Importance: {IMPORTANCE_LABELS[task.importance]}
        </span>
        {task.dueDate && <span className="text-[9px] text-white/30 font-helvetica">Due {formatTaskDate(task.dueDate)}</span>}
      </div>

      {task.subtasks.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-white/06">
          <p className="text-[10px] text-white/20 font-helvetica">{doneCount}/{task.subtasks.length} subtasks</p>
          {task.subtasks.map((s) => (
            <label key={s.id} onPointerDown={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => onToggleSubtask(s.id)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span className={cn("text-xs font-helvetica", s.done ? "line-through text-white/25" : "text-white/60")}>{s.text}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  status, tasks, onEdit, onDelete, onToggleSubtask,
}: {
  status: TaskStatus;
  tasks: PersonalTask[];
  onEdit: (t: PersonalTask) => void;
  onDelete: (t: PersonalTask) => void;
  onToggleSubtask: (task: PersonalTask, subtaskId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col-${status}` });

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-orbitron text-xs font-semibold text-white/60 uppercase tracking-widest">{TASK_STATUS_LABELS[status]}</h2>
        <span className="text-[10px] text-white/20 font-helvetica">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="space-y-2 min-h-[120px]">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task)}
              onToggleSubtask={(subtaskId) => onToggleSubtask(task, subtaskId)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="border border-dashed border-white/10 rounded-xl py-8 text-center">
              <p className="text-white/15 text-xs font-helvetica">Drop here</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function MyTasksPage() {
  const { profile } = useAuth();
  const [tasks, setTasks]     = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PersonalTask | "new" | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!profile?.uid) return;
    getMyTasks(profile.uid).then(setTasks).finally(() => setLoading(false));
  }, [profile?.uid]);

  async function handleSave(data: {
    title: string; description?: string; subtasks: PersonalSubtask[];
    urgency: 1 | 2 | 3; importance: 1 | 2 | 3; dueDate?: string;
  }) {
    if (!profile?.uid) return;
    if (editing && editing !== "new") {
      await updateTask(editing.id, data);
      setTasks((prev) => prev.map((t) => (t.id === editing.id ? { ...t, ...data, updatedAt: new Date().toISOString() } : t)));
    } else {
      const now = new Date().toISOString();
      const order = columnTasks(tasks, "todo").length;
      const created = await createTask({
        ...data,
        status: "todo",
        order,
        createdBy: profile.uid,
        createdAt: now,
        updatedAt: now,
      });
      setTasks((prev) => [...prev, created]);
    }
  }

  async function handleDelete(task: PersonalTask) {
    await deleteTask(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  }

  async function handleToggleSubtask(task: PersonalTask, subtaskId: string) {
    const subtasks = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks } : t)));
    await updateTask(task.id, { subtasks });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overId = String(over.id);
    const isColumnDrop = overId.startsWith("col-");
    const destStatus: TaskStatus = isColumnDrop
      ? (overId.slice(4) as TaskStatus)
      : (tasks.find((t) => t.id === overId)?.status ?? activeTask.status);

    let destList: PersonalTask[];
    if (destStatus === activeTask.status) {
      // Reordering within one column — both indices come from the SAME
      // array, so arrayMove's semantics hold (mixing an index from a
      // filtered list with one from the full list would misplace the
      // card by one position whenever the drop target sits after it).
      const list      = columnTasks(tasks, destStatus);
      const fromIndex = list.findIndex((t) => t.id === activeTask.id);
      const toIndex   = isColumnDrop ? list.length - 1 : list.findIndex((t) => t.id === overId);
      destList = arrayMove(list, fromIndex, toIndex === -1 ? list.length - 1 : toIndex);
    } else {
      // Moving to a different column — insert into that column's list
      // (which never contained activeTask) at the dropped-on position.
      const withoutActive = columnTasks(tasks, destStatus);
      const insertAt = isColumnDrop ? withoutActive.length : withoutActive.findIndex((t) => t.id === overId);
      destList = [...withoutActive];
      destList.splice(insertAt === -1 ? withoutActive.length : insertAt, 0, { ...activeTask, status: destStatus });
    }

    const updates = destList.map((t, i) => ({
      id: t.id,
      order: i,
      status: t.id === activeTask.id ? destStatus : undefined,
    }));

    setTasks((prev) => {
      const untouched   = prev.filter((t) => t.status !== destStatus && t.id !== activeTask.id);
      const reindexed   = destList.map((t, i) => ({ ...t, order: i, status: destStatus }));
      return [...untouched, ...reindexed];
    });

    applyReorder(updates).catch(() => {
      if (!profile?.uid) return;
      getMyTasks(profile.uid).then(setTasks);
    });
  }

  if (loading) return <Spinner />;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-lg font-bold text-white">My Tasks</h1>
          <p className="text-white/30 text-xs font-helvetica mt-1">Private to you — no one else, including admins, can see this list.</p>
        </div>
        <button onClick={() => setEditing("new")} className="btn-primary text-sm px-4 py-2.5">+ New Task</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-4">
          {TASK_STATUS_COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columnTasks(tasks, status)}
              onEdit={setEditing}
              onDelete={handleDelete}
              onToggleSubtask={handleToggleSubtask}
            />
          ))}
        </div>
      </DndContext>

      {editing && (
        <TaskFormModal
          task={editing === "new" ? undefined : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
