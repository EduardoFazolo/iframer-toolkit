const BASE_URL = "https://jsonplaceholder.typicode.com";

export async function restRequest<T>(
  method: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method, ...init });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}
