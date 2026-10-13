/**
 * dials.js: dials, sliders, buttons, a piano keyboard, a scope and meters to put on a scene.
 *
 *   const { dial, slider, keyboard, scope } = await use("dials.js")     (a pictures.js scene)
 *   import { dial, slider, keyboard, scope } from "./dials.js"          (any page with one canvas)
 *
 *   const speed = dial("speed", 0, 10)        a number to read: speed.value (or speed * dt)
 *   dial("cutoff", lead, "filter_cutoff")     the dial IS that setting of `lead`: turning it sets it
 *   rotary("wave", lead, "wave")              a knob that clicks between a few choices
 *   keyboard(lead, { octave: 4 })             piano keys, played by finger, mouse and computer keys
 *   scope(lead)                               the wave `lead` is making, live
 *
 * NOTHING IS POSITIONED BY HAND unless you want it. Controls line up in the order they are made, on
 * plates that share a width; the keyboard sits along the bottom; what does not fit scrolls; and
 * everything is laid out again when the picture changes size.
 *
 *   group("filter", () => { dial(…); dial(…) })     a titled plate that keeps its controls together
 *   row(…), column(…), grid(3, …), spacer()         how the controls inside one are arranged
 *   page("fx")                                      a page of plates, turned to with a tab
 *   group("moves", { at: "left" }, …), room()       a strip along an edge, and the rectangle left over
 *   layout({ wrap: false }), layout({ columns: 3 })  rows kept as written and drawn to fit; so many plates to a line
 *   layout({ size: [800, 480] }), { x, y }          a panel of a set size on every screen; exactly where you say
 *
 * THE CONTROLS ARE DRAWN ON A CANVAS OF THEIR OWN, laid exactly over the scene's. So they sit on
 * top of whatever the scene draws, 2D or 3D, need no call in draw(), and cost the scene nothing:
 * only a control that changed is drawn again. Pointers are heard on the scene's own canvas.
 *
 * A TARGET is anything a control can set. No library is named here: a target is known by what
 * it can do, and all of it is optional.
 *
 *   set(name, value), get(name)     else the control reads and writes target[name]
 *   onChange(fn)                    fn(name) is called when what describe(name) says has changed (a list of devices
 *                                   that grew): the control asks again. It may give back a function that stops it
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
const SPELLING = { color: 'colour', on_change: 'onChange', on_press: 'onPress', on_release: 'onRelease', on_note_on: 'onNoteOn', on_note_off: 'onNoteOff', title: 'label', on_enter: 'onEnter' }
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
  // A value the target has a name for (0 that means "auto") is shown by its name.
  if (c.labels) for (const at in c.labels) if (Math.abs(Number(at) - value) <= Math.abs(c.max - c.min) * 1e-9) return String(c.labels[at])
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
    // In a line it takes this share of the room left over; in a grid it covers this many columns.
    this.share = spec.share
    this.across = spec.span
    this.box = null // the group it is in
    this.x = this.y = this.w = this.h = 0
    this.u = 1 // the scale it is drawn at
    this.held = false
  }
  get accent() {
    if (this.colour) return this.colour
    for (let box = this.box; box; box = box.box) if (box.colour) return box.colour
    return THEME.accent
  }
  /** `size: "small"` and `"large"` draw it smaller and larger; a dial, slider and meter read `size` themselves. */
  scaleOf() { return typeof this.size === 'number' && this.size <= SIZE_TIMES ? this.size : this.size === 'small' ? 0.85 : this.size === 'large' ? 1.25 : 1 }
  /** How far it may be narrowed and widened to fit its line, as parts of its natural width. */
  stretch() { return [1, 1] }
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
    this.spec = spec
    this.format = spec.format || null
    this.range(d)
    const now = spec.value ?? (this.target ? readTarget(this.target, this.param) : undefined)
    this.default = spec.default ?? d.default ?? (typeof now === 'number' ? now : this.min)
    this.v = this.clean(typeof now === 'number' ? now : this.default)
    this.pos = this.toPos(this.v)
    if (spec.value != null && this.target) writeTarget(this.target, this.param, this.v)
  }
  /** Its range, step and unit: what the scene gave, else what the target says of the setting. */
  range(d) {
    const spec = this.spec
    this.min = spec.min ?? d.min ?? 0
    this.max = spec.max ?? d.max ?? 1
    this.step = spec.step ?? d.step ?? (d.kind === 'int' ? 1 : 0)
    this.unit = unitOf(spec.unit ?? d.unit ?? '')
    this.digits = spec.digits ?? d.digits
    // A pitch is turned by ratio, not by amount: half the dial is 20 to 200 Hz, not 20 to 10,000.
    this.log = this.min > 0 && this.max > this.min &&
      (spec.log ?? d.log ?? (d.curve === 'log' || (this.unit === 'Hz' && this.max / this.min >= 100)))
    // Turned by ratio from 0: 0 is the bottom of the dial, and just above it the dial starts at `logFrom`
    // (the smallest value worth turning to: a thousandth of the top, unless said) and goes on by ratio.
    this.from = 0
    if (this.min === 0 && this.max > 0 && (spec.log ?? d.log ?? d.curve === 'log')) {
      this.log = true
      this.from = spec.logFrom ?? d.logFrom ?? d.log_from ?? this.max / 1000
    }
    this.labels = spec.labels ?? d.labels ?? null
    if (typeof d.format === 'function' && !this.format) this.format = d.format
  }
  /** The target says the setting is not what it was (another range, another unit): it is asked again. */
  refresh() {
    const d = describe(this.target, this.param)
    this.range(d)
    this.default = this.spec.default ?? d.default ?? this.default
    const now = readTarget(this.target, this.param)
    this.v = this.clean(typeof now === 'number' ? now : this.v)
    this.pos = this.toPos(this.v)
  }
  clean(value) {
    value = clamp(Number(value) || 0, Math.min(this.min, this.max), Math.max(this.min, this.max))
    if (this.step) value = Number((this.min + Math.round((value - this.min) / this.step) * this.step).toFixed(decimals(this.step)))
    return value
  }
  toPos(value) {
    if (this.max === this.min) return 0
    if (this.from) return value < this.from ? (value <= 0 ? 0 : ZERO_PART * value / this.from) : ZERO_PART + (1 - ZERO_PART) * Math.log(value / this.from) / Math.log(this.max / this.from)
    return this.log ? Math.log(value / this.min) / Math.log(this.max / this.min) : (value - this.min) / (this.max - this.min)
  }
  fromPos(pos) {
    // The first little part of the turn is 0 itself, so that 0 is easy to find and to stay on.
    if (this.from) return pos < ZERO_PART ? 0 : this.from * Math.pow(this.max / this.from, (pos - ZERO_PART) / (1 - ZERO_PART))
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

/** Of a dial turned by ratio from 0, this much of the turn at the bottom is 0 itself. */
const ZERO_PART = 0.04

/** A size given as a number, or by name. */
const sized = (size, small, usual, large) => (typeof size === 'number' ? (size <= SIZE_TIMES ? usual * size : size) : size === 'small' ? small : size === 'large' ? large : usual)
/** A size no bigger than this is so many times the usual size (`size: 1.5`); a bigger number is points across. */
const SIZE_TIMES = 4

/** How far a finger travels to take a dial from one end to the other, in points. */
const DIAL_TRAVEL = 180
/** Further than this from the dial, the same travel turns it a quarter as much: pull away to be exact. */
const DIAL_FINE_AT = 140

class Dial extends Ranged {
  scaleOf() { return 1 }
  /** The room at a dial's sides can be given up before its line has to wrap. */
  stretch() { return [0.86, 1] }
  natural(u) {
    const across = sized(this.size, 36, 48, 64) * u
    return [Math.max(76 * u, across + 26 * u), across + 50 * u]
  }
  down(p) { this.last = { x: p.x, y: p.y }; this.touch() }
  move(p) {
    // Up or to the right turns it up. Each step is taken on its own, so Shift may be pressed part way.
    const u = this.u
    const travel = (this.last.y - p.y) + (p.x - this.last.x)
    this.last.x = p.x; this.last.y = p.y
    const away = Math.hypot(p.x - (this.x + this.w / 2), p.y - (this.y + this.h / 2))
    const fine = p.shift ? 0.1 : away > DIAL_FINE_AT * u ? 0.25 : 1
    this.slide(this.pos + travel / (DIAL_TRAVEL * u) * fine)
  }
  draw(g, u) {
    // The label is at the top of its box and the value at the bottom, so those of a big dial and a small one beside it line up.
    const cx = this.x + this.w / 2, cy = this.y + 20 * u + (this.h - 40 * u) / 2
    const r = sized(this.size, 36, 48, 64) * u / 2
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
  scaleOf() { return 1 }
  natural(u) {
    const long = (this.vertical ? sized(this.size, 80, 110, 150) : sized(this.size, 100, 150, 220)) * u
    return this.vertical ? [58 * u, long + 56 * u] : [long + 28 * u, 56 * u]
  }
  /** A slider that lies across gives and takes room: narrower before its line wraps, wider when there is room. */
  stretch() { return this.vertical || typeof this.size === 'number' ? [1, 1] : [0.8, 1.6] }
  /** The track: where it starts (the low end), and how long it is. */
  track(u) {
    return this.vertical ? { from: this.y + this.h - 30 * u, long: this.h - 56 * u } : { from: this.x + 14 * u, long: this.w - 28 * u }
  }
  along(p, u) {
    const t = this.track(u)
    return this.vertical ? (t.from - p.y) / t.long : (p.x - t.from) / t.long
  }
  down(p) {
    const u = this.u
    const here = this.along(p, u)
    // On the handle: it is dragged from where it is. Anywhere else on the track: it comes to the finger.
    if (Math.abs(here - this.pos) * this.track(u).long > 22 * u) this.slide(here)
    this.last = { x: p.x, y: p.y }
    this.touch()
  }
  move(p) {
    const travel = this.vertical ? this.last.y - p.y : p.x - this.last.x
    this.last.x = p.x; this.last.y = p.y
    this.slide(this.pos + travel / this.track(this.u).long * (p.shift ? 0.1 : 1))
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
    this.aliases = d.aliases || null
    this.i = Math.max(0, this.placeOf(now))
    this.default = this.i
  }
  /**
   * Which of the choices a target means, however it says it: by its place in the list, by its name (in any
   * case, or by another name the target says it answers to: `describe().aliases`, { sawtooth: "saw" }), or,
   * of two choices, by false and true. -1 if it is none of them.
   */
  placeOf(said) {
    const n = this.choices.length
    if (typeof said === 'boolean') return n === 2 ? Number(said) : -1
    if (typeof said === 'number' && !this.choices.includes(said)) return Number.isFinite(said) && Math.round(said) >= 0 && Math.round(said) < n ? Math.round(said) : -1
    let i = this.choices.indexOf(said)
    if (i < 0 && typeof said === 'string') {
      const low = said.toLowerCase()
      i = this.choices.findIndex((choice) => String(choice).toLowerCase() === low)
      if (i < 0 && this.aliases) for (const other in this.aliases) if (other.toLowerCase() === low) i = this.choices.indexOf(this.aliases[other])
    }
    return i
  }
  /**
   * The target says its choices are not what they were (a device was plugged in, or taken out): they are
   * asked for again. The choice it is on is kept if it is still one of them; if not, it is whatever the
   * target says it is on now.
   */
  refresh() {
    const d = describe(this.target, this.param), was = this.value
    if (d.choices) this.choices = [...d.choices]
    this.aliases = d.aliases || null
    let i = this.choices.indexOf(was)
    if (i < 0) i = this.placeOf(readTarget(this.target, this.param))
    this.i = Math.max(0, i)
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
  stretch() { return [0.88, 1] }
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
    // Changed some other way (the scene's code, a song): the control follows, and says nothing back to the target.
    const i = this.placeOf(readTarget(this.target, this.param))
    if (i >= 0 && i !== this.i) { this.i = i; this.touch() }
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

/** A rotary with this many choices or fewer has their names written round it; with more, only the one it is on is named, under it. */
const ROTARY_NAMED = 8
/** How far a finger travels from one notch to the next, in points: no less and no more than these, whatever the number of choices. */
const NOTCH_LEAST = 26
const NOTCH_MOST = 60
/** A finger that moved less than this, in points, tapped: on a notch or a name, the knob goes there. */
const TAP_REACH = 6

/**
 * THE ROTARY: a knob that clicks between a few fixed places, as the one on a real synth that picks a
 * waveform or a kind of reverb does. It is a select drawn another way: `value` is the choice, `index`
 * its place. Turn it by dragging (it holds at each notch until the finger has gone far enough for the
 * next, then clicks over), or tap a notch or a name to go straight there. Two taps put it back.
 */
class Rotary extends Select {
  scaleOf() { return 1 }
  stretch() { return [0.9, 1] }
  get knob() { return sized(this.size, 36, 48, 64) }
  /** Are the names written round the knob? Not round a small one, and not when there are too many to read. */
  get named() { return this.choices.length >= 2 && this.choices.length <= ROTARY_NAMED && this.knob >= 44 }
  /** The most room a name is given at the knob's side, in points before scaling: a bigger knob shows more of each. */
  get nameRoom() { return this.knob >= 60 ? 72 : 38 }
  natural(u, room, g) {
    const across = this.knob * u
    this.side = 0
    if (this.named) {
      g.font = `${10 * u}px ${THEME.font}`
      for (const choice of this.choices) this.side = Math.max(this.side, g.measureText(String(choice)).width)
      this.side = Math.min(this.side, this.nameRoom * u) + 8 * u
    }
    // With the names round it, the one it is on is lit there: it is not written again underneath.
    return [Math.max(76 * u, across + 26 * u + 2 * this.side), across + (this.named ? 60 : 50) * u]
  }
  /** Where notch i is round the knob: an angle, from lower left round the top to lower right. */
  angle(i) {
    const n = this.choices.length
    return TAU * 0.375 + TAU * 0.75 * (n > 1 ? i / (n - 1) : 0.5)
  }
  /** The middle of the knob: a little lower when names are written round it, to leave room for the one at the top. */
  centre(u) { return [this.x + this.w / 2, this.y + (this.named ? 28 : 20) * u + (this.h - (this.named ? 42 : 40) * u) / 2] }
  go(i) {
    i = clamp(i, 0, this.choices.length - 1)
    if (i === this.i) return
    this.i = i
    this.changed(this.choices[i])
  }
  reset() { this.lean = 0; this.go(this.default) }
  down(p) {
    this.last = { x: p.x, y: p.y }
    this.gone = 0 // how far the finger has moved in all: very little is a tap
    this.pulled = 0 // how far it has gone toward the next notch
    this.touch()
  }
  move(p) {
    const u = this.u, n = this.choices.length
    const travel = (this.last.y - p.y) + (p.x - this.last.x)
    this.gone += Math.hypot(p.x - this.last.x, p.y - this.last.y)
    this.last.x = p.x; this.last.y = p.y
    if (n < 2) return
    // It holds at a notch until the finger is most of the way to the next, then clicks over to it.
    const notch = clamp(DIAL_TRAVEL / (n - 1), NOTCH_LEAST, NOTCH_MOST) * u
    this.pulled += travel
    while (this.pulled > notch * 0.6 && this.i < n - 1) { this.pulled -= notch; this.go(this.i + 1) }
    while (this.pulled < -notch * 0.6 && this.i > 0) { this.pulled += notch; this.go(this.i - 1) }
    this.pulled = clamp(this.pulled, this.i > 0 ? -notch * 0.6 : 0, this.i < n - 1 ? notch * 0.6 : 0)
    // Between clicks the pointer leans a little the way it is being pulled: that is the feel of the detent.
    this.lean = this.pulled / notch * 0.3
    this.touch()
  }
  up(p) {
    this.lean = 0
    if (this.gone < TAP_REACH * this.u) {
      // A tap on a name goes to it; a tap on the ring of notches goes to the nearest.
      const u = this.u, [cx, cy] = this.centre(u), r = this.knob * u / 2
      const name = (this.names || []).find((at) => p.x >= at.x && p.x < at.x + at.w && p.y >= at.y - 8 * u && p.y < at.y + 8 * u)
      const far = Math.hypot(p.x - cx, p.y - cy)
      if (name) this.go(name.i)
      else if (far > r * 0.55 && far < r + 16 * u && this.choices.length > 1) {
        const turn = ((Math.atan2(p.y - cy, p.x - cx) - TAU * 0.375) % TAU + TAU) % TAU
        if (turn <= TAU * 0.75 + 0.3 || turn >= TAU - 0.3) this.go(Math.round(clamp(turn > TAU * 0.875 ? 0 : turn / (TAU * 0.75), 0, 1) * (this.choices.length - 1)))
      }
    }
    this.touch()
  }
  draw(g, u) {
    const n = this.choices.length, [cx, cy] = this.centre(u), r = this.knob * u / 2
    words(g, this.label, cx, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    g.fillStyle = this.held ? THEME.track : THEME.knob
    g.beginPath(); g.arc(cx, cy, r - 7 * u, 0, TAU); g.fill()
    // The notches, the one it is on lit; and the names beside them, where there is room.
    this.names = []
    g.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const a = this.angle(i), on = i === this.i, c = Math.cos(a), sn = Math.sin(a)
      g.strokeStyle = on ? this.accent : THEME.track
      g.lineWidth = (on ? 3.5 : 2.5) * u
      g.beginPath(); g.moveTo(cx + c * (r - 3 * u), cy + sn * (r - 3 * u)); g.lineTo(cx + c * (r + 3 * u), cy + sn * (r + 3 * u)); g.stroke()
      if (!this.named) continue
      // Left of the knob a name ends at its notch, right of it a name starts there, and at the top it is centred.
      const side = Math.abs(c) < 0.25 ? 'center' : c < 0 ? 'right' : 'left'
      const most = side === 'center' ? this.w - 8 * u : this.side - 6 * u
      const text = String(this.choices[i]), tx = cx + c * (r + 8 * u), ty = cy + sn * (r + 9 * u)
      g.font = `${on ? '600 ' : ''}${10 * u}px ${THEME.font}`
      const wide = Math.min(most, g.measureText(text).width)
      words(g, text, tx, ty, 10 * u, on ? THEME.text : THEME.dim, side, on ? '600' : '', most)
      this.names.push({ i, x: side === 'left' ? tx : side === 'right' ? tx - wide : tx - wide / 2, y: ty, w: wide, whole: wide < most - 0.01 || g.measureText(text).width <= most + 0.01 })
    }
    const a = this.angle(this.i) + (this.lean || 0) * (n > 1 ? TAU * 0.75 / (n - 1) : 0)
    g.strokeStyle = THEME.text
    g.lineWidth = 3 * u
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * (r - 18 * u), cy + Math.sin(a) * (r - 18 * u))
    g.lineTo(cx + Math.cos(a) * (r - 9 * u), cy + Math.sin(a) * (r - 9 * u))
    g.stroke()
    if (!this.named) words(g, String(this.value ?? ''), cx, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '600', this.w - 6 * u)
  }
}

/** Words. Made just before some controls, it is their heading: the title of the plate they are on. */
class Label extends Control {
  get value() { return this.label }
  set value(text) { this.label = String(text); this.panel.arrange = true }
  natural(u, room, g) {
    g.font = `600 ${(this.heading ? 13 : 14) * u}px ${THEME.font}`
    return [g.measureText(this.label).width + (this.heading ? 14 : 20) * u, 30 * u]
  }
  draw(g, u) {
    if (this.heading) words(g, this.label, this.x + 6 * u, this.y + this.h / 2, 13 * u, this.colour || THEME.text, 'left', '600', this.w - 8 * u)
    else words(g, this.label, this.x + 10 * u, this.y + this.h / 2, 14 * u, this.colour || THEME.text, 'left', '600')
  }
}

/** Not drawn: room between controls. `spacer(20)` is that many points; `spacer()` takes whatever room is left over. */
class Spacer extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.ghost = true
    if (typeof this.size !== 'number' && this.share == null) this.share = 1
  }
  natural(u) {
    const long = typeof this.size === 'number' ? this.size * u : 0
    return [long, long]
  }
}

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
/**
 * THE KEYBOARD IS THE INSTRUMENT: it is this tall, in points, and is the last thing to give way. Only where the
 * plates above it could hardly be seen (a phone on its side) is it KEYS_LEAST; on a panel with height to
 * spare it is as much as KEYS_MOST. `keyboard(lead, { height })` is kept to, whatever the room.
 */
const KEYS_TALL = 150
const KEYS_LEAST = 116
const KEYS_MOST = 190
/** A scope made outside any group is this tall; short of room, no less than SCOPE_LEAST, which is still tall enough to read a wave. */
const SCOPE_TALL = 104
const SCOPE_LEAST = 56
/** A picture shorter than this, in points, is a phone on its side: only there may the scope be put away altogether. */
const SHORT_VIEW = 480
/** A white key is never narrower than this, in points: with a mouse, and under a finger. Fewer octaves are shown instead. */
const KEY_LEAST = 14
const KEY_LEAST_FINGER = 22
/** How long the keys take to slide to a new octave, in milliseconds; an arrow held down steps again after the first wait, then at each of the next. */
const KEY_SLIDE_MS = 220
const KEY_HOLD_MS = 450
const KEY_AGAIN_MS = 240
/** Someone who has asked their computer for less movement gets none: the keys jump. */
const stillness = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { return false } }
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
    this.many = true
    this.animate = spec.animate !== false
    this.slid = null // the keys sliding to a new octave: { from: how far across they started, at: when }
    this.pull = null // a finger on the strip above the keys, dragging them sideways
    this.arrow = null // an arrow held down: it steps again and again
  }
  /** Made outside any group, and not placed by hand, it lies along the bottom. */
  get docked() { return !this.box && !this.at }
  /** The octave of the lowest key: 4 starts at middle C. */
  get octave() { return this.first }
  set octave(n) {
    n = clamp(Math.round(n), 0, 8)
    if (n === this.first) return
    this.release()
    // The keys slide to the new octave: they start where they were, which is so many octaves across from where they will be.
    const across = this.offset + (n - this.first) * 7 * (this.w / (7 * this.span(this.u) + 1) || 0)
    this.first = n
    this.pull = null
    this.slid = this.animate && across && !stillness() ? { from: across, at: performance.now() } : null
    this.touch()
  }
  /** How far across the keys are drawn from where they belong, in points: not 0 only while they slide or are dragged. */
  get offset() {
    if (this.pull) return this.pull.by
    if (!this.slid) return 0
    const t = (performance.now() - this.slid.at) / KEY_SLIDE_MS
    return t >= 1 ? 0 : this.slid.from * Math.pow(1 - t, 3)
  }
  get value() { return this.first }
  set value(n) { this.octave = n }
  /** The notes held on it now, lowest first. */
  get notes() { return [...this.count.keys()].sort((a, b) => a - b) }
  get low() { return 12 * (this.first + 1) }
  /** How many octaves are shown: as many as asked for, but never so many that a key is too narrow to play. */
  span(u) {
    const playable = Math.max(1, Math.floor(this.w / (7 * (this.panel.coarse ? KEY_LEAST_FINGER : KEY_LEAST) * u)))
    return this.octaves ? Math.min(this.octaves, playable) : clamp(Math.floor(this.w / (7 * 34 * u)), 1, 4)
  }
  natural(u, room) {
    // Short of room, it gives up some of its height before the controls above it have to be moved to be seen.
    if (!this.box || this.at) return [this.wide ? this.wide * u : room, (this.tall || (this.at ? KEYS_TALL : (this.panel.squeeze >= 2 ? KEYS_LEAST : KEYS_TALL) + (this.panel.keysMore || 0))) * u]
    return [this.wide ? this.wide * u : Math.min(room, 7 * 30 * (this.octaves || 2) * u), (this.tall || 130) * u]
  }
  stretch() { return this.wide || !this.box ? [1, 1] : [0.6, Infinity] }
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
    const strip = (this.panel.coarse ? 30 : 22) * u
    const whites = 7 * this.span(u) + 1
    return { strip, top: this.y + strip, tall: this.h - strip, whites, each: this.w / whites }
  }
  /** The note at a point and how hard it is struck there (lower on the key is harder), or null. */
  noteAt(p, u) {
    const s = this.shape(u)
    if (p.x < this.x || p.x >= this.x + this.w || p.y < s.top || p.y > this.y + this.h) return null
    // Where the keys are drawn now: while they slide, the key under the finger is the one played.
    const across = (p.x - this.x - this.offset) / s.each
    const white = Math.floor(across)
    const of = (i) => this.low + 12 * Math.floor(i / 7) + WHITE[((i % 7) + 7) % 7]
    const hard = clamp(0.35 + 0.65 * (p.y - s.top) / s.tall, 0.35, 1)
    let note = of(white), struck = hard
    if (p.y < s.top + s.tall * 0.62) {
      // A black key lies over the join between two white ones.
      const join = Math.round(across)
      if (Math.abs(across - join) < 0.3 && IS_BLACK[(((of(join - 1) + 1) % 12) + 12) % 12] && (this.offset || (join > 0 && join < s.whites))) {
        note = of(join - 1) + 1
        struck = clamp(0.35 + 0.65 * (p.y - s.top) / (s.tall * 0.62), 0.35, 1)
      }
    }
    return note >= 0 && note <= 127 ? { note, hard: struck } : null
  }
  down(p) {
    const u = this.u, s = this.shape(u)
    if (p.y < s.top) {
      // The strip: its left end steps down an octave, its right end up, again and again while it is held.
      // A finger on the rest of it drags the keys sideways, and they settle on a whole octave when it lifts.
      const by = p.x < this.x + 64 * u ? -1 : p.x > this.x + this.w - 64 * u ? 1 : 0
      if (by) { this.arrow = { id: p.id, by, next: performance.now() + KEY_HOLD_MS }; this.step(by) }
      else if (!this.pull) this.pull = { id: p.id, from: p.x, by: this.offset }
      this.slid = by ? this.slid : null
      return
    }
    const at = this.noteAt(p, u)
    if (!at) return
    this.fingers.set(p.id, at.note)
    this.press(at.note, at.hard)
  }
  move(p) {
    if (this.pull && this.pull.id === p.id) {
      // No further than the lowest and the highest octave there is.
      const octave = 7 * this.shape(this.u).each
      this.pull.by = clamp(p.x - this.pull.from, (this.first - 8) * octave, this.first * octave)
      this.touch()
      return
    }
    if (!this.fingers.has(p.id)) return
    const was = this.fingers.get(p.id)
    const at = this.noteAt(p, this.u)
    const now = at ? at.note : null
    if (now === was) return
    // Sliding to the next key: the new one sounds before the old one stops, as fingers do.
    if (now != null) this.press(now, at.hard)
    if (was != null) this.release(was)
    this.fingers.set(p.id, now)
  }
  up(p) {
    if (this.arrow && this.arrow.id === p.id) this.arrow = null
    if (this.pull && this.pull.id === p.id) {
      // Let go: the keys settle on the nearest whole octave.
      const by = this.pull.by, octave = 7 * this.shape(this.u).each
      const next = clamp(this.first - Math.round(by / octave), 0, 8), was = this.first
      this.pull = null
      if (next !== was) { this.release(); this.first = next; this.panel.told.push(this.id, next) }
      const across = by + (next - was) * octave
      this.slid = this.animate && across && !stillness() ? { from: across, at: performance.now() } : null
      this.touch()
      return
    }
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
    // Cheap when nothing moves: only a keyboard that is sliding, or whose arrow is held, is drawn again.
    if (this.slid) { if (performance.now() - this.slid.at >= KEY_SLIDE_MS) this.slid = null; this.touch() }
    if (this.arrow && performance.now() >= this.arrow.next) { this.arrow.next = performance.now() + KEY_AGAIN_MS; this.step(this.arrow.by) }
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
    // The keys, where they are now: across by `offset` while they slide, with those coming in from the side drawn too.
    const offset = this.offset
    const from = offset ? Math.floor(-offset / s.each) - 1 : 0, to = offset ? from + s.whites + 2 : s.whites
    const of = (i) => low + 12 * Math.floor(i / 7) + WHITE[((i % 7) + 7) % 7]
    for (let i = from; i < to; i++) {
      const note = of(i)
      if (note < 0 || note > 127) continue
      const x = this.x + offset + i * s.each
      g.fillStyle = lit(note) || THEME.white
      rounded(g, x + 1, s.top, s.each - 2, s.tall, 4 * u)
      g.fill()
      const hint = hints && !offset && KEY_HINTS[note - low]
      if (hint) words(g, hint, x + s.each / 2, s.top + s.tall - 13 * u, 11 * u, '#7b8190')
      else if (((i % 7) + 7) % 7 === 0 && s.each >= 18 * u) words(g, `C${this.first + Math.floor(i / 7)}`, x + s.each / 2, s.top + s.tall - 13 * u, 10 * u, '#7b8190')
    }
    const wide = s.each * 0.58, tall = s.tall * 0.62
    for (let i = from; i < to - 1; i++) {
      const note = of(i) + 1
      if (note < 0 || note > 127 || !IS_BLACK[note % 12]) continue
      const x = this.x + offset + (i + 1) * s.each - wide / 2
      g.fillStyle = lit(note) || THEME.black
      rounded(g, x, s.top, wide, tall, 3 * u)
      g.fill()
      const hint = hints && !offset && KEY_HINTS[note - low]
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
    // Made outside any group it is as wide as the picture; when there is more than fits, it gives up height first.
    const tall = (this.tall || (this.full && this.panel.squeeze ? SCOPE_LEAST : SCOPE_TALL)) * u
    if (this.wide) return [this.wide * u, tall]
    return [this.full || this.at ? room : Math.min(room, 220 * u), tall]
  }
  stretch() { return this.wide ? [1, 1] : [0.55, Infinity] }
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
  scaleOf() { return 1 }
  natural(u) {
    const long = sized(this.size, 70, 110, 160) * u
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

const KINDS = { dial: Dial, slider: Slider, button: Button, toggle: Toggle, select: Select, rotary: Rotary, label: Label, keyboard: Keyboard, scope: Scope, meter: Meter, spacer: Spacer }

// --------------------------------------------------------------------------------------------
/**
 * A BOX holds controls, and other boxes, and says how they are arranged:
 *
 *   group    a plate with a title; its controls stand in a line, which wraps evenly when it must
 *   row      the same with no plate of its own; made with nothing in it, `row()` only starts a new line
 *   column   one under another
 *   grid     so many to a line, in columns that line up
 *   page     a set of plates shown one page at a time, turned to with a tab
 *
 * A box is filled either by a function (`group("filter", () => { … })`: what is made in the function
 * is in the group) or in a straight line (`group("filter")`: what is made next is in the group, until
 * the next group, row or page). `enter()` and `leave()` are the two ends of the function, for a host
 * that has no function to pass (Python's `with group("filter"):`).
 */
const BOXES = ['group', 'row', 'column', 'grid', 'page']
const EDGES = ['left', 'right', 'top', 'bottom']
/** The widths, in points, that `layout({ columns: { phone: 1, tablet: 2, wide: 3 } })` names: from this width up. */
const WIDTHS = { phone: 0, narrow: 0, tablet: 600, wide: 900, desktop: 1200 }

class Box {
  constructor(panel, kind, spec) {
    this.panel = panel
    this.kind = kind
    this.id = spec.id ?? panel.nextId++
    this.label = spec.label != null ? String(spec.label) : ''
    this.items = []
    this.heading = null // a label() made just before its controls
    this.open = null // the box inside this one that is being filled in a straight line
    this.entered = false
    this.implicit = !!spec.implicit // made by the panel, for controls that were given no group
    this.full = !!spec.full
    this.columns = spec.columns
    this.share = spec.share
    this.across = spec.span
    this.dock = EDGES.includes(spec.at) ? spec.at : null
    this.at = spec.x != null || spec.y != null ? { x: spec.x ?? 0, y: spec.y ?? 0 } : null
    this.wide = spec.width
    this.tall = spec.height
    this.plate = spec.plate
    this.colour = spec.colour || null
    this.dividers = spec.dividers
    this.gap = spec.gap
    this.align = spec.align
    this.wrap = spec.wrap // false: what is in it stays on one line, whatever the width
    this.soft = !!spec.soft // a row() that is only a place to end a line if a line has to end
    this.box = null
    this.x = this.y = this.w = this.h = 0
    this.m = null
  }
  get title() { return this.label }
  set title(text) { this.label = String(text); this.panel.arrange = true }
  get value() { return this.label }
  set value(text) { this.title = text }
  /** Is this the page on show? */
  get shown() { return this.panel.shown === this }
  /** Turn to this page. */
  show() { this.panel.show(this) }
  enter() { this.panel.enter(this); return this }
  leave() { this.panel.leave(this) }
  touch() { this.panel.arrange = true }
  remove() { this.panel.remove(this) }
  place(x, y) {
    this.at = x == null ? null : { x, y: y ?? 0 }
    this.panel.arrange = true
  }
}

/** A row with nothing put in it by a function is not a box at all: it is where a new line starts. */
const isBreak = (node) => node.kind === 'row' && !!node.items && !node.entered

/**
 * Cut a run of things into lines no wider than `limit`. As few lines as will do; then the widest of them
 * as narrow as it can be, so six dials that do not fit are 3 + 3 and never 5 + 1; then, of ways about as
 * good, one that ends its lines where the scene's code did (`ends`: the places a row() was written), and
 * the most even. A line is counted as fitting when it would with everything in it made as narrow as it
 * goes (`m.min`).
 */
function wrapLines(kids, limit, between, ends) {
  const n = kids.length
  const span = (i, j, key) => {
    let sum = 0
    for (let a = i; a < j; a++) sum += kids[a].m[key] + (a > i ? between(kids[a - 1], kids[a]) : 0)
    return sum
  }
  let count = 1
  for (let from = 0, j = 2; j <= n; j++) if (span(from, j, 'min') > limit + 0.5) { count++; from = j - 1 }
  let cuts = [0, n]
  if (count > 1) {
    // Widths are compared in steps of a twentieth of the room: a few points either way are not worth an odd break.
    const step = Math.max(1, limit / 20)
    const better = (a, b) => !b || (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] <= b[2])
    const best = Array.from({ length: count + 1 }, () => new Array(n + 1).fill(null))
    const back = Array.from({ length: count + 1 }, () => new Array(n + 1).fill(0))
    best[0][0] = [0, 0, 0]
    for (let l = 1; l <= count; l++) {
      for (let j = l; j <= n; j++) {
        for (let i = l - 1; i < j; i++) {
          const before = best[l - 1][i]
          if (!before || (j - i > 1 && span(i, j, 'min') > limit + 0.5)) continue
          const wide = span(i, j, 'w')
          const cost = [Math.max(before[0], Math.ceil(wide / step)), before[1] + (i > 0 && ends && ends.size && !ends.has(i) ? 1 : 0), before[2] + wide * wide]
          if (better(cost, best[l][j])) { best[l][j] = cost; back[l][j] = i }
        }
      }
    }
    cuts = [n]
    for (let l = count, j = n; l > 0; l--) { j = back[l][j]; cuts.unshift(j) }
  }
  const lines = []
  for (let c = 0; c + 1 < cuts.length; c++) {
    const line = kids.slice(cuts[c], cuts[c + 1])
    lines.push({ kids: line, w: span(cuts[c], cuts[c + 1], 'w'), h: Math.max(...line.map((kid) => kid.m.h)) })
  }
  return lines
}

// --------------------------------------------------------------------------------------------
/** Two taps this close together, in milliseconds and points, put a dial or slider back to where it started. */
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_REACH = 30
/** How often a scene that looks empty is looked at again, in frames. */
const LOOK_EVERY = 30
/** Controls are drawn smaller to fit, a twentieth at a time, but never smaller than this part of their usual size. */
const SMALLEST = 0.8
/** On a touch screen they are drawn this much bigger, and never smaller than their size with a mouse: fingers need the room. */
const FINGER_SCALE = 1.15
/** Told to fit the width, controls are not drawn smaller than this by default: under a finger, and with a mouse. `minScale` says otherwise. */
/** Told to fit the width (fit: "width"), a panel with room to spare is drawn bigger, but no bigger than this. `maxScale` says otherwise. */
const GROWN_MOST = 1.6
const FINGER_LEAST = 0.8
const MOUSE_LEAST = 0.5
/** Where the plates have to be moved to be seen, at least this much height is left to see them in, in points: the scope goes first. */
const SEEN_LEAST = 190
/** Lines of plates that are this part of the width already are spread to fill all of it. */
const FILLS = 0.6
/** Plates let go while moving faster than this, in points a millisecond, carry on; they slow to a third in this many milliseconds. */
const FLING_LEAST = 0.15
const FLING_FADE = 320
/** How far a finger on a slider goes, in points, before it is clear whether it means the slider or to move the plates. */
const MEANT_AFTER = 8
/** A finger on one of these moves the plates under it when there is more than fits: they take no hand themselves. */
const SLIDES = new Set(['label', 'scope', 'meter'])

/**
 * THE PANEL: every control on one canvas, their layout, the canvas they are drawn on and the
 * pointers that are on them. There is one for a canvas, made the first time a control is.
 */
class Panel {
  constructor(canvas) {
    this.canvas = canvas
    this.items = []
    this.boxes = []
    this.root = new Box(this, 'root', { id: 0 })
    this.stack = [] // the boxes being filled by a function, the innermost last
    this.flat = null // the page being filled in a straight line
    this.shown = null // the page on show
    this.scrolls = new Map() // a page (or the root) -> how far down it has been moved
    this.nextId = 1
    this.stale = new Set() // controls to draw again this frame
    this.arrange = true // lay everything out and draw it all
    this.shift = false // the plates were moved under the finger: place them again at the same scale
    this.told = [] // what changed by hand, for a listener: id, value, id, value…
    this.played = [] // notes: keyboard id, note, velocity (0: let go)…
    this.made = [] // what a control took from its target, for a listener: id, min, max, default, choices, value…
    this.listener = null
    this.beats = false // the listener is called every frame it has answered the last (`ack`)
    this.armed = true
    this.grabs = new Map() // pointer id -> the control it is on
    this.tap = null
    this.plates = []
    this.titles = []
    this.rules = []
    this.tabs = []
    this.viewport = null // where the plates can be moved up and down, when there is more than fits
    this.free = [0, 0, 0, 0] // the rectangle no control is on
    this.freeSaid = ''
    this.pans = new Map() // a page (or the root) -> how far across it has been moved
    this.inset = [0, 0, 0, 0] // what the screen keeps of the picture's edges (a notch, a home bar): left, top, right, bottom
    this.zoomed = 1 // a panel of a set size is laid out at that size, then drawn this many times bigger
    this.scale = 1 // the scale the layout chose
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

    // What a finger holds when it moves the plates: it is given the pointer as a control is.
    this.scroller = {
      held: false, bar: false, last: 0,
      down: (p) => { this.scroller.last = p.y; this.scroller.lastX = p.x; this.scroller.at = performance.now(); this.scroller.speed = [0, 0]; this.fling = null },
      move: (p) => {
        const v = this.viewport, by = p.y - this.scroller.last, across = p.x - this.scroller.lastX
        this.scroller.last = p.y
        this.scroller.lastX = p.x
        // How fast the finger is going, in points a millisecond: the plates carry on at that speed when it lifts.
        const now = performance.now(), took = Math.max(1, now - this.scroller.at), s = this.scroller.speed
        this.scroller.at = now
        this.scroller.speed = [s[0] * 0.4 - across / took * 0.6, s[1] * 0.4 - by / took * 0.6]
        // On the bar the thumb follows the finger; anywhere else the plates do.
        if (v) this.scrollBy(this.scroller.bar ? by * (v.h + v.max) / v.h : -by, this.scroller.bar ? 0 : -across)
      },
      up: () => {
        const [vx, vy] = this.scroller.speed
        if (!this.scroller.bar && performance.now() - this.scroller.at < 80 && Math.hypot(vx, vy) > FLING_LEAST) this.fling = { vx, vy, at: performance.now() }
      },
      touch() {},
    }
    this.fling = null // the plates still moving after a finger let them go
    this.waits = new Map() // pointer id -> a slider a finger is on, until it is clear whether the finger means the slider or the plates

    const listen = (target, type, fn, how) => {
      target.addEventListener(type, fn, how)
      this.undo.push(() => target.removeEventListener(type, fn, how))
    }
    listen(canvas, 'pointerdown', (e) => this.pointerDown(e))
    listen(canvas, 'pointermove', (e) => this.pointerMove(e))
    listen(window, 'pointerup', (e) => this.pointerUp(e))
    listen(window, 'pointercancel', (e) => this.pointerUp(e))
    listen(canvas, 'wheel', (e) => {
      const v = this.viewport, p = this.point(e)
      if (this.popup) { e.preventDefault(); if (this.popup.wheel) this.popup.wheel(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY); return }
      if (!v || p.x < v.x || p.x >= v.x + v.w || p.y < v.y || p.y >= v.y + v.h) return
      e.preventDefault()
      this.scrollBy(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY, e.deltaMode === 1 ? e.deltaX * 30 : e.deltaX)
    }, { passive: false })
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
    for (const item of this.items) {
      if (item.kind === 'keyboard') item.release()
      if (item.unheed) { try { item.unheed() } catch (e) { /* already gone */ } item.unheed = null }
    }
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
    const inset = this.insets()
    if (W === this.W && H === this.H && ratio === this.ratio && inset.join() === this.inset.join()) return
    this.W = W; this.H = H; this.ratio = ratio; this.inset = inset
    layer.style.width = W + 'px'
    layer.style.height = H + 'px'
    layer.width = Math.max(1, Math.round(W * ratio))
    layer.height = Math.max(1, Math.round(H * ratio))
    this.arrange = true
    this.frames = 0
  }

  /** How much of each edge of the picture the screen keeps for itself (a phone's notch and home bar): left, top, right, bottom. */
  insets() {
    try {
      if (!Panel.edges) {
        Panel.edges = document.createElement('div')
        Panel.edges.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)'
      }
      // A page inside another's frame is told of the screen's edges though it may be nowhere near them: it keeps none.
      if (window.top !== window) return [0, 0, 0, 0]
      if (!Panel.edges.isConnected) document.documentElement.append(Panel.edges)
      const kept = getComputedStyle(Panel.edges), box = this.canvas.getBoundingClientRect()
      const part = (name, gone) => Math.max(0, (parseFloat(kept[name]) || 0) - Math.max(0, gone))
      return [part('paddingLeft', box.left), part('paddingTop', box.top), part('paddingRight', innerWidth - box.right), part('paddingBottom', innerHeight - box.bottom)]
    } catch (e) {
      return [0, 0, 0, 0]
    }
  }

  // --- what is in what: controls are put in boxes as they are made
  add(kind, spec) {
    spec = spelled(spec || {})
    this.arrange = true
    if (BOXES.includes(kind)) return this.addBox(kind, spec)
    // select("wave", …, { style: "rotary" }) is rotary("wave", …).
    if (kind === 'select' && spec.style === 'rotary') kind = 'rotary'
    const Kind = KINDS[kind]
    if (!Kind) throw new Error(`There is no control called "${kind}". There are: ${[...Object.keys(KINDS), ...BOXES].join(', ')}`)
    const item = new Kind(this, kind, spec)
    this.items.push(item)
    this.seat(item)
    this.heed(item)
    return item
  }
  /**
   * A target that can say when a setting of its own changes shape (`onChange(fn)`: fn is called with the
   * setting's name, or with nothing for all of them) is listened to: the control asks about its setting
   * again (its choices, its range, its unit), is drawn again, and laid out again in case it is wider.
   * What `onChange` gives back, if it is a function, stops the listening when the control goes.
   */
  heed(item) {
    if (!item.target || item.param == null || !item.refresh) return
    const listen = method(item.target, 'onChange', 'on_change')
    if (!listen) return
    let stop = null
    const heard = (name) => {
      if (!this.items.includes(item) || (name != null && name !== item.param)) return
      item.refresh()
      // A host that keeps the control elsewhere is told what it now is, as it was when it was made.
      this.made.push(item.id, item.min ?? 0, item.max ?? 1, item.default ?? 0, (item.choices || []).join('|'), item.i ?? item.v)
      this.arrange = true
    }
    try { stop = listen(heard) } catch (e) { /* a target whose onChange is something else */ }
    item.unheed = typeof stop === 'function' ? stop : null
  }
  /** A box of one kind inside another. A row is kept with the controls too: a host counts it among them. */
  newBox(kind, spec, home) {
    const box = new Box(this, kind, spec)
    box.box = home
    home.items.push(box)
    if (kind === 'row') this.items.push(box)
    else this.boxes.push(box)
    return box
  }
  /** Where a control goes: the box a function is filling, or the one being filled in a straight line. */
  seat(item) {
    const top = this.stack.at(-1) || null
    // A piano keyboard made outside any group lies along the bottom, on every page.
    if (item.kind === 'keyboard' && !top) return
    const home = top || this.flat || this.root
    const plates = home.kind === 'root' || home.kind === 'page'
    if (plates && !item.at) {
      // A scope given no width is as wide as the picture, on a plate of its own.
      if (item.kind === 'scope' && !item.wide) {
        home.open = null
        const own = this.newBox('group', { implicit: true, full: true }, home)
        own.items.push(item)
        item.box = own
        item.full = true
        return
      }
      // A label is the heading of the controls that follow it: they are kept together on one plate.
      if (item.kind === 'label' && (!home.open || home.open.implicit)) {
        const headed = home.open = this.newBox('group', { implicit: true }, home)
        headed.heading = item
        item.box = headed
        return
      }
    }
    let into = home.open || home
    if (into === home && plates) into = home.open = this.newBox('group', { implicit: true }, home)
    into.items.push(item)
    item.box = into
  }
  addBox(kind, spec) {
    const top = this.stack.at(-1) || null
    if (kind === 'page') {
      // A page with no name ends the pages: what is made next is on every page, below them.
      for (const box of [this.root, this.flat, top]) if (box) box.open = null
      this.flat = null
      if (!spec.label) return null
      const page = this.flat = this.newBox('page', spec, this.root)
      this.shown ||= page
      return page
    }
    const home = top || this.flat || this.root
    home.open = null
    const box = this.newBox(kind, spec, home)
    if (kind !== 'row') home.open = box
    return box
  }
  /** What is made from now on is in this box, until leave(). */
  enter(box) {
    if (this.stack.includes(box)) return
    box.entered = true
    if (box.box && box.box.open === box) box.box.open = null
    if (this.flat === box) this.flat = null
    this.stack.push(box)
    this.arrange = true
  }
  leave(box) {
    const i = this.stack.lastIndexOf(box)
    if (i >= 0) for (const left of this.stack.splice(i)) left.open = null
  }
  remove(item) {
    if (item.items) {
      for (const inside of [...item.items]) this.remove(inside)
      if (item.heading) this.remove(item.heading)
      for (const list of [this.boxes, this.items, this.stack]) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1) }
      if (this.flat === item) this.flat = null
      if (this.shown === item) this.shown = null
      this.scrolls.delete(item)
    } else {
      const i = this.items.indexOf(item)
      if (i < 0) return
      if (item.kind === 'keyboard') item.release()
      if (item.unheed) { try { item.unheed() } catch (e) { /* already gone */ } item.unheed = null }
      this.items.splice(i, 1)
      for (const [id, held] of this.grabs) if (held === item) this.grabs.delete(id)
      this.stale.delete(item)
    }
    const home = item.box
    if (home) {
      const i = home.items.indexOf(item)
      if (i >= 0) home.items.splice(i, 1)
      if (home.heading === item) home.heading = null
      if (home.open === item) home.open = null
      item.box = null
    }
    this.arrange = true
  }
  clear() {
    for (const item of [...this.items]) this.remove(item)
    for (const box of [...this.boxes]) this.remove(box)
    this.root.items.length = 0
    this.root.open = null
    this.stack.length = 0
    this.flat = this.shown = null
    this.scrolls.clear()
  }
  find(id) { return this.items.find((item) => item.id === id) || this.boxes.find((box) => box.id === id) }

  /** Turn to a page. */
  show(page) {
    if (!page || page.kind !== 'page' || this.shown === page) return
    this.shown = page
    this.arrange = true
  }
  /** Move the plates up (a positive number) or down by so many points, as far as they go. */
  scrollBy(by, across = 0) {
    const v = this.viewport
    if (!v) return
    const next = clamp(v.scroll + by, 0, v.max), over = clamp(v.scrollX + across, 0, v.maxX)
    if (next === v.scroll && over === v.scrollX) return
    v.scroll = next
    v.scrollX = over
    // Kept in the layout's own measure, which a panel of a set size is not drawn in.
    this.scrolls.set(v.key, next / this.zoomed)
    this.pans.set(v.key, over / this.zoomed)
    this.shift = true
  }
  /** How many plates to a line the scene asked for at this width (0: it did not say). */
  columnsAt(width) {
    const asked = this.options.columns
    if (asked == null) return 0
    if (typeof asked === 'number') return Math.max(0, Math.round(asked))
    let from = -1, many = 0
    for (const name in asked) {
      const least = WIDTHS[name] ?? Number(name)
      if (least <= width && least > from) { from = least; many = asked[name] }
    }
    return Math.max(0, Math.round(many) || 0)
  }
  /** A panel of a set size: { w, h } it is laid out at, and how it is then put on the picture (s times bigger, from ox, oy). */
  panelSize() {
    const o = this.options, given = o.size ?? o.design
    if (!given) return null
    const [w, h] = typeof given === 'number' ? [given, 0] : Array.isArray(given) ? given : [given.width, given.height]
    if (!(w > 0)) return null
    const [l, t, r, b] = this.inset, W = Math.max(1, this.W - l - r), H = Math.max(1, this.H - t - b)
    // A width alone, or fit: "width": as wide as the picture and as tall as that leaves, so what does not fit is moved up and down.
    if (!(h > 0) || o.fit === 'width') return { w, h: H * w / W, s: W / w, ox: l, oy: t }
    const s = Math.min(W / w, H / h)
    return { w, h, s, ox: l + (W - w * s) / 2, oy: t + (H - h * s) / 2 }
  }

  // --- layout: how much room each thing wants (measure), then where each thing goes (arrange)
  /** Is there anything of it to lay out? A control placed by hand is not the layout's, nor a box with nothing in it. */
  shows(node, placed) {
    if (!node.items) return !node.at
    if (node.at && !placed) return false
    if (node.heading && !node.heading.at) return true
    return node.items.some((kid) => !isBreak(kid) && this.shows(kid))
  }
  /** A plate is drawn under a box that stands on its own: one made outside any other, or told `plate: true`. */
  plated(box) {
    if (box.plate != null) return !!box.plate
    if (this.options.plates === false) return false
    if (this.bare(box)) return false
    // A row that holds only groups is not a plate: each of its groups is.
    let home = box.box
    while (home && home.plate == null && this.bare(home)) home = home.box
    return !home || home.kind === 'root' || home.kind === 'page'
  }
  bare(box) {
    if (box.kind !== 'row' || !box.entered || box.label) return false
    const kids = box.items.filter((kid) => !isBreak(kid) && this.shows(kid))
    return kids.length > 0 && kids.every((kid) => kid.items)
  }
  measure(node, room) {
    if (node.items) return this.measureBox(node, room)
    const u = node.u = this.k.u * node.scaleOf()
    const [w, h] = node.natural(u, room, this.g)
    const [least, most] = node.stretch(u)
    const wide = Math.min(w, room)
    node.rowH = 0
    node.m = { w: wide, h, min: Math.min(wide, w * least), max: node.share != null ? Infinity : Math.max(wide, w * most), greedy: node.share != null }
    return node.m
  }
  measureBox(box, room) {
    const k = this.k, u = k.u, g = this.g
    const plated = this.plated(box)
    const pad = plated ? k.pad : 0
    let kids = box.items.filter((kid) => isBreak(kid) || this.shows(kid))
    let head = box.heading && !box.heading.at ? box.heading : null
    // A label with nothing after it is not a heading: it is words on a plate of their own.
    if (head && !kids.some((kid) => !isBreak(kid))) { kids = [head]; head = null }
    if (box.heading) box.heading.heading = !!head
    const inner = Math.max(30 * u, room - 2 * pad)
    let th = 0, tw = 0
    if (head) {
      head.u = u
      th = k.title
      tw = head.natural(u, inner, g)[0]
    } else if (box.label && box.kind !== 'page') {
      th = plated ? k.title : k.title * 0.85
      g.font = `600 ${(plated ? 13 : 11.5) * u}px ${THEME.font}`
      tw = g.measureText(box.label).width + 14 * u
    }
    const bare = this.bare(box)
    const gap = bare && box.gap == null ? k.gap : (box.gap ?? (k.compact ? 6 : 10)) * u
    // Told not to wrap (itself, or the whole panel): what is in it stays on one line, however wide that is.
    const held = box.wrap === false || (this.hold && box.wrap !== true)
    // Controls carry their own room around them; boxes are kept a gap apart, and so is everything when a gap is asked for.
    const between = (a, b) => (a.items || b.items || box.gap != null ? gap : 0)
    const side = box.dock === 'left' || box.dock === 'right'
    // A strip down one side that is too tall for the picture is two columns, or three (`box.folds`).
    const folded = side && box.kind === 'group' && box.folds > 1
    const real = kids.filter((kid) => !isBreak(kid) && !(folded && kid.kind === 'spacer' && typeof kid.size !== 'number'))
    const way = box.kind === 'grid' || box.columns || folded ? 'grid' : box.kind === 'column' || (side && box.kind === 'group') ? 'column' : 'flow'
    // Something inside that asks for a share of the room makes the box ask for all there is (a spacer in a column asks for height, not width).
    let greedy = false
    for (const kid of real) greedy = (this.measure(kid, inner).greedy && !(way === 'column' && kid.kind === 'spacer')) || greedy
    const m = { way, kids: real, head, th, pad, between, greedy: greedy || box.share != null }
    // `narrow`: how wide it would be with everything in it as narrow as it goes.
    let w = 0, h = 0, narrow = 0
    if (way === 'column') {
      real.forEach((kid, i) => { w = Math.max(w, kid.m.w); narrow = Math.max(narrow, kid.m.min); h += kid.m.h + (i ? between(real[i - 1], kid) : 0) })
    } else if (way === 'grid') {
      const each = box.gap != null ? gap : 0
      let cols = clamp(folded ? box.folds : box.columns || real.length, 1, Math.max(1, real.length))
      const over = (kid) => Math.min(kid.across || 1, cols)
      // Fewer columns when they would not fit, and then no more than fill the lines evenly.
      const least = Math.max(1, ...real.map((kid) => kid.m.min / over(kid)))
      const fit = Math.max(1, Math.floor((inner + each) / (least + each)))
      if (cols > fit && !held) {
        cols = Math.ceil(real.length / Math.ceil(real.length / fit))
        this.wraps++
      }
      const cell = Math.max(0, ...real.map((kid) => kid.m.w / over(kid)))
      m.rows = []
      let r = 0, c = 0
      for (const kid of real) {
        const s = over(kid)
        if (c + s > cols) { r++; c = 0 }
        kid.cell = [r, c, s]
        m.rows[r] = Math.max(m.rows[r] || 0, kid.m.h)
        c += s
      }
      m.cols = cols
      m.each = each
      m.rowGap = box.gap != null ? gap : 2 * u
      w = held ? cols * cell + (cols - 1) * each : Math.min(inner, cols * cell + (cols - 1) * each)
      narrow = cols * least + (cols - 1) * each
      h = m.rows.reduce((sum, tall) => sum + tall, 0) + Math.max(0, m.rows.length - 1) * m.rowGap
    } else {
      // A row() starts a new line; wrap() only marks where a line may end if one has to.
      const runs = [{ kids: [], ends: new Set() }]
      for (const kid of kids) {
        if (!isBreak(kid)) runs.at(-1).kids.push(kid)
        else if (!kid.soft) runs.push({ kids: [], ends: new Set() })
        else if (runs.at(-1).kids.length) runs.at(-1).ends.add(runs.at(-1).kids.length)
      }
      m.lines = []
      for (const run of runs) {
        if (!run.kids.length) continue
        const made = wrapLines(run.kids, held ? Infinity : inner, between, run.ends)
        this.wraps += made.length - 1
        m.lines.push(...made)
      }
      m.rowGap = real.some((kid) => kid.items) || box.gap != null ? gap : 2 * u
      for (const line of m.lines) {
        w = Math.max(w, held ? line.w : Math.min(line.w, inner))
        narrow = Math.max(narrow, line.kids.reduce((sum, kid, i) => sum + kid.m.min + (i ? between(line.kids[i - 1], kid) : 0), 0))
      }
      h = m.lines.reduce((sum, line) => sum + line.h, 0) + Math.max(0, m.lines.length - 1) * m.rowGap
    }
    if (greedy && !held) w = Math.max(w, inner)
    if (box.wide && !box.at) w = Math.min(inner, Math.max(w, box.wide * u - 2 * pad))
    w = Math.max(w, Math.min(tw, inner))
    m.body = h
    m.w = m.max = w + 2 * pad
    // A scope made outside any group keeps the whole width: nothing is put beside it.
    m.min = box.full ? m.w : Math.min(w, Math.max(narrow, Math.min(tw, inner))) + 2 * pad
    m.h = h + th + 2 * pad
    box.m = m
    return m
  }
  /**
   * The widths of the things on one line that is `room` wide. Short of room, what can be narrowed is.
   * With room to spare: things given a share take it by their shares (and when every one has a share,
   * all the room is theirs in that ratio); else what stretches does, as far as it goes, and the rest
   * is shared out, so the line is filled and its controls are spread evenly along it.
   */
  spread(kids, room, align) {
    const widths = kids.map((kid) => kid.m.w)
    const spare = room - widths.reduce((sum, w) => sum + w, 0)
    if (spare < -0.5) {
      if (this.hold) return widths
      const give = kids.map((kid) => kid.m.w - kid.m.min), all = give.reduce((sum, w) => sum + w, 0)
      if (all > 0) give.forEach((w, i) => { widths[i] -= w * Math.min(1, -spare / all) })
      return widths
    }
    if (spare < 0.5) return widths
    const shares = kids.map((kid) => (kid.share != null ? Math.max(0, Number(kid.share) || 0) : null))
    const shared = shares.reduce((sum, s) => sum + (s || 0), 0)
    if (shared > 0) {
      if (shares.every((s) => s != null)) return shares.map((s, i) => Math.max(kids[i].m.min, room * s / shared))
      return widths.map((w, i) => w + spare * (shares[i] || 0) / shared)
    }
    if (align && align !== 'spread' && align !== 'stretch') return widths
    let left = spare
    const can = kids.map((kid) => (kid.items ? 0 : Math.max(0, kid.m.max - kid.m.w))), all = can.reduce((sum, w) => sum + w, 0)
    if (all > 0) {
      const part = Math.min(1, left / all)
      can.forEach((w, i) => { widths[i] += w * part })
      left -= all * part
    }
    if (left > 0.5) {
      // Boxes take the rest by how wide they are, so the controls in two plates side by side are spaced alike.
      const leaves = kids.filter((kid) => !kid.items), usual = leaves.length ? leaves.reduce((sum, kid) => sum + kid.m.w, 0) / leaves.length : 0
      const weights = kids.map((kid) => (kid.items ? kid.m.w : usual)), total = weights.reduce((sum, w) => sum + w, 0) || 1
      weights.forEach((w, i) => { widths[i] += left * w / total })
    }
    return widths
  }
  lay(node, x, y, w, h) {
    node.view = this.viewNow
    if (node.items) return this.arrangeBox(node, x, y, w, h)
    const m = node.m
    node.w = Math.min(w, m.max)
    // A scope beside taller things is as tall as they are.
    node.h = node.kind === 'scope' && !node.tall ? Math.max(m.h, h) : Math.min(Math.max(m.h, node.rowH || 0), h)
    node.x = x + (w - node.w) / 2
    node.y = y + (h - node.h) / 2
  }
  arrangeBox(box, x, y, w, h) {
    const m = box.m, k = this.k, u = k.u
    box.x = x; box.y = y; box.w = w; box.h = h
    const plated = this.plated(box)
    if (plated) this.plates.push(Object.assign([x, y, w, h], { clip: this.viewNow, inner: !!box.box && box.box.kind !== 'root' && box.box.kind !== 'page' }))
    const cx = x + m.pad, cw = w - 2 * m.pad, cy = y + m.pad + m.th, ch = h - 2 * m.pad - m.th
    if (m.head) {
      const head = m.head
      head.view = this.viewNow
      head.x = cx; head.y = y + m.pad; head.w = cw; head.h = m.th
    } else if (m.th) {
      this.titles.push({ text: box.label, x: cx + 6 * u, y: y + m.pad + m.th / 2, w: cw - 8 * u, size: (plated ? 13 : 11.5) * u, colour: box.colour || (plated ? THEME.text : THEME.dim), clip: this.viewNow })
    }
    const spare = Math.max(0, ch - m.body)
    const rules = box.dividers ?? this.options.dividers
    const align = box.align || 'spread'
    if (m.way === 'column') {
      // A spacer with no size takes what room is left; with none, a strip along an edge starts at its top.
      const springs = m.kids.filter((kid) => kid.kind === 'spacer' && typeof kid.size !== 'number')
      let ky = cy + (springs.length || box.dock ? 0 : spare / 2)
      m.kids.forEach((kid, i) => {
        if (i) {
          const apart = m.between(m.kids[i - 1], kid)
          if (rules && apart) this.rules.push([cx + 4 * u, ky + apart / 2, cx + cw - 4 * u, ky + apart / 2, this.viewNow])
          ky += apart
        }
        const tall = kid.m.h + (springs.includes(kid) ? spare / springs.length : 0)
        this.lay(kid, cx, ky, cw, tall)
        ky += tall
      })
    } else if (m.way === 'grid') {
      const fill = align === 'spread' || align === 'stretch'
      const natural = (m.w - 2 * m.pad - (m.cols - 1) * m.each) / m.cols
      const each = fill ? (cw - (m.cols - 1) * m.each) / m.cols : Math.min(natural, (cw - (m.cols - 1) * m.each) / m.cols)
      const used = each * m.cols + (m.cols - 1) * m.each
      const gx = cx + (align === 'end' ? cw - used : align === 'center' ? (cw - used) / 2 : 0)
      const more = spare / m.rows.length, tops = []
      let ky = cy
      m.rows.forEach((tall, r) => { tops[r] = ky; ky += tall + more + m.rowGap })
      for (const kid of m.kids) {
        const [r, c, s] = kid.cell
        this.lay(kid, gx + c * (each + m.each), tops[r], each * s + m.each * (s - 1), m.rows[r] + more)
      }
    } else {
      const more = m.lines.length ? spare / m.lines.length : 0
      let ky = cy
      for (const line of m.lines) {
        let gaps = 0
        line.kids.forEach((kid, i) => { if (i) gaps += m.between(line.kids[i - 1], kid) })
        const widths = this.spread(line.kids, cw - gaps, align)
        const used = widths.reduce((sum, wide) => sum + wide, gaps)
        let kx = cx + (align === 'end' ? cw - used : align === 'center' ? (cw - used) / 2 : 0)
        // Dials of different sizes on one line are all given the height of the biggest, so their labels and values line up.
        const turned = line.kids.filter((kid) => kid.kind === 'dial' || kid.kind === 'rotary')
        const tallest = Math.max(0, ...turned.map((kid) => kid.m.h))
        for (const kid of turned) kid.rowH = tallest
        line.kids.forEach((kid, i) => {
          if (i) {
            const apart = m.between(line.kids[i - 1], kid)
            if (rules && apart) this.rules.push([kx + apart / 2, ky + 4 * u, kx + apart / 2, ky + line.h + more - 4 * u, this.viewNow])
            kx += apart
          }
          this.lay(kid, kx, ky, widths[i], line.h + more)
          kx += widths[i]
        })
        ky += line.h + more + m.rowGap
      }
    }
  }
  /**
   * Plates into lines no wider than `room`: { lines, w (the widest line), h (all of them, one under another) }.
   * A line with something on it that asks for all the room (a scope made outside any group, a control given a
   * share) is `wide`: it is as wide as the picture, and is not counted in `w`, the width the other lines share.
   */
  flow(kids, room) {
    const gap = this.k.gap, runs = [], lines = [], between = () => gap
    // Plates with titles are a panel: they stand side by side to fill the width, a row() between them saying
    // where a line should end when a line has to. Anything else keeps its rows as they were written. Told how
    // (wrap: true or false), every row() is a new line; told how many to a line (columns), that many.
    const titled = (kid) => !!(kid.label || kid.heading) && !kid.full
    const many = this.columnsNow
    const join = (this.options.wrap == null && !this.hold) || many > 0
    let run = null, broke = false, soft = false
    for (const kid of kids) {
      if (isBreak(kid)) { if (kid.soft) soft = true; else broke = true; continue }
      this.measure(kid, room)
      if (run && broke && join && titled(kid) && run.kids.every(titled)) run.ends.add(run.kids.length)
      else if (!run || broke) runs.push(run = { kids: [], ends: new Set() })
      else if (soft) run.ends.add(run.kids.length)
      broke = soft = false
      run.kids.push(kid)
    }
    for (const run of runs) {
      if (many && run.kids.every((kid) => !kid.full)) {
        for (let from = 0; from < run.kids.length; from += many) lines.push(...wrapLines(run.kids.slice(from, from + many), Infinity, between, null))
      } else lines.push(...wrapLines(run.kids, this.hold ? Infinity : room, between, run.ends))
    }
    // How much wider than the room the widest line is, with everything in it as narrow as it goes.
    // (Told not to wrap, nothing is squeezed to fit: the one scale does it all, so every line is spaced alike.)
    const least = this.hold ? 'w' : 'min'
    for (const line of lines) {
      this.over = Math.max(this.over, line.kids.reduce((sum, kid) => sum + kid.m[least], gap * (line.kids.length - 1)) - room)
      // And how wide the widest line is, of those that do not fill the room whatever its width (a scope's does).
      if (!line.kids.some((kid) => kid.full || kid.m.greedy)) this.widest = Math.max(this.widest, line.w)
    }
    for (const line of lines) line.wide = line.kids.some((kid) => kid.full || kid.m.greedy)
    this.lines += lines.length
    return {
      lines,
      w: Math.max(0, ...lines.map((line) => (line.wide ? 0 : Math.min(line.w, room)))),
      h: lines.reduce((sum, line) => sum + line.h, 0) + Math.max(0, lines.length - 1) * gap,
    }
  }
  /**
   * Put those lines down from y, in the `room` that starts at x. Each is `wide` across, in the middle of the
   * room: the plates of a line share it, and are all as tall as the tallest.
   */
  put(flowed, x, y, room, wide) {
    const gap = this.k.gap, align = this.options.align || 'stretch'
    for (const line of flowed.lines) {
      const across = line.wide ? room : wide
      const gaps = gap * (line.kids.length - 1)
      const widths = this.spread(line.kids, across - gaps, line.wide ? 'stretch' : align)
      const used = widths.reduce((sum, w) => sum + w, gaps)
      let kx = x + (room - across) / 2 + (line.wide ? 0 : align === 'end' ? across - used : align === 'center' ? (across - used) / 2 : 0)
      line.kids.forEach((kid, i) => {
        this.lay(kid, kx, y, widths[i], line.h)
        kx += widths[i] + gap
      })
      y += line.h + gap
    }
  }
  /**
   * Lay everything out at one scale. From the outside in: strips along the edges, the keyboard along the
   * bottom, then the plates in what is left. `{ fits, lines }`: did it all fit, and how many lines of controls
   * it made.
   */
  compose(u, gutter) {
    const { options, g, root } = this
    // A panel of a set size is laid out in that size, whatever the picture's, and put on the picture afterwards.
    const set = this.panelSize()
    const W = set ? set.w : this.W, H = set ? set.h : this.H
    const compact = !!options.compact
    const k = this.k = { u, compact, pad: (compact ? 5 : 8) * u, gap: (compact ? 5 : 8) * u, title: (compact ? 18 : 22) * u }
    const margin = options.margin * u
    this.plates = []; this.titles = []; this.rules = []; this.tabs = []
    this.viewport = null; this.viewNow = null; this.wraps = 0; this.lines = 0; this.over = 0; this.widest = 0; this.spare = 0
    this.hold = options.wrap === false || (options.fit === 'width' && !set)
    this.columnsNow = this.columnsAt(W)
    for (const item of this.items) { item.hidden = false; item.view = null }
    const [il, it, ir, ib] = set ? [0, 0, 0, 0] : this.inset
    const R = { x: margin + il, y: margin + it, w: Math.max(40, W - 2 * margin - il - ir), h: Math.max(40, H - 2 * margin - it - ib) }
    // What is left of the picture for the scene: each thing along an edge moves that edge in.
    const free = { l: 0, t: 0, r: W, b: H }

    for (const box of root.items) {
      if (!box.dock || !this.shows(box)) continue
      const side = box.dock === 'left' || box.dock === 'right'
      const most = side ? Math.min(R.w, box.wide ? box.wide * u : Math.max(R.w * 0.45, 120 * u)) : R.w
      box.folds = 1
      while (this.measure(box, most).h > R.h + 0.5 && side && box.folds < 4) box.folds++
      const w = side ? box.m.w : R.w, h = side ? R.h : box.m.h
      const x = box.dock === 'right' ? R.x + R.w - w : R.x, y = box.dock === 'bottom' ? R.y + R.h - h : R.y
      this.lay(box, x, y, w, h)
      if (side) { R.w -= w + k.gap; if (box.dock === 'left') { R.x += w + k.gap; free.l = R.x } else free.r = R.x + R.w }
      else { R.h -= h + k.gap; if (box.dock === 'top') { R.y += h + k.gap; free.t = R.y } else free.b = R.y + R.h }
    }
    for (const item of this.items) {
      if (item.kind !== 'keyboard' || !item.docked) continue
      item.u = u * item.scaleOf()
      const room = Math.max(40, R.w - 2 * k.pad)
      const [, h] = item.natural(item.u, room, g)
      item.w = room
      // No more than four tenths of the height (a phone on its side), unless the scene said how tall.
      item.h = item.tall ? h : Math.min(h, Math.max(70 * u, H * 0.42))
      item.x = R.x + k.pad
      item.y = R.y + R.h - k.pad - item.h
      this.plates.push([R.x, item.y - k.pad, R.w, item.h + 2 * k.pad])
      R.h = Math.max(0, item.y - k.pad - k.gap - R.y)
      free.b = R.y + R.h
    }

    // The plates: in what is left, or in a column down one side of it.
    const side = options.at === 'left' || options.at === 'right'
    const F = { ...R }
    if (side) {
      F.w = Math.min(R.w, Math.max(170 * u, Math.min(R.w * 0.3, 270 * u)))
      if (options.at === 'right') F.x = R.x + R.w - F.w
    }
    const room = Math.max(40, F.w - gutter)
    const laid = (box) => box.items.filter((kid) => !kid.dock && (isBreak(kid) || this.shows(kid)))
    const kids = laid(root)
    const pages = kids.filter((kid) => kid.kind === 'page')
    if (!pages.includes(this.shown)) this.shown = pages[0] || null
    let head = [], body = kids, foot = []
    if (pages.length) {
      // What was made before the pages is above them on every page, and what was made after is below.
      const last = kids.lastIndexOf(pages.at(-1))
      head = kids.slice(0, last).filter((kid) => kid.kind !== 'page')
      foot = kids.slice(last + 1)
    } else {
      // A scope that comes last keeps its place above the keyboard while the plates before it are moved.
      let cut = kids.length
      while (cut > 0 && (isBreak(kids[cut - 1]) || kids[cut - 1].full)) cut--
      if (kids.slice(0, cut).some((kid) => !isBreak(kid))) { body = kids.slice(0, cut); foot = kids.slice(cut) }
    }
    // With very little height (a phone on its side) that scope is put away, so that the controls can be seen.
    if (this.squeeze >= 3) {
      for (const kid of foot) if (kid.full) this.hide(kid)
      foot = foot.filter((kid) => !kid.full)
    }
    const above = this.flow(head, room), below = this.flow(foot, room)
    const bodies = pages.length ? pages.map((page) => [page, this.flow(laid(page), room)]) : [[null, this.flow(body, room)]]
    const now = (bodies.find(([page]) => page === this.shown) || bodies[0])[1]
    // Every page is given the room of the tallest, so nothing moves or changes size as the pages are turned.
    const tall = Math.max(...bodies.map(([, flowed]) => flowed.h))
    const tabs = pages.length ? 32 * u : 0
    const stretch = !options.align || options.align === 'stretch'
    // The lines share one width: the whole width when the widest of them is most of it already (a panel is
    // set against the picture's edges), else the widest line's own (a few dials are not pulled apart to fill a wall).
    const widest = Math.max(above.w, below.w, ...bodies.map(([, flowed]) => flowed.w))
    const wide = side || !stretch || !widest || widest >= room * FILLS ? room : widest
    const others = [above.h, tabs, below.h].filter((part) => part > 0)
    const fixed = others.reduce((sum, part) => sum + part + k.gap, 0)
    const need = fixed + tall - (tall > 0 ? 0 : k.gap)
    const fits = need <= F.h + 0.5
    const x = F.x
    let y = options.at === 'bottom' ? F.y + F.h - Math.min(need, F.h) : F.y
    const top = y
    if (above.h) { this.put(above, x, y, room, wide); y += above.h + k.gap }
    if (tabs) {
      // The tabs share the strip, each as wide as its name wants if there is room.
      g.font = `600 ${13 * u}px ${THEME.font}`
      const wants = pages.map((page) => Math.max(56 * u, g.measureText(page.label).width + 30 * u))
      const squeeze = Math.min(1, wide / wants.reduce((sum, w) => sum + w, 0))
      let tx = x + (room - wide) / 2
      pages.forEach((page, i) => {
        this.tabs.push({ page, x: tx, y, w: wants[i] * squeeze, h: tabs })
        tx += wants[i] * squeeze
      })
      this.tabStrip = [x + (room - wide) / 2, y, wide, tabs]
      y += tabs + k.gap
    }
    // Where the plates are seen, on whole pixels so that what is drawn again at its edge leaves no seam.
    const snap = (v) => Math.round(v * this.ratio) / this.ratio
    const view = { x: F.x, y: snap(y), w: F.w, h: fits ? tall : snap(Math.max(40 * u, F.h - fixed)) }
    this.seen = fits ? Infinity : view.h / u
    y = view.y
    const key = this.shown || root
    const max = Math.max(0, now.h - view.h)
    const scroll = clamp(this.scrolls.get(key) || 0, 0, max)
    // Lines that are wider than the room even at the smallest scale allowed are moved from side to side.
    const maxX = this.over > 0.5 ? this.over : 0, scrollX = clamp(this.pans.get(key) || 0, 0, maxX)
    if (max > 0.5 || maxX) this.viewNow = view
    this.put(now, x - scrollX, y - scroll, room, wide)
    this.viewNow = null
    // The bar stands just beyond the plates' right edge.
    if (max > 0.5 || maxX) this.viewport = { ...view, max, scroll, maxX, scrollX, gutter, key, left: x + (room - wide) / 2, right: x + (room + wide) / 2 }
    this.roomWide = room
    y += view.h + (view.h > 0 ? k.gap : 0)
    let end = y
    if (below.h) {
      // Below the plates when everything fits; held at the bottom when the plates are moved or turned. On a scene
      // that draws nothing of its own (a panel) it is held just above the keyboard, and takes the height left over,
      // so far: there is no dead room between the scope and the keys.
      // A scope that was made shorter to fit is given back whatever height is left, up to its own.
      const scoped = below.lines.some((line) => line.wide)
      const panel = fits && scoped && options.at !== 'bottom' && ((this.blank && free.b < H) || this.squeeze > 0)
      if (panel) {
        const last = below.lines.at(-1), own = SCOPE_TALL * u + 2 * k.pad
        const most = this.blank && free.b < H ? Math.max(own * 1.5, F.h * 0.22) : own
        const more = Math.max(0, Math.min(F.h - need, most - last.h))
        last.h += more
        below.h += more
        this.spare = Math.max(0, F.h - need - more)
      }
      const held = pages.length || !fits || options.at === 'bottom' || panel
      const by = held ? F.y + F.h - below.h : y
      this.put(below, x, by, room, wide)
      end = held ? F.y + F.h : by + below.h + k.gap
      if (held && options.at !== 'bottom') { free.b = Math.min(free.b, by - k.gap); end = y }
    }
    if (fits && !below.h) this.spare = Math.max(0, F.h - need)
    if (need > 0) {
      if (side) { if (options.at === 'left') free.l = F.x + F.w + k.gap; else free.r = F.x - k.gap }
      else if (options.at === 'bottom') free.b = Math.min(free.b, top - k.gap)
      else free.t = Math.min(end, F.y + F.h)
    }
    for (const [page] of bodies) if (page && page !== this.shown) this.hide(page)

    // What was placed by hand: where it was put.
    const across = W - 2 * margin - 2 * k.pad
    for (const item of this.items) {
      if (!item.at || item.items) continue
      item.u = u * item.scaleOf()
      const [w, h] = item.natural(item.u, Math.max(40, across), g)
      item.w = w; item.h = h
      item.x = item.at.x; item.y = item.at.y
      this.plates.push([item.x - k.pad / 2, item.y - k.pad / 2, w + k.pad, h + k.pad])
    }
    for (const box of [...this.items, ...this.boxes]) {
      if (!box.items || !box.at || !this.shows(box, true)) continue
      const m = this.measure(box, box.wide ? box.wide * u : Math.max(40, W - box.at.x))
      this.lay(box, box.at.x, box.at.y, m.w, box.tall ? Math.max(m.h, box.tall * u) : m.h)
    }
    this.free = [free.l, free.t, Math.max(0, free.r - free.l), Math.max(0, free.b - free.t)]
    this.designed = null
    this.zoomed = 1
    this.u = u
    if (set) this.zoom(set)
    return { fits, lines: this.lines + this.wraps }
  }
  /** Put a panel that was laid out at its own size on the picture: everything s times bigger, from (ox, oy). */
  zoom({ w, h, s, ox, oy }) {
    const views = new Set()
    const box = (thing) => { thing.x = ox + thing.x * s; thing.y = oy + thing.y * s; thing.w *= s; thing.h *= s }
    for (const item of this.items) { box(item); if (!item.items) item.u *= s; if (item.view) views.add(item.view) }
    for (const group of this.boxes) box(group)
    for (const plate of this.plates) {
      plate[0] = ox + plate[0] * s; plate[1] = oy + plate[1] * s; plate[2] *= s; plate[3] *= s
      if (plate.clip) views.add(plate.clip)
    }
    for (const title of this.titles) { title.x = ox + title.x * s; title.y = oy + title.y * s; title.w *= s; title.size *= s; if (title.clip) views.add(title.clip) }
    for (const rule of this.rules) { rule[0] = ox + rule[0] * s; rule[1] = oy + rule[1] * s; rule[2] = ox + rule[2] * s; rule[3] = oy + rule[3] * s; if (rule[4]) views.add(rule[4]) }
    for (const tab of this.tabs) box(tab)
    if (this.tabs.length) this.tabStrip = [ox + this.tabStrip[0] * s, oy + this.tabStrip[1] * s, this.tabStrip[2] * s, this.tabStrip[3] * s]
    for (const view of views) box(view)
    const v = this.viewport
    if (v) { box(v); v.max *= s; v.scroll *= s; v.maxX *= s; v.scrollX *= s; v.gutter *= s; v.left = ox + v.left * s; v.right = ox + v.right * s }
    const [fx, fy, fw, fh] = this.free
    this.free = [ox + fx * s, oy + fy * s, fw * s, fh * s]
    this.designed = [ox, oy, w * s, h * s]
    this.zoomed = s
    this.u *= s
  }
  /** A page that is not on show: nothing of it is drawn or felt. */
  hide(box) {
    for (const kid of [box.heading, ...box.items]) {
      if (!kid) continue
      if (kid.items) this.hide(kid)
      kid.hidden = true
      kid.w = kid.h = 0
    }
  }
  /**
   * The scale is chosen, then everything is laid out at it. Controls are drawn at their full size if all
   * fits on as few lines as it can; if not, smaller, a step at a time, as far as SMALLEST (and on a touch screen never smaller than
   * they are with a mouse); and if it still does not fit, the plates can be moved up and down with a finger,
   * the wheel or the bar at their side, while the keyboard and the scope above it stay where they are.
   * `quick`: only the plates were moved, so the scale is the one already chosen.
   */
  layout(quick) {
    const { options } = this
    // A panel of a set size is the same on every screen: a finger's screen does not make its controls bigger.
    const set = !!this.panelSize()
    const usual = options.scale || (this.coarse && !set ? FINGER_SCALE : 1)
    const least = options.scale || !this.coarse || set ? usual * SMALLEST : 1
    const hold = options.wrap === false || (options.fit === 'width' && !set)
    let u = this.scale, squeeze = this.squeeze || 0
    if (!quick) {
      // ONE SCALE FOR THE WHOLE PANEL. A line that may not wrap and is too wide makes everything smaller until it
      // fits the width, so a knob is the same size on every line. Not below `minScale` (by default, the smallest
      // a finger can work comfortably): there the lines are left too wide, and are moved from side to side.
      const floor = options.minScale ?? (this.coarse ? FINGER_LEAST : MOUSE_LEAST)
      const narrowed = (size, bar) => {
        this.compose(size, bar ? (this.coarse ? 18 : 12) * size : 0)
        for (let tries = 0; tries < 6 && this.over > 0.5 && size > Math.min(size, floor) + 1e-6; tries++) {
          size = Math.max(Math.min(size, floor), size * this.roomWide / (this.roomWide + this.over) * 0.998)
          this.compose(size, bar ? (this.coarse ? 18 : 12) * size : 0)
        }
        return size
      }
      // Of the sizes at which all fits, the one that makes the fewest lines (a row stays a row if a little
      // smaller will keep it one), and of those the biggest. If none does, the same again with the keyboard
      // and the scope above it less tall. Told not to wrap, each size is first made as much smaller as the
      // widest row needs.
      const sizes = []
      for (let step = 0; usual * (1 - 0.05 * step) > least + 1e-6; step++) sizes.push(usual * (1 - 0.05 * step))
      sizes.push(least)
      u = 0
      this.keysMore = 0
      // (The scope may be made shorter to fit, as far as SCOPE_LEAST; the keyboard is not.)
      for (squeeze of [0, 1]) {
        this.squeeze = squeeze
        let fewest = Infinity
        for (let size of sizes) {
          if (hold) size = narrowed(size, false)
          const got = this.compose(size, 0)
          if (got.fits && got.lines < fewest) { fewest = got.lines; u = size }
        }
        if (u) break
      }
      if (!u) {
        // NOTHING FITS: THE PLATES ARE MOVED TO BE SEEN, under a scope and a keyboard that stay where they are.
        // The scope is at its least height. Only if that leaves hardly any room to see the plates in does the
        // keyboard give up some of its height; and only on a picture as short as a phone on its side is the
        // scope then put away, which is said once.
        this.squeeze = squeeze = 1
        u = hold ? narrowed(usual, true) : Math.max(least, usual * 0.9)
        this.compose(u, 0)
        if (this.seen < SEEN_LEAST) { this.squeeze = squeeze = 2; this.compose(u, 0) }
        if (this.seen < SEEN_LEAST && this.H < SHORT_VIEW && this.items.some((item) => item.full && item.kind === 'scope')) {
          squeeze = 3
          if (!this.saidAway) { this.saidAway = true; console.info('dials: there is too little height here for the scope, so it is put away to leave room for the controls') }
        }
      }
      this.squeeze = squeeze
      // A group told not to wrap, in a panel that otherwise may: the same one scale, found the same way.
      u = narrowed(u, !this.compose(u, 0).fits)
      // fit: "width" fills the width whichever way: with room to spare the panel is drawn bigger, as far as
      // `maxScale` and no further than still fits the height.
      if (options.fit === 'width' && !set && this.compose(u, 0).fits && this.widest > 0 && this.widest < this.roomWide - 1) {
        const most = Math.min(options.maxScale ?? GROWN_MOST, u * this.roomWide / this.widest * 0.998)
        for (const part of [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125]) {
          const bigger = u + (most - u) * part
          if (bigger > u + 1e-3 && this.compose(bigger, 0).fits && this.over <= 0.5) { u = bigger; break }
        }
      }
    }
    this.scale = u
    this.squeeze = squeeze || 0
    if (!this.compose(u, 0).fits) { this.compose(u, (this.coarse ? 18 : 12) * u); return }
    // Height still to spare on a panel, after the scope has had its part: the keyboard has it, up to KEYS_MOST.
    if (!quick) this.keysMore = this.blank && this.spare > u ? Math.min(KEYS_MOST - KEYS_TALL, this.spare / u) : 0
    if (this.keysMore) this.compose(u, 0)
  }
  /** What the layout came to: the picture's width and height, the scale the controls are drawn at, and how many plates to a line were asked for. */
  info() {
    if (this.arrange) this.layout()
    return { width: this.W, height: this.H, scale: Math.round(this.u * 1000) / 1000, columns: this.columnsNow || 0 }
  }
  /** The rectangle of the picture that no control is on, for the scene to draw in. */
  room() {
    if (this.arrange) this.layout()
    const [x, y, width, height] = this.free
    return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }
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
  /** A picture to lie behind the controls: `layout({ image })`, a web address or a picture already loaded. */
  skinned(image) {
    if (image === this.skinFrom) return
    this.skinFrom = image
    this.skin = null
    if (!image) return
    if (typeof image !== 'string') { this.skin = image; return }
    const picture = new Image()
    picture.onload = () => { if (this.skinFrom === image) { this.skin = picture; this.arrange = true } }
    picture.src = image
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
    if (this.fling) {
      // Let go while moving, the plates carry on and slow down, and stop at either end.
      const f = this.fling, took = Math.min(50, performance.now() - f.at), v = this.viewport
      f.at = performance.now()
      const was = v ? [v.scroll, v.scrollX] : null
      if (v) this.scrollBy(f.vy * took, f.vx * took)
      const fade = Math.pow(1 / 3, took / FLING_FADE)
      f.vx *= fade; f.vy *= fade
      if (!v || Math.hypot(f.vx, f.vy) < 0.02 || (was[0] === v.scroll && was[1] === v.scrollX)) this.fling = null
    }
    const { g, ratio } = this
    // What is open over the controls is drawn last, over everything: while it is, the whole is drawn afresh.
    if (this.popup && (this.stale.size || this.popup.stale)) this.shift = true
    if (this.arrange || this.shift) {
      const quick = !this.arrange
      this.arrange = this.shift = false
      this.stale.clear()
      this.layout(quick)
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.ground()
      for (const item of this.items) this.paint(item, false)
      this.cover()
      if (this.popup) this.popup.paint(g)
      // The rectangle no control is on, then the picture's width and height and the scale: said when any of them changes.
      const now = this.info(), free = [...this.free.map(Math.round), now.width, now.height, now.scale]
      if (free.join() !== this.freeSaid) {
        const resized = free.slice(4).join() !== this.freeSaid.split(',').slice(4).join()
        this.freeSaid = free.join()
        this.roomNews = free
        // A scene that arranges itself by the width is told when the picture changes size: layout({ onResize }).
        if (resized && typeof this.options.onResize === 'function') this.options.onResize(now)
      }
    } else if (this.stale.size) {
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      for (const item of this.stale) if (this.items.includes(item)) this.paint(item, true)
      this.stale.clear()
    }
    const beat = this.beats && this.armed
    if (this.listener && (this.told.length || this.played.length || this.made.length || this.roomNews || beat)) {
      const told = this.told, played = this.played, made = this.made
      this.told = []; this.played = []; this.made = []
      if (beat) this.armed = false
      const news = { c: told, n: played, m: made, b: beat ? 1 : 0 }
      // The rectangle no control is on, when it has changed: a host keeps it for its scene (Python's room()).
      if (this.roomNews) { news.f = this.roomNews; this.roomNews = null }
      this.listener(news)
    } else if (!this.listener) {
      this.told.length = this.played.length = this.made.length = 0
      this.roomNews = null
    }
  }
  /** What lies under the controls: the backdrop, a picture, the plates, their titles and the tabs. */
  ground() {
    const { g, W, H, options, u } = this
    g.clearRect(0, 0, W, H)
    const [bx, by, bw, bh] = this.designed || [0, 0, W, H]
    if (this.blank && this.items.length) {
      g.fillStyle = typeof options.backdrop === 'string' && options.backdrop !== 'auto' ? options.backdrop : THEME.backdrop
      g.fillRect(0, 0, W, H)
    }
    if (this.skin && this.skin.width) {
      // The picture covers the panel, cut at the edges rather than squashed.
      const s = Math.max(bw / this.skin.width, bh / this.skin.height)
      g.save()
      g.beginPath(); g.rect(bx, by, bw, bh); g.clip()
      g.drawImage(this.skin, bx + (bw - this.skin.width * s) / 2, by + (bh - this.skin.height * s) / 2, this.skin.width * s, this.skin.height * s)
      g.restore()
    }
    const within = (clip, draw) => {
      if (!clip) return draw()
      g.save()
      g.beginPath(); g.rect(clip.x, clip.y, clip.w, clip.h); g.clip()
      draw()
      g.restore()
    }
    for (const plate of this.plates) {
      within(plate.clip, () => {
        const [x, y, w, h] = plate
        rounded(g, x, y, w, h, (plate.inner ? 9 : 12) * u)
        g.fillStyle = plate.inner ? THEME.well : THEME.plate
        g.fill()
        g.strokeStyle = THEME.edge
        g.lineWidth = 1
        g.stroke()
      })
    }
    for (const [x1, y1, x2, y2, clip] of this.rules) {
      within(clip, () => {
        g.strokeStyle = THEME.edge
        g.lineWidth = 1
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
      })
    }
    for (const title of this.titles) within(title.clip, () => words(g, title.text, title.x, title.y, title.size, title.colour, 'left', '600', title.w))
    if (this.tabs.length) {
      const [x, y, w, h] = this.tabStrip
      rounded(g, x, y, w, h, 10 * u)
      g.fillStyle = THEME.well
      g.fill()
      g.strokeStyle = THEME.edge
      g.lineWidth = 1
      g.stroke()
      for (const tab of this.tabs) {
        const on = tab.page === this.shown
        if (on) {
          rounded(g, tab.x + 3 * u, tab.y + 3 * u, tab.w - 6 * u, tab.h - 6 * u, 7 * u)
          g.fillStyle = THEME.knob
          g.fill()
          g.fillStyle = tab.page.colour || THEME.accent
          g.fillRect(tab.x + 14 * u, tab.y + tab.h - 6 * u, tab.w - 28 * u, 2 * u)
        }
        words(g, tab.page.label, tab.x + tab.w / 2, tab.y + tab.h / 2 - (on ? 1 * u : 0), 13 * u, on ? THEME.text : THEME.dim, 'center', '600', tab.w - 14 * u)
      }
    }
  }
  /** What lies over the controls: where the plates can be moved, a shade at each end that has more beyond it, and the bar. */
  cover() {
    const v = this.viewport
    if (!v) return
    const { g, u } = this
    const shade = (from, to) => {
      const fade = g.createLinearGradient(0, from, 0, to)
      fade.addColorStop(0, 'rgba(0, 0, 0, 0.5)')
      fade.addColorStop(1, 'rgba(0, 0, 0, 0)')
      g.fillStyle = fade
      g.fillRect(v.left, Math.min(from, to), v.right - v.left, Math.abs(to - from))
    }
    if (v.scroll > 0.5) shade(v.y, v.y + 16 * u)
    if (v.scroll < v.max - 0.5) shade(v.y + v.h, v.y + v.h - 16 * u)
    if (v.maxX > 0.5) {
      // Moved from side to side: a thin bar along the bottom says how far across they are.
      const wide = v.w - v.gutter, long = Math.max(28 * u, wide * wide / (wide + v.maxX))
      rounded(g, v.x + (wide - long) * v.scrollX / v.maxX, v.y + v.h - 5 * u, long, 3 * u, 1.5 * u)
      g.fillStyle = THEME.track
      g.fill()
    }
    if (v.max <= 0.5) return
    const bar = this.bar()
    rounded(g, bar.x, v.y, bar.w, v.h, bar.w / 2)
    g.fillStyle = THEME.plate
    g.fill()
    rounded(g, bar.x, bar.y, bar.w, bar.h, bar.w / 2)
    g.fillStyle = this.scroller.held ? THEME.dim : THEME.track
    g.fill()
  }
  /** The thumb of the bar beside the plates: as long, of the bar, as what is seen is of what there is. */
  bar() {
    const v = this.viewport, u = this.u
    const w = 5 * u, h = Math.max(28 * u, v.h * v.h / (v.h + v.max))
    return { x: v.right + v.gutter / 2 - w / 2, y: v.y + (v.h - h) * (v.max ? v.scroll / v.max : 0), w, h }
  }
  /** Draw one control inside its own box; `again`: over what it drew before, so what lies under it goes back first. */
  paint(item, again) {
    if (!item.w || item.items || item.hidden || item.ghost) return
    const g = this.g, v = item.view
    let x = item.x, y = item.y, w = item.w, h = item.h
    if (v) {
      // On plates that can be moved, only the part inside where they are seen.
      const top = Math.max(y, v.y), bottom = Math.min(y + h, v.y + v.h), left = Math.max(x, v.x), right = Math.min(x + w, v.x + v.w)
      if (bottom <= top || right <= left) return
      y = top; h = bottom - top; x = left; w = right - left
    }
    // Cut on whole pixels: drawn again and again over itself, a soft edge would show as a line.
    const snap = (v) => Math.round(v * this.ratio) / this.ratio
    const right = snap(x + w), bottom = snap(y + h)
    x = snap(x); y = snap(y)
    g.save()
    g.beginPath()
    g.rect(x, y, right - x, bottom - y)
    g.clip()
    if (again) this.ground()
    item.draw(g, item.u)
    if (again) this.cover()
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
      if (!item.w || item.items || item.hidden || item.ghost) continue
      if (item.view && (y < item.view.y || y >= item.view.y + item.view.h || x < item.view.x || x >= item.view.x + item.view.w)) continue
      if (x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h) return item
    }
    return null
  }
  tabAt(x, y) { return this.tabs.find((tab) => x >= tab.x && x < tab.x + tab.w && y >= tab.y && y < tab.y + tab.h) }
  /** Is anything of the controls at this point: a control, a tab, or the bar beside plates that can be moved? */
  covers(x, y) {
    const v = this.viewport
    // Where the plates can be moved, the whole of where they are seen is the controls': a finger there moves them.
    return !!this.popup || !!this.under(x, y) || !!this.tabAt(x, y) || (!!v && x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h)
  }
  pointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = this.point(e)
    // A touch anywhere ends what was being typed; and while something is open over the controls, every touch is its.
    if (this.typing) this.typing.close(true)
    if (this.popup) {
      e.preventDefault()
      try { this.canvas.setPointerCapture(e.pointerId) } catch (e2) { /* a pointer that has already gone */ }
      this.grabs.set(e.pointerId, this.popup)
      this.popup.held = true
      return this.popup.down(p)
    }
    const tab = this.tabAt(p.x, p.y)
    if (tab) { e.preventDefault(); this.show(tab.page); return }
    let item = this.under(p.x, p.y)
    const v = this.viewport
    // Where there is more than fits, a finger between the controls (or on words, a scope or a meter) moves the plates.
    if (v && p.x >= v.x && p.x < v.x + v.w && p.y >= v.y && p.y < v.y + v.h && (!item || (item.view && SLIDES.has(item.kind)))) {
      if (this.scroller.held) return
      item = this.scroller
      item.bar = v.max > 0.5 && p.x >= v.right && p.x < v.right + v.gutter
      // A press on the bar away from its thumb brings the thumb there.
      const bar = this.bar()
      if (item.bar && (p.y < bar.y || p.y > bar.y + bar.h)) this.scrollBy((p.y - bar.y - bar.h / 2) * (v.h + v.max) / v.h)
    }
    // The control touched last is the one the arrow keys work.
    this.focus = item && item !== this.scroller ? item : null
    this.keyed = false
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
    // A slider that lies across the way the plates move: the finger may mean either. It is the slider's if it
    // goes along the slider, and the plates' if it clearly goes the way they move.
    if (item.kind === 'slider' && item.view && v && (item.vertical ? v.maxX > 0.5 : v.max > 0.5) && !this.scroller.held) {
      this.waits.set(e.pointerId, { item, from: p })
      return
    }
    this.grabs.set(e.pointerId, item)
    item.held = true
    item.down(p)
  }
  pointerMove(e) {
    const wait = this.waits.get(e.pointerId)
    if (wait) {
      const p = this.point(e), dx = Math.abs(p.x - wait.from.x), dy = Math.abs(p.y - wait.from.y)
      if (Math.max(dx, dy) < MEANT_AFTER * this.u) return
      this.waits.delete(e.pointerId)
      const along = wait.item.vertical ? dy : dx, cross = wait.item.vertical ? dx : dy
      const item = cross > along * 1.5 ? this.scroller : wait.item
      if (item === this.scroller) item.bar = false
      this.grabs.set(e.pointerId, item)
      item.held = true
      item.down(wait.from)
    }
    const item = this.grabs.get(e.pointerId)
    if (item) item.move(this.point(e))
  }
  pointerUp(e) {
    const wait = this.waits.get(e.pointerId)
    if (wait) {
      // It never went anywhere: a tap on the slider, which brings its handle there.
      this.waits.delete(e.pointerId)
      wait.item.down(wait.from)
      wait.item.up(this.point(e))
      return
    }
    const item = this.grabs.get(e.pointerId)
    if (!item) return
    this.grabs.delete(e.pointerId)
    let still = false
    for (const other of this.grabs.values()) if (other === item) still = true
    item.held = still
    item.up(this.point(e))
    if (item === this.scroller) this.shift = true
  }
}

