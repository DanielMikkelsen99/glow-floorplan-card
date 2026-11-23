/*
 * Glow Floorplan Card for Home Assistant
 * https://github.com/DanielMikkelsen99/glow-floorplan-card
 *
 * A dependency-free Lovelace card that draws a floor plan, lets every room
 * glow in the actual colour and brightness of its lamps, pulses rooms on
 * motion, switches between day and night, and ships with a drag-and-drop
 * visual editor.
 *
 * License: MIT
 */

const VERSION = "1.2.0";
const CARD_TAG = "glow-floorplan-card";
const EDITOR_TAG = "glow-floorplan-card-editor";

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_ICONS = {
  light: "mdi:lightbulb",
  switch: "mdi:power-socket-eu",
  fan: "mdi:fan",
  vacuum: "mdi:robot-vacuum",
  lawn_mower: "mdi:robot-mower",
  lock: "mdi:lock",
  cover: "mdi:window-shutter",
  climate: "mdi:thermostat",
  media_player: "mdi:speaker",
  binary_sensor: "mdi:checkbox-blank-circle-outline",
  sensor: "mdi:eye",
  camera: "mdi:cctv",
  scene: "mdi:palette",
  script: "mdi:script-text",
  input_boolean: "mdi:toggle-switch",
};

const ACTIVE_STATES = ["on", "open", "unlocked", "playing", "cleaning", "mowing", "returning", "heating", "cooling"];
const BUSY_STATES = ["cleaning", "returning", "mowing"];
const ERROR_STATES = ["error"];

const PALETTE = {
  day: {
    bg: "transparent",
    floorA: "#eef1f7",
    floorB: "#dfe4ee",
    wall: "#ffffff",
    opening: "#e7ebf3",
    dash: "#c9d0de",
    text: "#5b6478",
    shadow: 0.5,
  },
  night: {
    bg: "transparent",
    floorA: "#3b4254",
    floorB: "#2e3442",
    wall: "#646d82",
    opening: "#353b4b",
    dash: "#555d70",
    text: "#aab3c7",
    shadow: 0.6,
  },
};

const domainOf = (entityId) => (entityId || "").split(".")[0];

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clone = (o) => JSON.parse(JSON.stringify(o));

const slug = (s) =>
  String(s || "rum")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "rum";

