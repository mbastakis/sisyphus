/** In-progress form drafts, persisted per tab in sessionStorage so that a
 * page reload — whether from a service-worker update, an Authentik re-login
 * round trip, or a plain browser refresh — never loses what the user was
 * typing. Drafts are cleared on submit or explicit cancel. */

const PREFIX = "sisyphus.draft.";

export const createDraftKey = (boardId: string) => `${PREFIX}create.${boardId}`;
export const editDraftKey = (uuid: string) => `${PREFIX}edit.${uuid}`;

export function loadDraft<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failure: drafts are a convenience layer only.
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Uuids of every task with a pending edit draft in this tab. */
export function editDraftUuids(): string[] {
  const out: string[] = [];
  try {
    const prefix = editDraftKey("");
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
  } catch {
    // ignore
  }
  return out;
}