// ============================================================================================
// MORE CONTROLS. Each kind is a class of its own below, in the order of the README: for any program,
// for games, for music. They are put among the kinds at the end of this part, and `more` has the
// function a scene calls for each.

/**
 * THE KEYS go to the control that was touched last. `on` says what each key it knows does (it is
 * handed whether Shift is down); Tab goes on to the next control that takes keys, and Shift and Tab
 * back. A ring is drawn round the control once a key has been used on it.
 */
function keysOf(control, e, on) {
  const panel = control.panel
  if (panel.focus !== control || panel.typing || e.ctrlKey || e.metaKey || e.altKey) return false
  if (e.key === 'Tab') {
    const takers = panel.items.filter((item) => item.keyDown && item.kind !== 'keyboard' && item.w && !item.hidden)
    const next = takers[(takers.indexOf(control) + (e.shiftKey ? takers.length - 1 : 1)) % takers.length]
    if (!next || next === control) return false
    panel.focus = next
    panel.keyed = true
    control.touch(); next.touch()
    return true
  }
  const act = on[e.key === ' ' ? 'Space' : e.key]
  if (!act) return false
  panel.keyed = true
  act(e.shiftKey)
  control.touch()
  return true
}
function ring(g, control, x, y, w, h, r, u) {
  if (control.panel.focus !== control || !control.panel.keyed) return
  rounded(g, x - 2 * u, y - 2 * u, w + 4 * u, h + 4 * u, r + 2 * u)
  g.strokeStyle = THEME.text
  g.lineWidth = 1.5 * u
  g.stroke()
}

