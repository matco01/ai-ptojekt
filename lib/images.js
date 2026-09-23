// Generated SVG product illustrations for the demo catalog (a real shop would serve photos).
import { getProduct } from "./catalog.js";

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, v + amt)).toString(16).padStart(2, "0");
  return "#" + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
}

const DARK = "#1b1d22";

const draw = {
  phone: (c) => `
    <rect x="78" y="26" width="84" height="186" rx="18" fill="${DARK}"/>
    <rect x="84" y="33" width="72" height="172" rx="13" fill="url(#g)"/>
    <circle cx="120" cy="44" r="4" fill="${DARK}"/>
    <path d="M84 150 L156 80 L156 120 L84 190Z" fill="#fff" opacity=".12"/>`,
  laptop: (c) => `
    <rect x="42" y="46" width="156" height="108" rx="8" fill="${DARK}"/>
    <rect x="49" y="53" width="142" height="94" rx="3" fill="url(#g)"/>
    <path d="M22 158 H218 L228 172 Q228 178 222 178 H18 Q12 178 12 172Z" fill="#c9ced6"/>
    <rect x="100" y="158" width="40" height="5" rx="2" fill="#a9afb8"/>
    <path d="M49 120 L140 53 L180 53 L49 147Z" fill="#fff" opacity=".1"/>`,
  tv: (c) => `
    <rect x="14" y="42" width="212" height="130" rx="5" fill="#0e0f12"/>
    <rect x="19" y="47" width="202" height="120" rx="2" fill="url(#g)"/>
    <path d="M19 140 Q70 100 120 130 T221 115 V167 H19Z" fill="${shade(c, 60)}" opacity=".55"/>
    <path d="M19 150 Q90 125 150 150 T221 140 V167 H19Z" fill="${shade(c, 100)}" opacity=".35"/>
    <path d="M60 172 L50 196 M180 172 L190 196" stroke="#2a2d33" stroke-width="6" stroke-linecap="round"/>`,
  soundbar: (c) => `
    <rect x="150" y="70" width="62" height="98" rx="10" fill="${shade(c, 15)}"/>
    <circle cx="181" cy="119" r="20" fill="${shade(c, -10)}" stroke="${shade(c, 40)}" stroke-width="3"/>
    <rect x="16" y="140" width="190" height="34" rx="17" fill="${c}"/>
    ${Array.from({ length: 16 }, (_, i) => `<circle cx="${36 + i * 10}" cy="157" r="2" fill="${shade(c, 50)}"/>`).join("")}`,
  headphones: (c) => `
    <path d="M58 138 V118 A62 70 0 0 1 182 118 V138" fill="none" stroke="${shade(c, 20)}" stroke-width="13" stroke-linecap="round"/>
    <rect x="38" y="116" width="42" height="72" rx="20" fill="${c}"/>
    <rect x="160" y="116" width="42" height="72" rx="20" fill="${c}"/>
    <rect x="48" y="126" width="22" height="52" rx="11" fill="${shade(c, 35)}"/>
    <rect x="170" y="126" width="22" height="52" rx="11" fill="${shade(c, 35)}"/>`,
  earbuds: (c) => `
    <rect x="62" y="118" width="116" height="76" rx="32" fill="${c}" stroke="${shade(c, -30)}" stroke-width="2"/>
    <path d="M64 146 H176" stroke="${shade(c, -40)}" stroke-width="2"/>
    <circle cx="150" cy="170" r="4" fill="#3ac47d"/>
    <circle cx="92" cy="72" r="20" fill="${c}" stroke="${shade(c, -30)}" stroke-width="2"/><rect x="86" y="80" width="12" height="36" rx="6" fill="${c}" stroke="${shade(c, -30)}" stroke-width="2"/>
    <circle cx="148" cy="72" r="20" fill="${c}" stroke="${shade(c, -30)}" stroke-width="2"/><rect x="142" y="80" width="12" height="36" rx="6" fill="${c}" stroke="${shade(c, -30)}" stroke-width="2"/>
    <circle cx="92" cy="72" r="9" fill="${DARK}" opacity=".7"/><circle cx="148" cy="72" r="9" fill="${DARK}" opacity=".7"/>`,
  speaker: (c) => `
    <rect x="44" y="78" width="152" height="96" rx="48" fill="${c}"/>
    <ellipse cx="60" cy="126" rx="14" ry="46" fill="${shade(c, -40)}"/>
    <ellipse cx="180" cy="126" rx="14" ry="46" fill="${shade(c, -40)}"/>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 11 }, (_, i) => `<circle cx="${75 + i * 9}" cy="${104 + r * 11}" r="2.2" fill="${shade(c, -35)}"/>`).join("")).join("")}
    <rect x="98" y="80" width="44" height="10" rx="5" fill="${shade(c, 30)}"/>`,
  watch: (c) => `
    <rect x="96" y="14" width="48" height="212" rx="14" fill="${shade(c, -15)}"/>
    <rect x="76" y="70" width="88" height="100" rx="26" fill="${DARK}"/>
    <rect x="84" y="78" width="72" height="84" rx="19" fill="url(#g)"/>
    <rect x="164" y="104" width="7" height="22" rx="3" fill="#555"/>
    <text x="120" y="126" font-family="Arial" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">10:09</text>
    <text x="120" y="145" font-family="Arial" font-size="10" fill="#fff" opacity=".8" text-anchor="middle">♥ 72</text>`,
  tablet: (c) => `
    <rect x="40" y="30" width="160" height="184" rx="16" fill="${DARK}"/>
    <rect x="47" y="37" width="146" height="170" rx="10" fill="url(#g)"/>
    <path d="M47 150 L193 60 L193 100 L47 190Z" fill="#fff" opacity=".1"/>`,
  console: (c) => `
    <path d="M80 32 Q80 24 90 24 H112 V214 H92 Q80 214 78 204Z" fill="${c}" stroke="#cfd0d6" stroke-width="2"/>
    <path d="M160 32 Q160 24 150 24 H128 V214 H148 Q160 214 162 204Z" fill="${c}" stroke="#cfd0d6" stroke-width="2"/>
    <rect x="112" y="24" width="16" height="190" fill="${DARK}"/>
    <circle cx="120" cy="60" r="3" fill="#4ea1ff"/>`,
  controller: (c) => `
    <path d="M58 104 Q66 78 96 82 H144 Q174 78 182 104 L200 160 Q206 190 182 190 Q164 190 154 164 H86 Q76 190 58 190 Q34 190 40 160Z" fill="${c}" stroke="${shade(c, -45)}" stroke-width="2"/>
    <rect x="72" y="112" width="30" height="10" rx="2" fill="${DARK}"/><rect x="82" y="102" width="10" height="30" rx="2" fill="${DARK}"/>
    <circle cx="160" cy="104" r="6" fill="${DARK}"/><circle cx="174" cy="118" r="6" fill="${DARK}"/><circle cx="146" cy="118" r="6" fill="${DARK}"/><circle cx="160" cy="132" r="6" fill="${DARK}"/>
    <circle cx="104" cy="150" r="12" fill="${shade(c, -60)}"/><circle cx="136" cy="150" r="12" fill="${shade(c, -60)}"/>`,
  powerbank: (c) => `
    <rect x="72" y="42" width="96" height="160" rx="16" fill="${c}"/>
    <rect x="72" y="42" width="96" height="160" rx="16" fill="url(#shine)"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="${105 + i * 10}" cy="180" r="3" fill="${i < 3 ? "#3ac47d" : "#666"}"/>`).join("")}
    <rect x="104" y="42" width="32" height="6" rx="3" fill="${DARK}"/>`,
  charger: (c) => `
    <rect x="84" y="36" width="8" height="30" rx="3" fill="#b5b8bf"/><rect x="148" y="36" width="8" height="30" rx="3" fill="#b5b8bf"/>
    <rect x="70" y="62" width="100" height="92" rx="18" fill="${c}" stroke="${shade(c, -40)}" stroke-width="2"/>
    <rect x="100" y="140" width="40" height="8" rx="3" fill="${DARK}"/>
    <path d="M120 154 C120 200 60 180 50 214" fill="none" stroke="${shade(c, -60)}" stroke-width="7" stroke-linecap="round"/>`,
  case: (c) => `
    <rect x="74" y="24" width="92" height="192" rx="22" fill="${c}"/>
    <rect x="86" y="38" width="36" height="46" rx="10" fill="${shade(c, -40)}"/>
    <circle cx="98" cy="52" r="7" fill="${DARK}"/><circle cx="110" cy="70" r="7" fill="${DARK}"/>
    <rect x="60" y="40" width="80" height="170" rx="16" fill="#dff1ff" opacity=".55" stroke="#9cc9ea"/>`,
  mouse: (c) => `
    <ellipse cx="120" cy="124" rx="50" ry="74" fill="${c}"/>
    <path d="M120 50 V110" stroke="${shade(c, -40)}" stroke-width="2"/>
    <rect x="113" y="72" width="14" height="26" rx="7" fill="${shade(c, 40)}"/>
    <ellipse cx="104" cy="150" rx="18" ry="30" fill="#fff" opacity=".08"/>`,
  bag: (c) => `
    <path d="M90 76 Q90 48 120 48 Q150 48 150 76" fill="none" stroke="${shade(c, -30)}" stroke-width="10"/>
    <rect x="30" y="74" width="180" height="124" rx="14" fill="${c}"/>
    <rect x="56" y="118" width="128" height="58" rx="8" fill="${shade(c, 18)}"/>
    <path d="M56 130 H184" stroke="${shade(c, -30)}" stroke-width="2" stroke-dasharray="5 4"/>`,
  robot: (c) => `
    <circle cx="120" cy="126" r="86" fill="${c}"/>
    <circle cx="120" cy="126" r="70" fill="${shade(c, 12)}" stroke="${shade(c, -35)}" stroke-width="2"/>
    <circle cx="120" cy="92" r="18" fill="${shade(c, -70)}"/>
    <path d="M58 170 A72 72 0 0 0 182 170" fill="none" stroke="${shade(c, -60)}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="146" cy="140" r="5" fill="#3ac47d"/>`,
  coffee: (c) => `
    <rect x="62" y="28" width="116" height="180" rx="14" fill="${c}"/>
    <rect x="76" y="42" width="88" height="42" rx="6" fill="#2d3340"/>
    <circle cx="100" cy="63" r="6" fill="#e0a95b"/><circle cx="120" cy="63" r="6" fill="#aaa"/><circle cx="140" cy="63" r="6" fill="#aaa"/>
    <rect x="106" y="98" width="28" height="18" rx="4" fill="#777"/>
    <path d="M100 150 H140 L136 184 H104Z" fill="#fff"/><path d="M140 158 Q152 160 150 170 Q148 178 138 176" fill="none" stroke="#fff" stroke-width="4"/>
    <rect x="72" y="188" width="96" height="8" rx="3" fill="#444"/>`,
  stickvac: (c) => `
    <path d="M158 20 L110 196" stroke="${shade(c, -20)}" stroke-width="9" stroke-linecap="round"/>
    <rect x="128" y="44" width="46" height="70" rx="18" fill="${c}" transform="rotate(15 151 79)"/>
    <circle cx="150" cy="80" r="13" fill="#bfe3ff" opacity=".8"/>
    <rect x="70" y="190" width="84" height="20" rx="8" fill="${DARK}"/>`,
};

export function productSvg(id) {
  const p = getProduct(id);
  if (!p) return null;
  const c = p.color;
  const body = (draw[p.type] ?? draw.powerbank)(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="480" height="480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 70)}"/><stop offset="1" stop-color="${shade(c, -30)}"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <ellipse cx="120" cy="222" rx="80" ry="8" fill="#000" opacity=".07"/>
  ${body}
</svg>`;
}
