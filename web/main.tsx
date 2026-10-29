import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BoardPage } from "./Board";
import { EditorPage } from "./Editor";
import { HostPage } from "./Host";
import { isSoundOn, setSound } from "./lib";
import { PlayerPage } from "./Player";
import { Toasts } from "./ui";

const ROUTES = {
  "#/": { label: "Jouer", page: PlayerPage },
  "#/classement": { label: "Classement", page: BoardPage },
  "#/matt": { label: "Préparer", page: EditorPage, matt: true },
  "#/animer": { label: "Animer", page: HostPage, matt: true },
} as const;
type Route = keyof typeof ROUTES;

const current = (): Route => (location.hash in ROUTES ? (location.hash as Route) : "#/");

function App() {
  const [route, setRoute] = useState<Route>(current);
  const [sound, setSoundState] = useState(isSoundOn());
  useEffect(() => {
    const on = () => setRoute(current());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const Page = ROUTES[route].page;
  return (
    <>
      <header className="top">
        <a className="brand" href="#/">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <defs><clipPath id="hz"><rect x="0" y="0" width="48" height="33" /></clipPath></defs>
            <path className="rays" d="M24 5v6M9.5 11l4.2 4.2M38.5 11l-4.2 4.2M3 24h6M39 24h6" />
            <circle className="sunc" cx="24" cy="33" r="13" clipPath="url(#hz)" />
            <path className="hzl" d="M4 34.5h40M12 41h24" />
          </svg>
          <span><span className="brand-name">Le Matt'inal</span><span className="brand-sub">Le quiz du standup</span></span>
        </a>
        <div className="top-right">
          <nav className="seg" aria-label="Navigation">
            {(Object.keys(ROUTES) as Route[]).filter((r) => !("matt" in ROUTES[r])).map((r) => <a key={r} href={r} aria-current={r === route ? "page" : undefined}>{ROUTES[r].label}</a>)}
          </nav>
          <nav className="seg matt-nav" aria-label="Espace Matt">
            {(Object.keys(ROUTES) as Route[]).filter((r) => "matt" in ROUTES[r]).map((r) => <a key={r} href={r} aria-current={r === route ? "page" : undefined}>{ROUTES[r].label}</a>)}
          </nav>
          <button className="icon-btn" aria-pressed={sound} onClick={() => { setSound(!sound); setSoundState(!sound); }}>Son</button>
        </div>
      </header>
      <main><Page /></main>
      <Toasts />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