/** A finger that moved less than this, in points, between going down and lifting, tapped. */
const tapped = (control, p) => Math.hypot(p.x - control.from.x, p.y - control.from.y) < TAP_REACH * control.u && !control.dragged

/**
 * TYPING. A canvas cannot be typed into, so for as long as someone types, a real box for text is laid
 * over the control: the device's own keyboard, caret, selection and paste all work, on a phone as on
 * a computer. It is made as a tap ENDS (a phone brings its keyboard up only for a touch that has just
 * happened) and taken away when the typing is over: Enter keeps what was typed, Escape puts back what
 * was there, and a touch anywhere else keeps it. Its letters are never under 16 pixels, or a phone
 * would zoom the page in on it. It lies beside the controls' canvas in the page, so it stays on its
 * control when the page is scrolled or drawn at another size, and it asks nothing of the page it is
 * in (no dialog, no other window), so a scene shut in a frame is typed into as any other is. What is
 * typed goes no further than the box: the scene's `keys` do not see it.
 *
 *   where()                the place for it, in the scene's points: [x, y, w, h]
 *   text, keys             what is in it to begin with, and the keyboard asked for ("text", "decimal", "numeric")
 *   live(text)             called as each letter is typed
 *   done(text, entered)    called once at the end; entered: with the Enter key
 */
