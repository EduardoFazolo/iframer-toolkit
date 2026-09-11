# Captured API

One page, one button, one endpoint. Captured by clicking "Load task #1" on
[`docs/example/site/index.html`](../site/index.html).

## REST

| Verb | Endpoint | Function |
|------|----------|----------|
| read | `GET /todos/{id}` | `getTodos(id)` |

No auth. No cookies. No tokens. `jsonplaceholder.typicode.com` doesn't need any.

```ts
import { getTodos } from "./index";

const todo = await getTodos(1);
// { userId: 1, id: 1, title: "delectus aut autem", completed: false }
```

See [`captured-api.json`](../captured-api.json) for the raw capture (full
headers, response body, ready-to-run curl).
