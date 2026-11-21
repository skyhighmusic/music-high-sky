import { auth } from '../firebase';

export async function getAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra ?? {}),
  };

  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without token if unavailable
    }
  }

  return headers;
}

export async function apiFetchJson<T>(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  }
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