function typeIn(control, o) {
  const panel = control.panel
  if (panel.typing) panel.typing.close(true)
  const input = document.createElement('input')
  input.type = 'text'
  input.value = o.text
  input.inputMode = o.keys || 'text'
  input.enterKeyHint = 'done'
  input.autocomplete = 'off'
  input.autocapitalize = 'off'
  input.spellcheck = false
  if (o.max) input.maxLength = o.max
  if (o.placeholder) input.placeholder = o.placeholder
  input.setAttribute('aria-label', control.label)
  input.dataset.dialsTyping = ''
  const s = input.style, u = control.u
  s.cssText = `position:absolute;box-sizing:border-box;margin:0;padding:0 ${Math.round(8 * u)}px;border:1.5px solid ${control.accent};border-radius:${Math.round(6 * u)}px;outline:none;background:${THEME.well};color:${THEME.text};font:600 ${Math.max(16, Math.round(14 * u))}px ${THEME.font};text-align:${o.align || 'left'};-webkit-appearance:none;appearance:none;touch-action:manipulation`
  const typing = panel.typing = {
    control, input,
    /** Put it on its control, which the layout may have moved; a control that has gone, or gone out of sight, is typed into no more. */
    place() {
      const [x, y, w, h] = o.where(), v = control.view
      if (!panel.items.includes(control) || control.hidden || (v && (y < v.y || y + h > v.y + v.h || x < v.x || x + w > v.x + v.w))) return typing.close(true)
      const css = [panel.canvas.offsetLeft + x, panel.canvas.offsetTop + y, w, h].map((n) => Math.round(n * 2) / 2 + 'px')
      if (css.join() === typing.at) return
      typing.at = css.join()
      ;[s.left, s.top, s.width, s.height] = css
    },
    close(keep, entered, left) {
      if (panel.typing !== typing) return
      panel.typing = null
      const text = input.value, here = document.activeElement === input
      // Left because the page is taking it away (a scene that is stopped as it is typed into): the page is let finish first.
      if (left) { s.display = 'none'; setTimeout(() => input.remove()) } else input.remove()
      // The keys go back to the scene.
      if (here) try { panel.canvas.focus({ preventScroll: true }) } catch (e) { /* a canvas that cannot take them */ }
      o.done(keep ? text : o.text, !!(keep && entered))
      control.touch()
    },
  }
  input.addEventListener('input', () => { if (o.live) o.live(input.value) })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.isComposing) return
    if (e.key === 'Enter') typing.close(true, true)
    else if (e.key === 'Escape') typing.close(false)
  })
  input.addEventListener('keyup', (e) => e.stopPropagation())
  input.addEventListener('pointerdown', (e) => e.stopPropagation())
  input.addEventListener('blur', () => typing.close(true, false, true))
  if (!panel.typed) {
    panel.typed = true
    panel.undo.push(() => { if (panel.typing) panel.typing.close(false) })
  }
  panel.layer.after(input)
  typing.place()
  if (panel.typing !== typing) return null
  input.focus()
  if (o.all) input.select()
  else try { input.setSelectionRange(input.value.length, input.value.length) } catch (e) { /* a box that keeps no caret */ }
  control.touch()
  return typing
}
/** Is this control being typed into now? */
const typingIn = (control) => !!control.panel.typing && control.panel.typing.control === control

