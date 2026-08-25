// User domain and the authorization rule for destructive operations.

export enum Role {
  Member = "member",
  Admin = "admin",
}

export interface User {
  id: string;
  email: string;
  role: Role;
}

import type { Todo } from "./todo.js";

// Only the owner of a todo or an admin may delete it.
export function canDelete(user: User, todo: Todo): boolean {
  if (user.role === Role.Admin) return true;
  return todo.ownerId === user.id;
}
