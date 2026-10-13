/**
 * dials.js: dials, sliders, buttons, a piano keyboard, a scope and meters to put on a scene.
 *
 *   const { dial, slider, keyboard, scope } = await use("dials.js")     (a pictures.js scene)
 *   import { dial, slider, keyboard, scope } from "./dials.js"          (any page with one canvas)
 *
 *   const speed = dial("speed", 0, 10)        a number to read: speed.value (or speed * dt)
 *   dial("cutoff", lead, "filter_cutoff")     the dial IS that setting of `lead`: turning it sets it
 *   keyboard(lead, { octave: 4 })             piano keys, played by finger, mouse and computer keys
 *   scope(lead)                               the wave `lead` is making, live
 *
 * NOTHING IS POSITIONED BY HAND unless you want it. Controls line up in rows in the order they are
 * made, the keyboard sits along the bottom, and everything is laid out again when the picture
 * changes size. `{ x, y }` puts one control where you say.
 *
 * THE CONTROLS ARE DRAWN ON A CANVAS OF THEIR OWN, laid exactly over the scene's. So they sit on
 * top of whatever the scene draws, 2D or 3D, need no call in draw(), and cost the scene nothing:
 * only a control that changed is drawn again. Pointers are heard on the scene's own canvas.
 *
 * A TARGET is anything a control can set. No library is named here: a target is known by what
 * it can do, and all of it is optional.
 *
 *   set(name, value), get(name)     else the control reads and writes target[name]
 *   describe(name)                  { min, max, default, unit, step, kind, choices, name }: the control
 *                                   takes its range, unit and starting value from it. kind is "float",
 *                                   "int", "bool" or "choice"; choices is a list, or names joined by |
 *   noteOn(note, velocity), noteOff(note)      what a keyboard plays (note is a MIDI number, 60 is middle C)
 *   notes()                         the notes sounding now: a keyboard lights them
 *   samples()                       its latest output, a list of numbers from -1 to 1: a scope draws it
 *   level()                         how loud it is now, 0 to 1 (or [left, right]): a meter shows it
 *
 * The Python spellings (`note_on`, `on_change`) are understood wherever a name is looked for.
 *
 * MIT licence.
 */

const version = '0.0.0'

const TAU = Math.PI * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const isList = (v) => Array.isArray(v) || ArrayBuffer.isView(v)
const isTarget = (v) => v != null && (typeof v === 'object' || typeof v === 'function') && !isList(v)
const isPlain = (v) => v != null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
/** The first of these methods the thing has, ready to call. */
const method = (thing, ...names) => {
  for (const name of names) if (thing != null && typeof thing[name] === 'function') return thing[name].bind(thing)
  return null
}
const decimals = (step) => {
  const text = String(step)
  return text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1] || '').length
}

/** Colours and the font. `theme({ accent: "deepskyblue" })` changes them for controls made afterwards and before. */
const THEME = {
  plate: '#1c1f27', edge: '#313744', well: '#0b0d11', track: '#3a4150', knob: '#2b303b',
  text: '#eef0f4', dim: '#9aa2b1', accent: '#ffb224', backdrop: '#101216',
  white: '#f4f1ea', black: '#15171c', sounding: '#8fd3ff',
  good: '#3ddc84', warn: '#ffc53d', hot: '#ff5c5c',
  font: 'system-ui, -apple-system, "Segoe UI", sans-serif',
}

/** A spec's keys in one spelling: on_change is onChange, color is colour. */
const SPELLING = { color: 'colour', on_change: 'onChange', on_press: 'onPress', on_release: 'onRelease', on_note_on: 'onNoteOn', on_note_off: 'onNoteOff' }
const spelled = (spec) => {
  const out = {}
  for (const key in spec) out[SPELLING[key] || key] = spec[key]
  return out
}

// --- targets: what a control is tied to, known only by what it can do
function describe(target, param) {
  const ask = method(target, 'describe')
  let d = ask ? ask(param) : null
  if (!d && target.params) d = Array.isArray(target.params) ? target.params.find((p) => p.name === param) : target.params[param]
  d = d && typeof d === 'object' ? { ...d } : {}
  if (Array.isArray(d.range)) [d.min, d.max] = d.range
  if (typeof d.choices === 'string') d.choices = d.choices ? d.choices.split('|') : undefined
  if (d.kind === 'bool') { d.min = 0; d.max = 1 }
  return d
}
function readTarget(target, param) {
  const get = method(target, 'get')
  const value = get ? get(param) : target[param]
  return typeof value === 'function' ? undefined : value
}
function writeTarget(target, param, value) {
  const set = method(target, 'set')
  if (set) set(param, value)
  else target[param] = value
}

