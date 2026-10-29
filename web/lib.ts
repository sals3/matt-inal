import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ClientMsg, PublicState, ServerMsg, Sticker } from "../src/shared";

/* ---------- Jetons (joueur et Matt) ---------- */
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } },
  set: (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* stockage bloqué */ } },
};
export const auth = {
  get token() { return ls.get("mi.token"); },
  set token(v: string) { ls.set("mi.token", v); },
  get admin() { return ls.get("mi.admin"); },
  set admin(v: string) { ls.set("mi.admin", v); },
};

/* ---------- API ---------- */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function api<T>(path: string, opts: { method?: string; body?: unknown; raw?: Blob } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth.token) headers.authorization = `Bearer ${auth.token}`;
  if (auth.admin) headers["x-admin"] = auth.admin;
  let body: BodyInit | undefined;
  if (opts.raw) { body = opts.raw; headers["content-type"] = opts.raw.type || "application/octet-stream"; }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
  const res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

/* ---------- Toasts ---------- */
type Toast = { id: number; msg: string };
let toasts: Toast[] = [];
const toastSubs = new Set<() => void>();
const emit = () => toastSubs.forEach((f) => f());
export function toast(msg: string) {
  const t = { id: Date.now() + Math.random(), msg };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => { toasts = toasts.filter((x) => x !== t); emit(); }, 3400);
}
export const useToasts = () =>
  useSyncExternalStore((cb) => { toastSubs.add(cb); return () => { toastSubs.delete(cb); }; }, () => toasts);

/* ---------- Stickers de l'équipe (rechargés quand quelqu'un en ajoute un) ---------- */
let stickers: Sticker[] = [];
const stickerSubs = new Set<() => void>();
export async function refreshStickers() {
  try { stickers = await api<Sticker[]>("/api/stickers"); stickerSubs.forEach((f) => f()); } catch { /* pas connecté */ }
}
export function useStickers() {
  useEffect(() => { if (!stickers.length) void refreshStickers(); }, []);
  return useSyncExternalStore((cb) => { stickerSubs.add(cb); return () => { stickerSubs.delete(cb); }; }, () => stickers);
}

/* ---------- Partie en direct (WebSocket) ---------- */
export type ReactEvent = { playerId: string; e?: string; sticker?: string; target?: string };
export type ReactFn = (r: ReactEvent) => void;
export function useGame(role: "player" | "host") {
  const [state, setState] = useState<PublicState | null>(null);
  const [connected, setConnected] = useState(false);
  const offset = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reactSubs = useRef(new Set<ReactFn>());

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 800;
    const connect = () => {
      const qs = new URLSearchParams(role === "host" ? { admin: auth.admin } : { token: auth.token });
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?${qs}`);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); delay = 800; };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMsg;
        if (m.t === "state") { offset.current = m.s.serverNow - Date.now(); setState(m.s); }
        else if (m.t === "toast" || m.t === "error") toast(m.msg);
        else if (m.t === "react") reactSubs.current.forEach((f) => f(m));
        else if (m.t === "stickers") void refreshStickers();
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) { retry = setTimeout(connect, delay); delay = Math.min(8000, delay * 1.6); }
      };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); wsRef.current?.close(); };
  }, [role]);

  const send = useCallback((m: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    else toast("Connexion perdue. On se reconnecte…");
  }, []);
  const onReact = useCallback((f: ReactFn) => { reactSubs.current.add(f); return () => { reactSubs.current.delete(f); }; }, []);
  return { state, connected, send, offset, onReact };
}

export function useNow(intervalMs = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(i); }, [intervalMs]);
  return now;
}

/** Temps restant à la question, synchronisé sur l'horloge du serveur. */
export function useCountdown(s: PublicState | null, offset: { current: number }) {
  const now = useNow(100) + offset.current;
  if (!s || s.phase !== "question") return { left: 0, frac: 0 };
  const total = Math.max(1, s.deadline - s.startedAt);
  const left = Math.max(0, s.deadline - now);
  return { left, frac: left / total };
}

/* ---------- Formatage ---------- */
export const fmt = (n: number) => Math.round(n).toLocaleString("fr-CA");
export const signed = (n: number) => (n < 0 ? "−" + fmt(-n) : (n > 0 ? "+" : "") + fmt(n));
export const ord = (n: number) => (n === 1 ? "1er" : `${n}e`);
export const frDay = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("fr-CA", opts);
export const frMonth = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
export const shiftMonth = (month: string, delta: number) => {
  const d = new Date(`${month}-15T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
};

export const AVATARS = ["🦊", "🐻", "🦉", "🐸", "🐢", "🐙", "🦝", "🐧", "🐼", "🦁", "🐯", "🐨", "🐵", "🦄", "🐝", "🦖", "🐳", "🦜", "🐌", "🦔", "🦦", "🐞", "🐮", "🦩"];
export const COLORS = ["#E4531A", "#C2255C", "#9B3FC2", "#4655C8", "#0B8374", "#127A4C", "#9A6B3F", "#5F5887"];

/* ---------- Images : on réduit avant l'envoi ---------- */
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

/** Réduit l'image. `alpha` garde la transparence (caricatures détourées, stickers). */
export async function resizeImage(file: Blob, max = 1600, alpha = false): Promise<Blob> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  if (!alpha) return (await toBlob(c, "image/jpeg", 0.85)) ?? file;
  const webp = await toBlob(c, "image/webp", 0.9);
  return webp?.type === "image/webp" ? webp : (await toBlob(c, "image/png")) ?? file;
}

