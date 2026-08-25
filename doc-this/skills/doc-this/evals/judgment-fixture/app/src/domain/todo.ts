// Core todo domain: entity, lifecycle, and the rules that govern transitions.

export enum TodoStatus {
  Draft = "draft",
  Active = "active",
  Done = "done",
  Archived = "archived",
}

export enum Priority {
  Low = "low",
  Normal = "normal",
  High = "high",
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Todo {
  id: string;
  ownerId: string;
  title: string;
  status: TodoStatus;
  priority: Priority;
  dueDate: Date | null;
  subtasks: Subtask[];
  createdAt: Date;
  deletedAt: Date | null;
}

// Allowed lifecycle transitions. Anything not listed is rejected.
const ALLOWED_TRANSITIONS: Record<TodoStatus, TodoStatus[]> = {
  [TodoStatus.Draft]: [TodoStatus.Active],
  [TodoStatus.Active]: [TodoStatus.Done, TodoStatus.Archived],
  [TodoStatus.Done]: [TodoStatus.Archived],
  [TodoStatus.Archived]: [],
};

export class IllegalTransitionError extends Error {}
export class IncompleteSubtasksError extends Error {}

// Window before the due date that triggers automatic priority escalation.
const ESCALATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canTransition(from: TodoStatus, to: TodoStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// Move a todo to a new status, enforcing the lifecycle and the completion rule.
export function transition(todo: Todo, to: TodoStatus, now: Date): Todo {
  if (!canTransition(todo.status, to)) {
    throw new IllegalTransitionError(`${todo.status} -> ${to}`);
  }
  // A todo cannot be completed while it still has incomplete subtasks.
  if (to === TodoStatus.Done) {
    const incomplete = todo.subtasks.filter((s) => !s.completed);
    if (incomplete.length > 0) {
      throw new IncompleteSubtasksError(`${incomplete.length} subtask(s) remain`);
    }
  }
  return { ...todo, status: to };
}

// Returns true when the todo is past its due date and not yet resolved.
export function isOverdue(todo: Todo, now: Date): boolean {
  if (todo.dueDate === null) return false;
  if (todo.status === TodoStatus.Done || todo.status === TodoStatus.Archived) return false;
  return todo.dueDate.getTime() < now.getTime();
}

// Recompute the priority/label of a todo based on its current temporal state.
// FIXME: this grew organically and now mixes escalation, overdue, and labelling.
export function evaluateUrgency(todo: Todo, now: Date): { priority: Priority; label: string } {
  let priority = todo.priority;
  let label = "on-track";
  if (todo.status === TodoStatus.Active) {
    if (todo.dueDate !== null) {
      const remaining = todo.dueDate.getTime() - now.getTime();
      if (remaining < 0) {
        label = "overdue";
        if (todo.priority !== Priority.High) {
          priority = Priority.High;
        }
      } else if (remaining <= ESCALATION_WINDOW_MS) {
        label = "due-soon";
        if (todo.priority === Priority.Low) {
          priority = Priority.Normal;
        } else if (todo.priority === Priority.Normal) {
          priority = Priority.High;
        }
      } else {
        if (todo.subtasks.length > 0) {
          const done = todo.subtasks.filter((s) => s.completed).length;
          if (done === todo.subtasks.length) {
            label = "ready-to-complete";
          }
        }
      }
    }
  } else if (todo.status === TodoStatus.Draft) {
    label = "not-started";
  }
  return { priority, label };
}
