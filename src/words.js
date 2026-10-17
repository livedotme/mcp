// Units and words. Every conversion is the engine's own (WL.units): this file only picks which units and lays the words out.
import { WL } from './gen/engine.js';

const METRIC = () => WL.units({ distance: 'km', temp: 'c', rain: 'mm' });
const IMPERIAL = () => WL.units({ distance: 'mi', temp: 'f', rain: 'in' });

// Where miles are the road's unit (the engine's units rule: US, Liberia and Myanmar miles and °F; the UK miles and °C), by the
// event's time zone (livedot.js's rule: the clock says where it is).
const TZ_US = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Boise|Detroit|Juneau|Sitka|Nome|Yakutat|Metlakatla|Menominee|Indianapolis|Louisville|Fort_Wayne|Knox_IN|Atka|Shiprock|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu|US\/)/;
export function regionOfTz(tz) {
  if (!tz) return '';
  if (TZ_US.test(tz)) return 'US';
  return tz === 'Europe/London' ? 'GB' : tz === 'Africa/Monrovia' ? 'LR' : /^Asia\/(Yangon|Rangoon)$/.test(tz) ? 'MM' : '';
}

/** A locale's region from the host's hints, if any: ChatGPT's openai/userLocation (country) and openai/locale, or a plain locale. */
export function hostRegion(meta) {
  const m = meta || {}, loc = m['openai/userLocation'] || m.userLocation || null;
  if (loc && /^[A-Za-z]{2}$/.test(String(loc.country || ''))) return String(loc.country).toUpperCase();
  for (const k of ['openai/locale', 'locale', 'anthropic/locale', 'claude/locale']) {
    const r = String(m[k] || '').match(/[-_]([A-Za-z]{2})(?![A-Za-z])/);
    if (r) return r[1].toUpperCase();
  }
  return '';
}

/**
 * The units an answer uses: the tool's `units` if given; else the asker's region from the host (ChatGPT sends it); else the event's
 * country leads, with the other system in brackets ("km 79 (mile 49)"). Returns a formatter.
 */
export function unitsFor(choice, meta, tz) {
  if (choice === 'imperial') return fmt(IMPERIAL(), null);
  if (choice === 'metric') return fmt(METRIC(), null);
  const reg = hostRegion(meta);
  if (reg) return fmt(WL.units(null, 'en-' + reg), null);
  const ev = regionOfTz(tz), lead = WL.units(null, ev ? 'en-' + ev : 'en-001');
  const other = lead.distance === 'mi' ? METRIC() : IMPERIAL();
  return fmt(lead, other);
}

function fmt(U, O) {
  const both = (a, b) => (O && b !== a ? a + ' (' + b + ')' : a);
  const f = {
    U, dual: !!O, system: U.distance === 'mi' ? 'imperial' : 'metric',
    /** a place on the course: "km 79 (mile 49)" */
    at: (km) => both(U.AT + ' ' + U.dist(km), O && O.AT + ' ' + O.dist(km)),
    atShort: (km) => U.AT + ' ' + U.dist(km),
    /** a distance: "90 km (56 mi)" */
    dist: (km) => both(U.dist(km) + ' ' + U.DIST, O && O.dist(km) + ' ' + O.DIST),
    num: (km) => U.dist(km),
    speed: (kmh) => both(U.speed(kmh) + ' ' + U.SPEED, O && O.speed(kmh) + ' ' + O.SPEED),
    speedShort: (kmh) => U.speed(kmh) + ' ' + U.SPEED,
    deg: (c) => both(U.deg(c) + '°' + (O ? U.TEMP.slice(1) : ''), O && O.deg(c) + '°' + O.TEMP.slice(1)),
    degShort: (c) => U.deg(c) + '°',
    pace: (kmh) => both(U.pace(kmh) + ' ' + U.PACE, O && O.pace(kmh) + ' ' + O.PACE),
    paceShort: (kmh) => U.pace(kmh) + ' ' + U.PACE,
    label: { at: U.AT, dist: U.DIST, speed: U.SPEED, temp: U.TEMP, pace: U.PACE },
  };
  return f;
}

// ---------------------------------------------------------------- times
const p2 = (n) => String(n).padStart(2, '0');
/** 2:03, 1:02:03 */
export function hms(sec) {
  const s = Math.round(Math.abs(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? h + ':' + p2(m) + ':' + p2(r) : m + ':' + p2(r);
}
/** "2 minutes", "45 seconds", "1 h 12 min" */
export function span(sec) {
  const s = Math.round(Math.abs(sec));
  if (s < 90) return s + ' seconds';
  const m = Math.round(s / 60); if (m < 60) return m + ' minute' + (m === 1 ? '' : 's');
  const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : '');
}
export function ago(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); return h + ' h ' + (m % 60) + ' min ago';
}
/** The clock in the event's time zone: 15:40, or 3:40 PM where the asker reads miles and °F. */
export function clock(ms, tz, f) {
  try {
    return new Intl.DateTimeFormat(f && f.U.temp === 'f' ? 'en-US' : 'en-GB', { timeZone: tz || 'UTC', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  } catch (e) { return new Date(ms).toISOString().slice(11, 16) + ' UTC'; }
}

/** A public name as the public-name rule shows it: first name and last initial ("Thandi M."), the demo's marker kept. */
export function shortName(n) {
  const demo = /\(demo\)\s*$/i.test(String(n || '')), w = String(n || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'Someone';
  return (w[0].slice(0, 20) + (w.length > 1 ? ' ' + w[w.length - 1][0].toUpperCase() + '.' : '')).slice(0, 24) + (demo ? ' (demo)' : '');
}
export const firstName = (n) => String(n || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'They';
