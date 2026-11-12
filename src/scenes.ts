// Décors maison de la chasse aux trésors : dessinés en SVG, avec leurs objets cachés.
// Chaque décor fait 1200 × 800 ; les cachettes sont en fractions de la largeur et de la hauteur.
import type { Spot } from "./shared";

export interface Scene {
  name: string;
  blurb: string;
  ratio: number;
  svg: string;
  spots: Spot[];
}

const W = 1200, H = 800;
/** Cachette en pixels du dessin → fractions. */
const spot = (label: string, x: number, y: number, r: number): Spot => ({ label, x: x / W, y: y / H, r: r / W });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Arial Rounded MT Bold, Arial, sans-serif">${body}</svg>`;

/* ---------- Petits morceaux réutilisés ---------- */

/** Une algue qui ondule. */
const weed = (x: number, y: number, h: number, c = "#2f9e5b", w = 14) =>
  `<path d="M${x} ${y}C${x - 28} ${y - h / 3} ${x + 30} ${y - (2 * h) / 3} ${x - 6} ${y - h}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const bubbles = (pts: [number, number, number][]) =>
  pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-opacity=".55" stroke-width="2"/><circle cx="${x - r / 3}" cy="${y - r / 3}" r="${r / 4}" fill="#fff" fill-opacity=".7"/>`).join("");