// --- drawing helpers
function rounded(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
function words(g, text, x, y, size, colour, align = 'center', weight = '', fit) {
  g.font = `${weight} ${size}px ${THEME.font}`
  g.fillStyle = colour
  g.textAlign = align
  g.textBaseline = 'middle'
  if (fit) g.fillText(text, x, y, fit)
  else g.fillText(text, x, y)
}

/** A unit as it is written, however a target spells it: "hz" is Hz, "seconds" is s. */
const UNITS = { hz: 'Hz', khz: 'kHz', s: 's', sec: 's', secs: 's', second: 's', seconds: 's', ms: 'ms', db: 'dB', percent: '%', semitones: 'st', cents: 'ct' }
const unitOf = (unit) => UNITS[String(unit).toLowerCase()] ?? String(unit)

/** A number as a person reads it: 0.25, 440 Hz, 1.2 kHz, 50%. */
function shown(value, c) {
  if (c.format) return String(c.format(value))
  if (typeof value !== 'number') return String(value)
  let unit = c.unit || ''
  if (unit === 'Hz' && Math.abs(value) >= 1000) return `${(value / 1000).toFixed(Math.abs(value) >= 10000 ? 1 : 2)} kHz`
  const span = Math.abs(c.max - c.min)
  // A dial turned by ratio covers small values and large ones: each is shown to about three figures.
  const size = Math.abs(value)
  const places = c.digits ?? (c.step ? decimals(c.step) : c.log ? (size >= 100 ? 0 : size >= 10 ? 1 : size >= 1 ? 2 : 3)
    : span >= 100 ? (size < 10 ? 1 : 0) : span >= 10 ? 1 : 2)
  if (unit && unit !== '%') unit = ' ' + unit
  return value.toFixed(places) + unit
}

// --------------------------------------------------------------------------------------------
// One control. `x, y, w, h` is the box the layout gave it, in the scene's points.
class Control {
  constructor(panel, kind, spec) {
    this.panel = panel
    this.kind = kind
    this.id = spec.id ?? panel.nextId++
    this.label = spec.label ?? ''
    this.colour = spec.colour || null
    this.onChange = spec.onChange || null
    // Where it was asked to be; left out, the layout places it.
    this.at = spec.x != null || spec.y != null ? { x: spec.x ?? 0, y: spec.y ?? 0 } : null
    this.size = spec.size
    this.wide = spec.width
    this.tall = spec.height
    this.x = this.y = this.w = this.h = 0
    this.held = false
  }
  get accent() { return this.colour || THEME.accent }
  /** Its value changed by hand: tell the target, the scene and whoever listens. */
  changed(value) {
    if (this.target && this.param != null) writeTarget(this.target, this.param, this.out ? this.out(value) : value)
    if (this.onChange) this.onChange(value, this)
    this.panel.told.push(this.id, value)
    this.touch()
  }
  touch() { this.panel.stale.add(this) }
  remove() { this.panel.remove(this) }
  /** Move it: `control.place(x, y)`, and `control.place()` hands it back to the layout. */
  place(x, y) {
    this.at = x == null ? null : { x, y: y ?? 0 }
    this.panel.arrange = true
  }
  valueOf() { return this.value }
  toString() { return String(this.value) }
  natural() { return [0, 0] }
  draw() {}
  down() {}
  move() {}
  up() {}
}

// --------------------------------------------------------------------------------------------
// A control that is a number in a range: the dial and the slider.
class Ranged extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    let d = {}
    if (spec.target) {
      this.target = spec.target
      this.param = spec.param
      d = describe(spec.target, spec.param)
      if (!this.label) this.label = d.label ?? d.name ?? String(spec.param)
    }
    this.min = spec.min ?? d.min ?? 0
    this.max = spec.max ?? d.max ?? 1
    this.step = spec.step ?? d.step ?? (d.kind === 'int' ? 1 : 0)
    this.unit = unitOf(spec.unit ?? d.unit ?? '')
    this.digits = spec.digits ?? d.digits
    this.format = spec.format || null
    // A pitch is turned by ratio, not by amount: half the dial is 20 to 200 Hz, not 20 to 10,000.
    this.log = this.min > 0 && this.max > this.min &&
      (spec.log ?? d.log ?? (d.curve === 'log' || (this.unit === 'Hz' && this.max / this.min >= 100)))
    const now = spec.value ?? (this.target ? readTarget(this.target, this.param) : undefined)
    this.default = spec.default ?? d.default ?? (typeof now === 'number' ? now : this.min)
    this.v = this.clean(typeof now === 'number' ? now : this.default)
    this.pos = this.toPos(this.v)
    if (spec.value != null && this.target) writeTarget(this.target, this.param, this.v)
  }
  clean(value) {
    value = clamp(Number(value) || 0, Math.min(this.min, this.max), Math.max(this.min, this.max))
    if (this.step) value = Number((this.min + Math.round((value - this.min) / this.step) * this.step).toFixed(decimals(this.step)))
    return value
  }
  toPos(value) {
    if (this.max === this.min) return 0
    return this.log ? Math.log(value / this.min) / Math.log(this.max / this.min) : (value - this.min) / (this.max - this.min)
  }
  fromPos(pos) {
    return this.log ? this.min * Math.pow(this.max / this.min, pos) : this.min + (this.max - this.min) * pos
  }
  get value() { return this.v }
  /** Set from the scene's code: the target is told, onChange is not (it is for a change made by hand). */
  set value(value) {
    value = this.clean(value)
    if (value === this.v) return
    this.v = value
    this.pos = this.toPos(value)
    if (this.target) writeTarget(this.target, this.param, value)
    this.touch()
  }
  /** Put the handle at a place from 0 to 1, by hand. */
  slide(pos) {
    this.pos = clamp(pos, 0, 1)
    const value = this.clean(this.fromPos(this.pos))
    if (value === this.v) return
    this.v = value
    this.changed(value)
  }
  reset() {
    const value = this.clean(this.default)
    this.pos = this.toPos(value)
    if (value === this.v) return
    this.v = value
    this.changed(value)
  }
  /** Each frame: a target that was changed some other way (by the scene, by a song) moves the handle. */
  frame() {
    if (!this.target || this.held) return
    const now = readTarget(this.target, this.param)
    if (typeof now !== 'number' || Math.abs(now - this.v) <= Math.abs(this.max - this.min) * 1e-6) return
    this.v = clamp(now, Math.min(this.min, this.max), Math.max(this.min, this.max))
    this.pos = this.toPos(this.v)
    this.touch()
  }
  up() {
    this.pos = this.toPos(this.v)
    this.touch()
  }
}

/** How far a finger travels to take a dial from one end to the other, in points. */
const DIAL_TRAVEL = 180
/** Further than this from the dial, the same travel turns it a quarter as much: pull away to be exact. */
const DIAL_FINE_AT = 140

class Dial extends Ranged {
  natural(u) {
    const across = (this.size || 48) * u
    return [Math.max(76 * u, across + 26 * u), across + 50 * u]
  }
  down(p) { this.last = { x: p.x, y: p.y }; this.touch() }
  move(p) {
    // Up or to the right turns it up. Each step is taken on its own, so Shift may be pressed part way.
    const u = this.panel.u
    const travel = (this.last.y - p.y) + (p.x - this.last.x)
    this.last.x = p.x; this.last.y = p.y
    const away = Math.hypot(p.x - (this.x + this.w / 2), p.y - (this.y + this.h / 2))
    const fine = p.shift ? 0.1 : away > DIAL_FINE_AT * u ? 0.25 : 1
    this.slide(this.pos + travel / (DIAL_TRAVEL * u) * fine)
  }
  draw(g, u) {
    const cx = this.x + this.w / 2, cy = this.y + 20 * u + (this.h - 40 * u) / 2
    const r = (this.h - 50 * u) / 2
    const from = TAU * 0.375, sweep = TAU * 0.75
    const pos = this.toPos(this.v)
    words(g, this.label, cx, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    g.lineCap = 'round'
    g.lineWidth = 5 * u
    g.strokeStyle = THEME.track
    g.beginPath(); g.arc(cx, cy, r, from, from + sweep); g.stroke()
    // The lit part starts at zero when the range has one inside it (a pan, a detune), else at the low end.
    const zero = this.min < 0 && this.max > 0 ? this.toPos(0) : 0
    g.strokeStyle = this.accent
    g.beginPath(); g.arc(cx, cy, r, from + sweep * Math.min(zero, pos), from + sweep * Math.max(zero, pos)); g.stroke()
    g.fillStyle = this.held ? THEME.track : THEME.knob
    g.beginPath(); g.arc(cx, cy, r - 7 * u, 0, TAU); g.fill()
    const a = from + sweep * pos
    g.strokeStyle = THEME.text
    g.lineWidth = 3 * u
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * (r - 18 * u), cy + Math.sin(a) * (r - 18 * u))
    g.lineTo(cx + Math.cos(a) * (r - 9 * u), cy + Math.sin(a) * (r - 9 * u))
    g.stroke()
    words(g, shown(this.v, this), cx, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '', this.w - 6 * u)
  }
}