/** How long a − or + is held before it steps again, how long between steps at first, and the shortest that comes down to, in milliseconds. */
const STEP_HOLD_MS = 420
const STEP_AGAIN_MS = 130
const STEP_FASTEST_MS = 28
/** How far a finger drags up or down on the number for one step, in points. */
const STEP_DRAG = 9

/**
 * THE NUMBER BOX: a number with − and + at its sides. Tap one to step, hold it to keep stepping
 * (faster and faster), drag up or down on the number itself, or tap the number and type.
 * With the keys: the arrows step, Shift ten at a time, Home and End go to the ends, Enter types.
 */
class NumberBox extends Ranged {
  reset = null // two taps on + are two steps, not a way back to the start
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    if (!this.step) {
      // Told no step, it counts in ones; a range too small for that, in tenths or hundredths.
      const span = Math.abs(this.max - this.min)
      this.step = span >= 5 ? 1 : span >= 0.5 ? 0.1 : 0.01
      this.default = this.clean(this.default)
      this.v = this.clean(this.v)
    }
    this.log = false
    this.pos = this.toPos(this.v)
    this.side = 0 // the − (-1) or + (1) that is held
    this.again = 0 // when it steps next
  }
  scaleOf() { return 1 }
  natural(u, room, g) {
    g.font = `600 ${14 * u}px ${THEME.font}`
    const widest = Math.max(g.measureText(shown(this.min, this)).width, g.measureText(shown(this.max, this)).width)
    return [Math.max(132 * u, widest + 96 * u), 62 * u]
  }
  stretch() { return [0.92, 1.15] }
  /** The box the number and its − and + are in, and the room each of those two takes. */
  field(u) { return { x: this.x + 6 * u, y: this.y + 25 * u, w: this.w - 12 * u, h: 30 * u, side: 34 * u } }
  /** A new value made by hand: stepped, dragged or typed. */
  take(value) {
    value = this.clean(value)
    if (value === this.v) return
    this.v = value
    this.pos = this.toPos(value)
    this.changed(value)
  }
  nudge(by, big) { this.take(this.v + by * this.step * (big ? 10 : 1)) }
  down(p) {
    // A third of it at each side is the − and the +: more than is drawn, for a finger.
    this.side = p.x < this.x + this.w * 0.3 ? -1 : p.x >= this.x + this.w * 0.7 ? 1 : 0
    this.from = { x: p.x, y: p.y }
    this.dragged = false
    this.pulled = 0
    this.big = p.shift
    if (this.side) { this.nudge(this.side, p.shift); this.again = performance.now() + STEP_HOLD_MS; this.wait = STEP_AGAIN_MS }
    this.touch()
  }
  move(p) {
    if (this.side) return
    const u = this.u
    if (!this.dragged && Math.abs(p.y - this.from.y) < TAP_REACH * u) return
    if (!this.dragged) { this.dragged = true; this.last = this.from.y }
    this.pulled += this.last - p.y
    this.last = p.y
    const steps = Math.trunc(this.pulled / (STEP_DRAG * u))
    if (steps) { this.pulled -= steps * STEP_DRAG * u; this.nudge(steps, p.shift) }
  }
  up(p) {
    const tap = !this.side && tapped(this, p)
    this.side = 0
    this.again = 0
    if (tap) this.type()
    this.touch()
  }
  /** Type the number. What is typed that is not a number is not taken. */
  type() {
    const f = this.field(this.u)
    typeIn(this, {
      where: () => { const now = this.field(this.u); return [now.x + now.side, now.y, now.w - 2 * now.side, now.h] },
      text: String(this.v), keys: Math.min(this.min, this.max) < 0 ? 'text' : decimals(this.step) ? 'decimal' : 'numeric', align: 'center', all: true,
      done: (text) => { const n = parseFloat(String(text).replace(',', '.')); if (Number.isFinite(n)) this.take(n) },
    })
  }
  keyDown(e) {
    return keysOf(this, e, {
      ArrowUp: (big) => this.nudge(1, big), ArrowRight: (big) => this.nudge(1, big), ArrowDown: (big) => this.nudge(-1, big), ArrowLeft: (big) => this.nudge(-1, big),
      PageUp: () => this.nudge(1, true), PageDown: () => this.nudge(-1, true), Home: () => this.take(this.min), End: () => this.take(this.max), Enter: () => this.type(),
    })
  }
  frame() {
    super.frame()
    if (typingIn(this)) this.panel.typing.place()
    if (!this.side || !this.again || performance.now() < this.again) return
    this.wait = Math.max(STEP_FASTEST_MS, this.wait * 0.88)
    this.again = performance.now() + this.wait
    this.nudge(this.side, this.big)
  }
  draw(g, u) {
    const f = this.field(u), cy = f.y + f.h / 2
    const low = Math.min(this.min, this.max), high = Math.max(this.min, this.max)
    words(g, this.label, this.x + this.w / 2, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, f.x, f.y, f.w, f.h, 8 * u)
    g.fillStyle = THEME.knob
    g.fill()
    rounded(g, f.x + f.side, f.y + 3 * u, f.w - 2 * f.side, f.h - 6 * u, 5 * u)
    g.fillStyle = THEME.well
    g.fill()
    g.lineCap = 'round'
    g.lineWidth = 2.25 * u
    for (const by of [-1, 1]) {
      const cx = by < 0 ? f.x + f.side / 2 : f.x + f.w - f.side / 2, on = this.side === by
      if (on) { g.fillStyle = this.accent; g.beginPath(); g.arc(cx, cy, 11 * u, 0, TAU); g.fill() }
      // At the end of its range the − or the + has nothing more to do, and is drawn so.
      g.strokeStyle = on ? THEME.well : (by < 0 ? this.v > low : this.v < high) ? this.accent : THEME.track
      g.beginPath()
      g.moveTo(cx - 5 * u, cy); g.lineTo(cx + 5 * u, cy)
      if (by > 0) { g.moveTo(cx, cy - 5 * u); g.lineTo(cx, cy + 5 * u) }
      g.stroke()
    }
    if (!typingIn(this)) words(g, shown(this.v, this), this.x + this.w / 2, cy, 14 * u, THEME.text, 'center', '600', f.w - 2 * f.side - 8 * u)
    ring(g, this, f.x, f.y, f.w, f.h, 8 * u, u)
  }
}

