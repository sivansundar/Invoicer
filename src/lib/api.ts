import { toast } from "sonner";

/**
 * Sends one write to the server and says whether it stuck. A failure is
 * toasted here (the server's own message when it gave one), so callers only
 * need the boolean.
 */
export async function send(method: "PUT" | "DELETE", path: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return true;
    const message = await res
      .json()
      .then((j) => (j as { error?: string }).error)
      .catch(() => undefined);
    toast(message ?? "That change couldn't be saved. Please try again.");
  } catch {
    toast("Can't reach the server, so that change wasn't saved. Check your connection and try again.");
  }
  return false;
}
