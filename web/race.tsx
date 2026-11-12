// 🏁 La grande course : le jeu (canvas) sur l'écran du joueur, la course en direct sur l'écran de Matt,
// le classement à la révélation et le réglage dans l'éditeur.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LEVELS, makeCourse, obstacleX, RACE, raceLength, raceLevel, type Obstacle, type RaceLevel } from "../src/race";
import type { ClientMsg, Player, PublicState, Question } from "../src/shared";
import { sfx, signed } from "./lib";
import { Avatar } from "./ui";

const laneY = (h: number, lane: number) => h * (0.27 + lane * 0.24);

/* ---------- Les sprites, dessinés à la main ---------- */

function drawFish(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, tilt: number, t: number) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(s, s);
  const wag = Math.sin(t * 14) * 0.25;
  c.fillStyle = color;
  c.strokeStyle = "#1d1530";
  c.lineWidth = 2.5;
  c.beginPath(); // queue
  c.moveTo(-16, 0);
  c.lineTo(-32, -12 + wag * 10);
  c.lineTo(-32, 12 + wag * 10);
  c.closePath();
  c.fill(); c.stroke();
  c.beginPath(); // corps
  c.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2);
  c.fill(); c.stroke();
  c.fillStyle = "rgba(255,255,255,.35)";
  c.beginPath();
  c.ellipse(2, 5, 14, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff"; // œil
  c.beginPath(); c.arc(10, -4, 6, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = "#1d1530";
  c.beginPath(); c.arc(12, -4, 3, 0, Math.PI * 2); c.fill();
  c.beginPath(); // sourire
  c.arc(15, 4, 4, 0.2, Math.PI - 0.6);
  c.stroke();
  c.restore();
}

function drawShark(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  c.save();
  c.translate(x, y + Math.sin(t * 5 + x * 0.01) * 3);
  c.scale(s, s);
  c.strokeStyle = "#1d1530";
  c.lineWidth = 2.5;
  c.fillStyle = "#7d8a99";
  c.beginPath(); // aileron
  c.moveTo(-2, -14); c.lineTo(10, -34); c.lineTo(16, -12); c.closePath();
  c.fill(); c.stroke();
  c.beginPath(); // queue (à droite : il fonce vers la gauche)
  c.moveTo(34, 0); c.lineTo(54, -18); c.lineTo(48, 0); c.lineTo(54, 18); c.closePath();
  c.fill(); c.stroke();
  c.beginPath(); // corps
  c.ellipse(4, 0, 40, 17, 0, 0, Math.PI * 2);
  c.fill(); c.stroke();
  c.fillStyle = "#e9eef3";
  c.beginPath(); c.ellipse(-2, 7, 30, 8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff"; // gueule et dents
  c.beginPath(); c.moveTo(-34, 2); c.lineTo(-14, 4); c.lineTo(-30, 12); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#fff";
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-30 + i * 5, 4); c.lineTo(-28 + i * 5, 9); c.lineTo(-26 + i * 5, 4); c.fill(); }
  c.fillStyle = "#1d1530"; // œil fâché
  c.beginPath(); c.arc(-22, -5, 3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(-28, -11); c.lineTo(-17, -7); c.stroke();
  c.restore();
}

function drawNet(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  c.save();
  c.strokeStyle = "#e9d8b0";
  c.lineWidth = 2;
  const w = h * 0.55, top = y - h / 2;
  for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(x - w / 2 + (i * w) / 4, top); c.lineTo(x - w / 2 + (i * w) / 4 + 6, top + h); c.stroke(); }
  for (let j = 0; j <= 5; j++) { c.beginPath(); c.moveTo(x - w / 2, top + (j * h) / 5); c.lineTo(x + w / 2 + 6, top + (j * h) / 5); c.stroke(); }
  c.strokeStyle = "#8a5a1c"; c.lineWidth = 4; // corde et flotteurs
  c.beginPath(); c.moveTo(x - w / 2 - 4, top); c.lineTo(x + w / 2 + 4, top); c.stroke();
  c.fillStyle = "#e2463b";
  for (const fx of [x - w / 2, x + w / 2]) { c.beginPath(); c.arc(fx, top, 6, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

function drawJelly(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  c.save();
  c.translate(x, y + Math.sin(t * 3 + x * 0.02) * 6);
  c.scale(s, s);
  c.strokeStyle = "#c45bb0";
  c.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(i * 6, 2);
    for (let k = 1; k <= 4; k++) c.lineTo(i * 6 + Math.sin(t * 6 + k + i) * 4, 2 + k * 7);
    c.stroke();
  }
  c.fillStyle = "rgba(244,151,214,.85)";
  c.beginPath(); c.arc(0, 0, 17, Math.PI, 0); c.closePath(); c.fill();
  c.strokeStyle = "#7a2a6c"; c.lineWidth = 2.5; c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.ellipse(-6, -8, 4, 2.5, -0.5, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawBoost(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const r = 14 * s * (1 + Math.sin(t * 8) * 0.08);
  c.save();
  c.fillStyle = "rgba(255,210,63,.35)";
  c.strokeStyle = "#ffd23f";
  c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = "#fff";
  c.font = `bold ${Math.round(16 * s)}px sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("⚡", x, y + 1);
  c.restore();
}

function drawScene(c: CanvasRenderingContext2D, w: number, h: number, camX: number, ppm: number, len: number, t: number) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#2aa7d6"); g.addColorStop(0.6, "#156aa6"); g.addColorStop(1, "#0c3767");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Rayons de lumière et algues au loin (parallaxe).
  c.fillStyle = "rgba(255,255,255,.07)";
  for (let i = 0; i < 4; i++) {
    const rx = ((i * 260 - camX * ppm * 0.1) % (w + 300) + w + 300) % (w + 300) - 150;
    c.beginPath(); c.moveTo(rx, 0); c.lineTo(rx + 60, 0); c.lineTo(rx - 40, h); c.lineTo(rx - 90, h); c.fill();
  }
  c.strokeStyle = "rgba(10,47,94,.55)";
  c.lineWidth = 10; c.lineCap = "round";
  const sp = 140;
  const off = (camX * ppm * 0.35) % sp;
  for (let x = -off; x < w + sp; x += sp) {
    c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x - 20, h * 0.75, x + 8, h * 0.55); c.stroke();
  }
  // Sable.
  c.fillStyle = "#e8c27a";
  c.fillRect(0, h * 0.9, w, h * 0.1);
  c.fillStyle = "#c99550";
  const so = (camX * ppm) % 60;
  for (let x = -so; x < w; x += 60) { c.beginPath(); c.arc(x + 20, h * 0.95, 2.5, 0, Math.PI * 2); c.fill(); }
  // Couloirs.
  c.strokeStyle = "rgba(255,255,255,.12)";
  c.lineWidth = 2;
  c.setLineDash([14, 14]);
  for (const k of [0.5, 1.5]) { const y = laneY(h, k); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  c.setLineDash([]);
  // Bulles qui montent.
  c.strokeStyle = "rgba(255,255,255,.4)";
  for (let i = 0; i < 12; i++) {
    const bx = ((i * 97 - camX * ppm * 0.6) % w + w) % w;
    const by = h - ((t * 40 + i * 67) % h);
    c.beginPath(); c.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2); c.stroke();
  }
  // Ligne d'arrivée en damier.
  const fx = (len - camX) * ppm;
  if (fx > -40 && fx < w + 40) {
    const sq = h / 16;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 2; i++) {
      c.fillStyle = (i + j) % 2 ? "#fff" : "#1d1530";
      c.fillRect(fx + i * sq, j * sq, sq, sq);
    }
  }
}

/* ---------- Le jeu du joueur ---------- */

type Sim = {
  d: number; lane: number; y: number; lives: number;
  stuck: number; stun: number; invert: number; boost: number; invuln: number;
  hits: Set<number>; over: "" | "finish" | "eaten" | "time"; lastT: number; sent: number; dirty: boolean;
};

export function RaceGame({ q, s, me, offset, done, send }: {
  q: Question; s: PublicState; me: Player; offset: { current: number }; done: boolean; send: (m: ClientMsg) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const course = useMemo(() => makeCourse(q.data.seed ?? 1, q.data.level), [q.data.seed, q.data.level]);
  const len = raceLength(q.data.level);
  const sim = useRef<Sim>({ d: 0, lane: 1, y: 1, lives: RACE.lives, stuck: 0, stun: 0, invert: 0, boost: 0, invuln: 0, hits: new Set(), over: "", lastT: 0, sent: 0, dirty: false });
  const [hud, setHud] = useState({ d: 0, lives: RACE.lives, count: 3, msg: "", over: "" as Sim["over"], invert: false });
  const msgUntil = useRef(0);
  const msgText = useRef("");
  const stateRef = useRef({ s, done });
  stateRef.current = { s, done };

  const move = (dir: -1 | 1) => {
    const m = sim.current;
    if (m.over) return;
    const real = Date.now() < m.invert ? -dir : dir;
    m.lane = Math.max(0, Math.min(RACE.lanes - 1, m.lane + real));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, textarea, select")) return;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); move(-1); }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); move(1); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let raf = 0;
    const say = (msg: string, ms = 1400) => { msgUntil.current = Date.now() + ms; msgText.current = msg; };
    const report = (force = false) => {
      const m = sim.current, now = Date.now();
      if (!force && now - m.sent < 300) return;
      m.sent = now;
      send({ t: "race", qid: q.id, d: m.d, lives: m.lives });
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const cv = canvas.current;
      if (!cv) return;
      const { s: st, done: locked } = stateRef.current;
      const now = Date.now();
      const elapsed = now + offset.current - st.startedAt;
      const t = (elapsed - RACE.countdownMs) / 1000;
      const m = sim.current;
      const timeUp = now + offset.current > st.deadline;

      if (t >= 0 && !m.over && !locked) {
        const dt = Math.min(0.05, Math.max(0, t - m.lastT));
        m.lastT = t;
        const v = now < m.stuck ? 0 : now < m.stun ? RACE.stunned : now < m.boost ? RACE.boost : RACE.speed;
        m.d = Math.min(len, m.d + v * dt);
        m.y += (m.lane - m.y) * Math.min(1, dt * 12);
        course.forEach((o, i) => {
          if (m.hits.has(i)) return;
          if (Math.abs(obstacleX(o, t) - m.d) > 2.2 || Math.abs(o.lane - m.y) > 0.45) return;
          m.hits.add(i);
          if (o.kind === "net") { m.stuck = now + RACE.netMs; say("🕸️ Pris dans le filet!"); sfx("bad"); }
          else if (o.kind === "jelly") { m.invert = now + RACE.invertMs; say("🪼 Piqué! Contrôles inversés", RACE.invertMs); sfx("bad"); }
          else if (o.kind === "boost") { m.boost = now + RACE.boostMs; say("⚡ Turbo!"); sfx("good"); }
          else if (now > m.invuln) {
            m.lives--; m.stun = now + RACE.stunMs; m.invuln = now + RACE.invulnMs;
            say(m.lives ? `🦈 Croqué! Plus que ${m.lives} vie${m.lives > 1 ? "s" : ""}` : "🦈 Le requin t'a eu!"); sfx("bad");
          }
          m.dirty = true;
        });
        if (m.lives <= 0) { m.over = "eaten"; report(true); }
        else if (m.d >= len) { m.over = "finish"; sfx("fanfare"); report(true); }
        else { report(m.dirty); m.dirty = false; }
      }
      if (!m.over && (timeUp || locked) && t > 0) { m.over = "time"; report(true); }

      // Dessin.
      const dpr = devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const c = cv.getContext("2d")!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ppm = w / RACE.view;
      const camX = m.d - RACE.view * 0.2;
      const tt = Math.max(0, t);
      drawScene(c, w, h, camX, ppm, len, now / 1000);
      const sz = h / 300;
      course.forEach((o, i) => {
        const x = (obstacleX(o, tt) - camX) * ppm;
        if (x < -80 || x > w + 80) return;
        const y = laneY(h, o.lane);
        const hit = m.hits.has(i);
        if (o.kind === "net") drawNet(c, x, y, h * 0.22);
        else if (o.kind === "shark") drawShark(c, x, y, sz * 1.1, now / 1000);
        else if (o.kind === "jelly") drawJelly(c, x, y, sz * 1.1, now / 1000);
        else if (!hit) drawBoost(c, x, y, sz * 1.1, now / 1000);
      });
      const blink = now < m.invuln && Math.floor(now / 100) % 2 === 0;
      if (!blink && m.over !== "eaten") drawFish(c, w * 0.2, laneY(h, m.y), sz * 1.15, me.color, (m.lane - m.y) * 0.4, now / 1000);
      if (now < m.stuck) drawNet(c, w * 0.2, laneY(h, m.y), h * 0.2);

      const count = t < 0 ? Math.ceil(-t) : 0;
      const msg = now < msgUntil.current ? msgText.current : "";
      const next = { d: Math.round(m.d), lives: m.lives, count, msg, over: m.over, invert: now < m.invert };
      setHud((x) => (x.d === next.d && x.lives === next.lives && x.count === next.count && x.msg === next.msg && x.over === next.over && x.invert === next.invert ? x : next));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [course, len, q.id, send, offset, me.color]);

  const others = Object.entries(s.race).filter(([id]) => id !== me.id);
  return (
    <div className="race-wrap">
      <div className="race-hud">
        <span className="hearts" aria-label={`${hud.lives} vies`}>{"❤️".repeat(hud.lives)}{"🖤".repeat(Math.max(0, RACE.lives - hud.lives))}</span>
        <div className="race-track" aria-hidden="true">
          {others.map(([id, r]) => <span key={id} className="ghost" style={{ left: `${(r.d / len) * 100}%` }}><Avatar p={s.players[id]} size="sm" /></span>)}
          <span className="ghost me" style={{ left: `${(hud.d / len) * 100}%` }}><Avatar p={me} size="sm" /></span>
          <span className="flag">🏁</span>
        </div>
        <span className="mono">{hud.d} / {len} m</span>
      </div>
      <div className="race-stage" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); move(e.clientY - r.top < r.height / 2 ? -1 : 1); }}>
        <canvas ref={canvas} className="race-canvas" aria-label="La course : flèches haut et bas, ou touche le haut ou le bas de l'écran pour changer de couloir" />
        {hud.count > 0 && <div className="race-count">{hud.count}</div>}
        {hud.msg && <div className={`race-msg${hud.invert ? " inv" : ""}`}>{hud.msg}</div>}
        {hud.over && (
          <div className="race-over">
            {hud.over === "finish" ? <><b>🏁 Arrivé·e!</b><span>{s.race[me.id]?.place ? `${s.race[me.id]!.place}e place` : "Bravo!"}</span></>
              : hud.over === "eaten" ? <><b>🦈 Croqué!</b><span>Ta course s'arrête à {hud.d} m.</span></>
              : <><b>⏱️ Temps écoulé</b><span>{hud.d} m parcourus.</span></>}
          </div>
        )}
      </div>
      <div className="row race-pad">
        <button className="btn" onPointerDown={(e) => { e.preventDefault(); move(-1); }}>⬆️ Monter</button>
        <span className="muted small">Flèches ↑ ↓, ou touche le haut ou le bas de l'écran</span>
        <button className="btn" onPointerDown={(e) => { e.preventDefault(); move(1); }}>⬇️ Descendre</button>
      </div>
    </div>
  );
}

/* ---------- Écran de Matt : la course en direct ---------- */

export function RaceLive({ s }: { s: PublicState }) {
  const q = s.question!;
  const len = raceLength(q.data.level);
  const racers = s.presence.filter((p) => p.id !== q.authorId);
  return (
    <div className="race-live">
      <p className="muted small">{LEVELS[raceLevel(q.data.level)].name} · {len} m · 🦈 requins, 🕸️ filets, 🪼 méduses, ⚡ turbos</p>
      <div className="lanes">
        {racers.map((p) => {
          const r = s.race[p.id];
          return (
            <div key={p.id} className={`lane${r?.done ? ` ${r.done}` : ""}`}>
              <span className="lname">{p.name}</span>
              <div className="water">
                <span className="swimmer" style={{ left: `${((r?.d ?? 0) / len) * 92}%` } as CSSProperties}>
                  <Avatar p={p} size="sm" away={s.away.includes(p.id)} />
                  {r?.done === "eaten" && <span className="tag-ico">🦈</span>}
                  {r?.done === "finish" && <span className="tag-ico">{r.place === 1 ? "🥇" : r.place === 2 ? "🥈" : r.place === 3 ? "🥉" : "🏁"}</span>}
                </span>
                <span className="finish" />
              </div>
              <span className="lives">{"❤️".repeat(r?.lives ?? RACE.lives)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Révélation ---------- */

export function RaceReveal({ s, meId }: { s: PublicState; meId?: string }) {
  const r = s.reveal!;
  return (
    <div className="music-answers">
      {Object.keys(r.picks).sort((a, b) => (r.points[b] ?? 0) - (r.points[a] ?? 0)).map((id, i) => (
        <div key={id} className={`ma-row${id === meId ? " me" : ""}`}>
          <Avatar p={s.players[id]} size="sm" away={r.away.includes(id)} />
          <span className="ma-txt"><b>{i + 1}. {s.players[id]?.name}</b><span className="meta">{r.detail[id]}</span></span>
          <b className="mono">{signed(r.points[id] ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------- Éditeur ---------- */

const ICON: Record<Obstacle["kind"], string> = { net: "🕸️", shark: "🦈", jelly: "🪼", boost: "⚡" };

/** Petite carte du parcours : les trois couloirs et leurs obstacles. */
function CourseMap({ q }: { q: Question }) {
  const course = useMemo(() => makeCourse(q.data.seed ?? 1, q.data.level), [q.data.seed, q.data.level]);
  const len = raceLength(q.data.level);
  return (
    <div className="course-map" aria-hidden="true">
      {course.map((o, i) => <span key={i} style={{ left: `${Math.min(97, (o.at / (o.kind === "shark" ? 1 + RACE.sharkSpeed / RACE.speed : 1) / len) * 100)}%`, top: `${12 + o.lane * 33}%` }}>{ICON[o.kind]}</span>)}
      <span className="flag">🏁</span>
    </div>
  );
}

export function RaceEditor({ q, patchData }: { q: Question; patchData: (d: Partial<Question["data"]>) => void }) {
  const course = useMemo(() => makeCourse(q.data.seed ?? 1, q.data.level), [q.data.seed, q.data.level]);
  const n = (k: Obstacle["kind"]) => course.filter((o) => o.kind === k).length;
  const level = raceLevel(q.data.level);
  return (
    <div className="field"><span className="flabel">Le parcours</span>
      <div className="types">
        {(Object.keys(LEVELS) as RaceLevel[]).map((k) => <button key={k} className="type" aria-pressed={level === k} onClick={() => patchData({ level: k })}>{LEVELS[k].name}</button>)}
        <button className="btn sm ghost" onClick={() => patchData({ seed: Math.floor(Math.random() * 2 ** 31) })}>🎲 Nouveau parcours</button>
      </div>
      <span className="muted small">{LEVELS[level].blurb} {LEVELS[level].length} m · {n("shark")} requins, {n("net")} filets, {n("jelly")} méduses, {n("boost")} turbos.</span>
      <CourseMap q={q} />
      <span className="muted small">Tout le monde a le même parcours. 3 vies : un requin en enlève une, un filet immobilise 1,6 s, une méduse inverse les contrôles 3 s, un turbo accélère. Arrivée : 1 000 + bonus vitesse + podium (200, 100, 50). Sinon, une part de 700 selon la distance.</span>
    </div>
  );
}

export function RacePreview({ q }: { q: Question }) {
  return (
    <>
      <CourseMap q={q} />
      <p className="small muted">⬆️ ⬇️ pour changer de couloir. {LEVELS[raceLevel(q.data.level)].name}, {raceLength(q.data.level)} m.</p>
    </>
  );
}