/**
 * THE TEXT BOX: one line of text that is typed. `name.value` is the text; `onChange(text)` is called
 * as each letter is typed, and `onEnter(text)` when Enter (or the phone keyboard's Done) is pressed.
 */
class TextBox extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    let now = spec.value
    if (spec.target) {
      this.target = spec.target
      this.param = spec.param
      const d = describe(spec.target, spec.param)
      if (!this.label) this.label = d.label ?? d.name ?? String(spec.param)
      now ??= readTarget(this.target, this.param) ?? d.default
    }
    this.v = now == null ? '' : String(now)
    this.default = this.v
    this.placeholder = spec.placeholder ?? ''
    this.max = spec.max || 0 // the most letters it takes; 0: any number
    this.onEnter = spec.onEnter || null
    if (spec.value != null && this.target) writeTarget(this.target, this.param, this.v)
  }
  get value() { return this.v }
  set value(text) {
    text = String(text ?? '')
    if (text === this.v) return
    this.v = text
    if (this.target) writeTarget(this.target, this.param, text)
    if (typingIn(this)) this.panel.typing.input.value = text
    this.touch()
  }
  toString() { return this.v }
  natural(u) { return [(this.wide || 180) * u, 62 * u] }
  stretch() { return this.wide ? [1, 1] : [0.7, 2] }
  field(u) { return { x: this.x + 6 * u, y: this.y + 25 * u, w: this.w - 12 * u, h: 30 * u } }
  take(text) {
    if (this.max) text = text.slice(0, this.max)
    if (text === this.v) return
    this.v = text
    this.changed(text)
  }
  down(p) { this.from = { x: p.x, y: p.y }; this.touch() }
  up(p) { if (tapped(this, p)) this.type(); this.touch() }
  type() {
    typeIn(this, {
      where: () => { const f = this.field(this.u); return [f.x, f.y, f.w, f.h] },
      text: this.v, max: this.max, placeholder: this.placeholder,
      live: (text) => this.take(text),
      done: (text, entered) => {
        this.take(text)
        if (!entered) return
        if (this.onEnter) this.onEnter(this.v, this)
        // A host is told of Enter with the text in a list of its own.
        this.panel.told.push(this.id, [this.v])
      },
    })
  }
  keyDown(e) { return keysOf(this, e, { Enter: () => this.type() }) }
  frame() {
    if (typingIn(this)) return this.panel.typing.place()
    if (!this.target) return
    const there = readTarget(this.target, this.param)
    if (there != null && String(there) !== this.v) { this.v = String(there); this.touch() }
  }
  draw(g, u) {
    const f = this.field(u), cy = f.y + f.h / 2
    words(g, this.label, f.x + 2 * u, this.y + 13 * u, 12 * u, THEME.dim, 'left', '', this.w - 16 * u)
    rounded(g, f.x, f.y, f.w, f.h, 6 * u)
    g.fillStyle = THEME.well
    g.fill()
    g.strokeStyle = this.held ? this.accent : THEME.track
    g.lineWidth = 1.5 * u
    g.stroke()
    if (!typingIn(this)) {
      // Text too long for the box is shown from its end: the part that was typed last.
      g.save()
      g.beginPath(); g.rect(f.x + 8 * u, f.y, f.w - 16 * u, f.h); g.clip()
      g.font = `600 ${14 * u}px ${THEME.font}`
      const long = g.measureText(this.v).width > f.w - 16 * u
      if (this.v) words(g, this.v, long ? f.x + f.w - 8 * u : f.x + 8 * u, cy, 14 * u, THEME.text, long ? 'right' : 'left', '600')
      else if (this.placeholder) words(g, this.placeholder, f.x + 8 * u, cy, 14 * u, THEME.dim, 'left')
      g.restore()
    }
    ring(g, this, f.x, f.y, f.w, f.h, 6 * u, u)
  }
}