class Slider extends Ranged {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.vertical = !!spec.vertical
  }
  natural(u) {
    const long = (this.size || (this.vertical ? 110 : 150)) * u
    return this.vertical ? [58 * u, long + 56 * u] : [long + 28 * u, 56 * u]
  }
  /** The track: where it starts (the low end), and how long it is. */
  track(u) {
    return this.vertical ? { from: this.y + this.h - 30 * u, long: this.h - 56 * u } : { from: this.x + 14 * u, long: this.w - 28 * u }
  }
  along(p, u) {
    const t = this.track(u)
    return this.vertical ? (t.from - p.y) / t.long : (p.x - t.from) / t.long
  }
  down(p) {
    const u = this.panel.u
    const here = this.along(p, u)
    // On the handle: it is dragged from where it is. Anywhere else on the track: it comes to the finger.
    if (Math.abs(here - this.pos) * this.track(u).long > 22 * u) this.slide(here)
    this.last = { x: p.x, y: p.y }
    this.touch()
  }
  move(p) {
    const travel = this.vertical ? this.last.y - p.y : p.x - this.last.x
    this.last.x = p.x; this.last.y = p.y
    this.slide(this.pos + travel / this.track(this.panel.u).long * (p.shift ? 0.1 : 1))
  }
  draw(g, u) {
    const t = this.track(u), pos = this.toPos(this.v)
    const zero = this.min < 0 && this.max > 0 ? this.toPos(0) : 0
    g.lineCap = 'round'
    g.lineWidth = 6 * u
    let hx, hy
    if (this.vertical) {
      const cx = this.x + this.w / 2
      words(g, this.label, cx, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 4 * u)
      g.strokeStyle = THEME.track
      g.beginPath(); g.moveTo(cx, t.from); g.lineTo(cx, t.from - t.long); g.stroke()
      g.strokeStyle = this.accent
      g.beginPath(); g.moveTo(cx, t.from - t.long * zero); g.lineTo(cx, t.from - t.long * pos); g.stroke()
      hx = cx; hy = t.from - t.long * pos
      words(g, shown(this.v, this), cx, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '', this.w - 4 * u)
    } else {
      const cy = this.y + this.h - 18 * u
      words(g, this.label, this.x + 14 * u, this.y + 14 * u, 12 * u, THEME.dim, 'left', '', this.w * 0.55)
      words(g, shown(this.v, this), this.x + this.w - 14 * u, this.y + 14 * u, 12 * u, THEME.text, 'right', '', this.w * 0.4)
      g.strokeStyle = THEME.track
      g.beginPath(); g.moveTo(t.from, cy); g.lineTo(t.from + t.long, cy); g.stroke()
      g.strokeStyle = this.accent
      g.beginPath(); g.moveTo(t.from + t.long * zero, cy); g.lineTo(t.from + t.long * pos, cy); g.stroke()
      hx = t.from + t.long * pos; hy = cy
    }
    g.fillStyle = THEME.text
    g.beginPath(); g.arc(hx, hy, (this.held ? 10 : 8.5) * u, 0, TAU); g.fill()
  }
}

// --------------------------------------------------------------------------------------------
class Button extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.onPress = spec.onPress || null
    this.onRelease = spec.onRelease || null
    this.presses = 0
  }
  /** Is it held now? (`fire.held` says the same.) */
  get value() { return this.held }
  /** Was it pressed since this was last asked? `if (fire.pressed) shoot()` in update() acts once for each press. */
  get pressed() {
    if (!this.presses) return false
    this.presses = 0
    return true
  }
  natural(u, room, g) {
    g.font = `600 ${14 * u}px ${THEME.font}`
    return [this.wide ? this.wide * u : Math.max(72 * u, g.measureText(this.label).width + 44 * u), 56 * u]
  }
  down() {
    this.presses++
    if (this.onPress) this.onPress(this)
    this.panel.told.push(this.id, true)
    this.touch()
  }
  up() {
    if (this.onRelease) this.onRelease(this)
    this.panel.told.push(this.id, false)
    this.touch()
  }
  draw(g, u) {
    rounded(g, this.x + 6 * u, this.y + 9 * u, this.w - 12 * u, this.h - 18 * u, 9 * u)
    g.fillStyle = this.held ? this.accent : THEME.knob
    g.fill()
    if (!this.held) { g.strokeStyle = THEME.track; g.lineWidth = 1.5 * u; g.stroke() }
    words(g, this.label, this.x + this.w / 2, this.y + this.h / 2, 14 * u, this.held ? THEME.well : THEME.text, 'center', '600', this.w - 24 * u)
  }
}

class Toggle extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    let now = spec.value
    if (spec.target) {
      this.target = spec.target
      this.param = spec.param
      const d = describe(spec.target, spec.param)
      if (!this.label) this.label = d.label ?? d.name ?? String(spec.param)
      const there = readTarget(this.target, this.param)
      // A target that keeps 0 and 1 is given 0 and 1.
      if (typeof there === 'number' || d.kind === 'bool') this.out = (on) => (on ? 1 : 0)
      now ??= there ?? d.default
    }
    this.v = !!now
    this.default = this.v
  }
  get value() { return this.v }
  set value(on) {
    on = !!on
    if (on === this.v) return
    this.v = on
    if (this.target) writeTarget(this.target, this.param, this.out ? this.out(on) : on)
    this.touch()
  }
  get on() { return this.v }
  set on(on) { this.value = on }
  natural(u, room, g) {
    g.font = `${12 * u}px ${THEME.font}`
    return [Math.max(72 * u, g.measureText(this.label).width + 20 * u), 62 * u]
  }
  down() {
    this.v = !this.v
    this.changed(this.v)
  }
  frame() {
    if (!this.target) return
    const there = !!readTarget(this.target, this.param)
    if (there !== this.v) { this.v = there; this.touch() }
  }
  draw(g, u) {
    const cx = this.x + this.w / 2, cy = this.y + 40 * u, w = 46 * u, h = 26 * u
    words(g, this.label, cx, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, cx - w / 2, cy - h / 2, w, h, h / 2)
    g.fillStyle = this.v ? this.accent : THEME.track
    g.fill()
    g.fillStyle = THEME.text
    g.beginPath(); g.arc(cx + (this.v ? 1 : -1) * (w / 2 - h / 2), cy, h / 2 - 3.5 * u, 0, TAU); g.fill()
  }
}

/** One of a list, stepped through with the arrows at its sides: a waveform, a level, a colour. */
class Select extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    let d = {}, now = spec.value
    if (spec.target) {
      this.target = spec.target
      this.param = spec.param
      d = describe(spec.target, spec.param)
      if (!this.label) this.label = d.label ?? d.name ?? String(spec.param)
      const there = readTarget(this.target, this.param)
      // A target that keeps the choice as its number in the list is given the number.
      if (typeof there === 'number' || d.kind === 'choice') this.out = () => this.i
      now ??= there ?? d.default
    }
    this.choices = [...(spec.choices || d.choices || [])]
    this.i = Math.max(0, this.out && typeof now === 'number' ? clamp(Math.round(now), 0, this.choices.length - 1) : this.choices.indexOf(now))
    this.default = this.i
  }
  get value() { return this.choices[this.i] }
  set value(choice) { this.index = this.choices.indexOf(choice) }
  get index() { return this.i }
  set index(i) {
    if (!(i >= 0 && i < this.choices.length) || i === this.i) return
    this.i = i
    if (this.target) writeTarget(this.target, this.param, this.out ? i : this.choices[i])
    this.touch()
  }
  natural(u, room, g) {
    g.font = `600 ${13 * u}px ${THEME.font}`
    let widest = 0
    for (const choice of this.choices) widest = Math.max(widest, g.measureText(String(choice)).width)
    return [Math.max(120 * u, widest + 76 * u), 62 * u]
  }
  down(p) {
    const n = this.choices.length
    if (!n) return
    this.i = (this.i + (p.x < this.x + this.w / 2 ? n - 1 : 1)) % n
    this.changed(this.choices[this.i])
  }
  changed(value) {
    if (this.target) writeTarget(this.target, this.param, this.out ? this.i : value)
    if (this.onChange) this.onChange(value, this)
    this.panel.told.push(this.id, this.i)
    this.touch()
  }
  frame() {
    if (!this.target) return
    const there = readTarget(this.target, this.param)
    const i = this.out ? there : this.choices.indexOf(there)
    if (typeof i === 'number' && i >= 0 && i < this.choices.length && i !== this.i) { this.i = i; this.touch() }
  }
  draw(g, u) {
    const cx = this.x + this.w / 2, cy = this.y + 40 * u
    words(g, this.label, cx, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, this.x + 6 * u, cy - 14 * u, this.w - 12 * u, 28 * u, 8 * u)
    g.fillStyle = THEME.knob
    g.fill()
    words(g, '‹', this.x + 20 * u, cy - 1 * u, 18 * u, this.accent)
    words(g, '›', this.x + this.w - 20 * u, cy - 1 * u, 18 * u, this.accent)
    words(g, String(this.value ?? ''), cx, cy, 13 * u, THEME.text, 'center', '600', this.w - 64 * u)
  }
}

