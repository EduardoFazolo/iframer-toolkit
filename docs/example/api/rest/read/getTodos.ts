import { restRequest } from "../../transport/rest";
import type { Todo } from "../../types";

/** GET /todos/{id} */
export function getTodos(id: number): Promise<Todo> {
  return restRequest<Todo>("GET", `/todos/${id}`);
}