/** Seconds as a clock shows them: 65 is 1:05, and an hour or more is 1:01:05. */
function clock(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0)), two = (n) => String(n).padStart(2, '0')
  const h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60, s = whole % 60
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}
/** Words in which every digit takes the same room, so a number that is counting does not shake from side to side. */
function steady(g, text, cx, cy, size, colour, weight = '600') {
  g.font = `${weight} ${size}px ${THEME.font}`
  const cell = g.measureText('0').width, wide = (ch) => (ch >= '0' && ch <= '9' ? cell : g.measureText(ch).width)
  let all = 0
  for (const ch of text) all += wide(ch)
  if (cx == null) return all
  g.fillStyle = colour
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let x = cx - all / 2
  for (const ch of text) { const w = wide(ch); g.fillText(ch, x + w / 2, cy); x += w }
  return all
}

/**
 * THE READOUT shows a value or a message from the scene's code and takes no hand: a score, a clock,
 * a speed. It is given a function that is asked every frame (`readout("score", () => score)`), a
 * setting of a target, or nothing, and then `score.value = 12` says what it shows. `size: "large"`
 * is for a score; `format: "clock"` shows seconds as minutes and seconds.
 */
class Readout extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.pull = typeof spec.source === 'function' ? spec.source : null
    if (spec.target) {
      this.target = spec.target
      this.param = spec.param
      const d = describe(spec.target, spec.param)
      if (!this.label) this.label = d.label ?? d.name ?? String(spec.param)
      spec = { unit: d.unit, digits: d.digits, ...spec }
      this.pull = () => readTarget(this.target, this.param)
    }
    this.unit = unitOf(spec.unit ?? '')
    this.digits = spec.digits
    this.format = spec.format || null
    this.v = this.pull ? this.pull() : spec.value ?? ''
    this.text = this.said()
  }
  get value() { return this.v }
  set value(value) { this.v = value }
  scaleOf() { return 1 }
  /** How big its letters are, in points before scaling. */
  get letters() { return sized(this.size, 14, 20, 34) }
  /** What it shows, as words. */
  said() {
    const v = this.v
    if (this.format === 'clock') return clock(v)
    if (typeof this.format === 'function') return String(this.format(v))
    // A number that has once had a part after the point keeps two places, so that it does not jump as it passes a whole number.
    if (typeof v === 'number') return v.toFixed(this.digits ?? ((this.parts ||= !Number.isInteger(v)) ? 2 : 0))
    return v == null ? '' : String(v)
  }
  /** How wide what it shows is, with its unit. */
  wideOf(g, u) {
    const text = steady(g, this.text, null, 0, this.letters * u)
    if (!this.unit) return text
    g.font = `${Math.max(11, this.letters * 0.5) * u}px ${THEME.font}`
    return text + 5 * u + g.measureText(this.unit).width
  }
  natural(u, room, g) {
    g.font = `${12 * u}px ${THEME.font}`
    const heading = this.label ? g.measureText(this.label).width + 16 * u : 0
    return [this.wide ? this.wide * u : Math.max(84 * u, heading, this.wideOf(g, u) + 32 * u), ((this.label ? 25 : 8) + this.letters * 1.5 + 7) * u]
  }
  stretch() { return this.wide ? [1, 1] : [1, 1.6] }
  frame() {
    if (this.pull) this.v = this.pull()
    const text = this.said()
    if (text === this.text) return
    this.text = text
    // What no longer fits its box is given a wider one; a box is never made narrower, or the others would jump about.
    if (!this.wide && this.w && this.wideOf(this.panel.g, this.u) + 20 * this.u > this.w) this.panel.arrange = true
    this.touch()
  }
  draw(g, u) {
    const top = this.y + (this.label ? 25 : 8) * u, h = this.y + this.h - 7 * u - top, cy = top + h / 2
    if (this.label) words(g, this.label, this.x + this.w / 2, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, this.x + 6 * u, top, this.w - 12 * u, h, 7 * u)
    g.fillStyle = THEME.well
    g.fill()
    const size = this.letters * u, small = Math.max(11, this.letters * 0.5) * u
    g.font = `${small}px ${THEME.font}`
    const unit = this.unit ? g.measureText(this.unit).width + 5 * u : 0
    // Too long for its box even so (a message), it is drawn narrower rather than cut.
    const all = steady(g, this.text, null, 0, size) + unit, room = this.w - 24 * u
    g.save()
    if (all > room) { g.translate(this.x + this.w / 2, 0); g.scale(room / all, 1); g.translate(-(this.x + this.w / 2), 0) }
    const wide = steady(g, this.text, this.x + this.w / 2 - unit / 2, cy + 0.5 * u, size, this.colour || THEME.text)
    if (this.unit) words(g, this.unit, this.x + this.w / 2 - unit / 2 + wide / 2 + 5 * u, cy + (size - small) * 0.32, small, THEME.dim, 'left')
    g.restore()
  }
}

/**
 * SOMETHING OPEN OVER THE CONTROLS: a list to pick from, a colour picker, a message. It is drawn
 * last, over everything, and while it is open every touch is its own: one outside it closes it.
 * `owner` is the control it was opened from (it is put beside it), or nothing, and then it is
 * in the middle of the picture.
 */
class Popup {
  constructor(panel, owner) {
    this.panel = panel
    this.owner = owner || null
    this.x = this.y = this.w = this.h = 0
    this.held = false
    this.stale = true
  }
  get u() { return this.panel.u }
  get shown() { return this.panel.popup === this }
  open() {
    const panel = this.panel
    if (panel.typing) panel.typing.close(true)
    if (panel.popup && panel.popup !== this) panel.popup.close()
    panel.popup = this
    if (this.owner) panel.focus = this.owner
    this.stale = true
    return this
  }
  close() {
    if (!this.shown) return
    this.panel.popup = null
    for (const [id, held] of this.panel.grabs) if (held === this) this.panel.grabs.delete(id)
    this.held = false
    this.panel.shift = true
    if (this.closed) this.closed()
  }
  touch() { this.stale = true }
  /** Where it goes: under what it was opened from if there is room, else over it, and never off the picture. */
  put(w, h, near) {
    const { W, H } = this.panel, edge = 6 * this.u
    this.w = Math.min(w, W - 2 * edge)
    this.h = Math.min(h, H - 2 * edge)
    if (!near) { this.x = (W - this.w) / 2; this.y = (H - this.h) / 2; return }
    const [nx, ny, nw, nh] = near, gap = 4 * this.u
    this.x = clamp(nx + nw / 2 - this.w / 2, edge, W - edge - this.w)
    const under = ny + nh + gap, over = ny - gap - this.h
    this.y = under + this.h <= H - edge ? under : over >= edge ? over : clamp(under, edge, H - edge - this.h)
  }
  inside(p) { return p.x >= this.x && p.x < this.x + this.w && p.y >= this.y && p.y < this.y + this.h }
  paint(g) {
    const u = this.u
    this.stale = false
    // What it was opened from has gone (its scene took it away, or its page was turned): so does this.
    if (this.owner && (!this.panel.items.includes(this.owner) || this.owner.hidden)) return this.close()
    this.arrange(g, u)
    g.save()
    if (this.shade) { g.fillStyle = 'rgba(0, 0, 0, 0.55)'; g.fillRect(0, 0, this.panel.W, this.panel.H) }
    g.shadowColor = 'rgba(0, 0, 0, 0.5)'
    g.shadowBlur = 18 * u
    g.shadowOffsetY = 5 * u
    rounded(g, this.x, this.y, this.w, this.h, 10 * u)
    g.fillStyle = THEME.plate
    g.fill()
    g.shadowColor = 'transparent'
    g.strokeStyle = THEME.edge
    g.lineWidth = 1
    g.stroke()
    rounded(g, this.x, this.y, this.w, this.h, 10 * u)
    g.clip()
    this.draw(g, u)
    g.restore()
  }
  /** A touch outside it closes it, and is not felt by what is underneath. */
  down(p) {
    this.out = !this.inside(p)
    if (this.out) { if (!this.fixed) this.close(); return }
    this.press(p)
  }
  move(p) { if (!this.out) this.drag(p) }
  up(p) { if (!this.out) this.lift(p) }
  arrange() {}
  draw() {}
  press() {}
  drag() {}
  lift() {}
}

/** A tick, drawn: the mark of what is chosen. */
function tick(g, cx, cy, size, colour, thick) {
  g.strokeStyle = colour
  g.lineWidth = thick
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(cx - size * 0.5, cy + size * 0.02)
  g.lineTo(cx - size * 0.14, cy + size * 0.38)
  g.lineTo(cx + size * 0.52, cy - size * 0.36)
  g.stroke()
}

/** A CHECKBOX: a toggle drawn as a box that is ticked, with its label beside it. */
class Checkbox extends Toggle {
  natural(u, room, g) {
    g.font = `${14 * u}px ${THEME.font}`
    return [Math.max(64 * u, g.measureText(this.label).width + 54 * u), 44 * u]
  }
  keyDown(e) { return keysOf(this, e, { Space: () => this.down(), Enter: () => this.down() }) }
  draw(g, u) {
    const side = 22 * u, x = this.x + 10 * u, cy = this.y + this.h / 2
    rounded(g, x, cy - side / 2, side, side, 6 * u)
    g.fillStyle = this.v ? this.accent : THEME.well
    g.fill()
    if (!this.v) { g.strokeStyle = this.held ? this.accent : THEME.track; g.lineWidth = 1.75 * u; g.stroke() }
    else tick(g, x + side / 2, cy, side * 0.6, THEME.well, 2.75 * u)
    words(g, this.label, x + side + 9 * u, cy + 0.5 * u, 14 * u, THEME.text, 'left', '', this.w - side - 26 * u)
    ring(g, this, x, cy - side / 2, side, side, 6 * u, u)
  }
}

/**
 * ONE OF A FEW, all in sight: the choices stand side by side, and the one chosen is lit. A finger
 * that slides across them chooses as it goes. Where they do not fit on one line they take two.
 * `value` is the choice and `index` its place, as for a select.
 */
class Choose extends Select {
  /** Go to a choice by hand. */
  pick(i) {
    i = clamp(i, 0, this.choices.length - 1)
    if (i === this.i || !this.choices.length) return
    this.i = i
    this.changed(this.choices[i])
  }
  natural(u, room, g) {
    const n = Math.max(1, this.choices.length)
    g.font = `600 ${13 * u}px ${THEME.font}`
    let cell = 44 * u
    for (const choice of this.choices) cell = Math.max(cell, g.measureText(String(choice)).width + 24 * u)
    // As many to a line as fit, and the lines as even as they can be.
    const lines = Math.ceil(n / Math.max(1, Math.min(n, Math.floor((room - 12 * u) / cell))))
    this.cols = Math.ceil(n / lines)
    return [Math.min(room, Math.max(this.cols * cell + 12 * u, 96 * u)), (25 + lines * 30 + 7) * u]
  }
  stretch() { return [1, 1.5] }
  /** Where choice i is drawn. */
  cell(i, u) {
    const across = this.cols || 1, lines = Math.ceil(this.choices.length / across)
    const w = (this.w - 12 * u) / across, h = (this.h - 32 * u) / lines
    return { x: this.x + 6 * u + (i % across) * w, y: this.y + 25 * u + Math.floor(i / across) * h, w, h }
  }
  choiceAt(p, u) {
    const across = this.cols || 1, first = this.cell(0, u)
    const col = clamp(Math.floor((p.x - first.x) / first.w), 0, across - 1), line = clamp(Math.floor((p.y - first.y) / first.h), 0, Math.ceil(this.choices.length / across) - 1)
    return Math.min(this.choices.length - 1, line * across + col)
  }
  down(p) { this.pick(this.choiceAt(p, this.u)); this.touch() }
  move(p) { this.pick(this.choiceAt(p, this.u)) }
  keyDown(e) {
    const by = (n) => () => this.pick(this.i + n)
    return keysOf(this, e, { ArrowRight: by(1), ArrowDown: by(1), ArrowLeft: by(-1), ArrowUp: by(-1), Home: () => this.pick(0), End: () => this.pick(this.choices.length - 1) })
  }
  draw(g, u) {
    const n = this.choices.length
    words(g, this.label, this.x + this.w / 2, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, this.x + 6 * u, this.y + 25 * u, this.w - 12 * u, this.h - 32 * u, 8 * u)
    g.fillStyle = THEME.knob
    g.fill()
    for (let i = 0; i < n; i++) {
      const c = this.cell(i, u), on = i === this.i
      if (on) {
        rounded(g, c.x + 3 * u, c.y + 3 * u, c.w - 6 * u, c.h - 6 * u, 6 * u)
        g.fillStyle = this.accent
        g.fill()
      }
      words(g, String(this.choices[i]), c.x + c.w / 2, c.y + c.h / 2 + 0.5 * u, 13 * u, on ? THEME.well : THEME.text, 'center', '600', c.w - 10 * u)
    }
    ring(g, this, this.x + 6 * u, this.y + 25 * u, this.w - 12 * u, this.h - 32 * u, 8 * u, u)
  }
}