/** Words in the row: a heading for the controls after it. */
class Label extends Control {
  get value() { return this.label }
  set value(text) { this.label = String(text); this.panel.arrange = true }
  natural(u, room, g) {
    g.font = `600 ${14 * u}px ${THEME.font}`
    return [g.measureText(this.label).width + 20 * u, 30 * u]
  }
  draw(g, u) {
    words(g, this.label, this.x + 10 * u, this.y + this.h / 2, 14 * u, this.colour || THEME.text, 'left', '600')
  }
}

/** Not drawn: the controls after it start a new row. */
class Break extends Control {}

// --------------------------------------------------------------------------------------------
/**
 * THE PIANO KEYBOARD. Each finger holds the key under it and slides from key to key, so chords and
 * runs work on a touch screen. The computer's keys play it too, by where they are on the keyboard
 * (so the same hands work on any layout): the row from A is the white keys from C, the row above
 * it is the black keys, and Z and X step down and up an octave.
 */
const KEY_NOTES = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 }
const KEY_HINTS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"]
const WHITE = [0, 2, 4, 5, 7, 9, 11]
const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]
/** How hard the computer's keys play, 0 to 1. */
const KEY_VELOCITY = 0.8

class Keyboard extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.target = spec.target || null
    this.first = spec.octave ?? 4
    this.octaves = spec.octaves || 0 // 0: as many as fit well
    this.keys = spec.keys !== false
    this.hints = spec.hints
    this.onNoteOn = spec.onNoteOn || null
    this.onNoteOff = spec.onNoteOff || null
    this.count = new Map() // note -> how many fingers and keys hold it
    this.fingers = new Map() // pointer id -> note
    this.codes = new Map() // key code -> note
    this.sounding = null
    this.heard = ''
    this.docked = !this.at
    this.many = true
  }
  /** The octave of the lowest key: 4 starts at middle C. */
  get octave() { return this.first }
  set octave(n) {
    n = clamp(Math.round(n), 0, 8)
    if (n === this.first) return
    this.release()
    this.first = n
    this.touch()
  }
  get value() { return this.first }
  set value(n) { this.octave = n }
  /** The notes held on it now, lowest first. */
  get notes() { return [...this.count.keys()].sort((a, b) => a - b) }
  get low() { return 12 * (this.first + 1) }
  span(u) { return this.octaves || clamp(Math.floor(this.w / (7 * 34 * u)), 1, 4) }
  natural(u, room) {
    return [this.wide ? this.wide * u : room, (this.tall || 150) * u]
  }
  /** Play a note from the scene's code as a finger would: `piano.press(60)`. */
  press(note, velocity = KEY_VELOCITY) {
    const n = this.count.get(note) || 0
    this.count.set(note, n + 1)
    if (n) return
    const play = method(this.target, 'noteOn', 'note_on')
    if (play) play(note, velocity)
    if (this.onNoteOn) this.onNoteOn(note, velocity, this)
    this.panel.played.push(this.id, note, velocity)
    this.touch()
  }
  /** Let a note go; with no note, every note that is held. */
  release(note) {
    if (note == null) {
      for (const held of [...this.count.keys()]) { this.count.set(held, 1); this.release(held) }
      this.fingers.clear()
      this.codes.clear()
      return
    }
    const n = this.count.get(note) || 0
    if (!n) return
    if (n > 1) { this.count.set(note, n - 1); return }
    this.count.delete(note)
    const stop = method(this.target, 'noteOff', 'note_off')
    if (stop) stop(note)
    if (this.onNoteOff) this.onNoteOff(note, this)
    this.panel.played.push(this.id, note, 0)
    this.touch()
  }
  /** Where the keys are: below a strip that names the range and steps the octave. */
  shape(u) {
    const strip = 22 * u
    const whites = 7 * this.span(u) + 1
    return { strip, top: this.y + strip, tall: this.h - strip, whites, each: this.w / whites }
  }
  /** The note at a point and how hard it is struck there (lower on the key is harder), or null. */
  noteAt(p, u) {
    const s = this.shape(u)
    if (p.x < this.x || p.x >= this.x + this.w || p.y < s.top || p.y > this.y + this.h) return null
    const across = (p.x - this.x) / s.each
    const white = Math.floor(across)
    const hard = clamp(0.35 + 0.65 * (p.y - s.top) / s.tall, 0.35, 1)
    if (p.y < s.top + s.tall * 0.62) {
      // A black key lies over the join between two white ones.
      const join = Math.round(across)
      if (join > 0 && join < s.whites && Math.abs(across - join) < 0.3) {
        const below = this.low + 12 * Math.floor((join - 1) / 7) + WHITE[(join - 1) % 7]
        if (IS_BLACK[(below + 1) % 12]) return { note: below + 1, hard: clamp(0.35 + 0.65 * (p.y - s.top) / (s.tall * 0.62), 0.35, 1) }
      }
    }
    return { note: this.low + 12 * Math.floor(white / 7) + WHITE[white % 7], hard }
  }
  down(p) {
    const u = this.panel.u, s = this.shape(u)
    if (p.y < s.top) {
      // The strip: its left end steps down an octave, its right end up.
      if (p.x < this.x + 64 * u) this.step(-1)
      else if (p.x > this.x + this.w - 64 * u) this.step(1)
      return
    }
    const at = this.noteAt(p, u)
    if (!at) return
    this.fingers.set(p.id, at.note)
    this.press(at.note, at.hard)
  }
  move(p) {
    if (!this.fingers.has(p.id)) return
    const was = this.fingers.get(p.id)
    const at = this.noteAt(p, this.panel.u)
    const now = at ? at.note : null
    if (now === was) return
    // Sliding to the next key: the new one sounds before the old one stops, as fingers do.
    if (now != null) this.press(now, at.hard)
    if (was != null) this.release(was)
    this.fingers.set(p.id, now)
  }
  up(p) {
    const was = this.fingers.get(p.id)
    this.fingers.delete(p.id)
    if (was != null) this.release(was)
  }
  step(by) {
    const next = clamp(this.first + by, 0, 8)
    if (next === this.first) return
    this.octave = next
    this.panel.told.push(this.id, next)
  }
  keyDown(e) {
    if (!this.keys || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false
    if (e.code === 'KeyZ' || e.code === 'KeyX') { this.step(e.code === 'KeyZ' ? -1 : 1); return true }
    const offset = KEY_NOTES[e.code]
    if (offset === undefined) return false
    if (!this.codes.has(e.code)) {
      this.codes.set(e.code, this.low + offset)
      this.press(this.low + offset)
    }
    return true
  }
  keyUp(e) {
    const note = this.codes.get(e.code)
    if (note === undefined) return false
    this.codes.delete(e.code)
    this.release(note)
    return true
  }
  /** Each frame: the notes the target says are sounding (a song playing, a held pedal) are lit too. */
  frame() {
    const ask = method(this.target, 'notes')
    if (!ask) return
    const now = ask()
    const said = now ? [...now].join() : ''
    if (said === this.heard) return
    this.heard = said
    this.sounding = said ? new Set(now) : null
    this.touch()
  }
  draw(g, u) {
    const s = this.shape(u), span = this.span(u), low = this.low
    const lit = (note) => (this.count.has(note) ? this.accent : this.sounding && this.sounding.has(note) ? THEME.sounding : null)
    // The computer keys are named on the piano keys they play, where there is a keyboard to press.
    const hints = this.keys && (this.hints ?? !this.panel.coarse) && s.each >= 22 * u
    words(g, '‹', this.x + 14 * u, this.y + s.strip / 2 - 2 * u, 20 * u, this.accent)
    words(g, '›', this.x + this.w - 14 * u, this.y + s.strip / 2 - 2 * u, 20 * u, this.accent)
    words(g, `C${this.first} to C${this.first + span}`, this.x + this.w / 2, this.y + s.strip / 2 - 2 * u, 12 * u, THEME.dim)
    for (let i = 0; i < s.whites; i++) {
      const note = low + 12 * Math.floor(i / 7) + WHITE[i % 7]
      const x = this.x + i * s.each
      g.fillStyle = lit(note) || THEME.white
      rounded(g, x + 1, s.top, s.each - 2, s.tall, 4 * u)
      g.fill()
      const hint = hints && KEY_HINTS[note - low]
      if (hint) words(g, hint, x + s.each / 2, s.top + s.tall - 13 * u, 11 * u, '#7b8190')
      else if (i % 7 === 0 && s.each >= 18 * u) words(g, `C${this.first + i / 7}`, x + s.each / 2, s.top + s.tall - 13 * u, 10 * u, '#7b8190')
    }
    const wide = s.each * 0.58, tall = s.tall * 0.62
    for (let i = 0; i < s.whites - 1; i++) {
      const note = low + 12 * Math.floor(i / 7) + WHITE[i % 7] + 1
      if (!IS_BLACK[note % 12]) continue
      const x = this.x + (i + 1) * s.each - wide / 2
      g.fillStyle = lit(note) || THEME.black
      rounded(g, x, s.top, wide, tall, 3 * u)
      g.fill()
      const hint = hints && KEY_HINTS[note - low]
      if (hint) words(g, hint, x + wide / 2, s.top + tall - 11 * u, 10 * u, lit(note) ? THEME.well : '#9aa2b1')
    }
  }
}

