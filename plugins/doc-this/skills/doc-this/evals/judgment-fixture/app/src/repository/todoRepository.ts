// In-memory persistence for todos. Mirrors the shape we would store in SQL,
// hence the snake_case row fields.

import { Todo, TodoStatus, Priority } from "../domain/todo.js";

interface TodoRow {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  deleted_at: string | null;
}

// Retention window for soft-deleted rows before they are purged for good.
const RETENTION_DAYS = 30;

const rows = new Map<string, TodoRow>();

function toRow(todo: Todo): TodoRow {
  return {
    id: todo.id,
    owner_id: todo.ownerId,
    title: todo.title,
    status: todo.status,
    priority: todo.priority,
    due_date: todo.dueDate ? todo.dueDate.toISOString() : null,
    created_at: todo.createdAt.toISOString(),
    deleted_at: todo.deletedAt ? todo.deletedAt.toISOString() : null,
  };
}

function fromRow(row: TodoRow): Todo {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    status: row.status as TodoStatus,
    priority: row.priority as Priority,
    dueDate: row.due_date ? new Date(row.due_date) : null,
    subtasks: [],
    createdAt: new Date(row.created_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export function save(todo: Todo): void {
  rows.set(todo.id, toRow(todo));
}

export function findById(id: string): Todo | null {
  const row = rows.get(id);
  if (!row || row.deleted_at !== null) return null;
  return fromRow(row);
}

export function listActiveByOwner(ownerId: string): Todo[] {
  const out: Todo[] = [];
  for (const row of rows.values()) {
    if (row.owner_id === ownerId && row.deleted_at === null && row.status === TodoStatus.Active) {
      out.push(fromRow(row));
    }
  }
  return out;
}

// Mark a row soft-deleted; the actual storage is retained for RETENTION_DAYS.
export function softDelete(id: string, now: Date): void {
  const row = rows.get(id);
  if (!row) return;
  row.deleted_at = now.toISOString();
}

// Permanently remove rows whose soft-delete is older than the retention window.
export function purgeExpired(now: Date): number {
  let purged = 0;
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const [id, row] of rows.entries()) {
    if (row.deleted_at !== null && new Date(row.deleted_at).getTime() < cutoff) {
      rows.delete(id);
      purged++;
    }
  }
  return purged;
}
