// Application service: orchestrates domain rules and persistence.

import { Todo, TodoStatus, Priority, transition } from "../domain/todo.js";
import { User, canDelete } from "../domain/user.js";
import * as repo from "../repository/todoRepository.js";

// Maximum number of active todos a single user may hold at once.
const MAX_ACTIVE_TODOS = 50;

export class ValidationError extends Error {}
export class ActiveLimitError extends Error {}
export class ForbiddenError extends Error {}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `todo-${counter}`;
}

export function createTodo(owner: User, title: string, dueDate: Date | null, now: Date): Todo {
  // Validate title.
  if (title === null || title === undefined) {
    throw new ValidationError("title is required");
  }
  if (title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  if (title.length > 200) {
    throw new ValidationError("title too long");
  }
  if (dueDate !== null && dueDate.getTime() < now.getTime()) {
    throw new ValidationError("due date cannot be in the past");
  }

  const todo: Todo = {
    id: nextId(),
    ownerId: owner.id,
    title,
    status: TodoStatus.Draft,
    priority: Priority.Normal,
    dueDate,
    subtasks: [],
    createdAt: now,
    deletedAt: null,
  };
  repo.save(todo);
  return todo;
}

export function activateTodo(owner: User, todoId: string, title: string, now: Date): Todo {
  // Validate title.
  if (title === null || title === undefined) {
    throw new ValidationError("title is required");
  }
  if (title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  if (title.length > 200) {
    throw new ValidationError("title too long");
  }

  const todo = repo.findById(todoId);
  if (!todo) throw new ValidationError("todo not found");

  const active = repo.listActiveByOwner(owner.id);
  if (active.length >= MAX_ACTIVE_TODOS) {
    throw new ActiveLimitError(`limit of ${MAX_ACTIVE_TODOS} active todos reached`);
  }

  const moved = transition(todo, TodoStatus.Active, now);
  repo.save(moved);
  return moved;
}

export function completeTodo(todoId: string, now: Date): Todo {
  const todo = repo.findById(todoId);
  if (!todo) throw new ValidationError("todo not found");
  const moved = transition(todo, TodoStatus.Done, now);
  repo.save(moved);
  return moved;
}

export function deleteTodo(user: User, todoId: string, now: Date): void {
  const todo = repo.findById(todoId);
  if (!todo) throw new ValidationError("todo not found");
  if (!canDelete(user, todo)) {
    throw new ForbiddenError("not allowed to delete this todo");
  }
  repo.softDelete(todoId, now);
}