// --------------------------------------------------------------------------------------------
/**
 * THE SCOPE draws a line of numbers: a sound's wave, or any value over time. It takes whatever
 * can give it numbers: a target with samples(), a function that returns a list, a list that
 * someone else keeps filling, or nothing at all, and then `wave.push(value)` adds one point.
 */
class Scope extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    const source = spec.source
    this.pull = typeof source === 'function' ? source : method(source, 'samples', 'scope')
    this.list = !this.pull && isList(source) ? source : null
    this.own = !this.pull && !this.list
    this.points = spec.points || 256
    if (this.own) { this.ring = new Float32Array(this.points); this.filled = 0; this.fresh = true }
    this.min = spec.min
    this.max = spec.max
    // A wave is held still by starting it where it climbs through zero; a value over time is not a wave.
    this.steady = spec.steady ?? !this.own
  }
  get value() { return this.own ? this.ring[this.points - 1] : undefined }
  /** One more point on the right; the oldest drops off the left. */
  push(value) {
    this.ring.copyWithin(0, 1)
    this.ring[this.points - 1] = Number(value) || 0
    if (this.filled < this.points) this.filled++
    this.fresh = true
  }
  /** A whole new line at once (what Python sends each frame). */
  feed(list) { this.list = list; this.fresh = true }
  natural(u, room) {
    return [this.wide ? this.wide * u : room, (this.tall || 104) * u]
  }
  frame() {
    if (this.pull || (this.list && !this.own) || this.fresh) this.touch()
  }
  draw(g, u) {
    const x = this.x + 4 * u, y = this.y + 4 * u, w = this.w - 8 * u, h = this.h - 8 * u
    rounded(g, x, y, w, h, 7 * u)
    g.fillStyle = THEME.well
    g.fill()
    let data = this.pull ? this.pull() : this.list || this.ring
    this.fresh = false
    if (this.label) words(g, this.label, x + 9 * u, y + 12 * u, 11 * u, THEME.dim, 'left')
    if (!data || !data.length) return
    let from = this.own && !this.list ? this.points - this.filled : 0, count = data.length - from
    let low = this.min, high = this.max
    if (low == null || high == null) {
      if (this.own) {
        // A value over time has no set range: it is fitted, with a little room.
        let a = Infinity, b = -Infinity
        for (let i = from; i < data.length; i++) { if (data[i] < a) a = data[i]; if (data[i] > b) b = data[i] }
        if (!(b > a)) { a -= 1; b += 1 }
        low ??= a - (b - a) * 0.1
        high ??= b + (b - a) * 0.1
      } else { low ??= -1; high ??= 1 }
    }
    if (this.steady && count > 8) {
      const half = count >> 1
      for (let i = 1; i < half; i++) if (data[i - 1] <= 0 && data[i] > 0) { from = i; break }
      count = half
    }
    if (count < 2) return
    const mid = y + h / 2
    g.strokeStyle = THEME.edge
    g.lineWidth = 1
    g.beginPath(); g.moveTo(x + 6 * u, mid); g.lineTo(x + w - 6 * u, mid); g.stroke()
    // No more points than there are pixels to show them.
    const stride = Math.max(1, Math.floor(count / (w * this.panel.ratio)))
    const left = x + 6 * u, across = (w - 12 * u) / (count - 1), scale = (h - 12 * u) / (high - low), base = y + h - 6 * u
    g.beginPath()
    for (let i = 0; i < count; i += stride) {
      const py = clamp(base - (data[from + i] - low) * scale, y + 3 * u, y + h - 3 * u)
      if (i) g.lineTo(left + i * across, py)
      else g.moveTo(left, py)
    }
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.strokeStyle = this.accent
    g.globalAlpha = 0.25
    g.lineWidth = 5 * u
    g.stroke()
    g.globalAlpha = 1
    g.lineWidth = 1.75 * u
    g.stroke()
  }
}

/** How fast a meter's bar falls back, in full scales a second, and how long its peak mark stays, in seconds. */
const METER_FALL = 1.6
const METER_HOLD = 0.9