const rays = `<g fill="#fff" opacity=".09"><path d="M150 0h80L110 600H40z"/><path d="M420 0h60L380 520h-60z"/><path d="M700 0h90L640 640h-70z"/><path d="M1000 0h60L960 480h-50z"/></g>`;
/** Un petit poisson (leurre jaune, rouge…). */
const fish = (x: number, y: number, c: string, flip = false, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M-22 0c10-14 30-14 40 0-10 14-30 14-40 0z" fill="${c}"/><path d="M-20 0l-14-11v22z" fill="${c}"/><circle cx="8" cy="-3" r="3.5" fill="#fff"/><circle cx="9" cy="-3" r="1.8" fill="#222"/></g>`;
const eye = (x: number, y: number, r: number, look = 0) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#1d1530" stroke-width="3"/><circle cx="${x + look}" cy="${y + 2}" r="${r * 0.45}" fill="#1d1530"/><circle cx="${x + look - r * 0.15}" cy="${y - r * 0.1}" r="${r * 0.15}" fill="#fff"/>`;
const bubbleText = (x: number, y: number, w: number, lines: string[]) =>
  `<g transform="translate(${x} ${y})"><rect x="0" y="0" width="${w}" height="${18 + lines.length * 24}" rx="18" fill="#fff" stroke="#1d1530" stroke-width="3"/><path d="M30 ${16 + lines.length * 24}l-10 22 30-20" fill="#fff" stroke="#1d1530" stroke-width="3" stroke-linejoin="round"/><path d="M28 ${14 + lines.length * 24}h24" stroke="#fff" stroke-width="6"/>${lines.map((l, i) => `<text x="${w / 2}" y="${32 + i * 24}" text-anchor="middle" font-size="19" fill="#1d1530">${l}</text>`).join("")}</g>`;

/* ---------- Le récif du lundi matin ---------- */

const recif = svg(`
<defs>
  <linearGradient id="rw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2aa7d6"/><stop offset=".55" stop-color="#156aa6"/><stop offset="1" stop-color="#0c3767"/></linearGradient>
  <linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4d28c"/><stop offset="1" stop-color="#d7a35a"/></linearGradient>
  <linearGradient id="rr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3914d"/><stop offset="1" stop-color="#a55424"/></linearGradient>
</defs>
<rect width="1200" height="800" fill="url(#rw)"/>
${rays}
<path d="M0 520C60 430 120 470 170 400 210 350 250 420 300 380 360 330 420 430 480 410 560 380 600 450 660 430 760 400 820 460 900 420 980 380 1040 450 1200 410V640H0z" fill="#0f4a7c" opacity=".8"/>
<path d="M90 470v-60m0 30l-20-25m20 10l22-30M620 440v-70m0 25l-24-22m24 0l20-28M1080 430v-50m0 22l18-20" stroke="#0f4a7c" stroke-width="12" stroke-linecap="round" fill="none"/>
${bubbles([[300, 120, 14], [330, 80, 8], [560, 60, 11], [860, 140, 16], [890, 95, 9], [1120, 220, 12], [70, 250, 10]])}

<!-- Beigne flotteur, avec sa crevette -->
<g transform="translate(380 170) rotate(-12)">
  <circle r="30" fill="#d9a066"/><circle r="30" fill="none" stroke="#f08bb5" stroke-width="15" stroke-dasharray="70 9 40 12 60 8"/>
  <circle r="11" fill="#156aa6"/>
  <g fill="#fff"><rect x="-18" y="-24" width="7" height="3" rx="1.5" transform="rotate(30)"/><rect x="8" y="-26" width="7" height="3" rx="1.5" transform="rotate(-20)"/><rect x="14" y="10" width="7" height="3" rx="1.5" transform="rotate(60)"/></g>
  <path d="M26 -6c16-4 26 6 30 16-8-2-14 2-22-2-6 6-12 2-10-4" fill="#ff9a7a" stroke="#c4553a" stroke-width="2"/>
  <circle cx="50" cy="6" r="2.5" fill="#222"/><path d="M54 2l14-14M56 4l16-6" stroke="#c4553a" stroke-width="1.5"/>
</g>
${fish(250, 300, "#ffd23f", false, 1.1)}${fish(460, 250, "#ffd23f", true, 0.8)}

<!-- Sable -->
<path d="M0 600C190 565 360 615 560 590S900 560 1200 605V800H0z" fill="url(#rs)"/>
<g fill="#c99550" opacity=".7"><circle cx="90" cy="680" r="4"/><circle cx="260" cy="760" r="5"/><circle cx="480" cy="700" r="4"/><circle cx="640" cy="770" r="3"/><circle cx="820" cy="720" r="5"/><circle cx="1010" cy="760" r="4"/><circle cx="1140" cy="690" r="3"/><circle cx="380" cy="650" r="3"/></g>

<!-- Clé USB à moitié enterrée -->
<g transform="translate(120 735) rotate(-28)">
  <rect x="-6" y="-14" width="22" height="16" rx="2" fill="#b9c2cc" stroke="#6b7682" stroke-width="2"/>
  <rect x="0" y="-10" width="4" height="4" fill="#6b7682"/><rect x="8" y="-10" width="4" height="4" fill="#6b7682"/>
  <rect x="-34" y="-17" width="30" height="22" rx="5" fill="#2f6fd6" stroke="#1b3f7a" stroke-width="2"/>
</g>
<path d="M60 745c30-14 70-12 110 2v20H60z" fill="#e7bf74"/>

<!-- Gros rocher de gauche -->
<path d="M-10 650V380c50-45 130-55 180-15 60-12 130 30 150 100 20 70-15 140-70 185z" fill="url(#rr)"/>
<path d="M40 420c30-20 70-22 100 0M60 520c40-16 90-10 120 14M200 470c30-6 60 10 76 34" stroke="#8a4219" stroke-width="6" fill="none" stroke-linecap="round" opacity=".6"/>
<!-- Oursin et étoile de mer -->
<g transform="translate(250 395)" stroke="#5a2a7a" stroke-width="3" stroke-linecap="round"><path d="M0 0l0-18M0 0l14-12M0 0l18 0M0 0l-14-12M0 0l-18 0M0 0l10-16M0 0l-10-16"/><circle r="9" fill="#7b3aa6" stroke="none"/></g>
<path d="M60 600l12-26 12 26 28 2-22 17 8 27-26-15-26 15 8-27-22-17z" fill="#ff7a59" stroke="#c4462a" stroke-width="3" stroke-linejoin="round"/>

<!-- Tasse de café cachée dans les algues -->
<g transform="translate(230 522)">
  <path d="M-12 -30c4-6-4-9 0-15M0 -30c4-6-4-9 0-15" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>
  <rect x="-18" y="-20" width="30" height="36" rx="5" fill="#4f9c86" stroke="#24564a" stroke-width="3"/>
  <path d="M12 -10c15 0 15 18 0 18" fill="none" stroke="#24564a" stroke-width="5"/>
  <text x="-3" y="5" font-size="12" text-anchor="middle" fill="#24564a">M</text>
</g>
${weed(200, 600, 150)}${weed(245, 600, 120, "#3bb36a")}${weed(275, 600, 170, "#28864c", 12)}${weed(330, 610, 90, "#3bb36a", 10)}

<!-- Corail rose et la cravate perdue -->
<g stroke="#e8708f" stroke-width="16" stroke-linecap="round" fill="none">
  <path d="M560 590V450M560 500l-40-50v-40M560 470l38-46V380M520 410l-22-30M598 380l22-34M560 450l-6-60"/>
</g>
<g fill="#f497ae"><circle cx="498" cy="376" r="10"/><circle cx="620" cy="342" r="10"/><circle cx="554" cy="386" r="9"/><circle cx="520" cy="408" r="7"/></g>
<g transform="translate(566 396) rotate(14)">
  <path d="M-7 -20h14l-3 8 9 34-13 14-13-14 9-34z" fill="#b3243b" stroke="#6e1222" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M-4 -2l12 8M-6 10l12 8" stroke="#f497ae" stroke-width="3"/>
</g>

<!-- Coffre au trésor -->
<g transform="translate(420 610)">
  <path d="M-70 -10h140v50h-140z" fill="#8b5a2b" stroke="#4a2e12" stroke-width="4"/>
  <path d="M-70 -10c0-50 140-50 140 0z" fill="#a46a33" stroke="#4a2e12" stroke-width="4" transform="rotate(-18 -70 -10)"/>
  <path d="M-62 -10h124" stroke="#ffd23f" stroke-width="6"/><rect x="-10" y="0" width="20" height="18" rx="3" fill="#ffd23f" stroke="#4a2e12" stroke-width="3"/>
  <circle cx="-30" cy="-16" r="10" fill="#ffd23f"/><circle cx="-8" cy="-22" r="9" fill="#ffe36b"/><circle cx="20" cy="-14" r="8" fill="#ffd23f"/>
  <path d="M-80 40c40-14 120-14 170 0v12h-170z" fill="#e7bf74"/>
</g>

<!-- Gaston le mérou, pas réveillé -->
<g transform="translate(760 470)">
  <path d="M-110 0c0-70 70-100 130-90 70 10 110 50 110 90s-40 80-110 90c-60 10-130-20-130-90z" fill="#3f8f8a" stroke="#1d1530" stroke-width="4"/>
  <path d="M120 -10l60-50v110z" fill="#2f736f" stroke="#1d1530" stroke-width="4" stroke-linejoin="round"/>
  <path d="M-20 -88c20-30 80-30 100 0" fill="#2f736f" stroke="#1d1530" stroke-width="4"/>
  <g fill="#2a6b67"><circle cx="20" cy="40" r="7"/><circle cx="50" cy="20" r="6"/><circle cx="70" cy="50" r="7"/><circle cx="-10" cy="10" r="5"/></g>
  ${eye(-50, -30, 22, -6)}
  <path d="M-74 -40q24-14 48 0" stroke="#1d1530" stroke-width="5" fill="#3f8f8a"/>
  <path d="M-100 30q30 22 64 4" stroke="#1d1530" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M-95 34q6 10 14 6" stroke="#1d1530" stroke-width="3" fill="none"/>
  <g transform="translate(-40 -86) rotate(-8)"><rect width="44" height="34" fill="#ffe36b" stroke="#b49a2a" stroke-width="2"/><text x="22" y="22" text-anchor="middle" font-size="11" fill="#6a5a12">LUNDI</text></g>
</g>
${bubbleText(650, 215, 230, ["Y'é quelle heure,", "le standup?"])}

<!-- Palourde et son post-it -->
<g transform="translate(705 690)">
  <path d="M-60 0c0 26 120 26 120 0z" fill="#9aa3ad" stroke="#4d5560" stroke-width="4"/>
  <path d="M-60 0c-6-48 126-48 120 0z" fill="#b6bec7" stroke="#4d5560" stroke-width="4" transform="rotate(-22 -60 0)"/>
  <circle cx="0" cy="2" r="12" fill="#fff" stroke="#d8d8e0" stroke-width="3"/>
  <g transform="translate(6 -26) rotate(-30)"><rect x="-13" y="-13" width="26" height="26" fill="#ffe36b" stroke="#b49a2a" stroke-width="2"/><path d="M-8 -4h16M-8 2h12" stroke="#b49a2a" stroke-width="2"/></g>
</g>
${fish(640, 640, "#ffd23f", true, 0.7)}

<!-- Falaise de droite, sa corniche et la souris d'ordi -->
<path d="M1210 660V110c-60-20-140 10-170 70-30 40-90 60-100 130-6 50 40 70 60 110-40 40-90 80-80 160 10 40 60 60 110 70z" fill="url(#rr)"/>
<path d="M940 340c40-12 110-14 170-4v22c-60-8-120-8-170 4z" fill="#b8693a" stroke="#8a4219" stroke-width="4"/>
<g fill="#8f99a3" stroke="#59626c" stroke-width="2.5"><ellipse cx="972" cy="333" rx="14" ry="9"/><ellipse cx="1065" cy="332" rx="12" ry="8"/><ellipse cx="1090" cy="334" rx="9" ry="6"/></g>
<g transform="translate(1018 328)">
  <path d="M-10 -12c-18-20 6-34 0-56" fill="none" stroke="#59626c" stroke-width="3"/>
  <path d="M-20 4c0-22 40-22 40 0 0 10-10 14-20 14s-20-4-20-14z" fill="#9aa3ad" stroke="#59626c" stroke-width="3"/>
  <path d="M0 -14v10" stroke="#59626c" stroke-width="2.5"/>
</g>
${weed(1010, 330, 90, "#28864c", 10)}${weed(1150, 600, 200, "#2f9e5b")}${weed(1110, 610, 140, "#3bb36a", 12)}

<!-- Crabe au casque d'écoute -->
<g transform="translate(905 650)">
  <path d="M-36 0l-24 14M-36 8l-20 22M36 0l24 14M36 8l20 22" stroke="#b8322a" stroke-width="6" stroke-linecap="round"/>
  <ellipse rx="40" ry="26" fill="#e2463b" stroke="#8a1e18" stroke-width="4"/>
  <path d="M-38 -10c-30-10-40-40-24-50 10 8 24 6 24 20M38 -10c30-10 40-40 24-50-10 8-24 6-24 20" fill="#e2463b" stroke="#8a1e18" stroke-width="4"/>
  <path d="M-12 -24v-22M12 -24v-22" stroke="#8a1e18" stroke-width="4"/>
  ${eye(-12, -50, 9, 2)}${eye(12, -50, 9, 2)}
  <path d="M-28 -46c0-36 56-36 56 0" fill="none" stroke="#2a2a3a" stroke-width="7"/>
  <rect x="-36" y="-50" width="14" height="22" rx="6" fill="#4b4b66" stroke="#2a2a3a" stroke-width="3"/>
  <rect x="22" y="-50" width="14" height="22" rx="6" fill="#4b4b66" stroke="#2a2a3a" stroke-width="3"/>
  <path d="M-30 -30c-6 16 6 22 18 20" fill="none" stroke="#2a2a3a" stroke-width="3"/><circle cx="-11" cy="-10" r="4" fill="#2a2a3a"/>
  <path d="M-12 8q12 8 24 0" stroke="#8a1e18" stroke-width="3" fill="none"/>
</g>
${bubbles([[960, 560, 8], [975, 530, 5], [600, 520, 7]])}
`);

/* ---------- Le bureau englouti ---------- */

const bureau = svg(`
<defs>
  <linearGradient id="bw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fa3a6"/><stop offset=".6" stop-color="#17697f"/><stop offset="1" stop-color="#0d3b55"/></linearGradient>
  <linearGradient id="bs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9cf95"/><stop offset="1" stop-color="#c9a466"/></linearGradient>
</defs>
<rect width="1200" height="800" fill="url(#bw)"/>
${rays}
<!-- Mur de bureau avec moisissures -->
<path d="M0 0h1200v560H0z" fill="#1f7f8a" opacity=".35"/>
<path d="M0 470h1200" stroke="#0f5363" stroke-width="6" opacity=".5"/>
<g opacity=".35" fill="#0f5363"><rect x="80" y="80" width="140" height="100" rx="6"/><rect x="980" y="60" width="160" height="110" rx="6"/></g>
<text x="150" y="138" text-anchor="middle" font-size="18" fill="#9fe0d8" opacity=".8">OBJECTIFS</text>
<text x="150" y="160" text-anchor="middle" font-size="14" fill="#9fe0d8" opacity=".8">Q4 : rester sec</text>

<!-- Horloge du standup -->
<g transform="translate(600 120)">
  <circle r="62" fill="#fff" stroke="#1d1530" stroke-width="6"/>
  <g stroke="#1d1530" stroke-width="4" stroke-linecap="round"><path d="M0 -48v8M48 0h-8M0 48v-8M-48 0h8"/><path d="M0 0V-38"/><path d="M0 0h-28" stroke-width="6"/></g>
  <path d="M0 0v-38" stroke="#d94e16" stroke-width="5" stroke-linecap="round"/>
  <text y="30" text-anchor="middle" font-size="15" fill="#d94e16">STANDUP</text>
  ${fish(30, -60, "#ffd23f", true, 0.6)}
</g>

<!-- Badge d'employé accroché à une algue -->
${weed(1150, 640, 420, "#2f9e5b", 16)}
<g transform="translate(1146 262) rotate(10)">
  <path d="M0 -40l-10 30M0 -40l10 30" stroke="#d94e16" stroke-width="3"/>
  <rect x="-16" y="-12" width="32" height="42" rx="4" fill="#f2f6f9" stroke="#59626c" stroke-width="2.5"/>
  <circle cx="0" cy="2" r="7" fill="#9aa3ad"/><path d="M-9 20h18M-7 25h14" stroke="#59626c" stroke-width="2.5"/>
</g>
${weed(1100, 640, 260, "#3bb36a", 12)}

<!-- Distributeur d'eau, avec un poisson dedans -->
<g transform="translate(170 330)">
  <path d="M-50 0c0-40 100-40 100 0v130c0 20-100 20-100 0z" fill="#bfe8f5" fill-opacity=".55" stroke="#4b8ea6" stroke-width="5"/>
  <path d="M-46 40h92v86c0 16-92 16-92 0z" fill="#7fd0ea" fill-opacity=".6"/>
  ${fish(0, 80, "#ff8a3d", false, 1)}
  <rect x="-60" y="140" width="120" height="170" rx="10" fill="#e8edf2" stroke="#59626c" stroke-width="5"/>
  <rect x="-18" y="170" width="36" height="16" rx="4" fill="#4b8ea6"/>
</g>
${bubbleText(40, 210, 170, ["Enfin de l'eau", "fraîche!"])}

<!-- Bureau, écran et clavier -->
<rect x="320" y="470" width="520" height="28" rx="6" fill="#a87443" stroke="#5a3a1c" stroke-width="5"/>
<path d="M350 498v150M810 498v150" stroke="#5a3a1c" stroke-width="16"/>
<rect x="340" y="498" width="140" height="120" fill="#946437" stroke="#5a3a1c" stroke-width="5"/>
<path d="M360 540h100M360 580h100" stroke="#5a3a1c" stroke-width="4"/>
<g transform="translate(560 380)">
  <rect x="-140" y="-96" width="280" height="180" rx="10" fill="#26263a" stroke="#14141f" stroke-width="5"/>
  <rect x="-128" y="-84" width="256" height="148" rx="4" fill="#4a3d8f"/>
  <rect x="-128" y="-84" width="256" height="22" fill="#30276a"/>
  <text x="0" y="-68" text-anchor="middle" font-size="13" fill="#fff">Réunion : Standup 9 h 00</text>
  <g fill="#5d50a8"><rect x="-120" y="-56" width="116" height="54" rx="4"/><rect x="4" y="-56" width="116" height="54" rx="4"/><rect x="-120" y="2" width="116" height="54" rx="4"/><rect x="4" y="2" width="116" height="54" rx="4"/></g>
  ${fish(-62, -30, "#ffd23f", false, 0.8)}${fish(62, -30, "#ff8a3d", true, 0.8)}${fish(-62, 28, "#7fd0ea", false, 0.8)}
  <text x="62" y="34" text-anchor="middle" font-size="22">🐙</text>
  <rect x="-70" y="40" width="140" height="18" rx="9" fill="#1d1530" opacity=".85"/>
  <text x="0" y="53" text-anchor="middle" font-size="11" fill="#fff">🔇 Vous êtes en sourdine</text>
  <path d="M-20 84h40l10 6h-60z" fill="#14141f"/>
</g>
<!-- Lunettes oubliées sur le haut de l'écran -->
<g transform="translate(468 284) rotate(-6)">
  <circle cx="-13" cy="0" r="11" fill="#7fd0ea" fill-opacity=".35" stroke="#1d1530" stroke-width="3.5"/>
  <circle cx="13" cy="0" r="11" fill="#7fd0ea" fill-opacity=".35" stroke="#1d1530" stroke-width="3.5"/>
  <path d="M-2 0h4M-24 -2l-10-4M24 -2l10-4" stroke="#1d1530" stroke-width="3"/>
</g>
<rect x="470" y="452" width="170" height="18" rx="4" fill="#d6d9e0" stroke="#59626c" stroke-width="3"/>
<path d="M480 461h150" stroke="#59626c" stroke-width="2" stroke-dasharray="8 4"/>

<!-- La pieuvre qui tape au clavier, sur sa chaise -->
<g transform="translate(770 420)">
  <path d="M-40 150h80M0 150v-40M-40 150l-14 20M40 150l14 20" stroke="#2a2a3a" stroke-width="8" stroke-linecap="round"/>
  <rect x="-50" y="60" width="100" height="50" rx="12" fill="#3a3a52"/>
  <rect x="-46" y="-30" width="92" height="96" rx="16" fill="#4b4b66"/>
  <path d="M-30 60c-30 10-60 0-90 10M-20 66c-20 30-60 30-70 50M20 66c10 30 40 40 40 70M30 60c30 10 50 40 50 70" stroke="#c45bb0" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M-34 40c-60-10-80 0-110 10" stroke="#c45bb0" stroke-width="16" fill="none" stroke-linecap="round"/>
  <ellipse cx="0" cy="0" rx="52" ry="62" fill="#d76ac2" stroke="#7a2a6c" stroke-width="4"/>
  ${eye(-18, -6, 14, -5)}${eye(18, -6, 14, -5)}
  <path d="M-12 26q12 10 24 0" stroke="#7a2a6c" stroke-width="4" fill="none" stroke-linecap="round"/>
  <g fill="#b8509e"><circle cx="-30" cy="-36" r="5"/><circle cx="26" cy="-40" r="4"/><circle cx="0" cy="-50" r="5"/></g>
</g>
${bubbleText(830, 250, 220, ["Je peux pas,", "j'ai 8 réunions"])}

<!-- Classeur, son tiroir ouvert et le lunch oublié -->
<g transform="translate(1030 380)">
  <rect x="-80" y="0" width="160" height="260" rx="6" fill="#8f99a3" stroke="#4d5560" stroke-width="5"/>
  <path d="M-80 90h160M-80 175h160" stroke="#4d5560" stroke-width="5"/>
  <rect x="-20" y="120" width="40" height="10" rx="4" fill="#4d5560"/><rect x="-20" y="205" width="40" height="10" rx="4" fill="#4d5560"/>
  <path d="M-90 20h180l-10 60h-160z" fill="#a9b2bb" stroke="#4d5560" stroke-width="5"/>
  <rect x="-70" y="10" width="140" height="18" fill="#6e7780"/>
  <!-- Sandwich -->
  <g transform="translate(-6 30) rotate(-8)">
    <path d="M-30 6l30-22 30 22z" fill="#e8b766" stroke="#8a5a1c" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-30 6h60" stroke="#5fb84c" stroke-width="5"/><path d="M-28 11h56" stroke="#e2463b" stroke-width="4"/>
    <path d="M-30 15h60l-30-6z" fill="#e8b766" stroke="#8a5a1c" stroke-width="3"/>
  </g>
  ${weed(-40, 30, 70, "#3bb36a", 9)}${weed(40, 30, 60, "#2f9e5b", 9)}
  <!-- Trombone sur le dessus -->
  <path d="M30 -8h28c8 0 8-12 0-12h-24c-6 0-6 8 0 8h18" fill="none" stroke="#c9d1d9" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="-60" y="-12" width="44" height="12" rx="3" fill="#d6d9e0" stroke="#59626c" stroke-width="2"/>
</g>

<!-- Sol de sable -->
<path d="M0 640C220 610 380 660 600 640S960 610 1200 650V800H0z" fill="url(#bs)"/>
<g fill="#b8935a" opacity=".7"><circle cx="120" cy="720" r="4"/><circle cx="420" cy="760" r="5"/><circle cx="700" cy="720" r="4"/><circle cx="980" cy="750" r="5"/><circle cx="1120" cy="700" r="3"/></g>

<!-- Crayon dans le sable, et un poisson jaune pour mêler les cartes -->
<g transform="translate(300 708) rotate(-20)">
  <rect x="-34" y="-6" width="56" height="12" fill="#ffc83d" stroke="#8a6a12" stroke-width="2.5"/>
  <path d="M22 -6l14 6-14 6z" fill="#f2d3a6" stroke="#8a6a12" stroke-width="2.5"/><path d="M32 -2l4 2-4 2z" fill="#333"/>
  <rect x="-42" y="-6" width="8" height="12" fill="#f497ae" stroke="#8a6a12" stroke-width="2.5"/>
</g>
${fish(380, 690, "#ffd23f", true, 0.9)}

<!-- Plante (une anémone) dans son pot -->
<g transform="translate(900 640)">
  <path d="M-30 0h60l-8 50h-44z" fill="#d94e16" stroke="#7a2a0c" stroke-width="4"/>
  <g stroke="#ff8fb1" stroke-width="8" stroke-linecap="round"><path d="M0 0v-50M-10 0l-20-40M10 0l20-40M-18 0l-34-20M18 0l34-20"/></g>
</g>

<!-- Chargeur de laptop, enroulé comme un serpent de mer -->
<g transform="translate(640 690)">
  <path d="M-40 10c0-30 70-30 70 0s-56 24-56 0 42-18 42 0-26 10-26 0" fill="none" stroke="#1d1d26" stroke-width="5" stroke-linecap="round"/>
  <rect x="26" y="-6" width="30" height="20" rx="4" fill="#2a2a3a" stroke="#14141f" stroke-width="2.5"/><circle cx="48" cy="4" r="2.5" fill="#5ee0a0"/>
  <path d="M-40 10h-16" stroke="#1d1d26" stroke-width="5"/><rect x="-66" y="5" width="12" height="10" fill="#9aa3ad"/>
</g>
<!-- Vrai serpent de mer, pour l'ambiance -->
<path d="M120 640c20-30 50 10 70-20s50 10 60-10" stroke="#5a7a3a" stroke-width="10" fill="none" stroke-linecap="round"/>
<circle cx="250" cy="612" r="3" fill="#222"/>
${weed(40, 650, 160, "#2f9e5b")}${weed(80, 650, 110, "#3bb36a", 12)}
${bubbles([[700, 300, 10], [720, 260, 6], [300, 380, 12], [940, 520, 8], [1070, 320, 7]])}
`);

export const SCENES: Record<string, Scene> = {
  recif: {
    name: "Le récif du lundi matin",
    blurb: "Gaston le mérou n'est pas réveillé, et quelqu'un a semé ses affaires de bureau partout.",
    ratio: W / H,
    svg: recif,
    spots: [
      spot("La tasse de café", 228, 518, 30),
      spot("Le casque d'écoute", 905, 612, 38),
      spot("La souris d'ordi", 1018, 324, 28),
      spot("La cravate perdue", 566, 398, 28),
      spot("Le post-it jaune", 708, 664, 24),
      spot("Le beigne", 380, 170, 36),
      spot("La clé USB", 112, 728, 26),
    ],
  },
  bureau: {
    name: "Le bureau englouti",
    blurb: "Le standup a lieu même sous l'eau. La pieuvre a 8 réunions, et des objets ont coulé partout.",
    ratio: W / H,
    svg: bureau,
    spots: [
      spot("Le trombone", 1072, 366, 24),
      spot("Les lunettes", 468, 284, 30),
      spot("Le crayon", 298, 708, 30),
      spot("Le badge d'employé", 1146, 270, 26),
      spot("Le lunch oublié", 1024, 410, 32),
      spot("Le chargeur de laptop", 640, 694, 40),
    ],
  },
};

/** L'image d'une chasse : un décor maison (SVG intégré) ou l'image téléversée par Matt. */
export function huntSrc(q: { imageId: string | null; data: { scene?: string } }): string | null {
  const s = q.data.scene && SCENES[q.data.scene];
  if (s) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`;
  return q.imageId ? `/media/${q.imageId}` : null;
}