function fireEvent(node, type, detail) {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** Kelvin to approximate RGB (Tanner Helland). */
function kelvinToRgb(k) {
  const t = Math.max(1000, Math.min(40000, k)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v) => Math.round(Math.max(0, Math.min(255, v)));
  return [c(r), c(g), c(b)];
}

/** Colour of a lit entity: real bulb colour when available, warm white otherwise. */
function lightColor(stateObj, fallback) {
  const a = (stateObj && stateObj.attributes) || {};
  if (Array.isArray(a.rgb_color)) return a.rgb_color;
  if (a.color_temp_kelvin) return kelvinToRgb(a.color_temp_kelvin);
  if (Array.isArray(a.hs_color)) return hsToRgb(a.hs_color[0], a.hs_color[1]);
  return fallback || [255, 196, 120];
}

function hsToRgb(h, s) {
  s /= 100;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return 255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [Math.round(f(5)), Math.round(f(3)), Math.round(f(1))];
}

function brightnessOf(stateObj) {
  const b = stateObj && stateObj.attributes && stateObj.attributes.brightness;
  return typeof b === "number" ? Math.max(0.08, b / 255) : 1;
}

function isOn(stateObj) {
  return !!stateObj && ACTIVE_STATES.includes(stateObj.state);
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function normalizeConfig(config) {
  const c = clone(config || {});
  c.size = Array.isArray(c.size) && c.size.length === 2 ? c.size.map(Number) : [850, 1250];
  c.rooms = Array.isArray(c.rooms) ? c.rooms : [];
  c.devices = Array.isArray(c.devices) ? c.devices : [];
  c.openings = (Array.isArray(c.openings) ? c.openings : [])
    .map((o) => (Array.isArray(o) ? { line: o.map(Number) } : o && Array.isArray(o.line) ? { ...o, line: o.line.map(Number) } : null))
    .filter(Boolean);
  c.doors = (Array.isArray(c.doors) ? c.doors : [])
    .filter((d) => d && Array.isArray(d.line))
    .map((d) => ({ ...d, type: d.type === "window" ? "window" : "door", line: d.line.map(Number) }));
  c.rooms.forEach((r, i) => {
    r.id = r.id || slug(r.name || `rum_${i + 1}`);
    r.points = Array.isArray(r.points) ? r.points.map((p) => [Number(p[0]), Number(p[1])]) : [];
    r.motion = r.motion ? [].concat(r.motion) : [];
  });
  return c;
}

/* ------------------------------------------------------------------ */
/* Shared renderer (used by the card and by the editor preview)         */
/* ------------------------------------------------------------------ */

const STYLES = `
  :host { display: block; }
  ha-card { overflow: hidden; background: var(--gfp-card-bg, var(--ha-card-background, var(--card-background-color))); }
  .wrap { position: relative; width: 100%; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .wrap svg.plan { display: block; width: 100%; height: auto; }
  .layer { position: absolute; inset: 0; pointer-events: none; }
  .dev {
    position: absolute; transform: translate(-50%, -50%);
    pointer-events: auto; cursor: pointer; line-height: 0;
    -webkit-tap-highlight-color: transparent;
  }
  .dev ha-icon {
    --mdc-icon-size: var(--gfp-icon-size, 26px);
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.75));
    transition: color .4s ease, opacity .4s ease;
  }
  .dev.chip {
    line-height: normal; font-size: 12px; font-weight: 600; color: #fff;
    background: rgba(30,36,52,0.35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.3); border-radius: 10px; padding: 2px 8px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap;
  }
  .dev.unavailable ha-icon { opacity: .35; }
  .room-hit { cursor: pointer; }
  .pulse { animation: gfp-pulse 2s ease-in-out infinite; }
  .ring { animation: gfp-ring 1.8s ease-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes gfp-pulse { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
  @keyframes gfp-ring { 0% { opacity: .9; transform: scale(.35); } 100% { opacity: 0; transform: scale(1); } }
  .glow { transition: opacity .6s ease; }
  .warn { padding: 12px 16px; color: var(--error-color, #db4437); }
  @media (prefers-reduced-motion: reduce) { .pulse, .ring { animation: none; opacity: .6; } }
`;

class Renderer {
  constructor(config, hass, opts = {}) {
    this.c = config;
    this.hass = hass;
    this.edit = !!opts.edit;
    this.uid = opts.uid || Math.random().toString(36).slice(2, 8);
  }

  mode() {
    const t = this.c.theme || "auto";
    if (t === "day" || t === "night") return t;
    const sun = this.hass && this.hass.states["sun.sun"];
    return sun && sun.state === "below_horizon" ? "night" : "day";
  }

  st(id) {
    return (this.hass && this.hass.states[id]) || undefined;
  }

  roomOf(x, y) {
    return this.c.rooms.find((r) => r.points.length > 2 && pointInPolygon(x, y, r.points));
  }

  /** Every light source that should glow: placed lights (and devices with glow: true). */
  glowSources() {
    const out = [];
    for (const d of this.c.devices) {
      const dom = domainOf(d.entity);
      const wants = d.glow === undefined ? dom === "light" : !!d.glow;
      if (!wants || d.type === "label") continue;
      const s = this.st(d.entity);
      if (!isOn(s)) continue;
      out.push({ x: d.x, y: d.y, rgb: lightColor(s, d.glow_color), level: brightnessOf(s), room: this.roomOf(d.x, d.y) });
    }
    // Room-level lights without a placed icon glow from the room centre.
    for (const r of this.c.rooms) {
      for (const id of [].concat(r.lights || [])) {
        const s = this.st(id);
        if (!isOn(s)) continue;
        const b = bbox(r.points);
        out.push({ x: b.cx, y: b.cy, rgb: lightColor(s), level: brightnessOf(s), room: r });
      }
    }
    return out;
  }

  svg() {
    const c = this.c;
    const [W, H] = c.size;
    const p = PALETTE[this.mode()];
    const u = this.uid;
    const glowStrength = c.glow_strength === undefined ? 1 : Number(c.glow_strength);

    const defs = [];
    const floor = [];
    const glow = [];
    const pulses = [];
    const labels = [];
    const hits = [];

    defs.push(`
      <linearGradient id="f-${u}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p.floorA}"/><stop offset="1" stop-color="${p.floorB}"/>
      </linearGradient>
      <filter id="sh-${u}" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="8" dy="10" stdDeviation="6" flood-color="#000" flood-opacity="${p.shadow}"/>
      </filter>`);

    c.rooms.forEach((r, i) => {
      if (r.points.length < 3) return;
      const pts = r.points.map((q) => q.join(",")).join(" ");
      defs.push(`<clipPath id="cp-${u}-${i}"><polygon points="${pts}"/></clipPath>`);
      floor.push(`<polygon points="${pts}" fill="url(#f-${u})" stroke="${p.wall}" stroke-width="${c.wall_width || 24}" stroke-linejoin="miter"/>`);
    });

    // Openings: erase the wall between two rooms (e.g. an open kitchen).
    const openings = c.openings
      .map((o) => {
        const [x1, y1, x2, y2] = o.line;
        const w = o.width || (c.wall_width || 24) + 2;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.opening}" stroke-width="${w}"/>` +
          (o.dashed === false ? "" : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.dash}" stroke-width="2" stroke-dasharray="8 8"/>`);
      })
      .join("");

    // Glow: one radial gradient per light source, clipped to its room.
    this.glowSources().forEach((g, gi) => {
      const [r, gg, b] = g.rgb;
      const col = `rgb(${r},${gg},${b})`;
      const a = Math.min(0.95, 0.25 + 0.7 * g.level) * glowStrength;
      if (g.room) {
        const ri = c.rooms.indexOf(g.room);
        const bb = bbox(g.room.points);
        const rad = Math.max(bb.w, bb.h) * 0.85;
        defs.push(`<radialGradient id="g-${u}-${gi}" gradientUnits="userSpaceOnUse" cx="${g.x}" cy="${g.y}" r="${rad}">
          <stop offset="0" stop-color="${col}" stop-opacity="${a.toFixed(3)}"/>
          <stop offset="0.55" stop-color="${col}" stop-opacity="${(a * 0.45).toFixed(3)}"/>
          <stop offset="1" stop-color="${col}" stop-opacity="${(a * 0.12).toFixed(3)}"/></radialGradient>`);
        glow.push(`<rect class="glow" clip-path="url(#cp-${u}-${ri})" x="${bb.minX - 20}" y="${bb.minY - 20}" width="${bb.w + 40}" height="${bb.h + 40}" fill="url(#g-${u}-${gi})" style="mix-blend-mode:${this.mode() === "night" ? "screen" : "normal"}"/>`);
      } else {
        const rad = c.outdoor_glow_radius || 70;
        defs.push(`<radialGradient id="g-${u}-${gi}" gradientUnits="userSpaceOnUse" cx="${g.x}" cy="${g.y}" r="${rad}">
          <stop offset="0" stop-color="${col}" stop-opacity="${(a * 0.9).toFixed(3)}"/>
          <stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`);
        glow.push(`<circle class="glow" cx="${g.x}" cy="${g.y}" r="${rad}" fill="url(#g-${u}-${gi})"/>`);
      }
    });

    // Motion: the whole room pulses while any of its motion sensors is on.
    c.rooms.forEach((r, i) => {
      if (r.points.length < 3) return;
      const moving = r.motion.some((id) => isOn(this.st(id)));
      if (moving || (this.edit && this.c.preview_motion)) {
        const pts = r.points.map((q) => q.join(",")).join(" ");
        const col = c.motion_color || "#7fd3ff";
        pulses.push(`<g class="pulse"><polygon points="${pts}" fill="${col}" fill-opacity="0.32" stroke="${col}" stroke-width="6" stroke-opacity="0.9" clip-path="url(#cp-${u}-${i})"/></g>`);
      }
      if (r.name && r.show_name !== false) {
        const bb = bbox(r.points);
        const [lx, ly] = r.label || [bb.cx, bb.cy];
        labels.push(`<text x="${lx}" y="${ly}" font-family="Helvetica,Arial,sans-serif" font-size="${c.label_size || 28}" font-weight="600" fill="${p.text}" text-anchor="middle" dominant-baseline="middle">${esc(r.name)}</text>`);
      }
      if (!this.edit && r.entity) {
        const pts = r.points.map((q) => q.join(",")).join(" ");
        hits.push(`<polygon class="room-hit" data-room="${i}" points="${pts}" fill="transparent"/>`);
      }
    });

    // Robots: ring when busy, red ring on error.
    for (const d of c.devices) {
      const s = this.st(d.entity);
      if (!s) continue;
      const dom = domainOf(d.entity);
      if (!["vacuum", "lawn_mower"].includes(dom) && !d.ring_states) continue;
      const busy = (d.ring_states || BUSY_STATES).includes(s.state);
      const err = ERROR_STATES.includes(s.state);
      if (!busy && !err) continue;
      const col = err ? c.error_color || "#ff3b30" : c.ring_color || "#34c759";
      pulses.push(`<circle class="pulse" cx="${d.x}" cy="${d.y}" r="34" fill="${col}" fill-opacity="0.35"/>`);
      pulses.push(`<circle class="ring" cx="${d.x}" cy="${d.y}" r="55" fill="none" stroke="${col}" stroke-width="5"/>`);
    }

    const [doorBack, doorFront] = this.doorsSvg(p);
    if (!this.edit) {
      c.doors.forEach((d, i) => {
        if (!d.sensor) return;
        const [x1, y1, x2, y2] = d.line;
        hits.push(`<circle class="room-hit" data-door="${i}" cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="${Math.max(24, Math.hypot(x2 - x1, y2 - y1) / 2)}" fill="transparent"/>`);
      });
    }

    return `<svg class="plan" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>${defs.join("")}</defs>
      <g filter="url(#sh-${u})">${floor.join("")}</g>
      ${openings}
      ${doorBack}
      <g>${glow.join("")}</g>
      ${doorFront}
      <g>${pulses.join("")}</g>
      <g pointer-events="none">${labels.join("")}</g>
      <g>${hits.join("")}</g>
    </svg>`;
  }

  /**
   * Doors and windows in architectural style. The first point of `line` is the
   * hinge; `swing` (1 or -1) picks the side of the wall the leaf opens to.
   * With a sensor the leaf is drawn open while the sensor is on, otherwise it
   * is drawn closed with a dashed arc that shows how it opens.
   */
  doorsSvg(p) {
    const back = [];
    const front = [];
    const night = this.mode() === "night";
    const wallW = this.c.wall_width || 24;
    const leafCol = night ? "#d5dbe8" : "#4a5366";
    const arcCol = night ? "#8a93a8" : "#9aa3b5";
    const openCol = this.c.door_open_color || "#ff9f0a";
    const glass = night ? "#7fb8e6" : "#5aa9e6";
    this.c.doors.forEach((d) => {
      const [x1, y1, x2, y2] = d.line;
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (L < 2) return;
      const ux = (x2 - x1) / L;
      const uy = (y2 - y1) / L;
      const side = d.swing === -1 ? -1 : 1;
      const nx = -uy * side;
      const ny = ux * side;
      const s = d.sensor ? this.st(d.sensor) : null;
      const open = !!s && isOn(s);
      const isWin = d.type === "window";
      // Clear the wall where the door or window sits.
      back.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.opening}" stroke-width="${wallW + 2}"/>`);
      // Wall stubs (jambs) at both ends.
      [[x1, y1], [x2, y2]].forEach(([jx, jy]) =>
        back.push(`<line x1="${jx - (nx * wallW) / 2}" y1="${jy - (ny * wallW) / 2}" x2="${jx + (nx * wallW) / 2}" y2="${jy + (ny * wallW) / 2}" stroke="${p.wall === "#ffffff" ? "#c9d0de" : p.wall}" stroke-width="3"/>`)
      );
      if (isWin) {
        // Glass: two thin parallel lines in the wall.
        const o = wallW / 5;
        front.push(`<line x1="${x1 + nx * o}" y1="${y1 + ny * o}" x2="${x2 + nx * o}" y2="${y2 + ny * o}" stroke="${glass}" stroke-width="2.5"/>`);
        front.push(`<line x1="${x1 - nx * o}" y1="${y1 - ny * o}" x2="${x2 - nx * o}" y2="${y2 - ny * o}" stroke="${glass}" stroke-width="2.5"/>`);
        if (d.swing === 0) return; // fixed window
      }
      // One or two leaves. Each leaf: hinge h, closed tip c, open tip o.
      const leaves = d.leaves === 2 ? 2 : 1;
      const parts = [];
      if (leaves === 1) parts.push({ hx: x1, hy: y1, len: L, dir: 1 });
      else {
        parts.push({ hx: x1, hy: y1, len: L / 2, dir: 1 });
        parts.push({ hx: x2, hy: y2, len: L / 2, dir: -1 });
      }
      const col = open ? openCol : leafCol;
      const lw = isWin ? 3 : 4;
      parts.forEach(({ hx, hy, len, dir }) => {
        const cx = hx + ux * len * dir;
        const cy = hy + uy * len * dir;
        const ox = hx + nx * len;
        const oy = hy + ny * len;
        // Sweep direction: from closed tip to open tip around the hinge.
        const cross = (cx - hx) * (oy - hy) - (cy - hy) * (ox - hx);
        const sweep = cross > 0 ? 1 : 0;
        const arc = `M ${cx} ${cy} A ${len} ${len} 0 0 ${sweep} ${ox} ${oy}`;
        if (open) {
          front.push(`<path d="M ${hx} ${hy} L ${cx} ${cy} A ${len} ${len} 0 0 ${sweep} ${ox} ${oy} Z" fill="${openCol}" fill-opacity="0.14"/>`);
          front.push(`<path d="${arc}" fill="none" stroke="${openCol}" stroke-width="2"/>`);
          front.push(`<line class="leaf-open" x1="${hx}" y1="${hy}" x2="${ox}" y2="${oy}" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"/>`);
        } else {
          front.push(`<path d="${arc}" fill="none" stroke="${arcCol}" stroke-width="1.6" stroke-dasharray="5 5"/>`);
          if (!isWin) front.push(`<line x1="${hx}" y1="${hy}" x2="${cx}" y2="${cy}" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"/>`);
        }
        front.push(`<circle cx="${hx}" cy="${hy}" r="${isWin ? 3 : 4}" fill="${col}"/>`);
      });
    });
    return [back.join(""), front.join("")];
  }

  iconColor(d, s) {
    if (!s || s.state === "unavailable") return "var(--disabled-text-color, #9aa3b5)";
    if (d.color) return d.color;
    const dom = domainOf(d.entity);
    if (ERROR_STATES.includes(s.state)) return "var(--error-color, #ff5252)";
    if (!isOn(s)) return this.mode() === "night" ? "#c3cad8" : "var(--state-icon-color, #44739e)";
    if (dom === "light") {
      const [r, g, b] = lightColor(s);
      return `rgb(${r},${g},${b})`;
    }
    if (BUSY_STATES.includes(s.state)) return this.c.ring_color || "#34c759";
    return "var(--state-active-color, #ffc107)";
  }

  devicesHtml() {
    const [W, H] = this.c.size;
    return this.c.devices
      .map((d, i) => {
        const s = this.st(d.entity);
        const left = ((d.x / W) * 100).toFixed(3);
        const top = ((d.y / H) * 100).toFixed(3);
        const una = !s || s.state === "unavailable" ? " unavailable" : "";
        if (d.type === "label") {
          let txt = "–";
          if (s) {
            const unit = s.attributes.unit_of_measurement || "";
            txt = d.attribute ? s.attributes[d.attribute] : s.state;
            if (!isNaN(parseFloat(txt)) && d.decimals !== undefined) txt = Number(txt).toFixed(d.decimals);
            txt = `${d.prefix || ""}${txt}${d.attribute ? "" : unit ? " " + unit : ""}${d.suffix || ""}`;
          }
          return `<div class="dev chip${una}" data-dev="${i}" style="left:${left}%;top:${top}%" title="${esc(d.name || (s && s.attributes.friendly_name) || d.entity)}">${esc(txt)}</div>`;
        }
        const icon = d.icon || (s && s.attributes.icon) || DEFAULT_ICONS[domainOf(d.entity)] || "mdi:help-circle-outline";
        const size = d.size ? `--gfp-icon-size:${d.size}px;` : "";
        return `<div class="dev${una}" data-dev="${i}" style="left:${left}%;top:${top}%;${size}" title="${esc(d.name || (s && s.attributes.friendly_name) || d.entity)}"><ha-icon icon="${esc(icon)}" style="color:${this.iconColor(d, s)}"></ha-icon></div>`;
      })
      .join("");
  }

  /** A compact signature of the states the card depends on, to skip needless re-renders. */
  signature() {
    const ids = new Set(["sun.sun"]);
    this.c.devices.forEach((d) => ids.add(d.entity));
    this.c.rooms.forEach((r) => {
      r.motion.forEach((m) => ids.add(m));
      [].concat(r.lights || []).forEach((l) => ids.add(l));
      if (r.entity) ids.add(r.entity);
    });
    this.c.doors.forEach((d) => d.sensor && ids.add(d.sensor));
    let sig = "";
    for (const id of ids) {
      const s = this.st(id);
      if (!s) {
        sig += `${id}:-|`;
        continue;
      }
      const a = s.attributes || {};
      sig += `${id}:${s.state}:${a.brightness}:${a.rgb_color}:${a.color_temp_kelvin}:${a.unit_of_measurement}|`;
    }
    return sig;
  }
}