/** A level from 0 to 1 as a bar of lights, with a mark left at the loudest it has just been. */
class Meter extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    const source = spec.source
    this.pull = typeof source === 'function' ? source : method(source, 'level')
    this.vertical = spec.vertical !== false
    this.given = [0]
    this.bars = [0]
    this.peaks = [0]
    this.since = [0]
    this.last = 0
  }
  get value() { return this.given.length > 1 ? this.given : this.given[0] }
  set value(level) { this.given = isList(level) ? [...level] : [Number(level) || 0] }
  feed(level) { this.value = level }
  natural(u) {
    const long = (this.size || 110) * u
    return this.vertical ? [44 * u, long + 30 * u] : [long + 28 * u, 46 * u]
  }
  frame(now) {
    if (this.pull) this.value = this.pull()
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
    this.last = now
    let moved = false
    for (let i = 0; i < this.given.length; i++) {
      const level = clamp(this.given[i] || 0, 0, 1), was = this.bars[i] || 0
      const bar = Math.max(level, was - METER_FALL * dt)
      if (bar >= (this.peaks[i] || 0)) { this.peaks[i] = bar; this.since[i] = now }
      else if (now - (this.since[i] || 0) > METER_HOLD * 1000) this.peaks[i] = Math.max(bar, this.peaks[i] - METER_FALL * dt)
      if (Math.abs(bar - was) > 0.002) moved = true
      this.bars[i] = bar
    }
    if (this.bars.length !== this.given.length) { this.bars.length = this.peaks.length = this.given.length; moved = true }
    if (moved || this.peaks.some((peak, i) => peak > this.bars[i] + 0.004)) this.touch()
  }
  draw(g, u) {
    const n = this.bars.length, lights = 14
    const colour = (i) => (i >= lights - 2 ? THEME.hot : i >= lights - 5 ? THEME.warn : THEME.good)
    if (this.label) words(g, this.label, this.x + this.w / 2, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 4 * u)
    // The lights run up a vertical meter and along a horizontal one.
    const across = this.vertical ? this.w - 16 * u : this.h - (this.label ? 30 : 16) * u
    const long = this.vertical ? this.h - 32 * u : this.w - 28 * u
    const each = long / lights, thick = (across - (n - 1) * 3 * u) / n
    for (let b = 0; b < n; b++) {
      const on = Math.round(this.bars[b] * lights), peak = Math.round(this.peaks[b] * lights) - 1
      for (let i = 0; i < lights; i++) {
        g.fillStyle = i < on || (i === peak && peak >= on) ? colour(i) : THEME.track
        g.globalAlpha = i < on || i === peak ? 1 : 0.55
        if (this.vertical) g.fillRect(this.x + 8 * u + b * (thick + 3 * u), this.y + this.h - 8 * u - (i + 1) * each + 1, thick, each - 2)
        else g.fillRect(this.x + 14 * u + i * each + 1, this.y + (this.label ? 24 : 8) * u + b * (thick + 3 * u), each - 2, thick)
      }
    }
    g.globalAlpha = 1
  }
}

const KINDS = { dial: Dial, slider: Slider, button: Button, toggle: Toggle, select: Select, label: Label, keyboard: Keyboard, scope: Scope, meter: Meter, row: Break }

// --------------------------------------------------------------------------------------------
/** Two taps this close together, in milliseconds and points, put a dial or slider back to where it started. */
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_REACH = 30
/** How often a scene that looks empty is looked at again, in frames. */
const LOOK_EVERY = 30

/**
 * THE PANEL: every control on one canvas, their layout, the canvas they are drawn on and the
 * pointers that are on them. There is one for a canvas, made the first time a control is.
 */
class Panel {
  constructor(canvas) {
    this.canvas = canvas
    this.items = []
    this.nextId = 1
    this.stale = new Set() // controls to draw again this frame
    this.arrange = true // lay everything out and draw it all
    this.told = [] // what changed by hand, for a listener: id, value, id, value…
    this.played = [] // notes: keyboard id, note, velocity (0: let go)…
    this.made = [] // what a control took from its target, for a listener: id, min, max, default, choices, value…
    this.listener = null
    this.beats = false // the listener is called every frame it has answered the last (`ack`)
    this.armed = true
    this.grabs = new Map() // pointer id -> the control it is on
    this.tap = null
    this.plates = []
    this.W = this.H = 0
    this.ratio = 1
    this.u = 1
    this.options = { at: 'top', scale: 0, margin: 10, backdrop: 'auto' }
    this.blank = false
    this.frames = 0
    this.undo = []
    this.raf = 0

    // The controls' own canvas, laid over the scene's. It takes no pointer: the scene's canvas hears them all.
    const layer = this.layer = document.createElement('canvas')
    layer.dataset.dialsLayer = ''
    layer.style.cssText = 'position:absolute;pointer-events:none;margin:0;padding:0;border:0;inset:auto'
    canvas.after(layer)
    this.g = layer.getContext('2d')
    try { this.coarse = matchMedia('(pointer: coarse)').matches } catch (e) { this.coarse = false }

    const listen = (target, type, fn, how) => {
      target.addEventListener(type, fn, how)
      this.undo.push(() => target.removeEventListener(type, fn, how))
    }
    listen(canvas, 'pointerdown', (e) => this.pointerDown(e))
    listen(canvas, 'pointermove', (e) => this.pointerMove(e))
    listen(window, 'pointerup', (e) => this.pointerUp(e))
    listen(window, 'pointercancel', (e) => this.pointerUp(e))
    listen(canvas, 'keydown', (e) => { for (const item of this.items) if (item.keyDown && item.keyDown(e)) { e.preventDefault(); break } })
    listen(canvas, 'keyup', (e) => { for (const item of this.items) if (item.keyUp) item.keyUp(e) })
    listen(canvas, 'blur', () => { for (const item of this.items) if (item.kind === 'keyboard') item.release() })
    // A finger on a control must turn it, not scroll the page.
    canvas.style.touchAction = 'none'
    if (typeof ResizeObserver === 'function') {
      const sizes = new ResizeObserver(() => this.fit())
      sizes.observe(canvas)
      this.undo.push(() => sizes.disconnect())
    }
    this.fit()
    const tick = (now) => {
      // The scene was stopped or run again (its canvas is gone, or what it added to the page is): so are its controls.
      if (!canvas.isConnected || !layer.isConnected) return this.close()
      this.raf = requestAnimationFrame(tick)
      this.frame(now)
    }
    this.raf = requestAnimationFrame(tick)
  }

  close() {
    cancelAnimationFrame(this.raf)
    for (const item of this.items) if (item.kind === 'keyboard') item.release()
    for (const undo of this.undo.splice(0)) undo()
    this.layer.remove()
    this.items.length = 0
    if (this.canvas[PANEL] === this) delete this.canvas[PANEL]
  }

  /** Lay the controls' canvas exactly over the scene's, with a real pixel for each of the screen's. */
  fit() {
    const { canvas, layer } = this
    const W = canvas.clientWidth, H = canvas.clientHeight, ratio = window.devicePixelRatio || 1
    layer.style.left = canvas.offsetLeft + 'px'
    layer.style.top = canvas.offsetTop + 'px'
    if (W === this.W && H === this.H && ratio === this.ratio) return
    this.W = W; this.H = H; this.ratio = ratio
    layer.style.width = W + 'px'
    layer.style.height = H + 'px'
    layer.width = Math.max(1, Math.round(W * ratio))
    layer.height = Math.max(1, Math.round(H * ratio))
    this.arrange = true
    this.frames = 0
  }

  add(kind, spec) {
    const Kind = KINDS[kind]
    if (!Kind) throw new Error(`There is no control called "${kind}". There are: ${Object.keys(KINDS).join(', ')}`)
    const item = new Kind(this, kind, spelled(spec || {}))
    this.items.push(item)
    this.arrange = true
    return item
  }
  remove(item) {
    const i = this.items.indexOf(item)
    if (i < 0) return
    if (item.kind === 'keyboard') item.release()
    this.items.splice(i, 1)
    for (const [id, held] of this.grabs) if (held === item) this.grabs.delete(id)
    this.arrange = true
  }
  find(id) { return this.items.find((item) => item.id === id) }