/** ONE OF A FEW, one under another, each with a round mark that is filled when it is the one chosen. */
class Radio extends Choose {
  natural(u, room, g) {
    g.font = `${14 * u}px ${THEME.font}`
    let widest = g.measureText(this.label).width - 30 * u
    for (const choice of this.choices) widest = Math.max(widest, g.measureText(String(choice)).width)
    return [Math.min(room, Math.max(96 * u, widest + 54 * u)), ((this.label ? 25 : 6) + Math.max(1, this.choices.length) * 34 + 4) * u]
  }
  stretch() { return [1, 1] }
  cell(i, u) {
    const top = this.y + (this.label ? 25 : 6) * u
    return { x: this.x + 6 * u, y: top + i * 34 * u, w: this.w - 12 * u, h: 34 * u }
  }
  choiceAt(p, u) { return clamp(Math.floor((p.y - this.cell(0, u).y) / (34 * u)), 0, this.choices.length - 1) }
  draw(g, u) {
    if (this.label) words(g, this.label, this.x + 10 * u, this.y + 13 * u, 12 * u, THEME.dim, 'left', '', this.w - 16 * u)
    for (let i = 0; i < this.choices.length; i++) {
      const c = this.cell(i, u), on = i === this.i, cx = c.x + 15 * u, cy = c.y + c.h / 2
      g.beginPath(); g.arc(cx, cy, 10 * u, 0, TAU)
      g.fillStyle = THEME.well
      g.fill()
      g.strokeStyle = on ? this.accent : THEME.track
      g.lineWidth = 1.75 * u
      g.stroke()
      if (on) { g.fillStyle = this.accent; g.beginPath(); g.arc(cx, cy, 5.5 * u, 0, TAU); g.fill() }
      words(g, String(this.choices[i]), cx + 19 * u, cy + 0.5 * u, 14 * u, on ? THEME.text : THEME.dim, 'left', on ? '600' : '', c.w - 40 * u)
      if (on) ring(g, this, c.x + 3 * u, c.y + 3 * u, c.w - 6 * u, c.h - 6 * u, 6 * u, u)
    }
  }
}

/** How tall a line of an open list is, in points, and how many are shown at once at most: more are moved to with a finger or the wheel. */
const LIST_LINE = 40
const LIST_LINES = 7.5

/** The list a dropdown opens: every choice on a line of its own. A tap picks; a drag, or the wheel, moves a list too long to show. */
class ListPopup extends Popup {
  constructor(owner) {
    super(owner.panel, owner)
    this.scroll = null // how far down the list has been moved; null: not yet, so the choice is brought into sight
    this.on = owner.i // the line the keys are on
  }
  arrange(g, u) {
    const o = this.owner, n = o.choices.length, line = LIST_LINE * u
    g.font = `600 ${14 * u}px ${THEME.font}`
    let widest = 0
    for (const choice of o.choices) widest = Math.max(widest, g.measureText(String(choice)).width)
    const f = o.field(u)
    this.put(Math.max(f.w, widest + 62 * u), Math.min(n, LIST_LINES) * line + 8 * u, [f.x, f.y, f.w, f.h])
    this.most = Math.max(0, n * line + 8 * u - this.h)
    this.scroll = clamp(this.scroll ?? (o.i + 0.5) * line - this.h / 2, 0, this.most)
  }
  /** Bring a line into sight. */
  see(i) {
    const line = LIST_LINE * this.u, top = i * line, bottom = top + line + 8 * this.u
    this.scroll = clamp(clamp(this.scroll || 0, bottom - this.h, top), 0, this.most || 0)
    this.touch()
  }
  wheel(by) { this.scroll = clamp((this.scroll || 0) + by, 0, this.most || 0); this.touch() }
  lineAt(p) { return Math.floor((p.y - this.y - 4 * this.u + this.scroll) / (LIST_LINE * this.u)) }
  press(p) { this.from = { x: p.x, y: p.y }; this.last = p.y; this.moved = false; this.down_ = this.lineAt(p); this.touch() }
  drag(p) {
    if (!this.moved && Math.abs(p.y - this.from.y) < TAP_REACH * this.u) return
    this.moved = true
    this.wheel(this.last - p.y)
    this.last = p.y
  }
  lift(p) {
    const i = this.lineAt(p), o = this.owner
    this.down_ = null
    if (this.moved || i < 0 || i >= o.choices.length) return this.touch()
    this.close()
    o.pick(i)
  }
  closed() { this.owner.touch() }
  keyDown(e) {
    const n = this.owner.choices.length, to = (i) => { this.on = clamp(i, 0, n - 1); this.see(this.on) }
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown') to(this.on + 1)
    else if (e.key === 'ArrowUp') to(this.on - 1)
    else if (e.key === 'Home') to(0)
    else if (e.key === 'End') to(n - 1)
    else if (e.key === 'Enter' || e.key === ' ') { this.close(); this.owner.pick(this.on) }
    else return false
    return true
  }
  draw(g, u) {
    const o = this.owner, line = LIST_LINE * u, top = this.y + 4 * u - this.scroll
    for (let i = Math.max(0, Math.floor(this.scroll / line) - 1); i < o.choices.length; i++) {
      const y = top + i * line
      if (y > this.y + this.h) break
      const on = i === o.i, pressed = i === this.down_ && !this.moved, keyed = this.panel.keyed && i === this.on
      if (on || pressed || keyed) {
        rounded(g, this.x + 4 * u, y + 2 * u, this.w - 8 * u, line - 4 * u, 7 * u)
        g.fillStyle = pressed ? THEME.track : THEME.knob
        g.fill()
        if (keyed) { g.strokeStyle = THEME.text; g.lineWidth = 1.5 * u; g.stroke() }
      }
      if (on) tick(g, this.x + 22 * u, y + line / 2, 12 * u, o.accent, 2.25 * u)
      words(g, String(o.choices[i]), this.x + 40 * u, y + line / 2 + 0.5 * u, 14 * u, on ? THEME.text : THEME.dim, 'left', on ? '600' : '', this.w - 54 * u)
    }
    if (this.most > 0.5) {
      // More than is shown: a thumb at the side says how far down the list is.
      const long = Math.max(24 * u, this.h * this.h / (this.h + this.most)), y = this.y + 4 * u + (this.h - 8 * u - long) * (this.scroll / this.most)
      rounded(g, this.x + this.w - 7 * u, y, 3.5 * u, long, 2 * u)
      g.fillStyle = THEME.track
      g.fill()
    }
  }
}

/**
 * A DROPDOWN: one of a list too long to step through. It shows the choice; a tap opens the whole
 * list over the controls, which is moved with a finger or the wheel when it is long, and closes on
 * a pick or a touch outside it. `value` is the choice and `index` its place, as for a select.
 */
class Dropdown extends Choose {
  natural(u, room, g) {
    g.font = `600 ${13 * u}px ${THEME.font}`
    let widest = 0
    for (const choice of this.choices) widest = Math.max(widest, g.measureText(String(choice)).width)
    return [Math.min(room, Math.max(120 * u, Math.min(widest, 180 * u) + 58 * u)), 62 * u]
  }
  stretch() { return [0.88, 1.3] }
  field(u) { return { x: this.x + 6 * u, y: this.y + 25 * u, w: this.w - 12 * u, h: 30 * u } }
  get open() { return !!this.list && this.list.shown }
  set open(on) { if (on) this.show(); else if (this.list) this.list.close() }
  /** Open the list. */
  show() { if (this.choices.length) this.list = new ListPopup(this).open() }
  down(p) { this.from = { x: p.x, y: p.y }; this.touch() }
  move() {}
  up(p) { if (tapped(this, p)) this.show(); this.touch() }
  keyDown(e) {
    if (this.open) {
      if (this.panel.focus !== this) return false
      this.panel.keyed = true
      return this.list.keyDown(e)
    }
    const by = (n) => () => this.pick(this.i + n)
    return keysOf(this, e, { ArrowDown: by(1), ArrowUp: by(-1), Enter: () => this.show(), Space: () => this.show() })
  }
  draw(g, u) {
    const f = this.field(u), cy = f.y + f.h / 2
    words(g, this.label, this.x + this.w / 2, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, f.x, f.y, f.w, f.h, 8 * u)
    g.fillStyle = this.held || this.open ? THEME.track : THEME.knob
    g.fill()
    words(g, String(this.value ?? ''), f.x + 12 * u, cy + 0.5 * u, 13 * u, THEME.text, 'left', '600', f.w - 42 * u)
    // The mark that says there is a list: a small arrow head, pointing down.
    const ax = f.x + f.w - 17 * u
    g.strokeStyle = this.accent
    g.lineWidth = 2.25 * u
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath(); g.moveTo(ax - 5 * u, cy - 2.5 * u); g.lineTo(ax, cy + 2.5 * u); g.lineTo(ax + 5 * u, cy - 2.5 * u); g.stroke()
    ring(g, this, f.x, f.y, f.w, f.h, 8 * u, u)
  }
}

Object.assign(KINDS, { number: NumberBox, textBox: TextBox, readout: Readout, checkbox: Checkbox, choose: Choose, radio: Radio, dropdown: Dropdown })
for (const kind of ['readout']) SLIDES.add(kind)

/** A text box: (label, text, options) or (label, target, "setting", options). A function anywhere is its onChange. */
function texted(args) {
  let [label, a, b, c] = args
  if (typeof label !== 'string') { [a, b, c] = [label, a, b]; label = undefined }
  let spec
  if (isTarget(a) && typeof a !== 'function' && typeof b === 'string') spec = { ...c, target: a, param: b }
  else if (typeof a === 'string' || typeof a === 'number') spec = { ...(isPlain(b) ? b : null), value: String(a) }
  else spec = { ...(isPlain(a) ? a : null) }
  for (const arg of args) if (typeof arg === 'function') spec.onChange = arg
  spec.label = label
  return spec
}
/** A readout: (label, () => value, options), (label, value, options), (label, target, "setting", options) or (label, options). */
function shownFrom(args) {
  let [label, a, b, c] = args
  if (typeof label !== 'string') { [a, b, c] = [label, a, b]; label = undefined }
  if (typeof a === 'function') return { ...b, label, source: a }
  if (isTarget(a) && typeof b === 'string') return { ...c, label, target: a, param: b }
  if (isPlain(a)) return { ...a, label }
  return { ...b, label, value: a }
}

/** The functions a scene calls for the controls of this part. */
function more(panel) {
  const make = (kind, read) => (...args) => panel.add(kind, read(args))
  return {
    /** A number with − and + at its sides, which can be typed: number("lives", 0, 9, 3) or number("voices", lead, "voices"). */
    number: make('number', ranged),
    stepper: make('number', ranged),
    /** A line of text that is typed: textBox("name", "Ada"), then name.value. Options: placeholder, max (letters), onChange, onEnter. */
    textBox: make('textBox', texted),
    /** A value or a message shown: readout("score", () => score), or score = readout("score") and score.value = 12. */
    readout: make('readout', shownFrom),
    /** A box that is ticked: checkbox("sound", true), then sound.on. checkbox(label, target, "setting") ties it to a setting. */
    checkbox: make('checkbox', toggled),
    /** One of a few, side by side: choose("mode", ["easy", "medium", "hard"], "medium"), then mode.value. */
    choose: make('choose', selected),
    /** One of a few, one under another with a round mark each. */
    radio: make('radio', selected),
    /** One of a long list, which opens over the controls: dropdown("country", countries, "Peru"). */
    dropdown: make('dropdown', selected),
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
  /**
   * A box: its title, how many columns (a number), its options and the function that fills it, each left out
   * or given in any order. With a function, what the function makes is in the box. With none, what is made
   * next is, until the next group, row or page.
   */
  const boxed = (kind) => (...args) => {
    const spec = {}
    let fill = null
    for (const arg of args) {
      if (typeof arg === 'function') fill = arg
      else if (typeof arg === 'string') spec.label = arg
      else if (typeof arg === 'number') spec.columns = arg
      else if (isPlain(arg)) Object.assign(spec, arg)
    }
    const box = panel.add(kind, spec)
    if (fill && box) {
      box.enter()
      try { fill(box) } finally { box.leave() }
    }
    return box
  }
  return {
    dial: make('dial', ranged),
    slider: make('slider', ranged),
    toggle: make('toggle', toggled),
    select: make('select', selected),
    /** A knob that clicks between a few places: rotary("mode", ["room", "hall", "plate"], "hall") or rotary("wave", lead, "wave"). */
    rotary: make('rotary', selected),
    scope: make('scope', sourced),
    meter: make('meter', sourced),
    /** button("fire"), button("fire", onPress), button("fire", { onPress, onRelease }). */
    button: (label, a, b) => panel.add('button', typeof a === 'function' ? { ...b, label, onPress: a } : { ...a, label }),
    /** keyboard(target, { octave: 4 }), keyboard({ octave: 4 }) or keyboard(). */
    keyboard: (a, b) => panel.add('keyboard', isPlain(a) && !method(a, 'noteOn', 'note_on') ? { ...a } : { ...b, target: a }),
    /** Words. Made just before some controls and outside any group, it is their heading. */
    label: (text, options) => panel.add('label', { ...options, label: String(text) }),
    /** A titled plate that keeps its controls together: group("filter", () => { dial(…); dial(…) }), or group("filter") and then the controls. */
    group: boxed('group'),
    /** row(() => { … }): what the function makes stands in a line. row() alone: the controls made after this start a new line. */
    row: boxed('row'),
    /** column(() => { … }): one under another. */
    column: boxed('column'),
    /** grid(3, () => { … }): three to a line, in columns that line up. */
    grid: boxed('grid'),
    /** page("fx", () => { … }), or page("fx") and then its controls: a page of plates, turned to with a tab. page() ends the pages. */
    page: boxed('page'),
    /** wrap(): if this line has to be split, here is where. Nothing happens while everything fits. */
    wrap: () => panel.add('row', { soft: true }),
    /** spacer(20): that much room. spacer(): all the room that is left over, so what follows is pushed to the far end. */
    spacer: (size, options) => panel.add('spacer', isPlain(size) ? { ...size } : { ...options, size }),
    /**
     * How it is all laid out, each of these left out or given:
     *   wrap: false                  every row stays one row; everything is drawn smaller until the widest fits the width
     *   wrap: true                   every row() is a new line, and a row is split only when it does not fit
     *   minScale: 0.8                told not to wrap, no smaller than this: wider rows are moved from side to side
     *   columns: 3                   so many plates to a line; or by width, { phone: 1, tablet: 2, wide: 3 } or { 0: 1, 700: 3 }
     *   size: [800, 480]             the panel is laid out at this size on every screen, then made to fit the picture whole;
     *                                size: 800 is a width alone (as is fit: "width"): what does not fit is moved up and down
     *   scale: 1.2                   everything bigger or smaller
     *   at: "top", "bottom", "left" or "right", margin: 10, align: "center", compact: true, dividers: true, plates: false,
     *   backdrop: true, false or a colour, image: a picture behind the controls, onResize: called when the picture changes size
     * It gives back { width, height, scale, columns }: the picture's size and the scale the controls are drawn at now.
     */
    layout: (options) => {
      if (options) {
        Object.assign(panel.options, options)
        if ('image' in options) panel.skinned(options.image)
        panel.arrange = true
      }
      return panel.info()
    },
    /** The rectangle of the picture that no control is on: { x, y, width, height }. A scene draws in it. */
    room: () => panel.room(),
    /** Is a control at this point? A game asks before it treats a click as its own. */
    over: (x, y) => { if (typeof x === 'object') ({ x, y } = x); return panel.covers(x, y) },
    theme: (colours) => theme(colours),
    ...more(panel),
    /** Take every control away. */
    clear: () => panel.clear(),
    get all() { return panel.items.filter((item) => !item.items) },
    panel,

    // --- for a host that keeps the scene's code somewhere else (Python): controls by number
    make: (kind, id, spec) => {
      const item = panel.add(kind, { ...spec, id })
      // What it took from a target in the page (its range, its choices, where it stands) is told to the host.
      if (item && item.target && item.param != null) panel.made.push(id, item.min ?? 0, item.max ?? 1, item.default ?? 0, (item.choices || []).join('|'), item.i ?? item.v)
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
const rotary = (...args) => dials().rotary(...args)
const keyboard = (...args) => dials().keyboard(...args)
const scope = (...args) => dials().scope(...args)
const meter = (...args) => dials().meter(...args)
const label = (...args) => dials().label(...args)
const group = (...args) => dials().group(...args)
const row = (...args) => dials().row(...args)
const column = (...args) => dials().column(...args)
const grid = (...args) => dials().grid(...args)
const page = (...args) => dials().page(...args)
const spacer = (...args) => dials().spacer(...args)
const wrap = () => dials().wrap()
const layout = (options) => dials().layout(options)
const room = () => dials().room()
const over = (x, y) => dials().over(x, y)
const number = (...args) => dials().number(...args)
const stepper = (...args) => dials().stepper(...args)
const textBox = (...args) => dials().textBox(...args)
const readout = (...args) => dials().readout(...args)
const checkbox = (...args) => dials().checkbox(...args)
const choose = (...args) => dials().choose(...args)
const radio = (...args) => dials().radio(...args)
const dropdown = (...args) => dials().dropdown(...args)

export { dials, dial, slider, button, toggle, select, rotary, keyboard, scope, meter, label, group, row, column, grid, page, spacer, wrap, layout, room, over, theme, version,
  number, stepper, textBox, readout, checkbox, choose, radio, dropdown }
