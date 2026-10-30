// Accounts: each password unlocks that account's payload in data/auth.json. With a GitHub token the
// payload reads and writes the account's secret gist with progress.json; without one, progress stays
// in this browser. The password itself is never stored.

const SESSION_KEY = "de-session";
const GIST_FILE = "progress.json";
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function session() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function logout() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing stored */
  }
}

export async function accountConfigured() {
  try {
    const r = await fetch(new URL("../data/auth.json", import.meta.url), { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function login(user, password) {
  const r = await fetch(new URL("../data/auth.json", import.meta.url), { cache: "no-store" });
  if (!r.ok) throw new Error("Аккаунт ещё не настроен");
  const file = await r.json();
  const fail = new Error("Неверный логин или пароль");
  const accounts = file.accounts || [file];
  const cfg = accounts.find((a) => a.user.toLowerCase() === user.trim().toLowerCase());
  if (!cfg) throw fail;
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(cfg.salt), iterations: cfg.iter },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  let payload;
  try {
    // AES-GCM checks integrity: a wrong password fails here.
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(cfg.iv) }, key, b64(cfg.ct));
    payload = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw fail;
  }
  // Without a token the account works on this device only; sync starts once auth.json carries one.
  // The first account is the owner: it keeps the progress this browser had before accounts existed.
  const s = { user: cfg.user, owner: cfg === accounts[0], token: payload.token || null, gist: payload.gist || null };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode: the session lives until the tab closes */
  }
  return s;
}

function headers(s) {
  return { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github+json" };
}

export async function gistLoad(s) {
  const r = await fetch(`https://api.github.com/gists/${s.gist}`, { headers: headers(s), cache: "no-store" });
  if (r.status === 401) throw new Error("Токен GitHub недействителен — войдите заново");
  if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
  const file = (await r.json()).files[GIST_FILE];
  if (!file) return null;
  const text = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  return text.trim() ? JSON.parse(text) : null;
}

export async function gistSave(s, progress) {
  const r = await fetch(`https://api.github.com/gists/${s.gist}`, {
    method: "PATCH",
    headers: { ...headers(s), "Content-Type": "application/json" },
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(progress) } } }),
  });
  if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
}