  // --- layout: rows of controls in the order they were made, each row on a plate; a keyboard along the bottom
  layout() {
    const { g, W, H, options } = this
    const base = options.scale || (this.coarse ? 1.15 : 1)
    let u = base
    const flow = this.items.filter((item) => !item.at && !item.docked)
    const docked = this.items.filter((item) => item.docked && !item.at)
    const fixed = this.items.filter((item) => item.at)
    let rows, margin, pad, gap, floor
    // Smaller, a step at a time, until the rows fit above the keyboard (and no smaller than six tenths).
    for (;;) {
      this.u = u
      margin = options.margin * u; pad = 8 * u; gap = 8 * u
      const room = Math.max(40, W - 2 * margin - 2 * pad)
      floor = H - margin
      for (const item of docked) {
        const [, h] = item.natural(u, room, g)
        item.w = room
        item.h = Math.min(h, Math.max(70 * u, H * 0.42))
        item.x = (W - room) / 2
        item.y = floor - pad - item.h
        floor = item.y - pad - gap
      }
      rows = []
      let row = null
      for (const item of flow) {
        if (item.kind === 'row') { row = null; continue }
        const [w, h] = item.natural(u, room, g)
        item.w = Math.min(w, room); item.h = h
        if (!row || row.w + item.w > room + 0.5) rows.push(row = { items: [], w: 0, h: 0 })
        row.items.push(item)
        row.w += item.w
        row.h = Math.max(row.h, h)
      }
      const tall = rows.reduce((sum, r) => sum + r.h + 2 * pad + gap, 0)
      if (tall <= floor - margin + gap || u <= base * 0.6) { this.flowTall = tall; break }
      u -= base * 0.1
    }
    this.plates = []
    for (const item of docked) this.plates.push([item.x - pad, item.y - pad, item.w + 2 * pad, item.h + 2 * pad])
    let y = options.at === 'bottom' ? Math.max(margin, floor + gap - this.flowTall) : margin
    for (const row of rows) {
      let x = (W - row.w) / 2
      this.plates.push([x - pad, y, row.w + 2 * pad, row.h + 2 * pad])
      for (const item of row.items) {
        item.x = x
        item.y = y + pad + (row.h - item.h) / 2
        x += item.w
      }
      y += row.h + 2 * pad + gap
    }
    for (const item of fixed) {
      if (item.kind === 'row') continue
      const [w, h] = item.natural(u, Math.max(40, W - 2 * margin - 2 * pad), g)
      item.w = w; item.h = h
      item.x = item.at.x; item.y = item.at.y
      this.plates.push([item.x - pad / 2, item.y - pad / 2, w + pad, h + pad])
    }
  }

  /**
   * Has the scene drawn anything? One that only makes controls (a synth panel with no draw())
   * leaves its canvas clear, and the controls would float on whatever the page is. Then a dark
   * backdrop is painted behind them. Asked by drawing the scene small: its canvas is not touched.
   */
  look() {
    const choice = this.options.backdrop
    if (choice !== 'auto') return !!choice
    try {
      const probe = this.probe ??= Object.assign(document.createElement('canvas'), { width: 2, height: 2 }).getContext('2d', { willReadFrequently: true })
      probe.clearRect(0, 0, 2, 2)
      probe.drawImage(this.canvas, 0, 0, 2, 2)
      const d = probe.getImageData(0, 0, 2, 2).data
      return d[3] + d[7] + d[11] + d[15] === 0
    } catch (e) {
      return false
    }
  }

  frame(now) {
    if ((window.devicePixelRatio || 1) !== this.ratio || this.canvas.offsetLeft + 'px' !== this.layer.style.left || this.canvas.offsetTop + 'px' !== this.layer.style.top) this.fit()
    if (!this.items.length && !this.arrange) return
    // Looked at on the second frame (the scene's first draw has happened) and now and then after.
    if (this.frames === 1 || (this.frames % LOOK_EVERY === 0 && this.frames)) {
      const blank = this.look()
      if (blank !== this.blank) { this.blank = blank; this.arrange = true }
    }
    this.frames++
    for (const item of this.items) if (item.frame) item.frame(now)
    const { g, ratio } = this
    if (this.arrange) {
      this.arrange = false
      this.stale.clear()
      this.layout()
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      g.clearRect(0, 0, this.W, this.H)
      if (this.blank && this.items.length) {
        g.fillStyle = typeof this.options.backdrop === 'string' && this.options.backdrop !== 'auto' ? this.options.backdrop : THEME.backdrop
        g.fillRect(0, 0, this.W, this.H)
      }
      for (const [x, y, w, h] of this.plates) {
        rounded(g, x, y, w, h, 12 * this.u)
        g.fillStyle = THEME.plate
        g.fill()
        g.strokeStyle = THEME.edge
        g.lineWidth = 1
        g.stroke()
      }
      for (const item of this.items) this.paint(item, false)
    } else if (this.stale.size) {
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      for (const item of this.stale) if (this.items.includes(item)) this.paint(item, true)
      this.stale.clear()
    }
    const beat = this.beats && this.armed
    if (this.listener && (this.told.length || this.played.length || this.made.length || beat)) {
      const told = this.told, played = this.played, made = this.made
      this.told = []; this.played = []; this.made = []
      if (beat) this.armed = false
      this.listener({ c: told, n: played, m: made, b: beat ? 1 : 0 })
    } else if (!this.listener) {
      this.told.length = this.played.length = this.made.length = 0
    }
  }
  /** Draw one control inside its own box; `again`: over what it drew before, so the plate goes back first. */
  paint(item, again) {
    if (!item.w || item.kind === 'row') return
    const g = this.g
    g.save()
    g.beginPath()
    g.rect(item.x, item.y, item.w, item.h)
    g.clip()
    if (again) { g.fillStyle = THEME.plate; g.fillRect(item.x, item.y, item.w, item.h) }
    item.draw(g, this.u)
    g.restore()
  }

  // --- pointers
  point(e) {
    const box = this.canvas.getBoundingClientRect()
    return {
      x: (e.clientX - box.left) * (this.W / (box.width || 1)), y: (e.clientY - box.top) * (this.H / (box.height || 1)),
      id: e.pointerId, shift: e.shiftKey, type: e.pointerType || 'mouse',
    }
  }
  /** The control at a point, the one made last on top. */
  under(x, y) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      if (item.w && x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h) return item
    }
    return null
  }
  pointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = this.point(e)
    const item = this.under(p.x, p.y)
    if (!item) return
    // The whole drag is this control's, wherever the pointer goes: off the control, off the canvas.
    e.preventDefault()
    try { this.canvas.setPointerCapture(e.pointerId) } catch (e2) { /* a pointer that has already gone */ }
    // One finger to a dial; a keyboard takes as many as land on it.
    if (item.held && !item.many) return
    const now = performance.now(), tap = this.tap
    this.tap = { item, at: now, x: p.x, y: p.y }
    if (item.reset && tap && tap.item === item && now - tap.at < DOUBLE_TAP_MS && Math.hypot(p.x - tap.x, p.y - tap.y) < DOUBLE_TAP_REACH * this.u) {
      this.tap = null
      item.reset()
      return
    }
    this.grabs.set(e.pointerId, item)
    item.held = true
    item.down(p)
  }
  pointerMove(e) {
    const item = this.grabs.get(e.pointerId)
    if (item) item.move(this.point(e))
  }
  pointerUp(e) {
    const item = this.grabs.get(e.pointerId)
    if (!item) return
    this.grabs.delete(e.pointerId)
    let still = false
    for (const other of this.grabs.values()) if (other === item) still = true
    item.held = still
    item.up(this.point(e))
  }
}