/** Téléverse une image et renvoie l'identifiant du média. */
export async function uploadImage(file: Blob, max: number, alpha = false): Promise<string> {
  const blob = await resizeImage(file, max, alpha);
  return (await api<{ id: string }>("/api/media", { raw: blob })).id;
}

/**
 * Mode 100 % cerveau : si l'onglet reste caché 2 secondes pendant une question
 * (ChatGPT, Google…), on le signale une fois. Un coup d'œil à Teams ne compte pas.
 */
export function useAwayWatch(active: boolean, onAway: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVis = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden" && !fired.current) {
        timer = setTimeout(() => { fired.current = true; onAway(); }, 2000);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [active, onAway]);
}

/* ---------- Sons ---------- */
let AC: AudioContext | null = null;
let soundOn = ls.get("mi.sound") !== "off";
export const isSoundOn = () => soundOn;
export const setSound = (on: boolean) => { soundOn = on; ls.set("mi.sound", on ? "" : "off"); };
type Note = [freq: number, start: number, dur: number, type?: OscillatorType, gain?: number];
const SFX: Record<string, Note[]> = {
  pop: [[660, 0, 0.07, "sine", 0.05]],
  count: [[523, 0, 0.14, "square", 0.035]],
  lock: [[440, 0, 0.07, "triangle", 0.09], [660, 0.06, 0.1, "triangle", 0.09]],
  good: [[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.3]],
  bad: [[311, 0, 0.2, "sawtooth", 0.035], [233, 0.16, 0.35, "sawtooth", 0.035]],
  tick: [[1200, 0, 0.035, "square", 0.02]],
  fanfare: [[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1047, 0.39, 0.5]],
};
export function sfx(kind: keyof typeof SFX) {
  if (!soundOn) return;
  try {
    AC ??= new AudioContext();
    if (AC.state === "suspended") void AC.resume();
    for (const [f, t0, d, type = "triangle", gv = 0.1] of SFX[kind] ?? []) {
      const o = AC.createOscillator(), g = AC.createGain(), s = AC.currentTime + t0;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(gv, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
      o.connect(g).connect(AC.destination); o.start(s); o.stop(s + d + 0.03);
    }
  } catch { /* pas de son, pas grave */ }
}

/* ---------- Confettis ---------- */
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let raf = 0;
export function confetti(n = 140) {
  if (reduced()) return;
  let c = document.getElementById("confetti") as HTMLCanvasElement | null;
  if (!c) { c = document.createElement("canvas"); c.id = "confetti"; document.body.appendChild(c); }
  const x = c.getContext("2d")!, dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr; x.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--sun", "--gold", "--c2", "--c3", "--c4"].map((v) => cs.getPropertyValue(v).trim());
  const parts = Array.from({ length: n }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 260, y: H * 0.35, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 12 - 4,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    c: cols[(Math.random() * cols.length) | 0]!,
  }));
  const t0 = performance.now();
  cancelAnimationFrame(raf);
  const frame = (now: number) => {
    const el = now - t0;
    x.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - el / 2600); x.fillStyle = p.c;
      x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
    }
    if (el < 2600) raf = requestAnimationFrame(frame); else x.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(frame);
}