/* ------------------------------------------------------------------ */
/* Action handling                                                      */
/* ------------------------------------------------------------------ */

function defaultTap(entity) {
  const dom = domainOf(entity);
  if (["light", "switch", "fan", "input_boolean", "lock", "cover"].includes(dom)) return { action: "toggle" };
  if (["scene", "script"].includes(dom)) return { action: "perform-action", perform_action: `${dom}.turn_on`, target: { entity_id: entity } };
  return { action: "more-info" };
}

function bindPress(el, onTap, onHold, onDouble) {
  let timer = null;
  let held = false;
  let lastTap = 0;
  let single = null;
  let startX = 0;
  let startY = 0;
  el.addEventListener("pointerdown", (ev) => {
    held = false;
    startX = ev.clientX;
    startY = ev.clientY;
    timer = setTimeout(() => {
      held = true;
      onHold && onHold();
    }, 500);
  });
  const cancel = () => clearTimeout(timer);
  el.addEventListener("pointermove", (ev) => {
    if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) cancel();
  });
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerup", () => {
    cancel();
    if (held) return;
    const now = Date.now();
    if (onDouble && now - lastTap < 250) {
      clearTimeout(single);
      lastTap = 0;
      onDouble();
      return;
    }
    lastTap = now;
    if (onDouble) single = setTimeout(onTap, 250);
    else onTap();
  });
  el.addEventListener("contextmenu", (ev) => ev.preventDefault());
}

/* ------------------------------------------------------------------ */
/* The card                                                             */
/* ------------------------------------------------------------------ */

class GlowFloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
    this._uid = Math.random().toString(36).slice(2, 8);
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig() {
    return {
      size: [600, 400],
      rooms: [
        { name: "Stue", points: [[40, 40], [340, 40], [340, 360], [40, 360]], motion: [] },
        { name: "Køkken", points: [[360, 40], [560, 40], [560, 220], [360, 220]], motion: [] },
      ],
      devices: [],
      openings: [],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Ugyldig konfiguration");
    this._raw = config;
    this._layout = null;
    if (config.layout_from) {
      this._config = normalizeConfig({ ...config, rooms: [], devices: [] });
      this._loadShared();
    } else {
      this._config = normalizeConfig(config);
    }
    this._sig = "";
    this._render(true);
  }

  async _loadShared() {
    if (!this._hass) return;
    const src = this._raw.layout_from;
    const urlPath = typeof src === "string" ? src : src.dashboard;
    try {
      const lv = await this._hass.callWS({ type: "lovelace/config", url_path: urlPath === "default" ? null : urlPath });
      const found = findCard(lv, (c) => c.type === `custom:${CARD_TAG}` && !c.layout_from);
      if (!found) throw new Error(`Fandt ingen ${CARD_TAG} i ${urlPath}`);
      const { layout_from, type, ...local } = this._raw;
      this._config = normalizeConfig({ ...found, ...local });
      this._layoutError = null;
    } catch (e) {
      this._layoutError = e.message || String(e);
    }
    this._loading = false;
    this._sig = "";
    this._render(true);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._raw && this._raw.layout_from && !this._loading) {
      this._loading = true;
      this._loadShared();
    }
    this._render(false);
  }

  getCardSize() {
    const [W, H] = (this._config && this._config.size) || [850, 1250];
    return Math.max(3, Math.round((H / W) * 8));
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6 };
  }

  _render(force) {
    if (!this._config || !this._hass) return;
    const r = new Renderer(this._config, this._hass, { uid: this._uid });
    const sig = r.signature();
    if (!force && sig === this._sig) return;
    this._sig = sig;
    const [W, H] = this._config.size;
    const err = this._layoutError ? `<div class="warn">${esc(this._layoutError)}</div>` : "";
    const title = this._config.title ? `<h1 class="card-header">${esc(this._config.title)}</h1>` : "";
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <ha-card>${title}${err}
        <div class="wrap" style="aspect-ratio:${W}/${H}">
          ${r.svg()}
          <div class="layer">${r.devicesHtml()}</div>
        </div>
      </ha-card>`;
    this._bind();
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll(".dev").forEach((el) => {
      const d = this._config.devices[Number(el.dataset.dev)];
      if (!d) return;
      const cfg = {
        entity: d.entity,
        tap_action: d.tap_action || (d.type === "label" ? { action: "more-info" } : defaultTap(d.entity)),
        hold_action: d.hold_action || { action: "more-info" },
        double_tap_action: d.double_tap_action,
      };
      bindPress(
        el,
        () => this._act(cfg, "tap"),
        () => this._act(cfg, "hold"),
        d.double_tap_action ? () => this._act(cfg, "double_tap") : null
      );
    });
    root.querySelectorAll(".room-hit[data-door]").forEach((el) => {
      const d = this._config.doors[Number(el.dataset.door)];
      if (!d || !d.sensor) return;
      const cfg = { entity: d.sensor, tap_action: d.tap_action || { action: "more-info" } };
      bindPress(el, () => this._act(cfg, "tap"));
    });
    root.querySelectorAll(".room-hit[data-room]").forEach((el) => {
      const room = this._config.rooms[Number(el.dataset.room)];
      if (!room) return;
      const cfg = {
        entity: room.entity,
        tap_action: room.tap_action || defaultTap(room.entity),
        hold_action: room.hold_action || { action: "more-info" },
      };
      bindPress(el, () => this._act(cfg, "tap"), () => this._act(cfg, "hold"));
    });
  }

  _act(cfg, action) {
    const a = cfg[`${action}_action`];
    if (!a || a.action === "none") return;
    // Toggle locally for snappy feedback is left to HA; use the standard action pipeline.
    fireEvent(this, "hass-action", { config: cfg, action });
  }
}

function findCard(node, pred) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findCard(n, pred);
      if (f) return f;
    }
    return null;
  }
  if (node.type && pred(node)) return node;
  for (const k of ["views", "sections", "cards", "card", "elements"]) {
    if (node[k]) {
      const f = findCard(node[k], pred);
      if (f) return f;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Visual editor with drag and drop                                     */
/* ------------------------------------------------------------------ */

const EDITOR_STYLES = `
  ${STYLES}
  .ed { display: flex; flex-direction: column; gap: 12px; }
  .bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .seg { display: inline-flex; border: 1px solid var(--divider-color, #ccc); border-radius: 10px; overflow: hidden; }
  .seg button { border: 0; border-radius: 0; border-right: 1px solid var(--divider-color, #ccc); }
  .seg button:last-child { border-right: 0; }
  .bar button, .panel button {
    font: inherit; font-size: 13px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff);
    color: var(--primary-text-color); border-radius: 8px; padding: 6px 10px; cursor: pointer;
  }
  .seg button { border: 0; border-radius: 0; border-right: 1px solid var(--divider-color, #ccc); }
  .bar button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
  .bar button.danger, .panel button.danger { color: var(--error-color, #db4437); }
  .hint { font-size: 12px; color: var(--secondary-text-color); }
  .stage { position: relative; border-radius: 12px; overflow: hidden; border: 1px dashed var(--divider-color, #ccc); touch-action: none; }
  .stage .dev { cursor: grab; outline: none; }
  .stage .dev.sel { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 3px; border-radius: 50%; }
  .stage .dev.chip.sel { border-radius: 10px; }
  .stage.dragging, .stage.dragging * { cursor: grabbing !important; }
  .handle { fill: #fff; stroke: var(--primary-color, #03a9f4); stroke-width: 3; cursor: grab; }
  .handle.label { fill: var(--primary-color, #03a9f4); }
  .handle.mid { fill: var(--primary-color, #03a9f4); stroke: #fff; }
  .handle.hinge { fill: #ff9f0a; stroke: #fff; }
  .room-outline { fill: none; stroke: var(--primary-color, #03a9f4); stroke-width: 3; stroke-dasharray: 10 6; pointer-events: none; }
  .room-pick { fill: transparent; cursor: pointer; }
  .room-pick.sel { fill: rgba(3,169,244,0.06); cursor: move; }
  .op-hit { stroke: transparent; stroke-width: 34; cursor: pointer; }
  .op-line { stroke: var(--primary-color, #03a9f4); stroke-width: 5; stroke-linecap: round; opacity: .45; pointer-events: none; }
  .op-line.sel { opacity: 1; stroke-width: 6; }
  .guide { stroke: #ff4081; stroke-width: 2; stroke-dasharray: 6 5; pointer-events: none; }
  .panel { display: grid; grid-template-columns: 110px 1fr; gap: 8px 10px; align-items: center;
    padding: 12px; border-radius: 12px; background: var(--secondary-background-color, #f5f5f5); }
  .panel h3 { grid-column: 1 / -1; margin: 0; font-size: 15px; }
  .panel label { font-size: 13px; color: var(--secondary-text-color); }
  .panel input, .panel select {
    font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color, #fff); color: var(--primary-text-color); width: 100%; box-sizing: border-box;
  }
  .panel input[type=checkbox] { width: auto; }
  .panel .row { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
`;

const HINTS = {
  devices: "Træk ikonerne på plads. Klik på et ikon for at ændre det. En lampe lyser det rum op, den står i.",
  rooms: "Klik på et rum og træk det for at flytte det (ikonerne i rummet følger med). Træk i hjørnerne – de snapper vandret og lodret. Den blå prik flytter navnet. Hold Alt for at flytte frit.",
  openings: "En åbning fjerner væggen mellem to rum. Træk i enderne – de snapper til væggene og til 90°. Den udfyldte prik i midten flytter hele åbningen. Hold Alt for at flytte frit.",
  doors: "Tegn døre og vinduer i væggene. Træk i enderne (de snapper til væggene) – den første ende er hængslet. Vælg en sensor, så vises døren åben, når sensoren melder åben.",
};

class GlowFloorplanCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._mode = "devices"; // devices | rooms | openings
    this._sel = null; // {kind:'dev'|'room'|'op', i}
    this._uid = Math.random().toString(36).slice(2, 8);
    this._raf = 0;
  }

  setConfig(config) {
    this._raw = config;
    if (this._dragging) return;
    this._config = normalizeConfig(config);
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
  }

  _emit() {
    const out = clone(this._config);
    out.rooms.forEach((r) => {
      if (!r.motion.length) delete r.motion;
      if (r.id === slug(r.name)) delete r.id;
    });
    if (!out.openings.length) delete out.openings;
    if (!out.doors.length) delete out.doors;
    out.type = (this._raw && this._raw.type) || `custom:${CARD_TAG}`;
    fireEvent(this, "config-changed", { config: out });
  }

  _entityOptions(filter) {
    if (!this._hass) return "";
    return Object.keys(this._hass.states)
      .filter((id) => !filter || filter(id))
      .sort()
      .map((id) => `<option value="${id}">${esc(this._hass.states[id].attributes.friendly_name || "")}</option>`)
      .join("");
  }

  /* ---------- rendering ---------- */

  _render() {
    if (!this._config) return;
    if (this._config.layout_from) {
      const src = typeof this._config.layout_from === "string" ? this._config.layout_from : this._config.layout_from.dashboard;
      this.shadowRoot.innerHTML = `<style>${EDITOR_STYLES}</style><div class="ed"><div class="hint">
        Dette kort henter sin plantegning fra <b>${esc(src)}</b>. Rediger plantegningen dér – ændringer vises automatisk her.
        Brug kodeeditoren for at fjerne <code>layout_from</code>.</div></div>`;
      return;
    }
    const [W, H] = this._config.size;
    const m = this._mode;
    const add = {
      devices: `<button data-act="add-dev">+ Enhed</button><button data-act="add-label">+ Måling</button>`,
      rooms: `<button data-act="add-room">+ Rum</button>`,
      openings: `<button data-act="add-op">+ Åbning</button>`,
      doors: `<button data-act="add-door">+ Dør</button><button data-act="add-window">+ Vindue</button>`,
    }[m];
    this.shadowRoot.innerHTML = `<style>${EDITOR_STYLES}</style>
      <div class="ed">
        <div class="bar">
          <div class="seg">
            <button data-mode="devices" class="${m === "devices" ? "on" : ""}">Enheder</button>
            <button data-mode="rooms" class="${m === "rooms" ? "on" : ""}">Rum</button>
            <button data-mode="openings" class="${m === "openings" ? "on" : ""}">Åbninger</button>
            <button data-mode="doors" class="${m === "doors" ? "on" : ""}">Døre &amp; vinduer</button>
          </div>
          <span style="flex:1"></span>${add}
        </div>
        <div class="hint">${HINTS[m]}</div>
        <div class="stage"></div>
        <div class="panelwrap">${this._panel()}</div>
        <details><summary class="hint">Kortindstillinger</summary>
          <div class="panel" style="margin-top:8px">
            <label>Titel</label><input data-g="title" value="${esc(this._config.title || "")}">
            <label>Størrelse</label><div class="grid2"><input data-g="w" type="number" value="${W}"><input data-g="h" type="number" value="${H}"></div>
            <label>Tema</label><select data-g="theme">
              ${["auto", "day", "night"].map((t) => `<option value="${t}" ${(this._config.theme || "auto") === t ? "selected" : ""}>${{ auto: "Auto (sol)", day: "Dag", night: "Nat" }[t]}</option>`).join("")}
            </select>
            <label>Glødstyrke</label><input data-g="glow_strength" type="range" min="0" max="1.5" step="0.05" value="${this._config.glow_strength ?? 1}">
            <label>Test bevægelse</label><input data-g="preview_motion" type="checkbox" ${this._config.preview_motion ? "checked" : ""}>
          </div>
        </details>
        <datalist id="ents">${this._entityOptions()}</datalist>
        <datalist id="motion-ents">${this._entityOptions((id) => id.startsWith("binary_sensor."))}</datalist>
      </div>`;
    const root = this.shadowRoot;
    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        this._mode = b.dataset.mode;
        this._sel = null;
        this._render();
      })
    );
    root.querySelectorAll(".bar [data-act]").forEach((b) => b.addEventListener("click", () => this._action(b.dataset.act)));
    root.querySelectorAll("[data-g]").forEach((inp) => inp.addEventListener("change", () => this._globalField(inp.dataset.g, inp)));
    this._wirePanel();
    this._renderStage();
  }

  _renderPanel() {
    const wrap = this.shadowRoot.querySelector(".panelwrap");
    if (!wrap) return;
    wrap.innerHTML = this._panel();
    this._wirePanel();
  }

  _wirePanel() {
    const root = this.shadowRoot.querySelector(".panelwrap");
    if (!root) return;
    root.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => this._action(b.dataset.act)));
    root.querySelectorAll("[data-d]").forEach((inp) => inp.addEventListener("change", () => this._devField(inp.dataset.d, inp)));
    root.querySelectorAll("[data-r]").forEach((inp) => inp.addEventListener("change", () => this._roomField(inp.dataset.r, inp)));
    root.querySelectorAll("[data-o]").forEach((inp) => inp.addEventListener("change", () => this._opField(inp.dataset.o, inp)));
    root.querySelectorAll("[data-w]").forEach((inp) => inp.addEventListener("change", () => this._doorField(inp.dataset.w, inp)));
  }

  _overlay() {
    const c = this._config;
    const s = this._sel;
    let out = "";
    if (this._mode === "rooms") {
      // Unselected rooms first, the selected one last so it sits on top.
      const order = c.rooms.map((_, i) => i).filter((i) => !(s && s.kind === "room" && s.i === i));
      if (s && s.kind === "room" && c.rooms[s.i]) order.push(s.i);
      for (const i of order) {
        const room = c.rooms[i];
        if (!room || room.points.length < 3) continue;
        const pts = room.points.map((p) => p.join(",")).join(" ");
        const sel = s && s.kind === "room" && s.i === i;
        out += `<polygon class="room-pick${sel ? " sel" : ""}" data-pick="${i}" points="${pts}"/>`;
        if (sel) {
          out += `<polygon class="room-outline" points="${pts}"/>`;
          out += room.points.map((p, vi) => `<circle class="handle" data-room="${i}" data-v="${vi}" cx="${p[0]}" cy="${p[1]}" r="13"/>`).join("");
          const bb = bbox(room.points);
          const [lx, ly] = room.label || [bb.cx, bb.cy];
          out += `<circle class="handle label" data-room="${i}" data-v="label" cx="${lx}" cy="${ly + 24}" r="9"/>`;
        }
      }
    }
    if (this._mode === "openings" || this._mode === "doors") {
      const coll = this._mode;
      const kind = coll === "doors" ? "door" : "op";
      c[coll].forEach((o, i) => {
        const [x1, y1, x2, y2] = o.line;
        const sel = s && s.kind === kind && s.i === i;
        out += `<line class="op-line${sel ? " sel" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
        out += `<line class="op-hit" data-coll="${coll}" data-op="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
        if (sel) {
          out += `<circle class="handle${coll === "doors" ? " hinge" : ""}" data-coll="${coll}" data-op="${i}" data-end="0" cx="${x1}" cy="${y1}" r="13"/>`;
          out += `<circle class="handle" data-coll="${coll}" data-op="${i}" data-end="1" cx="${x2}" cy="${y2}" r="13"/>`;
          out += `<circle class="handle mid" data-coll="${coll}" data-op="${i}" data-end="mid" cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="11"/>`;
        }
      });
    }
    const g = (this._guides || [])
      .map(([x1, y1, x2, y2]) => `<line class="guide" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
      .join("");
    return `<g class="ovl">${out}</g><g>${g}</g>`;
  }

  _renderStage() {
    const stage = this.shadowRoot.querySelector(".stage");
    if (!stage) return;
    const hass = this._hass || { states: {} };
    const r = new Renderer(this._config, hass, { edit: true, uid: this._uid });
    const [W, H] = this._config.size;
    const svg = r.svg().replace(/<\/svg>\s*$/, `${this._overlay()}</svg>`);
    stage.innerHTML = `<div class="wrap" style="aspect-ratio:${W}/${H}">${svg}<div class="layer">${r.devicesHtml()}</div></div>`;
    stage.classList.toggle("dragging", !!this._dragging);
    this._wireStage(stage);
  }

  _scheduleStage() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._renderStage();
    });
  }

  /* ---------- geometry helpers ---------- */

  _toUnits(ev, snapGrid = true) {
    const svg = this.shadowRoot.querySelector(".stage svg");
    const rect = svg.getBoundingClientRect();
    const [W, H] = this._config.size;
    let x = ((ev.clientX - rect.left) / rect.width) * W;
    let y = ((ev.clientY - rect.top) / rect.height) * H;
    if (snapGrid) {
      const g = this._config.snap || 5;
      x = Math.round(x / g) * g;
      y = Math.round(y / g) * g;
    }
    return [x, y];
  }

  /** Snap tolerance in canvas units, equal to ~10 screen pixels. */
  _tol() {
    const svg = this.shadowRoot.querySelector(".stage svg");
    const w = svg ? svg.getBoundingClientRect().width || 400 : 400;
    return (10 * this._config.size[0]) / w;
  }

  /** All corner points except the ones excluded. */
  _corners(excludeRoom, excludeVertex) {
    const pts = [];
    this._config.rooms.forEach((r, ri) =>
      r.points.forEach((p, vi) => {
        if (ri === excludeRoom && (excludeVertex === undefined || excludeVertex === vi)) return;
        pts.push({ p, near: false });
      })
    );
    return pts;
  }

  /**
   * Align x and y with reference points. Preferred refs (the neighbours of a
   * corner) win over other refs at the same distance. Returns guides to draw.
   */
  _align(x, y, preferred, others) {
    const tol = this._tol();
    let bx = null;
    let by = null;
    const tryX = (p, bonus) => {
      const d = Math.abs(p[0] - x) - bonus;
      if (Math.abs(p[0] - x) <= tol && (!bx || d < bx.d)) bx = { v: p[0], d, p };
    };
    const tryY = (p, bonus) => {
      const d = Math.abs(p[1] - y) - bonus;
      if (Math.abs(p[1] - y) <= tol && (!by || d < by.d)) by = { v: p[1], d, p };
    };
    preferred.forEach((p) => {
      tryX(p, tol / 2);
      tryY(p, tol / 2);
    });
    others.forEach((p) => {
      tryX(p, 0);
      tryY(p, 0);
    });
    const guides = [];
    if (bx) x = bx.v;
    if (by) y = by.v;
    if (bx) guides.push([x, Math.min(y, bx.p[1]) - 30, x, Math.max(y, bx.p[1]) + 30]);
    if (by) guides.push([Math.min(x, by.p[0]) - 30, y, Math.max(x, by.p[0]) + 30, y]);
    return { x, y, guides };
  }

  /** Pull a point onto the nearest wall (room edge) within tolerance. */
  _onWall(x, y) {
    const tol = this._tol();
    let best = null;
    for (const r of this._config.rooms) {
      const pts = r.points;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        const px = ax + t * dx;
        const py = ay + t * dy;
        const d = Math.hypot(px - x, py - y);
        if (d <= tol && (!best || d < best.d)) best = { x: px, y: py, d, horiz: Math.abs(dy) < Math.abs(dx) };
      }
    }
    return best;
  }

  /* ---------- wiring the stage ---------- */

  _wireStage(stage) {
    const c = this._config;
    const s = this._sel;

    stage.querySelectorAll(".dev").forEach((el) => {
      const i = Number(el.dataset.dev);
      if (s && s.kind === "dev" && s.i === i) el.classList.add("sel");
      if (this._mode !== "devices") {
        el.style.pointerEvents = "none";
        return;
      }
      el.addEventListener("pointerdown", (ev) => {
        const d = c.devices[i];
        const [sx, sy] = [d.x, d.y];
        const [px, py] = this._toUnits(ev, false);
        this._startDrag(ev, {
          onMove: (e) => {
            const [x, y] = this._toUnits(e, false);
            const g = c.snap || 5;
            d.x = Math.round((sx + x - px) / g) * g;
            d.y = Math.round((sy + y - py) / g) * g;
          },
          onEnd: () => (this._sel = { kind: "dev", i }),
        });
      });
    });

    // Rooms: select, drag whole room, drag corners and label.
    stage.querySelectorAll(".room-pick").forEach((el) => {
      const i = Number(el.dataset.pick);
      el.addEventListener("pointerdown", (ev) => {
        const room = c.rooms[i];
        const start = room.points.map((p) => [...p]);
        const label = room.label ? [...room.label] : null;
        // Devices standing in the room move with it.
        const riders = c.devices.filter((d) => pointInPolygon(d.x, d.y, start)).map((d) => ({ d, x: d.x, y: d.y }));
        const [px, py] = this._toUnits(ev, false);
        const others = this._corners(i).map((o) => o.p);
        this._startDrag(ev, {
          onMove: (e) => {
            const [x, y] = this._toUnits(e, false);
            let dx = x - px;
            let dy = y - py;
            const g = c.snap || 5;
            dx = Math.round(dx / g) * g;
            dy = Math.round(dy / g) * g;
            this._guides = [];
            if (!e.altKey) {
              // Snap so that any corner of this room lines up with another room's corner.
              const tol = this._tol();
              let bx = null;
              let by = null;
              for (const p of start) {
                for (const o of others) {
                  const ddx = o[0] - (p[0] + dx);
                  const ddy = o[1] - (p[1] + dy);
                  if (Math.abs(ddx) <= tol && (!bx || Math.abs(ddx) < Math.abs(bx.v))) bx = { v: ddx, o, p };
                  if (Math.abs(ddy) <= tol && (!by || Math.abs(ddy) < Math.abs(by.v))) by = { v: ddy, o, p };
                }
              }
              if (bx) dx += bx.v;
              if (by) dy += by.v;
              if (bx) this._guides.push([bx.o[0], Math.min(bx.o[1], bx.p[1] + dy) - 30, bx.o[0], Math.max(bx.o[1], bx.p[1] + dy) + 30]);
              if (by) this._guides.push([Math.min(by.o[0], by.p[0] + dx) - 30, by.o[1], Math.max(by.o[0], by.p[0] + dx) + 30, by.o[1]]);
            }
            room.points = start.map((p) => [p[0] + dx, p[1] + dy]);
            if (label) room.label = [label[0] + dx, label[1] + dy];
            riders.forEach((r) => {
              r.d.x = r.x + dx;
              r.d.y = r.y + dy;
            });
          },
          onEnd: () => (this._sel = { kind: "room", i }),
        });
      });
    });

    stage.querySelectorAll(".handle[data-room]").forEach((el) => {
      const ri = Number(el.dataset.room);
      const v = el.dataset.v;
      el.addEventListener("pointerdown", (ev) => {
        const room = c.rooms[ri];
        this._startDrag(ev, {
          onMove: (e) => {
            let [x, y] = this._toUnits(e);
            this._guides = [];
            if (v === "label") {
              room.label = [x, y - 24];
              return;
            }
            const vi = Number(v);
            const n = room.points.length;
            if (!e.altKey) {
              const neighbours = [room.points[(vi - 1 + n) % n], room.points[(vi + 1) % n]];
              const others = this._corners(ri, vi)
                .map((o) => o.p)
                .filter((p) => !neighbours.includes(p));
              const a = this._align(x, y, neighbours, others);
              x = a.x;
              y = a.y;
              this._guides = a.guides;
            }
            room.points[vi] = [x, y];
            this._lastVertex = vi;
          },
          onEnd: () => {},
        });
      });
    });

    // Openings: select, drag ends (snap to walls and 90°) or the middle.
    stage.querySelectorAll(".op-hit").forEach((el) => {
      const i = Number(el.dataset.op);
      el.addEventListener("pointerdown", (ev) => this._dragOpening(ev, i, "mid", el.dataset.coll));
    });
    stage.querySelectorAll(".handle[data-op]").forEach((el) => {
      el.addEventListener("pointerdown", (ev) => this._dragOpening(ev, Number(el.dataset.op), el.dataset.end, el.dataset.coll));
    });
  }

  _dragOpening(ev, i, end, coll = "openings") {
    const c = this._config;
    const o = c[coll][i];
    const start = [...o.line];
    const [px, py] = this._toUnits(ev, false);
    const corners = this._corners(-1).map((q) => q.p);
    this._startDrag(ev, {
      onMove: (e) => {
        this._guides = [];
        if (end === "mid") {
          let [x, y] = this._toUnits(e, false);
          const g = c.snap || 5;
          let dx = Math.round((x - px) / g) * g;
          let dy = Math.round((y - py) / g) * g;
          let a = [start[0] + dx, start[1] + dy];
          let b = [start[2] + dx, start[3] + dy];
          if (!e.altKey) {
            // Keep it on a wall: snap the midpoint onto the nearest wall.
            const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const w = this._onWall(mid[0], mid[1]);
            if (w) {
              const ox = w.x - mid[0];
              const oy = w.y - mid[1];
              a = [a[0] + (w.horiz ? 0 : ox), a[1] + (w.horiz ? oy : 0)];
              b = [b[0] + (w.horiz ? 0 : ox), b[1] + (w.horiz ? oy : 0)];
            }
          }
          o.line = [a[0], a[1], b[0], b[1]].map((n) => Math.round(n));
          return;
        }
        let [x, y] = this._toUnits(e);
        const other = end === "0" ? [o.line[2], o.line[3]] : [o.line[0], o.line[1]];
        if (!e.altKey) {
          const w = this._onWall(x, y);
          if (w) {
            x = w.x;
            y = w.y;
          }
          const al = this._align(x, y, [other], corners);
          // On a wall only the free axis is aligned; off a wall both are.
          if (w && w.horiz) x = al.x;
          else if (w) y = al.y;
          else {
            x = al.x;
            y = al.y;
          }
          this._guides = al.guides;
        }
        x = Math.round(x);
        y = Math.round(y);
        if (end === "0") o.line = [x, y, o.line[2], o.line[3]];
        else o.line = [o.line[0], o.line[1], x, y];
      },
      onEnd: () => (this._sel = { kind: coll === "doors" ? "door" : "op", i }),
    });
  }

  /** Window-level drag so the stage can be re-rendered live while dragging. */
  _startDrag(ev, { onMove, onEnd }) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const sx = ev.clientX;
    const sy = ev.clientY;
    let moved = false;
    const move = (e) => {
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 4) return;
      if (!moved) {
        moved = true;
        this._dragging = true;
      }
      onMove(e);
      this._scheduleStage();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this._dragging = false;
      this._guides = [];
      const prev = JSON.stringify(this._sel);
      onEnd();
      if (moved) this._emit();
      this._renderStage();
      if (moved || JSON.stringify(this._sel) !== prev) this._renderPanel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /* ---------- side panel ---------- */

  _panel() {
    const s = this._sel;
    if (!s) return "";
    if (s.kind === "dev") {
      const d = this._config.devices[s.i];
      if (!d) return "";
      const tap = (d.tap_action && d.tap_action.action) || "auto";
      return `<div class="panel">
        <h3>${d.type === "label" ? "Måling" : "Enhed"}</h3>
        <label>Entitet</label><input data-d="entity" list="ents" value="${esc(d.entity || "")}">
        ${d.type === "label" ? "" : `<label>Ikon</label><input data-d="icon" placeholder="mdi:lamp" value="${esc(d.icon || "")}">`}
        <label>Tryk</label><select data-d="tap">
          ${[["auto", "Automatisk"], ["toggle", "Tænd/sluk"], ["more-info", "Vis detaljer"], ["navigate", "Gå til side"], ["none", "Ingen"]]
            .map(([v, t]) => `<option value="${v}" ${tap === v ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        ${tap === "navigate" ? `<label>Sti</label><input data-d="nav" placeholder="/dashboard/side" value="${esc((d.tap_action && d.tap_action.navigation_path) || "")}">` : ""}
        ${d.type === "label" ? "" : `<label>Gløder</label><select data-d="glow">
          ${[["auto", "Automatisk (lamper)"], ["true", "Ja"], ["false", "Nej"]].map(([v, t]) => `<option value="${v}" ${String(d.glow === undefined ? "auto" : d.glow) === v ? "selected" : ""}>${t}</option>`).join("")}
        </select>`}
        <label>Position</label><div class="grid2"><input data-d="x" type="number" value="${Math.round(d.x)}"><input data-d="y" type="number" value="${Math.round(d.y)}"></div>
        <div class="row"><button class="danger" data-act="del-dev">Slet</button><button data-act="dup-dev">Kopiér</button><button data-act="deselect">Luk</button></div>
      </div>`;
    }
    if (s.kind === "door") {
      const d = this._config.doors[s.i];
      if (!d) return "";
      const isWin = d.type === "window";
      return `<div class="panel">
        <h3>${isWin ? "Vindue" : "Dør"}</h3>
        <label>Type</label><select data-w="type">
          <option value="door" ${isWin ? "" : "selected"}>Dør</option><option value="window" ${isWin ? "selected" : ""}>Vindue</option>
        </select>
        <label>Fløje</label><select data-w="leaves">
          <option value="1" ${d.leaves === 2 ? "" : "selected"}>Én fløj</option><option value="2" ${d.leaves === 2 ? "selected" : ""}>To fløje</option>
        </select>
        ${isWin ? `<label>Fast vindue</label><input data-w="fixed" type="checkbox" ${d.swing === 0 ? "checked" : ""}>` : ""}
        <label>Sensor</label><input data-w="sensor" list="motion-ents" placeholder="binary_sensor.hoveddor (valgfri)" value="${esc(d.sensor || "")}">
        <div class="row">
          <button data-act="flip-swing">⇅ Vend åbningsretning</button>
          <button data-act="flip-hinge">⇆ Vend hængsel</button>
        </div>
        <div class="row"><button class="danger" data-act="del-door">Slet</button><button data-act="deselect">Luk</button></div>
        <div class="hint" style="grid-column:1/-1">Den orange prik er hængslet. Uden sensor vises ${isWin ? "vinduet" : "døren"} lukket, og den stiplede bue viser, hvordan den åbner.</div>
      </div>`;
    }
    if (s.kind === "op") {
      const o = this._config.openings[s.i];
      if (!o) return "";
      const [x1, y1, x2, y2] = o.line;
      return `<div class="panel">
        <h3>Åbning</h3>
        <label>Fra</label><div class="grid2"><input data-o="x1" type="number" value="${x1}"><input data-o="y1" type="number" value="${y1}"></div>
        <label>Til</label><div class="grid2"><input data-o="x2" type="number" value="${x2}"><input data-o="y2" type="number" value="${y2}"></div>
        <label>Bredde</label><input data-o="width" type="number" placeholder="Automatisk (vægtykkelse)" value="${o.width ?? ""}">
        <label>Stiplet linje</label><input data-o="dashed" type="checkbox" ${o.dashed === false ? "" : "checked"}>
        <div class="row"><button class="danger" data-act="del-op">Slet</button><button data-act="deselect">Luk</button></div>
      </div>`;
    }
    const room = this._config.rooms[s.i];
    if (!room) return "";
    return `<div class="panel">
      <h3>Rum</h3>
      <label>Navn</label><input data-r="name" value="${esc(room.name || "")}">
      <label>Bevægelse</label><input data-r="motion" list="motion-ents" placeholder="binary_sensor.x, binary_sensor.y" value="${esc(room.motion.join(", "))}">
      <label>Tryk på rum</label><input data-r="entity" list="ents" placeholder="fx light.stue (valgfri)" value="${esc(room.entity || "")}">
      <label>Vis navn</label><input data-r="show_name" type="checkbox" ${room.show_name === false ? "" : "checked"}>
      <div class="row">
        <button data-act="add-vertex">+ Hjørne</button>
        <button data-act="del-vertex">− Hjørne</button>
        <button class="danger" data-act="del-room">Slet rum</button>
        <button data-act="deselect">Luk</button>
      </div>
      <div class="hint" style="grid-column:1/-1">Lamper behøver ikke at blive valgt her: alle lamper, der står i rummet, får det til at gløde.</div>
    </div>`;
  }

  _devField(key, inp) {
    const d = this._config.devices[this._sel.i];
    const v = inp.value.trim();
    if (key === "entity") d.entity = v;
    if (key === "icon") v ? (d.icon = v) : delete d.icon;
    if (key === "x") d.x = Number(v);
    if (key === "y") d.y = Number(v);
    if (key === "glow") v === "auto" ? delete d.glow : (d.glow = v === "true");
    if (key === "tap") {
      if (v === "auto") delete d.tap_action;
      else if (v === "navigate") d.tap_action = { action: "navigate", navigation_path: (d.tap_action && d.tap_action.navigation_path) || "/" };
      else d.tap_action = { action: v };
    }
    if (key === "nav") d.tap_action = { action: "navigate", navigation_path: v };
    this._emit();
    this._renderStage();
    if (key === "tap") this._renderPanel();
  }

  _roomField(key, inp) {
    const room = this._config.rooms[this._sel.i];
    const v = inp.type === "checkbox" ? inp.checked : inp.value.trim();
    if (key === "name") {
      room.name = v;
      room.id = slug(v);
    }
    if (key === "motion") room.motion = v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (key === "entity") v ? (room.entity = v) : delete room.entity;
    if (key === "show_name") v ? delete room.show_name : (room.show_name = false);
    this._emit();
    this._renderStage();
  }

  _opField(key, inp) {
    const o = this._config.openings[this._sel.i];
    const idx = { x1: 0, y1: 1, x2: 2, y2: 3 }[key];
    if (idx !== undefined) o.line[idx] = Number(inp.value);
    if (key === "width") inp.value === "" ? delete o.width : (o.width = Number(inp.value));
    if (key === "dashed") inp.checked ? delete o.dashed : (o.dashed = false);
    this._emit();
    this._renderStage();
  }

  _doorField(key, inp) {
    const d = this._config.doors[this._sel.i];
    if (key === "type") d.type = inp.value;
    if (key === "leaves") inp.value === "2" ? (d.leaves = 2) : delete d.leaves;
    if (key === "fixed") inp.checked ? (d.swing = 0) : delete d.swing;
    if (key === "sensor") inp.value.trim() ? (d.sensor = inp.value.trim()) : delete d.sensor;
    this._emit();
    this._renderStage();
    if (key === "type") this._renderPanel();
  }

  _globalField(key, inp) {
    const c = this._config;
    if (key === "title") inp.value ? (c.title = inp.value) : delete c.title;
    if (key === "w") c.size = [Number(inp.value) || 850, c.size[1]];
    if (key === "h") c.size = [c.size[0], Number(inp.value) || 1250];
    if (key === "theme") inp.value === "auto" ? delete c.theme : (c.theme = inp.value);
    if (key === "glow_strength") Number(inp.value) === 1 ? delete c.glow_strength : (c.glow_strength = Number(inp.value));
    if (key === "preview_motion") inp.checked ? (c.preview_motion = true) : delete c.preview_motion;
    this._emit();
    this._renderStage();
  }

  _action(act) {
    const c = this._config;
    const [W, H] = c.size;
    if (act === "add-dev" || act === "add-label") {
      const d = { entity: "", x: Math.round(W / 2), y: Math.round(H / 2) };
      if (act === "add-label") d.type = "label";
      c.devices.push(d);
      this._sel = { kind: "dev", i: c.devices.length - 1 };
    }
    if (act === "dup-dev" && this._sel) {
      const d = clone(c.devices[this._sel.i]);
      d.x += 30;
      d.y += 30;
      c.devices.push(d);
      this._sel = { kind: "dev", i: c.devices.length - 1 };
    }
    if (act === "del-dev" && this._sel) {
      c.devices.splice(this._sel.i, 1);
      this._sel = null;
    }
    if (act === "add-room") {
      const w = Math.round(W / 4);
      const h = Math.round(H / 6);
      const x = Math.round(W / 2 - w / 2);
      const y = Math.round(H / 2 - h / 2);
      c.rooms.push({ name: `Rum ${c.rooms.length + 1}`, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], motion: [] });
      this._sel = { kind: "room", i: c.rooms.length - 1 };
    }
    if (act === "del-room" && this._sel) {
      c.rooms.splice(this._sel.i, 1);
      this._sel = null;
    }
    if ((act === "add-vertex" || act === "del-vertex") && this._sel && this._sel.kind === "room") {
      const pts = c.rooms[this._sel.i].points;
      const vi = Math.min(this._lastVertex ?? pts.length - 1, pts.length - 1);
      if (act === "add-vertex") {
        const a = pts[vi];
        const b = pts[(vi + 1) % pts.length];
        pts.splice(vi + 1, 0, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]);
        this._lastVertex = vi + 1;
      } else if (pts.length > 3) {
        pts.splice(vi, 1);
        this._lastVertex = Math.max(0, vi - 1);
      }
    }
    if (act === "add-op") {
      // Start on the wall of the selected room if there is one, otherwise in the middle.
      let line = [Math.round(W / 2 - 75), Math.round(H / 2), Math.round(W / 2 + 75), Math.round(H / 2)];
      const r = c.rooms[0];
      if (r && r.points.length > 1) {
        const [a, b] = r.points;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const horiz = Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]);
        line = horiz ? [mx - 60, my, mx + 60, my] : [mx, my - 60, mx, my + 60];
        line = line.map((n) => Math.round(n));
      }
      c.openings.push({ line });
      this._sel = { kind: "op", i: c.openings.length - 1 };
    }
    if (act === "add-door" || act === "add-window") {
      const win = act === "add-window";
      const len = win ? 90 : 80;
      // Put it on the top wall of the first room, or in the middle of the plan.
      let line = [Math.round(W / 2 - len / 2), Math.round(H / 2), Math.round(W / 2 + len / 2), Math.round(H / 2)];
      const r = c.rooms[0];
      if (r && r.points.length > 1) {
        const [a, b] = r.points;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const horiz = Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]);
        line = (horiz ? [mx - len / 2, my, mx + len / 2, my] : [mx, my - len / 2, mx, my + len / 2]).map((n) => Math.round(n));
      }
      c.doors.push(win ? { type: "window", line } : { type: "door", line });
      this._sel = { kind: "door", i: c.doors.length - 1 };
    }
    if (act === "del-door" && this._sel) {
      c.doors.splice(this._sel.i, 1);
      this._sel = null;
    }
    if (act === "flip-swing" && this._sel) {
      const d = c.doors[this._sel.i];
      d.swing === -1 ? delete d.swing : (d.swing = -1);
    }
    if (act === "flip-hinge" && this._sel) {
      // Swap the ends; keep the leaf on the same side of the wall.
      const d = c.doors[this._sel.i];
      const [x1, y1, x2, y2] = d.line;
      d.line = [x2, y2, x1, y1];
      if (d.swing === 0) {
        // fixed window: nothing to flip
      } else d.swing === -1 ? delete d.swing : (d.swing = -1);
    }
    if (act === "del-op" && this._sel) {
      c.openings.splice(this._sel.i, 1);
      this._sel = null;
    }
    if (act === "deselect") this._sel = null;
    if (act !== "deselect") this._emit();
    this._renderStage();
    this._renderPanel();
  }
}

/* ------------------------------------------------------------------ */
/* Registration                                                         */
/* ------------------------------------------------------------------ */

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, GlowFloorplanCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, GlowFloorplanCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Glow Floorplan Card",
    description: "Plantegning hvor rummene gløder i lampernes rigtige farve, pulserer ved bevægelse og kan redigeres med træk-og-slip.",
    preview: true,
    documentationURL: "https://github.com/DanielMikkelsen99/glow-floorplan-card",
  });
}

console.info(`%c GLOW-FLOORPLAN-CARD %c v${VERSION} `, "color:#fff;background:#f5a623;font-weight:700", "color:#f5a623;background:#2e3442");

// Exported for tests (no effect in Home Assistant).
if (typeof window !== "undefined") window.__glowFloorplan = { Renderer, normalizeConfig, kelvinToRgb, pointInPolygon, findCard, VERSION };