// --------------------------------------------------------------------------------------------
// What a scene calls. Each function reads its arguments the way they are most easily written.
/** A canvas keeps its panel under this name, so two copies of this file on one page share it. */
const PANEL = Symbol.for('dials.panel')

/** A dial or slider: (label, min, max, start, options), (label, target, "setting", options) or (label, options). */
function ranged(args) {
  let [label, a, b, c, d] = args
  if (typeof label !== 'string') { [a, b, c, d] = [label, a, b, c]; label = undefined }
  let spec
  if (typeof a === 'number' || typeof b === 'number') spec = typeof c === 'number' ? { ...d, min: a, max: b, value: c } : { ...c, min: a, max: b }
  else if (isTarget(a) && typeof b === 'string') spec = { ...c, target: a, param: b }
  else spec = { ...a }
  if (label !== undefined) spec.label = label
  return spec
}
/** A toggle: (label, on, options), (label, target, "setting", options). A function anywhere is its onChange. */
function toggled(args) {
  const [label, a, b, c] = args
  let spec
  if (isTarget(a) && typeof b === 'string') spec = { ...c, target: a, param: b }
  else if (typeof a === 'boolean') spec = { ...(isPlain(b) ? b : null), value: a }
  else spec = { ...(isPlain(a) ? a : null) }
  for (const arg of args) if (typeof arg === 'function' && arg !== spec.target) spec.onChange = arg
  spec.label = label
  return spec
}
/** A select: (label, choices, start, options), (label, target, "setting", options). */
function selected(args) {
  const [label, a, b, c] = args
  let spec
  if (Array.isArray(a)) spec = isPlain(b) ? { ...b, choices: a } : { ...c, choices: a, value: b }
  else if (isTarget(a) && typeof b === 'string') spec = { ...c, target: a, param: b }
  else spec = { ...a }
  spec.label = label
  return spec
}
/** A scope or meter: (source, options), ("label", source, options), (options) or nothing. */
function sourced(args) {
  let [label, source, options] = args
  if (typeof label !== 'string') { [source, options] = [label, source]; label = undefined }
  if (isPlain(source) && !method(source, 'samples', 'scope', 'level')) { options = source; source = undefined }
  const spec = { ...options, source }
  if (label !== undefined) spec.label = label
  return spec
}

function api(panel) {
  const make = (kind, read) => (...args) => panel.add(kind, read(args))
  return {
    dial: make('dial', ranged),
    slider: make('slider', ranged),
    toggle: make('toggle', toggled),
    select: make('select', selected),
    scope: make('scope', sourced),
    meter: make('meter', sourced),
    /** button("fire"), button("fire", onPress), button("fire", { onPress, onRelease }). */
    button: (label, a, b) => panel.add('button', typeof a === 'function' ? { ...b, label, onPress: a } : { ...a, label }),
    /** keyboard(target, { octave: 4 }), keyboard({ octave: 4 }) or keyboard(). */
    keyboard: (a, b) => panel.add('keyboard', isPlain(a) && !method(a, 'noteOn', 'note_on') ? { ...a } : { ...b, target: a }),
    label: (text, options) => panel.add('label', { ...options, label: String(text) }),
    /** The controls made after this start a new row. */
    row: () => panel.add('row', {}),
    /** How the rows are laid out: { at: "top" or "bottom", scale: 1.2, margin: 10, backdrop: true, false or a colour }. */
    layout: (options) => { Object.assign(panel.options, options); panel.arrange = true },
    /** Is a control at this point? A game asks before it treats a click as its own. */
    over: (x, y) => { if (typeof x === 'object') ({ x, y } = x); return !!panel.under(x, y) },
    theme: (colours) => theme(colours),
    /** Take every control away. */
    clear: () => { for (const item of [...panel.items]) panel.remove(item) },
    get all() { return [...panel.items] },
    panel,

    // --- for a host that keeps the scene's code somewhere else (Python): controls by number
    make: (kind, id, spec) => {
      const item = panel.add(kind, { ...spec, id })
      // What it took from a target in the page (its range, its choices, where it stands) is told to the host.
      if (item.target && item.param != null) panel.made.push(id, item.min ?? 0, item.max ?? 1, item.default ?? 0, (item.choices || []).join('|'), item.i ?? item.v)
    },
    set: (id, name, value) => { const item = panel.find(id); if (item) { item[name] = value; item.touch(); if (name === 'label') panel.arrange = true } },
    call: (id, name, ...args) => { const item = panel.find(id); if (item && typeof item[name] === 'function') item[name](...args) },
    drop: (id) => { const item = panel.find(id); if (item) panel.remove(item) },
    /** What was changed by hand is handed over once a frame: { c: [id, value, …], n: [keyboard id, note, velocity, …] }. */
    listen: (fn) => { panel.listener = fn },
    /** A host that feeds scopes and meters is called every frame instead, once it has answered the last call with ack(). */
    beat: (on) => { panel.beats = on !== false; panel.armed = true },
    ack: () => { panel.armed = true },
  }
}

/** The controls of one canvas: `const { dial, slider } = dials(canvas)`. With no canvas, the page's only one. */
function dials(canvas, options) {
  if (canvas && !(typeof canvas.getBoundingClientRect === 'function')) { options = canvas; canvas = null }
  canvas ||= onlyCanvas()
  let panel = canvas[PANEL]
  // `fresh`: a new run of the scene on a canvas that was kept starts with no controls.
  if (panel && options && options.fresh) { panel.close(); panel = null }
  if (!panel) {
    panel = canvas[PANEL] = new Panel(canvas)
    panel.api = api(panel)
  }
  if (options) {
    const { fresh, ...rest } = options
    panel.api.layout(rest)
  }
  return panel.api
}
function onlyCanvas() {
  const found = [...document.querySelectorAll('canvas')].filter((c) => c.dataset.dialsLayer === undefined)
  if (found.length === 1) return found[0]
  throw new Error(found.length
    ? 'There is more than one canvas on this page, so say which one the controls are for: const { dial, slider } = dials(canvas)'
    : 'There is no canvas on this page to put controls on')
}

/** Change the colours: theme({ accent: "deepskyblue" }). The names are those of THEME. */
function theme(colours) {
  Object.assign(THEME, colours)
  for (const c of document.querySelectorAll('canvas')) if (c[PANEL]) c[PANEL].arrange = true
  return THEME
}

// The same functions with no canvas named: for a page (and a pictures.js scene) with one canvas.
const dial = (...args) => dials().dial(...args)
const slider = (...args) => dials().slider(...args)
const button = (...args) => dials().button(...args)
const toggle = (...args) => dials().toggle(...args)
const select = (...args) => dials().select(...args)
const keyboard = (...args) => dials().keyboard(...args)
const scope = (...args) => dials().scope(...args)
const meter = (...args) => dials().meter(...args)
const label = (...args) => dials().label(...args)
const row = () => dials().row()
const layout = (options) => dials().layout(options)
const over = (x, y) => dials().over(x, y)

export { dials, dial, slider, button, toggle, select, keyboard, scope, meter, label, row, layout, over, theme, version }
