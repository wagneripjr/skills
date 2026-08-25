// HTTP surface for the todo service.

import express, { Request, Response, NextFunction } from "express";
import * as service from "../service/todoService.js";
import { User, Role } from "../domain/user.js";
import { purgeExpired } from "../repository/todoRepository.js";

const app = express();
app.use(express.json());

// Per-request configuration knobs.
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;

// Authentication: resolve the caller from a bearer token header.
// (Token verification is stubbed for the fixture.)
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const token = header.slice("Bearer ".length);
  // The token encodes "userId:role" for this fixture.
  const [id, role] = token.split(":");
  if (!id) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  (req as Request & { user: User }).user = {
    id,
    email: `${id}@example.com`,
    role: role === "admin" ? Role.Admin : Role.Member,
  };
  next();
}

app.use(authenticate);

app.post("/todos", (req, res) => {
  const user = (req as Request & { user: User }).user;
  try {
    const due = req.body.dueDate ? new Date(req.body.dueDate) : null;
    const todo = service.createTodo(user, req.body.title, due, new Date());
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/todos/:id/activate", (req, res) => {
  const user = (req as Request & { user: User }).user;
  try {
    const todo = service.activateTodo(user, req.params.id, req.body.title, new Date());
    res.json(todo);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/todos/:id/complete", (req, res) => {
  try {
    const todo = service.completeTodo(req.params.id, new Date());
    res.json(todo);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/todos/:id", (req, res) => {
  const user = (req as Request & { user: User }).user;
  try {
    service.deleteTodo(user, req.params.id, new Date());
    res.status(204).end();
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

// Internal maintenance endpoint — invoked by a scheduled job, not by clients.
function runPurge(req: Request, res: Response): void {
  const purged = purgeExpired(new Date());
  res.json({ purged });
}
app.post("/internal/purge", runPurge);

app.listen(3000, () => {
  console.log(`listening on 3000 (timeout=${REQUEST_TIMEOUT_MS}ms, retries=${MAX_RETRIES})`);
});
