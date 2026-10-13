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
const SPELLING = { color: 'colour', on_change: 'onChange', on_press: 'onPress', on_release: 'onRelease', on_note_on: 'onNoteOn', on_note_off: 'onNoteOff', title: 'label', show_value: 'showValue', log_from: 'logFrom', min_scale: 'minScale', max_scale: 'maxScale', on_resize: 'onResize' }
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
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.showValue = spec.showValue
  }
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
    // With the names round it, the one it is on is lit there: it is not written again underneath, unless asked for.
    return [Math.max(76 * u, across + 26 * u + 2 * this.side), across + (this.named ? (this.reads ? 78 : 66) : 50) * u]
  }
  /** Where notch i is round the knob: an angle, from lower left round the top to lower right. */
  angle(i) {
    const n = this.choices.length
    return TAU * 0.375 + TAU * 0.75 * (n > 1 ? i / (n - 1) : 0.5)
  }
  /** The middle of the knob: where a dial's is in a box as tall, so that a rotary and the dials beside it are on one line. */
  centre(u) { return [this.x + this.w / 2, this.y + 20 * u + (this.h - 40 * u) / 2] }
  /** Is the choice written under the knob? Where no names are round it, unless told not to (`showValue: false`); where they are, only if asked (`showValue: true`). */
  get reads() { return this.showValue ?? !this.named }
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
      // (The name at the top sits close to the knob, to stay clear of the title above it.)
      const text = String(this.choices[i]), tx = cx + c * (r + 8 * u), ty = cy + sn * (r + (side === 'center' ? 7 : 9) * u)
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
    if (this.reads) words(g, String(this.value ?? ''), cx, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '600', this.w - 6 * u)
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

SPELLING.on_enter = 'onEnter'
SPELLING.as_keys = 'asKeys'
SPELLING.on_step = 'onStep'

/**
 * THE KEYS go to the control that was touched last. `on` says what each key it knows does (it is
 * handed whether Shift is down); Tab goes on to the next control that takes keys, and Shift and Tab
 * back. A ring is drawn round the control once a key has been used on it.
 */
function keysOf(control, e, on) {
  const panel = control.panel
  // (A key that a control pressed for the scene, as a pad of arrows does, is the scene's alone.)
  if (panel.focus !== control || panel.typing || e.ctrlKey || e.metaKey || e.altKey || e.isTrusted === false) return false
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
  s.cssText = `position:absolute;box-sizing:border-box;margin:0;padding:0 ${Math.round(8 * u)}px;border:1.5px solid ${control.accent};border-radius:${Math.round(6 * u)}px;outline:none;background:${THEME.well};color:${THEME.text};font:600 ${Math.max(16, Math.round(14 * u))}px ${THEME.font};text-align:${o.align || 'left'};-webkit-appearance:none;appearance:none;touch-action:manipulation;user-select:text;-webkit-user-select:text`
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
  press(p) { this.from = { x: p.x, y: p.y }; this.last = p.y; this.moved = false; this.pressed = this.lineAt(p); this.touch() }
  drag(p) {
    if (!this.moved && Math.abs(p.y - this.from.y) < TAP_REACH * this.u) return
    this.moved = true
    this.wheel(this.last - p.y)
    this.last = p.y
  }
  lift(p) {
    const i = this.lineAt(p), o = this.owner
    this.pressed = null
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
      const on = i === o.i, pressed = i === this.pressed && !this.moved, keyed = this.panel.keyed && i === this.on
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

/**
 * WHAT A SCENE IS GIVEN for a control whose numbers are called x and y. On the control itself those
 * two names say where it is drawn, so the scene holds this instead: the numbers under their own
 * names, with what every control has (value, label, held, onChange, remove, place). The control it
 * stands for is its `control`, and keeps the two numbers as `vx` and `vy` (and a pad of arrows keeps
 * its up and down, which on a control are a pointer lifting and landing, as `upward` and `downward`).
 */
function standIn(control, numbers) {
  const face = { control, remove: () => control.remove(), place: (x, y) => control.place(x, y), valueOf: () => control.value, toString: () => String(control.value) }
  const written = (name) => {
    for (let o = control; o; o = Object.getPrototypeOf(o)) { const d = Object.getOwnPropertyDescriptor(o, name); if (d) return !!(d.set || d.writable) }
    return true
  }
  for (const name of ['value', 'label', 'held', 'onChange', 'id', 'kind', ...numbers]) {
    const kept = { x: 'vx', y: 'vy', up: 'upward', down: 'downward' }[name] || name
    Object.defineProperty(face, name, { enumerable: true, get: () => control[kept], set: (value) => { if (written(kept)) control[kept] = value } })
  }
  return face
}

/**
 * ONE NUMBER IN A RANGE that is part of a control with several: each way of an XY pad, each end
 * of a range. It takes its range from a target as a dial does, and keeps to it in the same way.
 */
class Axis {
  constructor(target, param, spec = {}) {
    this.target = target && param != null ? target : null
    this.param = param
    // `or`: what it is when neither the scene nor the target says.
    const d = this.target ? describe(target, param) : {}, or = spec.or || {}
    this.name = spec.label ?? d.label ?? d.name ?? (param != null ? String(param) : '')
    this.min = spec.min ?? d.min ?? or.min ?? 0
    this.max = spec.max ?? d.max ?? or.max ?? 1
    this.step = spec.step ?? d.step ?? (d.kind === 'int' ? 1 : 0)
    this.unit = unitOf(spec.unit ?? d.unit ?? or.unit ?? '')
    this.digits = spec.digits ?? d.digits
    this.log = this.min > 0 && this.max > this.min && (spec.log ?? d.log ?? (d.curve === 'log' || (this.unit === 'Hz' && this.max / this.min >= 100)))
    const now = spec.value ?? (this.target ? readTarget(target, param) : or.value)
    this.default = spec.default ?? d.default ?? (typeof now === 'number' ? now : this.fromPos(0.5))
    this.v = this.clean(typeof now === 'number' ? now : this.default)
    if (spec.value != null && this.target) writeTarget(target, param, this.v)
  }
  get pos() { return this.toPos(this.v) }
  /** Take a value; the target is told. Was it a new one? */
  put(value) {
    value = this.clean(value)
    if (value === this.v) return false
    this.v = value
    if (this.target) writeTarget(this.target, this.param, value)
    return true
  }
  /** Go to a place from 0 to 1 along the range. */
  slide(pos) { return this.put(this.fromPos(clamp(pos, 0, 1))) }
  /** A target that was changed some other way is followed. Did it move? */
  follow() {
    if (!this.target) return false
    const now = readTarget(this.target, this.param)
    if (typeof now !== 'number' || Math.abs(now - this.v) <= Math.abs(this.max - this.min) * 1e-6) return false
    this.v = clamp(now, Math.min(this.min, this.max), Math.max(this.min, this.max))
    return true
  }
}
for (const name of ['clean', 'toPos', 'fromPos']) Axis.prototype[name] = Ranged.prototype[name]

/**
 * THE XY PAD: a square where one finger sets two numbers at once, one by going across and one by
 * going up. `pad.x` and `pad.y` are the numbers and `pad.value` is both. The dot comes to the
 * finger and follows it; Shift moves it a tenth as far; two taps put it back. `spring: true` lets
 * it go back to where it started whenever it is let go, as a joystick does.
 */
class XYPad extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    const way = (given, param) => new Axis(spec.target, param, Array.isArray(given) ? { min: given[0], max: given[1], value: given[2] } : given || {})
    this.ax = way(spec.across, spec.paramX)
    this.ay = way(spec.up, spec.paramY)
    this.target = spec.target || null
    this.param = spec.paramX
    this.spring = !!spec.spring
    this.many = false
    if (!this.label && this.target) this.label = `${this.ax.name} / ${this.ay.name}`
    this.face = standIn(this, ['x', 'y'])
  }
  // Its two numbers. (On the control itself x and y say where it is drawn: the scene reads them as pad.x and pad.y.)
  get vx() { return this.ax.v }
  set vx(value) { if (this.ax.put(value)) this.touch() }
  get vy() { return this.ay.v }
  set vy(value) { if (this.ay.put(value)) this.touch() }
  get value() { return [this.ax.v, this.ay.v] }
  set value(pair) { if (this.ax.put(pair[0]) | this.ay.put(pair[1])) this.touch() }
  get v() { return this.value }
  scaleOf() { return 1 }
  get side() { return sized(this.size, 110, 150, 210) }
  natural(u) { return [(this.side + 16) * u, (this.side + 48) * u] }
  /** The square itself. */
  pad(u) { const side = Math.min(this.w - 16 * u, this.h - 48 * u); return { x: this.x + (this.w - side) / 2, y: this.y + 24 * u, side } }
  /** Go to a place: 0 to 1 across, and 0 to 1 up. */
  go(px, py) {
    if (!(this.ax.slide(px) | this.ay.slide(py))) return
    if (this.onChange) this.onChange(this.ax.v, this.ay.v, this)
    this.panel.told.push(this.id, this.value)
    this.touch()
  }
  reset() { this.go(this.ax.toPos(this.ax.clean(this.ax.default)), this.ay.toPos(this.ay.clean(this.ay.default))) }
  down(p) {
    this.last = { x: p.x, y: p.y }
    const s = this.pad(this.u)
    // The dot comes to the finger; with Shift it stays, and is moved a tenth as far from where it is.
    this.where = p.shift ? [this.ax.pos, this.ay.pos] : [clamp((p.x - s.x) / s.side, 0, 1), clamp(1 - (p.y - s.y) / s.side, 0, 1)]
    this.go(...this.where)
    this.touch()
  }
  move(p) {
    const s = this.pad(this.u), fine = p.shift ? 0.1 : 1
    this.where = [clamp(this.where[0] + (p.x - this.last.x) / s.side * fine, 0, 1), clamp(this.where[1] - (p.y - this.last.y) / s.side * fine, 0, 1)]
    this.last = { x: p.x, y: p.y }
    this.go(...this.where)
  }
  up() { if (this.spring) this.reset(); this.touch() }
  keyDown(e) {
    const by = (dx, dy) => (fine) => this.go(this.ax.pos + dx * (fine ? 0.005 : 0.05), this.ay.pos + dy * (fine ? 0.005 : 0.05))
    return keysOf(this, e, { ArrowLeft: by(-1, 0), ArrowRight: by(1, 0), ArrowUp: by(0, 1), ArrowDown: by(0, -1), Home: () => this.reset() })
  }
  frame() { if (!this.held && (this.ax.follow() | this.ay.follow())) this.touch() }
  draw(g, u) {
    const s = this.pad(u), px = s.x + s.side * this.ax.pos, py = s.y + s.side * (1 - this.ay.pos)
    words(g, this.label, this.x + this.w / 2, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, s.x, s.y, s.side, s.side, 9 * u)
    g.fillStyle = THEME.well
    g.fill()
    g.save()
    rounded(g, s.x, s.y, s.side, s.side, 9 * u)
    g.clip()
    g.strokeStyle = THEME.edge
    g.lineWidth = 1
    g.beginPath()
    for (let i = 1; i < 4; i++) { g.moveTo(s.x + s.side * i / 4, s.y); g.lineTo(s.x + s.side * i / 4, s.y + s.side); g.moveTo(s.x, s.y + s.side * i / 4); g.lineTo(s.x + s.side, s.y + s.side * i / 4) }
    g.stroke()
    // Lines from the dot to the edges: where it is each way is read off them.
    g.strokeStyle = this.accent
    g.globalAlpha = 0.45
    g.lineWidth = 1.25 * u
    g.beginPath(); g.moveTo(px, s.y); g.lineTo(px, s.y + s.side); g.moveTo(s.x, py); g.lineTo(s.x + s.side, py); g.stroke()
    g.globalAlpha = this.held ? 0.3 : 0.18
    g.fillStyle = this.accent
    g.beginPath(); g.arc(px, py, (this.held ? 20 : 15) * u, 0, TAU); g.fill()
    g.globalAlpha = 1
    g.restore()
    g.fillStyle = this.accent
    g.beginPath(); g.arc(clamp(px, s.x + 7 * u, s.x + s.side - 7 * u), clamp(py, s.y + 7 * u, s.y + s.side - 7 * u), 7 * u, 0, TAU); g.fill()
    g.strokeStyle = THEME.text
    g.lineWidth = 2 * u
    g.stroke()
    words(g, `${shown(this.ax.v, this.ax)}  ·  ${shown(this.ay.v, this.ay)}`, this.x + this.w / 2, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '', this.w - 6 * u)
    ring(g, this, s.x, s.y, s.side, s.side, 9 * u, u)
  }
}

// --- colours
/** A colour as the browser reads it, any way it may be written ("tomato", "#f60", "rgb(…)"): [red, green, blue], each 0 to 255. */
function rgbOf(colour) {
  const g = rgbOf.g ||= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  g.clearRect(0, 0, 1, 1)
  g.fillStyle = '#000'
  g.fillStyle = String(colour)
  g.fillRect(0, 0, 1, 1)
  return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3)
}
/** Red, green and blue as a hue (0 to 360), and how strong and how bright it is (each 0 to 1); and back. */
function hsvOf([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const high = Math.max(r, g, b), d = high - Math.min(r, g, b)
  const h = !d ? 0 : high === r ? ((g - b) / d + 6) % 6 : high === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, high ? d / high : 0, high]
}
function rgbFrom(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))) }
  return [f(5), f(3), f(1)]
}
const hexOf = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('')
/** Is a colour light, so that a mark on it should be dark? */
const isLight = (rgb) => rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150

/** The colours a picker offers by name, in two lines: ones a child knows, by the names a scene can use. */
const NAMED = ['red', 'orange', 'gold', 'yellow', 'limegreen', 'green', 'turquoise', 'skyblue', 'blue', 'purple', 'hotpink', 'brown', 'white', 'silver', 'grey', 'black']

/** What a colour picker opens: a square of every strength and brightness of one hue, a strip of hues, and the named colours. */
class ColourPopup extends Popup {
  arrange(g, u) {
    const o = this.owner, f = o.field(u), names = o.colours.length, lines = Math.ceil(names / 8)
    this.put(248 * u, (8 + 150 + 12 + 22 + (names ? 12 + lines * 28 : 0) + 8) * u, [f.x, f.y, f.w, f.h])
    const x = this.x + 8 * u, w = this.w - 16 * u
    this.square = { x, y: this.y + 8 * u, w, h: 150 * u }
    this.strip = { x, y: this.square.y + this.square.h + 12 * u, w, h: 22 * u }
    this.names = { x, y: this.strip.y + this.strip.h + 12 * u, each: w / 8, h: 28 * u }
  }
  within(r, p, slack = 0) { return p.x >= r.x - slack && p.x < r.x + r.w + slack && p.y >= r.y - slack && p.y < r.y + r.h + slack }
  nameAt(p) {
    const n = this.names, o = this.owner
    if (p.y < n.y || p.x < n.x) return null
    const i = Math.floor((p.y - n.y) / n.h) * 8 + Math.floor((p.x - n.x) / n.each)
    return p.x < n.x + 8 * n.each && i < o.colours.length ? o.colours[i] : null
  }
  press(p) {
    const u = this.u
    this.part = this.within(this.square, p) ? 'sv' : this.within(this.strip, p, 6 * u) ? 'hue' : this.nameAt(p) ? 'name' : null
    this.drag(p)
  }
  drag(p) {
    const o = this.owner
    if (this.part === 'sv') o.mix(o.hue, clamp((p.x - this.square.x) / this.square.w, 0, 1), 1 - clamp((p.y - this.square.y) / this.square.h, 0, 1))
    else if (this.part === 'hue') o.mix(clamp((p.x - this.strip.x) / this.strip.w, 0, 1) * 360, o.strong, o.bright)
    this.touch()
  }
  lift(p) {
    // A colour picked by its name is the choice made: the picker closes.
    const name = this.part === 'name' && this.nameAt(p)
    this.part = null
    if (name) { this.owner.take(name); this.close() }
  }
  closed() { this.owner.touch() }
  keyDown(e) {
    if (e.key !== 'Escape' && e.key !== 'Enter') return false
    this.close()
    return true
  }
  draw(g, u) {
    const o = this.owner, sv = this.square, hue = this.strip, names = this.names
    // Across: from white to the hue at its strongest. Down: to black.
    g.save()
    rounded(g, sv.x, sv.y, sv.w, sv.h, 6 * u)
    g.clip()
    const across = g.createLinearGradient(sv.x, 0, sv.x + sv.w, 0)
    across.addColorStop(0, '#fff')
    across.addColorStop(1, hexOf(rgbFrom(o.hue, 1, 1)))
    g.fillStyle = across
    g.fillRect(sv.x, sv.y, sv.w, sv.h)
    const down = g.createLinearGradient(0, sv.y, 0, sv.y + sv.h)
    down.addColorStop(0, 'rgba(0, 0, 0, 0)')
    down.addColorStop(1, '#000')
    g.fillStyle = down
    g.fillRect(sv.x, sv.y, sv.w, sv.h)
    g.restore()
    const mark = (x, y, r, fill) => {
      g.beginPath(); g.arc(x, y, r, 0, TAU)
      g.fillStyle = fill
      g.fill()
      g.strokeStyle = '#fff'
      g.lineWidth = 2.5 * u
      g.stroke()
      g.strokeStyle = 'rgba(0, 0, 0, 0.45)'
      g.lineWidth = 1
      g.beginPath(); g.arc(x, y, r + 1.75 * u, 0, TAU); g.stroke()
    }
    mark(clamp(sv.x + sv.w * o.strong, sv.x + 8 * u, sv.x + sv.w - 8 * u), clamp(sv.y + sv.h * (1 - o.bright), sv.y + 8 * u, sv.y + sv.h - 8 * u), 8 * u, hexOf(rgbFrom(o.hue, o.strong, o.bright)))
    const hues = g.createLinearGradient(hue.x, 0, hue.x + hue.w, 0)
    for (let i = 0; i <= 6; i++) hues.addColorStop(i / 6, hexOf(rgbFrom(i * 60 % 360, 1, 1)))
    rounded(g, hue.x, hue.y + 4 * u, hue.w, hue.h - 8 * u, 7 * u)
    g.fillStyle = hues
    g.fill()
    mark(clamp(hue.x + hue.w * o.hue / 360, hue.x + 9 * u, hue.x + hue.w - 9 * u), hue.y + hue.h / 2, 9 * u, hexOf(rgbFrom(o.hue, 1, 1)))
    o.colours.forEach((name, i) => {
      const cx = names.x + (i % 8 + 0.5) * names.each, cy = names.y + (Math.floor(i / 8) + 0.5) * names.h, on = o.v === name
      g.beginPath(); g.arc(cx, cy, 10.5 * u, 0, TAU)
      g.fillStyle = name
      g.fill()
      g.strokeStyle = on ? THEME.text : THEME.edge
      g.lineWidth = (on ? 2.25 : 1) * u
      g.stroke()
    })
  }
}

/**
 * THE COLOUR PICKER: a patch of the colour chosen. A tap opens a picker over the controls: drag in
 * the square for how strong and how bright, along the strip for the hue, or tap one of the named
 * colours. `ink.value` is the colour as a scene writes one ("tomato", "#3a7bd5"), so it goes
 * straight into a drawing call: circle(x, y, 40, ink.value).
 */
class ColourPicker extends Control {
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
    this.colours = spec.colours === false ? [] : Array.isArray(spec.colours) ? [...spec.colours] : NAMED
    this.keep(now == null ? 'tomato' : String(now))
    this.default = this.v
    if (spec.value != null && this.target) writeTarget(this.target, this.param, this.v)
  }
  /** Keep a colour, and where it is in the picker. */
  keep(colour) {
    this.v = colour
    this.rgb = rgbOf(colour)
    const [hue, strong, bright] = hsvOf(this.rgb)
    // Grey has no hue, and black no strength: the picker stays where it was rather than jump to red.
    this.hue = strong && bright ? hue : this.hue ?? hue
    this.strong = bright ? strong : this.strong ?? strong
    this.bright = bright
  }
  get value() { return this.v }
  set value(colour) {
    colour = String(colour)
    if (colour === this.v) return
    this.keep(colour)
    if (this.target) writeTarget(this.target, this.param, colour)
    this.touch()
    if (this.open) this.picker.touch()
  }
  toString() { return this.v }
  /** A colour chosen by hand. */
  take(colour) {
    if (colour === this.v) return
    this.keep(colour)
    this.changed(colour)
  }
  /** A colour mixed in the picker: a hue, how strong and how bright. */
  mix(hue, strong, bright) {
    const colour = hexOf(rgbFrom(hue, strong, bright))
    this.hue = hue; this.strong = strong; this.bright = bright
    if (colour === this.v) return
    this.v = colour
    this.rgb = rgbOf(colour)
    this.changed(colour)
  }
  get open() { return !!this.picker && this.picker.shown }
  set open(on) { if (on) this.show(); else if (this.picker) this.picker.close() }
  show() { this.picker = new ColourPopup(this.panel, this).open() }
  natural(u, room, g) {
    g.font = `${12 * u}px ${THEME.font}`
    return [Math.max(84 * u, g.measureText(this.label).width + 16 * u), 62 * u]
  }
  field(u) { return { x: this.x + 6 * u, y: this.y + 25 * u, w: this.w - 12 * u, h: 30 * u } }
  down(p) { this.from = { x: p.x, y: p.y }; this.touch() }
  up(p) { if (tapped(this, p)) this.show(); this.touch() }
  keyDown(e) {
    if (this.open) return this.panel.focus === this && this.picker.keyDown(e)
    return keysOf(this, e, { Enter: () => this.show(), Space: () => this.show() })
  }
  frame() {
    if (!this.target || this.held || this.open) return
    const there = readTarget(this.target, this.param)
    if (there != null && String(there) !== this.v) { this.keep(String(there)); this.touch() }
  }
  draw(g, u) {
    const f = this.field(u)
    words(g, this.label, this.x + this.w / 2, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, f.x, f.y, f.w, f.h, 8 * u)
    g.fillStyle = THEME.knob
    g.fill()
    rounded(g, f.x + 4 * u, f.y + 4 * u, f.w - 8 * u, f.h - 8 * u, 5 * u)
    g.fillStyle = this.v
    g.fill()
    g.strokeStyle = this.held || this.open ? THEME.text : 'rgba(255, 255, 255, 0.18)'
    g.lineWidth = (this.held || this.open ? 1.5 : 1) * u
    g.stroke()
    ring(g, this, f.x, f.y, f.w, f.h, 8 * u, u)
  }
}

// --- things that only show
/** A source for a control that shows something: a function that is asked, a setting of a target, or nothing. */
function pulled(spec, ...asks) {
  if (typeof spec.source === 'function') return spec.source
  if (spec.target && spec.param != null) return () => readTarget(spec.target, spec.param)
  return method(spec.source, ...asks)
}

/** A BAR THAT FILLS as something gets done: `loading.value = 0.4`, or from 0 to `max`. */
class Progress extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.pull = pulled(spec, 'progress', 'level')
    this.min = spec.min ?? 0
    this.max = spec.max ?? 1
    this.percent = spec.percent !== false
    this.v = Number(this.pull ? this.pull() : spec.value ?? this.min) || 0
    this.drawn = null
  }
  get value() { return this.v }
  set value(value) { this.v = Number(value) || 0 }
  /** How much is done, from 0 to 1. */
  get done() { return this.max === this.min ? 0 : clamp((this.v - this.min) / (this.max - this.min), 0, 1) }
  scaleOf() { return 1 }
  natural(u) { return [(this.wide || sized(this.size, 110, 160, 240)) * u, (this.label || this.percent ? 46 : 28) * u] }
  stretch() { return this.wide ? [1, 1] : [0.7, 2.5] }
  frame() {
    if (this.pull) this.value = this.pull()
    const now = Math.round(this.done * 1000)
    if (now !== this.drawn) { this.drawn = now; this.touch() }
  }
  draw(g, u) {
    const done = this.done, x = this.x + 10 * u, w = this.w - 20 * u, top = this.label || this.percent, cy = this.y + (top ? 32 : 14) * u, thick = 8 * u
    if (this.label) words(g, this.label, x, this.y + 14 * u, 12 * u, THEME.dim, 'left', '', w * 0.7)
    if (this.percent) words(g, `${Math.round(done * 100)}%`, x + w, this.y + 14 * u, 12 * u, THEME.text, 'right')
    rounded(g, x, cy - thick / 2, w, thick, thick / 2)
    g.fillStyle = THEME.track
    g.fill()
    if (done <= 0) return
    rounded(g, x, cy - thick / 2, Math.max(thick, w * done), thick, thick / 2)
    g.fillStyle = done >= 1 ? THEME.good : this.accent
    g.fill()
  }
}

/**
 * A LIGHT: on or off, a brightness from 0 to 1, or a colour. `ready.on = true`,
 * `light("signal", lead)` (as bright as the target is loud), `status.value = "red"`.
 */
class Light extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.pull = pulled(spec, 'level')
    this.v = this.pull ? this.pull() : spec.value ?? false
    this.said = null
  }
  get value() { return this.v }
  set value(value) { this.v = value }
  get on() { return this.bright > 0 }
  set on(on) { this.v = !!on }
  /** How bright it is, from 0 to 1: a level makes it so bright, and true or a colour is fully on. */
  get bright() {
    let v = this.v
    if (isList(v)) v = Math.max(...v)
    return typeof v === 'number' ? clamp(v, 0, 1) : v && v !== 'off' ? 1 : 0
  }
  /** The colour it shines: the one it was told, or its own. */
  get shine() { return typeof this.v === 'string' && this.v !== 'off' && this.v !== 'on' ? this.v : this.accent }
  scaleOf() { return 1 }
  get lamp() { return sized(this.size, 12, 18, 28) }
  natural(u, room, g) {
    g.font = `${12 * u}px ${THEME.font}`
    return [Math.max(44 * u, (this.label ? g.measureText(this.label).width : 0) + 16 * u), ((this.label ? 25 : 8) + this.lamp + 16) * u]
  }
  frame() {
    if (this.pull) this.v = this.pull()
    const now = `${Math.round(this.bright * 50)} ${this.shine}`
    if (now !== this.said) { this.said = now; this.touch() }
  }
  draw(g, u) {
    const r = this.lamp * u / 2, cx = this.x + this.w / 2, cy = this.y + (this.label ? 25 : 8) * u + (this.h - (this.label ? 32 : 16) * u) / 2, bright = this.bright
    if (this.label) words(g, this.label, cx, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    if (bright > 0) {
      // Its glow, which reaches a little way past the lamp.
      const glow = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + 7 * u)
      glow.addColorStop(0, this.shine)
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      g.globalAlpha = 0.55 * bright
      g.fillStyle = glow
      g.beginPath(); g.arc(cx, cy, r + 7 * u, 0, TAU); g.fill()
      g.globalAlpha = 1
    }
    g.beginPath(); g.arc(cx, cy, r, 0, TAU)
    g.fillStyle = THEME.well
    g.fill()
    g.globalAlpha = bright
    g.fillStyle = this.shine
    g.fill()
    g.globalAlpha = 1
    g.strokeStyle = bright > 0 ? 'rgba(255, 255, 255, 0.35)' : THEME.track
    g.lineWidth = 1.5 * u
    g.stroke()
    // A small bright spot, as on a lamp behind glass.
    g.fillStyle = `rgba(255, 255, 255, ${0.12 + 0.5 * bright})`
    g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.32, r * 0.24, 0, TAU); g.fill()
  }
}

/** SOMETHING IS HAPPENING: a ring that goes round while `busy.on` is true, and is still when it is not. */
class Busy extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.pull = pulled(spec)
    this.v = this.pull ? !!this.pull() : spec.value !== false
  }
  get value() { return this.v }
  set value(on) { this.v = !!on; this.touch() }
  get on() { return this.v }
  set on(on) { this.value = on }
  scaleOf() { return 1 }
  get round() { return sized(this.size, 18, 26, 40) }
  natural(u, room, g) {
    g.font = `${12 * u}px ${THEME.font}`
    return [Math.max(44 * u, (this.label ? g.measureText(this.label).width : 0) + 16 * u), ((this.label ? 25 : 8) + this.round + 12) * u]
  }
  frame() {
    if (this.pull) { const on = !!this.pull(); if (on !== this.v) this.value = on }
    if (this.v) this.touch()
  }
  draw(g, u) {
    const r = this.round * u / 2 - 2 * u, cx = this.x + this.w / 2, cy = this.y + (this.label ? 25 : 8) * u + (this.h - (this.label ? 32 : 16) * u) / 2
    if (this.label) words(g, this.label, cx, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    g.lineWidth = 3.5 * u
    g.lineCap = 'round'
    g.strokeStyle = THEME.track
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke()
    if (!this.v) return
    // Someone who asked for less movement is shown a ring that is lit and still.
    const a = stillness() ? -TAU / 4 : performance.now() / 1000 * TAU * 0.9
    g.strokeStyle = this.accent
    g.beginPath(); g.arc(cx, cy, r, a, a + TAU * 0.3); g.stroke()
  }
}

// --- sliders of other kinds
/**
 * A SLIDER WITH TWO HANDLES: a low end and a high end, for a range (a price from 20 to 80, the
 * part of a sound to play). `span.low` and `span.high` are the numbers and `span.value` is both.
 * The handle nearer the finger is the one moved, and neither goes past the other.
 */
class RangeSlider extends Slider {
  constructor(panel, kind, spec) {
    const { target, param, paramHigh, value, ...rest } = spec
    super(panel, kind, rest)
    const pair = Array.isArray(value) ? value : []
    const end = (name, at, fallback) => {
      if (target && name != null) {
        const there = at ?? readTarget(target, name)
        if (at != null) writeTarget(target, name, this.clean(at))
        return this.clean(typeof there === 'number' ? there : fallback)
      }
      return this.clean(at ?? fallback)
    }
    if (target) {
      // The range is the low setting's: both ends are in the same measure.
      const d = describe(target, param)
      this.min = rest.min ?? d.min ?? 0
      this.max = rest.max ?? d.max ?? 1
      this.step = rest.step ?? d.step ?? 0
      this.unit = unitOf(rest.unit ?? d.unit ?? '')
      this.log = this.min > 0 && this.max > this.min && (rest.log ?? d.log ?? (this.unit === 'Hz' && this.max / this.min >= 100))
      this.target = target
      this.param = param
      this.pair = [param, paramHigh]
    }
    this.lo = end(param, pair[0], this.min)
    this.hi = Math.max(this.lo, end(paramHigh, pair[1], this.max))
    this.default = [this.lo, this.hi]
    this.which = 1 // the handle moved last: 0 the low one, 1 the high one
  }
  get low() { return this.lo }
  set low(value) { this.put(0, Math.min(this.clean(value), this.hi)) }
  get high() { return this.hi }
  set high(value) { this.put(1, Math.max(this.clean(value), this.lo)) }
  get value() { return [this.lo, this.hi] }
  set value(pair) { this.low = Math.min(pair[0], pair[1]); this.high = Math.max(pair[0], pair[1]); this.low = Math.min(pair[0], pair[1]) }
  get v() { return this.value }
  set v(value) {}
  /** Set one end from the scene's code: the target is told. */
  put(which, value) {
    if (value === (which ? this.hi : this.lo)) return false
    if (which) this.hi = value; else this.lo = value
    if (this.target && this.pair[which] != null) writeTarget(this.target, this.pair[which], value)
    this.touch()
    return true
  }
  /** Move one end by hand to a place from 0 to 1 along the track, no further than the other end. */
  slideEnd(which, pos) {
    let value = this.clean(this.fromPos(clamp(pos, 0, 1)))
    value = which ? Math.max(value, this.lo) : Math.min(value, this.hi)
    if (!this.put(which, value)) return
    if (this.onChange) this.onChange(this.lo, this.hi, this)
    this.panel.told.push(this.id, this.value)
  }
  reset() { this.slideEnd(0, this.toPos(Math.min(this.default[0], this.hi))); this.slideEnd(1, this.toPos(this.default[1])); this.slideEnd(0, this.toPos(this.default[0])) }
  down(p) {
    const here = this.along(p, this.u), a = this.toPos(this.lo), b = this.toPos(this.hi)
    // The nearer handle; where both are at one place, the one that can go the way the finger is.
    this.which = a === b ? (here > a ? 1 : 0) : Math.abs(here - a) <= Math.abs(here - b) ? 0 : 1
    this.grip = this.which ? b : a
    if (Math.abs(here - this.grip) * this.track(this.u).long > 22 * this.u) { this.grip = clamp(here, 0, 1); this.slideEnd(this.which, this.grip) }
    this.last = { x: p.x, y: p.y }
    this.touch()
  }
  move(p) {
    const travel = this.vertical ? this.last.y - p.y : p.x - this.last.x
    this.last.x = p.x; this.last.y = p.y
    this.grip = clamp(this.grip + travel / this.track(this.u).long * (p.shift ? 0.1 : 1), 0, 1)
    this.slideEnd(this.which, this.grip)
  }
  up() { this.touch() }
  keyDown(e) {
    const by = (n) => (fine) => this.slideEnd(this.which, this.toPos(this.which ? this.hi : this.lo) + n * (this.step ? this.step / Math.abs(this.max - this.min || 1) : fine ? 0.002 : 0.02))
    return keysOf(this, e, { ArrowRight: by(1), ArrowUp: by(1), ArrowLeft: by(-1), ArrowDown: by(-1) })
  }
  frame() {
    if (!this.target || this.held) return
    this.pair.forEach((name, which) => {
      const now = name == null ? undefined : readTarget(this.target, name)
      if (typeof now !== 'number' || Math.abs(now - (which ? this.hi : this.lo)) <= Math.abs(this.max - this.min) * 1e-6) return
      if (which) this.hi = now; else this.lo = now
      this.touch()
    })
  }
  draw(g, u) {
    const t = this.track(u), a = this.toPos(this.lo), b = this.toPos(this.hi), said = `${shown(this.lo, this)} to ${shown(this.hi, this)}`
    g.lineCap = 'round'
    g.lineWidth = 6 * u
    const at = (pos) => (this.vertical ? [this.x + this.w / 2, t.from - t.long * pos] : [t.from + t.long * pos, this.y + this.h - 18 * u])
    if (this.vertical) {
      words(g, this.label, this.x + this.w / 2, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 4 * u)
      words(g, said, this.x + this.w / 2, this.y + this.h - 11 * u, 11 * u, THEME.text, 'center', '', this.w - 4 * u)
    } else {
      words(g, this.label, this.x + 14 * u, this.y + 14 * u, 12 * u, THEME.dim, 'left', '', this.w * 0.45)
      words(g, said, this.x + this.w - 14 * u, this.y + 14 * u, 12 * u, THEME.text, 'right', '', this.w * 0.5)
    }
    g.strokeStyle = THEME.track
    g.beginPath(); g.moveTo(...at(0)); g.lineTo(...at(1)); g.stroke()
    g.strokeStyle = this.accent
    g.beginPath(); g.moveTo(...at(a)); g.lineTo(...at(b)); g.stroke()
    for (const which of [0, 1]) {
      const [hx, hy] = at(which ? b : a), on = this.held && this.which === which
      g.fillStyle = THEME.text
      g.beginPath(); g.arc(hx, hy, (on ? 10 : 8.5) * u, 0, TAU); g.fill()
      if (this.panel.focus === this && this.panel.keyed && this.which === which) { g.strokeStyle = this.accent; g.lineWidth = 2 * u; g.stroke(); g.lineWidth = 6 * u }
    }
  }
}

/** A FADER: an upright slider with the look of a mixing desk's, a cap that slides in a slot beside a scale. It is a slider in every other way. */
class Fader extends Slider {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.vertical = true
  }
  natural(u) { return [58 * u, (sized(this.size, 100, 140, 190) + 56) * u] }
  draw(g, u) {
    const t = this.track(u), pos = this.toPos(this.v), cx = this.x + this.w / 2, y = t.from - t.long * pos
    words(g, this.label, cx, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 4 * u)
    // The scale: a mark at each tenth, longer at the ends and the middle.
    g.strokeStyle = THEME.track
    g.lineWidth = 1 * u
    g.beginPath()
    for (let i = 0; i <= 10; i++) {
      const my = t.from - t.long * i / 10, long = (i % 5 ? 4 : 7) * u
      g.moveTo(cx - 15 * u - long, my); g.lineTo(cx - 15 * u, my)
      g.moveTo(cx + 15 * u, my); g.lineTo(cx + 15 * u + long, my)
    }
    g.stroke()
    rounded(g, cx - 3 * u, t.from - t.long - 3 * u, 6 * u, t.long + 6 * u, 3 * u)
    g.fillStyle = THEME.well
    g.fill()
    const zero = this.min < 0 && this.max > 0 ? this.toPos(0) : 0
    g.lineCap = 'round'
    g.lineWidth = 2.5 * u
    g.strokeStyle = this.accent
    g.beginPath(); g.moveTo(cx, t.from - t.long * zero); g.lineTo(cx, y); g.stroke()
    // The cap, with a line across it where it reads.
    const cw = 30 * u, ch = 18 * u
    rounded(g, cx - cw / 2, y - ch / 2, cw, ch, 4 * u)
    g.fillStyle = this.held ? THEME.text : THEME.dim
    g.fill()
    g.strokeStyle = THEME.well
    g.lineWidth = 1
    g.stroke()
    g.strokeStyle = this.accent
    g.lineWidth = 2.5 * u
    g.beginPath(); g.moveTo(cx - cw / 2 + 4 * u, y); g.lineTo(cx + cw / 2 - 4 * u, y); g.stroke()
    words(g, shown(this.v, this), cx, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '', this.w - 4 * u)
  }
}

// --------------------------------------------------------------------------------------------
// FOR GAMES: a joystick, a pad of arrows and round buttons. Each finger holds its own control, so a
// thumb can steer while another fires.

/** The keys a control can press for a scene, by the names a scene gives them: [what `keys` calls it, where it is on the keyboard]. */
const FED = { left: ['ArrowLeft', 'ArrowLeft'], right: ['ArrowRight', 'ArrowRight'], up: ['ArrowUp', 'ArrowUp'], down: ['ArrowDown', 'ArrowDown'], space: [' ', 'Space'], enter: ['Enter', 'Enter'], shift: ['Shift', 'ShiftLeft'] }
/**
 * PRESS A KEY FOR THE SCENE. A game written for the computer's keys (`keys.has("ArrowLeft")`) is
 * played on a phone unchanged when a control presses those keys for it: the scene's canvas is sent
 * the same news a real key sends, so `keys`, `onKeyDown` and the rest all hear it. A key is named
 * as a scene names it ("ArrowLeft", " ", "a") or more plainly ("left", "space").
 */
function feedKey(control, name, down) {
  const fed = control.fed ||= new Set()
  if (fed.has(name) === !!down) return
  if (down) fed.add(name); else fed.delete(name)
  const plain = String(name), [key, code] = FED[plain.toLowerCase()] || [plain, /^[a-z]$/i.test(plain) ? 'Key' + plain.toUpperCase() : /^\d$/.test(plain) ? 'Digit' + plain : plain === ' ' ? 'Space' : plain]
  control.panel.canvas.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code, bubbles: true, cancelable: true }))
}
/** The four keys a stick or a pad of arrows presses: the arrows, or W A S D when told `asKeys: "wasd"`. */
const fourKeys = (asKeys) => (String(asKeys).toLowerCase() === 'wasd' ? ['a', 'd', 'w', 's'] : Array.isArray(asKeys) ? asKeys : ['left', 'right', 'up', 'down'])
/** Hold the keys that go with a push: left, right, up, down, each on or off. */
function feedFour(control, left, right, up, down) {
  if (!control.asKeys) return
  const names = fourKeys(control.asKeys)
  ;[left, right, up, down].forEach((on, i) => feedKey(control, names[i], on))
}

/**
 * THE JOYSTICK: a stick under one thumb that springs back when it is let go. `stick.x` and
 * `stick.y` are each from -1 to 1, in the scene's own directions (x to the right, y DOWN the
 * picture), so `ship.x += stick.x * speed` and `ship.y += stick.y * speed` go where the thumb
 * pushes. `stick.angle` is the way it is pushed (in radians, 0 to the right, as `Math.atan2`
 * gives it) and `stick.distance` how far, 0 to 1. `floating: true`: it appears where the thumb
 * lands, anywhere in its box. `asKeys: true`: pushed, it holds the arrow keys down for the scene.
 */
class Joystick extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.floating = !!spec.floating
    this.asKeys = spec.asKeys || false
    this.jx = this.jy = 0
    this.centre = null // where a floating stick was put down
    this.many = false
    this.face = standIn(this, ['x', 'y', 'angle', 'distance'])
  }
  get vx() { return this.jx }
  get vy() { return this.jy }
  get value() { return [this.jx, this.jy] }
  get angle() { return Math.atan2(this.jy, this.jx) }
  get distance() { return Math.min(1, Math.hypot(this.jx, this.jy)) }
  scaleOf() { return 1 }
  get diameter() { return sized(this.size, 96, 128, 170) }
  natural(u) {
    const d = this.diameter
    // One that appears under the thumb has a box to appear in, bigger than itself.
    if (this.floating) return [(this.wide || d * 1.7) * u, (this.tall || d * 1.4) * u]
    return [(d + 16) * u, (d + (this.label ? 34 : 16)) * u]
  }
  /** Where its middle is, and how far the knob travels from it. */
  shape(u) {
    const d = this.diameter * u, top = this.label ? 22 * u : 0
    const home = { x: this.x + this.w / 2, y: this.y + top + (this.h - top) / 2 }
    const r = d / 2, at = this.floating && this.centre ? this.centre : home
    return { x: at.x, y: at.y, r, reach: r * 0.58 }
  }
  push(x, y) {
    if (x === this.jx && y === this.jy) return
    this.jx = x; this.jy = y
    if (this.onChange) this.onChange(x, y, this)
    this.panel.told.push(this.id, [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
    feedFour(this, x < -0.5, x > 0.5, y < -0.5, y > 0.5)
    this.touch()
  }
  down(p) {
    if (this.floating) {
      // It is put down under the thumb, but never so near an edge of its box that part of it would be outside.
      const r = this.diameter * this.u / 2
      this.centre = { x: clamp(p.x, this.x + r, Math.max(this.x + r, this.x + this.w - r)), y: clamp(p.y, this.y + r, Math.max(this.y + r, this.y + this.h - r)) }
    }
    this.move(p)
    this.touch()
  }
  move(p) {
    const s = this.shape(this.u), dx = (p.x - s.x) / s.reach, dy = (p.y - s.y) / s.reach, far = Math.hypot(dx, dy)
    // Past the rim the knob stays on it, pointing the way of the thumb.
    this.push(far > 1 ? dx / far : dx, far > 1 ? dy / far : dy)
  }
  up() { this.centre = null; this.push(0, 0); this.touch() }
  draw(g, u) {
    const s = this.shape(u), shown = !this.floating || this.held
    if (this.label) words(g, this.label, this.x + this.w / 2, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    g.globalAlpha = shown ? 1 : 0.4
    g.beginPath(); g.arc(s.x, s.y, s.r - 1 * u, 0, TAU)
    g.fillStyle = THEME.well
    g.fill()
    g.strokeStyle = THEME.track
    g.lineWidth = 2 * u
    g.stroke()
    // Four small marks: up, down, left and right.
    g.fillStyle = THEME.track
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4, c = Math.cos(a), sn = Math.sin(a), far = s.r - 9 * u
      g.beginPath()
      g.moveTo(s.x + c * far, s.y + sn * far)
      g.lineTo(s.x + c * (far - 7 * u) - sn * 5 * u, s.y + sn * (far - 7 * u) + c * 5 * u)
      g.lineTo(s.x + c * (far - 7 * u) + sn * 5 * u, s.y + sn * (far - 7 * u) - c * 5 * u)
      g.fill()
    }
    const kx = s.x + this.jx * s.reach, ky = s.y + this.jy * s.reach, kr = s.r * 0.42
    g.beginPath(); g.arc(kx, ky, kr, 0, TAU)
    g.fillStyle = this.held ? this.accent : THEME.knob
    g.fill()
    g.strokeStyle = this.held ? THEME.text : this.accent
    g.lineWidth = 2.5 * u
    g.stroke()
    g.globalAlpha = 1
  }
}

/**
 * A PAD OF ARROWS: up, down, left and right under one thumb, which slides from one to the next.
 * `pad.left`, `pad.right`, `pad.up` and `pad.down` are true while pressed, and `pad.x` and `pad.y`
 * are -1, 0 or 1 (y down the picture, as a scene's is). Between two arrows both are pressed, unless
 * it was told `ways: 4`. `asKeys: true`: it holds the arrow keys down for the scene, so a game
 * written for `keys.has("ArrowLeft")` is played on a phone as it is ("wasd" for those keys).
 */
class Dpad extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.ways = spec.ways === 4 ? 4 : 8
    this.asKeys = spec.asKeys || false
    this.jx = this.jy = 0
    this.many = false
    this.face = standIn(this, ['x', 'y', 'left', 'right', 'up', 'down', 'ways'])
  }
  get vx() { return this.jx }
  get vy() { return this.jy }
  get value() { return [this.jx, this.jy] }
  // Which arrows are pressed. (`up` and `down` on the control itself are a pointer lifting and landing: the scene reads these as pad.up and pad.down.)
  get left() { return this.jx < 0 }
  get right() { return this.jx > 0 }
  get upward() { return this.jy < 0 }
  get downward() { return this.jy > 0 }
  scaleOf() { return 1 }
  get diameter() { return sized(this.size, 104, 132, 170) }
  natural(u) { return [(this.diameter + 12) * u, (this.diameter + (this.label ? 30 : 12)) * u] }
  shape(u) {
    const top = this.label ? 20 * u : 0
    return { x: this.x + this.w / 2, y: this.y + top + (this.h - top) / 2, r: this.diameter * u / 2 }
  }
  push(x, y) {
    if (x === this.jx && y === this.jy) return
    this.jx = x; this.jy = y
    if (this.onChange) this.onChange(x, y, this)
    // A host is told which arrows are down as one number: left 1, right 2, up 4, down 8.
    this.panel.told.push(this.id, (x < 0 ? 1 : 0) | (x > 0 ? 2 : 0) | (y < 0 ? 4 : 0) | (y > 0 ? 8 : 0))
    feedFour(this, x < 0, x > 0, y < 0, y > 0)
    this.touch()
  }
  down(p) { this.move(p); this.touch() }
  up() { this.push(0, 0); this.touch() }
  move(p) {
    const s = this.shape(this.u), dx = p.x - s.x, dy = p.y - s.y
    // The very middle is no arrow at all.
    if (Math.hypot(dx, dy) < s.r * 0.2) return this.push(0, 0)
    const part = this.ways === 4 ? 4 : 8, turn = Math.round(Math.atan2(dy, dx) / (TAU / part)) * (TAU / part)
    this.push(Math.round(Math.cos(turn)), Math.round(Math.sin(turn)))
  }
  draw(g, u) {
    const s = this.shape(u), arm = s.r * 0.36, r = s.r - 2 * u
    if (this.label) words(g, this.label, this.x + this.w / 2, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    // A cross: two bars, one across and one down.
    const cross = () => {
      g.beginPath()
      for (const [x, y, w, h] of [[s.x - r, s.y - arm, 2 * r, 2 * arm], [s.x - arm, s.y - r, 2 * arm, 2 * r]]) {
        if (g.roundRect) g.roundRect(x, y, w, h, 9 * u)
        else g.rect(x, y, w, h)
      }
    }
    cross()
    g.fillStyle = THEME.knob
    g.fill()
    const lit = [this.jx > 0, this.jy > 0, this.jx < 0, this.jy < 0]
    ;[[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([c, sn], i) => {
      if (lit[i]) {
        // The arm that is pressed is lit to its end.
        g.save()
        cross()
        g.clip()
        g.fillStyle = this.accent
        g.fillRect(s.x + (c ? (c > 0 ? arm : -r) : -arm), s.y + (sn ? (sn > 0 ? arm : -r) : -arm), c ? r - arm : 2 * arm, sn ? r - arm : 2 * arm)
        g.restore()
      }
      const far = r - 11 * u, back = far - 12 * u, half = 9 * u
      g.fillStyle = lit[i] ? THEME.well : THEME.dim
      g.beginPath()
      g.moveTo(s.x + c * far, s.y + sn * far)
      g.lineTo(s.x + c * back - sn * half, s.y + sn * back + c * half)
      g.lineTo(s.x + c * back + sn * half, s.y + sn * back - c * half)
      g.fill()
    })
    g.fillStyle = THEME.well
    g.beginPath(); g.arc(s.x, s.y, arm * 0.42, 0, TAU); g.fill()
  }
}
/**
 * A ROUND BUTTON, as a game pad's A and B are. It is a button in every way (`fire.pressed` once
 * for each press, `fire.held` while it is down), and with `key: "space"` it holds that key down
 * for the scene while it is pressed.
 */
class ActionButton extends Button {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.key = spec.key || null
  }
  scaleOf() { return 1 }
  get diameter() { return sized(this.size, 52, 66, 88) }
  natural(u) { return [(this.diameter + 14) * u, (this.diameter + 14) * u] }
  down(p) { if (this.key) feedKey(this, this.key, true); super.down(p) }
  up(p) { if (this.key) feedKey(this, this.key, false); super.up(p) }
  draw(g, u) {
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2, r = this.diameter * u / 2
    g.beginPath(); g.arc(cx, cy, r - 1.5 * u, 0, TAU)
    g.fillStyle = this.held ? this.accent : THEME.knob
    g.fill()
    g.strokeStyle = this.accent
    g.lineWidth = 2.5 * u
    g.stroke()
    g.font = `700 ${r * 0.8}px ${THEME.font}`
    const long = g.measureText(this.label).width > r * 1.3
    words(g, this.label, cx, cy + 1 * u, long ? Math.max(11 * u, r * 0.42) : r * 0.8, this.held ? THEME.well : THEME.text, 'center', '700', 2 * r - 12 * u)
  }
}

// --------------------------------------------------------------------------------------------
// FOR MUSIC: the shape of a note drawn as a graph, a grid of steps, pads to hit and wheels.

/** The four parts of a note's shape, and the names a target may give each. */
const SHAPE = ['attack', 'decay', 'sustain', 'release']
/** How much of the graph's width each timed part takes at its longest, and how much the held part always takes. */
const SHAPE_PART = 0.27
const SHAPE_HOLD = 0.19

/**
 * THE ENVELOPE: how a note begins, settles, holds and dies away, drawn as a graph whose corners are
 * dragged. `envelope("shape", lead)` finds the target's attack, decay, sustain and release by those
 * names (or is given the four names), and each corner sets them as it moves: the first corner the
 * attack, the second the decay (across) and the sustain (up and down), the last the release.
 * `shape.attack`, `shape.decay`, `shape.sustain` and `shape.release` are the numbers.
 */
class Envelope extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.target = spec.target || null
    const names = spec.params || SHAPE
    this.parts = SHAPE.map((part, i) => {
      // A target may call its attack "attack", "env_attack" or "amp_attack".
      let name = names[i]
      if (this.target && !spec.params) name = [part, 'env_' + part, 'amp_' + part, part[0]].find((n) => method(this.target, 'describe') ? Object.keys(describe(this.target, n)).length : readTarget(this.target, n) !== undefined) ?? part
      // A target that does not say its ranges is given these: up to two seconds, and a level from 0 to 1. With no target at all, a shape to start from.
      const given = spec[part], or = part === 'sustain' ? { min: 0, max: 1 } : { min: 0, max: 2, unit: 's' }
      if (!this.target) or.value = part === 'sustain' ? 0.7 : part === 'attack' ? 0.05 : part === 'decay' ? 0.3 : 0.5
      return new Axis(this.target, this.target ? name : null, { ...(typeof given === 'number' ? { value: given } : given), label: part, or })
    })
    this.param = this.parts[0].param
    this.many = false
    this.grip = -1 // the corner that is held: 0 the attack's, 1 the decay's and sustain's, 2 the end of the hold, 3 the release's
    for (const [i, part] of SHAPE.entries()) Object.defineProperty(this, part, { get: () => this.parts[i].v, set: (value) => { if (this.parts[i].put(value)) this.touch() } })
  }
  get value() { return this.parts.map((part) => part.v) }
  set value(four) { let moved = 0; four.forEach((value, i) => { moved |= this.parts[i].put(value) }); if (moved) this.touch() }
  get v() { return this.value }
  scaleOf() { return 1 }
  natural(u) { return [(this.wide || 230) * u, (this.tall || 150) * u] }
  stretch() { return this.wide ? [1, 1] : [0.75, 1.3] }
  /** The graph's box, and its five corners: the start, the top of the attack, the end of the decay, the end of the hold and the end. */
  shape(u) {
    const x = this.x + 12 * u, y = this.y + 28 * u, w = this.w - 24 * u, h = this.h - 54 * u
    const [a, d, s, r] = this.parts.map((part) => part.pos)
    const level = y + h * (1 - s), x1 = x + w * SHAPE_PART * a, x2 = x1 + w * SHAPE_PART * d, x3 = x2 + w * SHAPE_HOLD, x4 = x3 + w * SHAPE_PART * r
    return { x, y, w, h, points: [[x, y + h], [x1, y], [x2, level], [x3, level], [x4, y + h]] }
  }
  /** Move a part by hand to a place from 0 to 1. Did anything change? */
  slide(i, pos) { return this.parts[i].slide(pos) }
  tell() {
    if (this.onChange) this.onChange(...this.value, this)
    this.panel.told.push(this.id, this.value)
    this.touch()
  }
  reset() {
    let moved = 0
    for (const part of this.parts) moved |= part.put(part.default)
    if (moved) this.tell()
  }
  down(p) {
    // The corner nearest the finger is the one held.
    const points = this.shape(this.u).points
    let near = Infinity
    for (let i = 1; i < 5; i++) { const far = Math.hypot(p.x - points[i][0], p.y - points[i][1]); if (far < near) { near = far; this.grip = i - 1 } }
    this.last = { x: p.x, y: p.y }
    this.where = this.parts.map((part) => part.pos)
    this.touch()
  }
  move(p) {
    const s = this.shape(this.u), fine = p.shift ? 0.1 : 1
    const across = (p.x - this.last.x) / (s.w * SHAPE_PART) * fine, upward = (this.last.y - p.y) / s.h * fine
    this.last = { x: p.x, y: p.y }
    const go = (i, by) => { this.where[i] = clamp(this.where[i] + by, 0, 1); return this.slide(i, this.where[i]) }
    let moved = 0
    if (this.grip === 0) moved |= go(0, across)
    if (this.grip === 1) moved |= go(1, across) | go(2, upward)
    if (this.grip === 2) moved |= go(2, upward)
    if (this.grip === 3) moved |= go(3, across)
    if (moved) this.tell()
  }
  up() { this.grip = -1; this.touch() }
  frame() {
    if (this.held) return
    let moved = 0
    for (const part of this.parts) moved |= part.follow()
    if (moved) this.touch()
  }
  draw(g, u) {
    const s = this.shape(u), pts = s.points
    words(g, this.label, this.x + this.w / 2, this.y + 13 * u, 12 * u, THEME.dim, 'center', '', this.w - 6 * u)
    rounded(g, this.x + 4 * u, s.y - 8 * u, this.w - 8 * u, s.h + 16 * u, 7 * u)
    g.fillStyle = THEME.well
    g.fill()
    const trace = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))) }
    trace()
    g.closePath()
    g.globalAlpha = 0.18
    g.fillStyle = this.accent
    g.fill()
    g.globalAlpha = 1
    trace()
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.strokeStyle = this.accent
    g.lineWidth = 2 * u
    g.stroke()
    for (let i = 1; i < 5; i++) {
      const on = this.grip === i - 1
      g.beginPath(); g.arc(pts[i][0], pts[i][1], (on ? 7.5 : i === 3 ? 4 : 6) * u, 0, TAU)
      g.fillStyle = on ? this.accent : THEME.text
      g.fill()
    }
    // Under the graph: the four numbers, or while a corner is held, what it is setting, in full.
    const held = this.grip < 0 ? [] : this.grip === 1 ? [1, 2] : [this.grip === 2 ? 2 : this.grip]
    const said = held.length ? held.map((i) => `${SHAPE[i]} ${shown(this.parts[i].v, this.parts[i])}`).join('   ') : this.parts.map((part, i) => `${SHAPE[i][0].toUpperCase()} ${shown(part.v, { ...part, unit: '' })}`).join('   ')
    words(g, said, this.x + this.w / 2, this.y + this.h - 10 * u, 11 * u, held.length ? THEME.text : THEME.dim, 'center', '', this.w - 12 * u)
  }
}

// --- patterns: rows of steps, as lists and as text
/**
 * A PATTERN AS TEXT, so that it can be saved, pasted into a scene's code and handed to a target
 * that keeps its pattern that way. It is the text the sound engine reads (synths.js, and a song's
 * file), mark for mark. The marks are these two tables and nothing else.
 *
 *   steps (a gate, a drum's row, a lane):  one mark a step.  . off   x on   1 to 8: on, at that many ninths
 *                                          (0 is off and 9 is on).  X on, with an accent: a drum's row and a
 *                                          lane have accents, a gate has none.  Spaces and | are for the eye.
 *   an arpeggio:  steps with a space between.  1 2 3: that note of the chord, counted from 1 at its lowest
 *                 (past its top note the count goes on an octave up)   - or . a rest   _ the note before, held on
 *                 after a note: ' an octave up (, down)   ^ an accent   :1 to :9 its own length, in tenths of a step
 *                 before a note: ~ slide into it
 *
 * In place of the steps a pattern may be the name of one that is built in ("trance", "gallop").
 */
// A GATE'S TEXT AND A ROW OF STEPS' TEXT ARE TWO KINDS OF TEXT, though they look alike. A gate's is the sound
// engine's, and has no accents; a drum's row (and a lane, and a row of a grid) is this library's own, and has.
// Neither is to be handed over as the other: each control reads and writes by its own table.
const GATE_MARKS = { off: '.', on: 'x', accent: null, skipped: ' ', parts: 9 }
const STEP_MARKS = { off: '.', on: 'x', accent: 'X', skipped: ' |', parts: 9 }
const ARP_MARKS = { rest: '-', rests: '-.', tie: '_', up: "'", down: ',', accent: '^', length: ':', slide: '~' }
/** The patterns that are built in, by name: a target that says its own (describe(name).patterns) is believed instead. */
const GATE_NAMED = { eighths: 'x.x.x.x.x.x.x.x.', offbeat: '..x...x...x...x.', gallop: 'x.xxx.xxx.xxx.xx', trance: 'x.x.xx.xx.x.xx.x', stutter: 'xxx.xx.xx.xxx.x.', pump: '2468246824682468', triplets: 'x..x..x..x..x..x..x..x..', dotted: 'x..x..x.x..x..x.' }
const ARP_NAMED = { bounce: '1 2 3 2', octaves: "1 1' 1 1'", 'root-fifth': "1 3 1' 3", thumb: '1 2 1 3 1 4 1 3', converge: '1 4 2 3', diverge: '2 3 1 4', offbeat: '- 1 - 2 - 3 - 2', gallop: '1^ - 1 1 2^ - 2 2', trance: '1^ - 3 2 - 1^ 3 -', acid: "1^ 1 ~3 - 1' ~1 2^ -" }

function stepsFromText(text, marks = STEP_MARKS) {
  const steps = []
  for (const mark of String(text)) {
    if (marks.skipped.includes(mark)) continue
    if (mark >= '0' && mark <= '9') steps.push({ level: Math.min(1, Number(mark) / marks.parts), accent: false })
    else steps.push({ level: mark === marks.off ? 0 : 1, accent: !!marks.accent && mark === marks.accent })
  }
  return steps
}
function stepsToText(steps, marks = STEP_MARKS) {
  return steps.map((s) => {
    const part = Math.round((s.level || 0) * marks.parts)
    return part <= 0 ? marks.off : s.accent && marks.accent ? marks.accent : part >= marks.parts ? marks.on : String(part)
  }).join('')
}
/** One step of an arpeggio: a rest, until it is given a note. `length` 0 is the arpeggio's own. */
const arpStep = (given) => ({ note: 0, octave: 0, tie: false, accent: false, slide: false, length: 0, ...given })
function arpFromText(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).map((word) => {
    if (word === ARP_MARKS.tie) return arpStep({ tie: true })
    const at = /^(~?)(\d{1,2})([',]*)(\^?)(?::(\d))?$/.exec(word.split(ARP_MARKS.slide).join('~').split(ARP_MARKS.up).join("'").split(ARP_MARKS.down).join(',').split(ARP_MARKS.accent).join('^').split(ARP_MARKS.length).join(':'))
    // (What is not a step is a rest: a pattern half typed is still a pattern.)
    if (!at) return arpStep()
    let octave = 0
    for (const mark of at[3]) octave += mark === "'" ? 1 : -1
    return arpStep({ note: Number(at[2]), octave, accent: !!at[4], slide: !!at[1], length: Number(at[5]) || 0 })
  })
}
function arpToText(steps) {
  return steps.map((s) => {
    if (s.tie) return ARP_MARKS.tie
    if (!s.note) return ARP_MARKS.rest
    return (s.slide ? ARP_MARKS.slide : '') + s.note + (s.octave > 0 ? ARP_MARKS.up.repeat(s.octave) : ARP_MARKS.down.repeat(-s.octave || 0)) + (s.accent ? ARP_MARKS.accent : '') + (s.length ? ARP_MARKS.length + s.length : '')
  }).join(' ')
}
/** A pattern given as text may be the name of one: the text that name stands for, or the text as it was. */
const named = (text, names) => (typeof text === 'string' && names[text.trim().toLowerCase()]) || text

/**
 * ONE ROW OF STEPS: what a gate, a drum's row, a row of a grid and a lane of accents all are. Each
 * step is off or on at a level from 0 to 1, and may have an accent; `length` of them are in use.
 * It keeps the steps and knows what a finger does to them, and each control that has rows says
 * where they are drawn.
 *
 *   bars       each step is a bar as tall as its level: a finger sets the level by how high it is,
 *              and dragged across draws a line of levels
 *   accents    a drag up on a step gives it an accent, and down takes it away
 *   velocity   a drag up or down on a step says how hard, 0 to 1
 */
class Lane {
  constructor(most, length, how = {}) {
    this.most = most
    this.length = clamp(length, 1, most)
    this.bars = !!how.bars
    this.accents = !!how.accents
    this.velocity = !!how.velocity
    this.marks = how.marks || STEP_MARKS // how it is written as text: a gate's lane is told the gate's marks
    this.level = new Array(most).fill(0)
    this.accent = new Array(most).fill(false)
    this.stroke = null
  }
  /** The steps in use, each { on, level, accent }. */
  get steps() { return this.level.slice(0, this.length).map((level, i) => ({ on: level > 0, level, accent: this.accent[i] })) }
  get levels() { return this.level.slice(0, this.length) }
  get text() { return stepsToText(this.steps, this.marks) }
  /** Take a whole row: text, or a list of numbers, of true and false, or of steps. `fit`: its length becomes the row's. */
  take(row, fit) {
    const steps = typeof row === 'string' ? stepsFromText(row, this.marks) : [...(row || [])].map((s) => (s != null && typeof s === 'object' ? { level: s.level ?? (s.on === false ? 0 : 1), accent: !!s.accent } : { level: s === true ? 1 : clamp(Number(s) || 0, 0, 1), accent: false }))
    if (fit && steps.length) this.length = clamp(steps.length, 1, this.most)
    for (let i = 0; i < this.most; i++) { this.level[i] = steps[i]?.level || 0; this.accent[i] = !!steps[i]?.accent && this.level[i] > 0 }
  }
  put(i, level, accent) {
    if (!(i >= 0 && i < this.most)) return false
    level = level === true ? 1 : clamp(Number(level) || 0, 0, 1)
    accent = level > 0 && (accent ?? this.accent[i])
    if (this.level[i] === level && this.accent[i] === accent) return false
    this.level[i] = level; this.accent[i] = accent
    return true
  }
  /** A level from where a finger is in a step: `down` is 0 at its top and 1 at its bottom. */
  high(down) { return clamp(Math.round((1 - down) * this.marks.parts) / this.marks.parts, 0, 1) } // (in ninths, as the text has them)
  /** A finger lands on step i, `down` of the way down it. Each of these three says whether anything changed. */
  begin(i, down) {
    this.stroke = { first: i, down, was: this.level[i], moved: false, paint: this.level[i] ? 0 : 1 }
    if (this.bars) return this.level[i] ? false : this.put(i, 1, false)
    return this.put(i, this.stroke.paint, false)
  }
  drag(i, down) {
    const s = this.stroke
    if (!s) return false
    if (this.bars) {
      if (i === s.first && !s.moved && Math.abs(down - s.down) < 0.12) return false
      s.moved = true
      return this.put(i, this.high(down), false)
    }
    if (i !== s.first) { s.moved = true; return this.put(i, s.paint, false) }
    if (!s.paint || s.moved) return false
    const up = s.down - down
    if (this.accents && Math.abs(up) > 0.4) return this.put(i, 1, up > 0)
    if (this.velocity && Math.abs(up) > 0.15) return this.put(i, clamp(Math.round((up > 0 ? 1 : 1 + up / 2) * 20) / 20, 0.1, 1), false)
    return false
  }
  end() {
    const s = this.stroke
    this.stroke = null
    // A tap on a bar that was up puts it down.
    return !!s && this.bars && !s.moved && s.was > 0 && this.put(s.first, 0)
  }
  /** Draw step i in a box. `now`: it is the one sounding. Past the length in use it is drawn faint. */
  drawStep(g, x, y, w, h, u, i, colour, now) {
    const level = this.level[i], gap = Math.min(2 * u, w * 0.08), used = i < this.length
    g.globalAlpha = used ? 1 : 0.35
    rounded(g, x + gap, y + gap, w - 2 * gap, h - 2 * gap, 5 * u)
    // Every fourth step starts a beat, and is drawn a little lighter so that the eye can count.
    g.fillStyle = now ? THEME.track : i % 4 === 0 ? THEME.knob : THEME.well
    g.fill()
    if (level > 0) {
      if (this.bars) {
        const tall = Math.max(4 * u, (h - 2 * gap) * level)
        rounded(g, x + gap, y + h - gap - tall, w - 2 * gap, tall, 4 * u)
        g.fillStyle = colour
        g.fill()
      } else {
        g.globalAlpha = (used ? 1 : 0.35) * (this.accent[i] ? 1 : 0.3 + 0.5 * level)
        g.fillStyle = colour
        g.fill()
        g.globalAlpha = used ? 1 : 0.35
        // An accent is a full, bright step with a mark on it.
        if (this.accent[i]) { g.fillStyle = THEME.text; g.fillRect(x + w * 0.3, y + gap + 3 * u, w * 0.4, 2.5 * u) }
      }
    }
    if (now) { rounded(g, x + gap, y + gap, w - 2 * gap, h - 2 * gap, 5 * u); g.strokeStyle = THEME.text; g.lineWidth = 1.5 * u; g.stroke() }
    g.globalAlpha = 1
  }
}

/** A − and a + with a number between them, small, at a control's top right: how many steps a pattern has. Where it is, and which of the two a point is on. */
function countBox(control, u) { return { x: control.x + control.w - 86 * u, y: control.y + 2 * u, w: 80 * u, h: 22 * u } }
function countAt(control, p, u) {
  const b = countBox(control, u)
  // A finger is given more room than is drawn: the whole corner.
  if (p.y > b.y + b.h + 8 * u || p.x < b.x - 8 * u) return 0
  return p.x < b.x + b.w / 2 ? -1 : 1
}
function drawCount(g, control, u, n) {
  const b = countBox(control, u), cy = b.y + b.h / 2
  rounded(g, b.x, b.y, b.w, b.h, 6 * u)
  g.fillStyle = THEME.knob
  g.fill()
  g.strokeStyle = control.accent
  g.lineWidth = 2 * u
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(b.x + 9 * u, cy); g.lineTo(b.x + 17 * u, cy)
  g.moveTo(b.x + b.w - 17 * u, cy); g.lineTo(b.x + b.w - 9 * u, cy); g.moveTo(b.x + b.w - 13 * u, cy - 4 * u); g.lineTo(b.x + b.w - 13 * u, cy + 4 * u)
  g.stroke()
  words(g, String(n), b.x + b.w / 2, cy + 0.5 * u, 12 * u, THEME.text, 'center', '600')
}
/** The step a target says is sounding, if it says: its step() or its position(), or the setting of that name (a synth's "gateStep"). Below 0 is none. */
function soundingOf(target, length, name) {
  const ask = method(target, 'step', 'position')
  const at = ask ? ask() : name ? readTarget(target, name) : null
  return typeof at !== 'number' ? null : at < 0 ? -1 : Math.floor(at) % length
}

/**
 * A LANE OF STEPS: `steps("accent", 16)`. A row of steps to tap on and off and to drag across;
 * with `levels: true` each is a bar whose height is its level. `lane.value` is the levels (0 for
 * off), `lane.steps` the same as { on, level, accent } and `lane.text` as text ("x...x.5."); any
 * of the three may be set. `lane.length` is how many are in use (the − and + change it, up to
 * `max`), and `lane.step = 3` lights the one that is sounding. Tied to a setting of a target, it
 * reads and writes the pattern there, as text if that is how the target keeps it, else as a list.
 */
class StepLane extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    let d = {}, there
    if (spec.target) {
      this.target = spec.target
      // The setting may be left out: it is looked for under the names a pattern of this kind goes by.
      this.param = spec.param ?? this.names.find((name) => readTarget(this.target, name) !== undefined || Object.keys(describe(this.target, name)).length) ?? this.names[0]
      d = describe(this.target, this.param)
      there = readTarget(this.target, this.param)
      if (!this.label && !spec.bare) this.label = d.label ?? d.name ?? String(this.param)
      this.asText = typeof there === 'string' || (!isList(there) && ['text', 'pattern', 'steps'].includes(d.kind))
    }
    const most = clamp(Math.round(spec.max ?? d.max ?? d.steps ?? 32), 1, 64)
    this.lane = new Lane(most, spec.steps ?? d.length ?? Math.min(16, most), { bars: spec.levels ?? this.bars, accents: spec.accents, velocity: spec.velocity, marks: this.marks })
    this.resizable = spec.length !== false // may its length be changed by hand?
    this.known = d.patterns && typeof d.patterns === 'object' ? d.patterns : null // the target's own named patterns
    const given = spec.value ?? (there === '' ? null : there) ?? d.default
    if (given != null && given !== '') this.read(given, spec.steps == null)
    this.playing = -1
    this.per = this.lane.length
    this.many = false
    if (spec.value != null && this.target) this.write()
  }
  get names() { return ['pattern', 'steps'] }
  get bars() { return false }
  /** The patterns it can be set to by name, and the setting of its target that says which step is sounding. */
  get presets() { return {} }
  get sounding() { return null }
  get marks() { return STEP_MARKS }
  /** Write a pattern by its name. */
  preset(name) {
    const text = this.presets[String(name).toLowerCase()]
    if (!text) return
    this.read(text, true)
    this.panel.arrange = true
    this.tell()
  }
  /** Take a pattern in any of the ways one is written. */
  read(given, fit) { this.lane.take(named(given, this.presets), fit) }
  /** What the target is told: text, or a list of levels. */
  write() { if (this.target) writeTarget(this.target, this.param, this.asText ? this.text : this.value) }
  get value() { return this.lane.levels }
  set value(given) { this.read(given, true); this.write(); this.panel.arrange = true }
  get steps() { return this.lane.steps }
  set steps(given) { this.value = given }
  get text() { return this.lane.text }
  set text(given) { this.value = given }
  get v() { return this.text }
  get length() { return this.lane.length }
  set length(n) { n = clamp(Math.round(n), 1, this.lane.most); if (n !== this.lane.length) { this.lane.length = n; this.write(); this.panel.arrange = true } }
  get step() { return this.playing }
  set step(n) { n = n == null || n < 0 ? -1 : Math.floor(n) % this.lane.length; if (n !== this.playing) { this.playing = n; this.touch() } }
  put(i, level, accent) { if (this.lane.put(i, level, accent)) { this.write(); this.touch() } }
  clear() { this.lane.take([]); this.write(); this.touch() }
  /** Changed by hand: the target, the scene and whoever listens are told. */
  tell() {
    this.write()
    if (this.onChange) this.onChange(this.value, this)
    this.panel.told.push(this.id, this.text)
    this.touch()
  }
  resize(by) {
    const n = clamp(this.lane.length + by, 1, this.lane.most)
    if (n === this.lane.length) return
    this.lane.length = n
    this.panel.arrange = true
    this.tell()
  }
  scaleOf() { return 1 }
  get tallness() { return this.lane.bars ? 64 : 30 }
  natural(u, room) {
    const n = this.lane.length, side = (per) => (room - 14 * u) / per
    this.per = n
    while (side(this.per) < STEP_LEAST * u && this.per > 4) this.per = Math.ceil(this.per / 2)
    this.each = clamp(side(this.per), STEP_LEAST * u, 34 * u)
    return [Math.max(this.per * this.each + 14 * u, 150 * u), 28 * u + Math.ceil(n / this.per) * (this.tallness * u + 4 * u) + 4 * u]
  }
  spotOf(i, u) {
    const w = (this.w - 14 * u) / this.per, h = this.tallness * u
    return { x: this.x + 7 * u + (i % this.per) * w, y: this.y + 28 * u + Math.floor(i / this.per) * (h + 4 * u), w, h }
  }
  /** The step at a point, and how far down it the point is (0 at its top, 1 at its bottom), or null. */
  stepAt(p, u) {
    const first = this.spotOf(0, u), line = clamp(Math.floor((p.y - first.y) / (first.h + 4 * u)), 0, Math.ceil(this.lane.length / this.per) - 1)
    const i = line * this.per + clamp(Math.floor((p.x - first.x) / first.w), 0, this.per - 1)
    return i < this.lane.length ? [i, clamp((p.y - first.y - line * (first.h + 4 * u)) / first.h, 0, 1)] : null
  }
  down(p) {
    const u = this.u, by = this.resizable && p.y < this.y + 26 * u ? countAt(this, p, u) : 0
    this.drawing = false
    if (by) return this.resize(by)
    if (p.y < this.y + 26 * u) return
    const at = this.stepAt(p, u)
    if (!at) return
    this.drawing = true
    if (this.lane.begin(...at)) this.tell()
  }
  move(p) {
    const at = this.drawing && this.stepAt(p, this.u)
    if (at && this.lane.drag(...at)) this.tell()
  }
  up() { if (this.drawing && this.lane.end()) this.tell(); this.drawing = false }
  frame() {
    if (!this.target) return
    const now = soundingOf(this.target, this.lane.length, this.sounding)
    if (now != null) this.step = now
    if (this.held) return
    // A target whose pattern was changed some other way is followed.
    const there = readTarget(this.target, this.param)
    // (An empty pattern is a target that has none: what is drawn here stays, until it is given one.)
    if (there == null || there === '') return
    const said = typeof there === 'string' ? stepsToText(stepsFromText(named(there, this.presets), this.lane.marks), this.lane.marks) : [...there].join()
    if (said === (typeof there === 'string' ? this.text : this.value.join())) return
    this.read(there, true)
    this.panel.arrange = true
  }
  draw(g, u) {
    words(g, this.label, this.x + 8 * u, this.y + 13 * u, 12 * u, THEME.dim, 'left', '', this.w - 104 * u)
    if (this.resizable) drawCount(g, this, u, this.lane.length)
    for (let i = 0; i < this.lane.length; i++) { const s = this.spotOf(i, u); this.lane.drawStep(g, s.x, s.y, s.w, s.h, u, i, this.accent, i === this.playing) }
  }
}

/**
 * A TRANCE GATE'S PATTERN: `tranceGate("gate", pad)`. The steps that open and shut a sound in time, each
 * a bar as tall as the gate is open: tap one on and off, drag up and down for its level, drag
 * across to draw. It is a lane of steps with levels, and finds its target's pattern by name.
 */
class TranceGate extends StepLane {
  get names() { return ['gatePattern', 'gate_pattern', 'pattern'] }
  get bars() { return true }
  get presets() { return this.known || GATE_NAMED }
  get sounding() { return 'gateStep' }
  get marks() { return GATE_MARKS }
}

/** The lanes under an arpeggio's grid, one for each thing a step has besides its note: the mark it is known by, and the step's word for it. */
const ARP_LANES = [['^', 'accent'], ['~', 'slide'], ["'", 'octave'], [':', 'length']]
/** The octaves a tap on a step's octave goes through, in turn. */
const ARP_OCTAVES = [0, 1, 2, -1]

/**
 * AN ARPEGGIO'S PATTERN: `arpPattern("arp", lead)`. Steps across, and the notes of the chord up the
 * side: 1 is its lowest, and past its top note the count goes on an octave up, so on a chord of
 * four notes row 5 is the lowest again, an octave higher. Tap a cell and that step plays that note;
 * tap it again for a rest; drag sideways from it and the note is held across the next steps. Under
 * the grid is a lane for each other thing a step has: tap for an accent (^), tap for a slide into
 * the note (~), tap to go round the octaves ('), and drag up and down for the step's own length (:).
 *
 * `arp.value` is the steps, each { note, octave, tie, accent, slide, length } (note 0 is a rest;
 * length 0 is the arpeggio's own, 1 to 9 tenths of a step), and `arp.text` the same as the text the
 * sound engine reads ("1 - 3 2 _ 1 3 5^"). Either may be set, and so may a built-in pattern's name:
 * `arp.preset("trance")`.
 */
class ArpPattern extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    let d = {}, there
    if (spec.target) {
      this.target = spec.target
      this.param = spec.param ?? ['arpPattern', 'arp_pattern', 'pattern'].find((name) => readTarget(this.target, name) !== undefined || Object.keys(describe(this.target, name)).length) ?? 'arpPattern'
      d = describe(this.target, this.param)
      there = readTarget(this.target, this.param)
      if (!this.label && !spec.bare) this.label = d.label ?? d.name ?? String(this.param)
      this.asText = typeof there === 'string' || !isList(there)
    }
    this.known = d.patterns && typeof d.patterns === 'object' ? d.patterns : null
    this.most = clamp(Math.round(spec.max ?? d.max ?? d.steps ?? 32), 1, 64)
    this.rows = clamp(Math.round(spec.notes ?? d.notes ?? 8), 1, 16)
    this.pattern = []
    this.count = spec.steps ?? Math.min(8, this.most)
    const given = spec.value ?? (there === '' ? null : there) ?? d.default
    this.read(given != null && given !== '' ? given : [1, 2, 3, 4], spec.steps == null)
    this.playing = -1
    this.many = false
    if (spec.value != null && this.target) this.write()
  }
  get presets() { return this.known || ARP_NAMED }
  /** Take a pattern: its text, a built-in pattern's name, or a list whose items are steps, a step's text, or a note's number (0 for a rest). */
  read(given, fit) {
    const steps = typeof given === 'string' ? arpFromText(named(given, this.presets))
      : [...(given || [])].map((s) => (typeof s === 'string' ? arpFromText(s)[0] || arpStep() : typeof s === 'object' && s ? arpStep({ note: s.note || 0, octave: s.octave || 0, tie: !!s.tie, accent: !!s.accent, slide: !!s.slide, length: clamp(Math.round(s.length || 0), 0, 9) }) : arpStep({ note: Number(s) || 0 })))
    if (fit && steps.length) this.count = clamp(steps.length, 1, this.most)
    this.pattern = Array.from({ length: this.most }, (_, i) => steps[i] || arpStep())
    // A note above the rows there are is given a row.
    for (const step of steps) if (step.note > this.rows) this.rows = Math.min(16, step.note)
  }
  write() { if (this.target) writeTarget(this.target, this.param, this.asText ? this.text : this.value) }
  get value() { return this.pattern.slice(0, this.count).map((s) => ({ ...s })) }
  set value(given) { this.read(given, true); this.write(); this.panel.arrange = true }
  get text() { return arpToText(this.pattern.slice(0, this.count)) }
  set text(given) { this.value = given }
  get v() { return this.text }
  get length() { return this.count }
  set length(n) { n = clamp(Math.round(n), 1, this.most); if (n !== this.count) { this.count = n; this.write(); this.panel.arrange = true } }
  get step() { return this.playing }
  set step(n) { n = n == null || n < 0 ? -1 : Math.floor(n) % this.count; if (n !== this.playing) { this.playing = n; this.touch() } }
  /** Write a pattern by its name: "bounce", "trance", "acid" and the rest. */
  preset(name) {
    const text = this.presets[String(name).toLowerCase()]
    if (!text) return
    this.read(text, true)
    this.panel.arrange = true
    this.tell()
  }
  tell() {
    this.write()
    if (this.onChange) this.onChange(this.value, this)
    this.panel.told.push(this.id, this.text)
    this.touch()
  }
  scaleOf() { return 1 }
  natural(u, room) {
    this.each = clamp((room - 40 * u) / this.count, STEP_LEAST * u, 34 * u)
    this.tall_ = clamp(200 / this.rows, 14, 26) * u
    return [Math.max(this.count * this.each + 40 * u, 170 * u), 28 * u + this.rows * this.tall_ + ARP_LANES.length * 24 * u + 10 * u]
  }
  grid(u) {
    const x = this.x + 30 * u, y = this.y + 28 * u, w = (this.w - 40 * u) / this.count, h = (this.h - 38 * u - ARP_LANES.length * 24 * u) / this.rows
    return { x, y, w, h, under: y + this.rows * h + 4 * u }
  }
  /** What is at a point: { i, row } in the grid (row 0 is note 1, at the bottom), or { i, lane } under it, or null. */
  cellAt(p, u) {
    const s = this.grid(u), i = Math.floor((p.x - s.x) / s.w)
    if (i < 0 || i >= this.count) return null
    if (p.y >= s.under) { const lane = Math.floor((p.y - s.under) / (24 * u)); return lane < ARP_LANES.length ? { i, lane } : null }
    const row = this.rows - 1 - Math.floor((p.y - s.y) / s.h)
    return row >= 0 && row < this.rows ? { i, row } : null
  }
  down(p) {
    const u = this.u
    this.from = this.sizing = null
    if (p.y < this.y + 26 * u) {
      const by = countAt(this, p, u), n = clamp(this.count + by, 1, this.most)
      if (by && n !== this.count) { this.count = n; this.panel.arrange = true; this.tell() }
      return
    }
    const at = this.cellAt(p, u)
    if (!at) return
    const step = this.pattern[at.i]
    if (at.lane != null) {
      const word = ARP_LANES[at.lane][1]
      // A rest and a tie have nothing to accent, slide, raise or shorten.
      if (!step.note) return
      if (word === 'length') { this.sizing = { i: at.i, y: p.y, was: step.length, moved: false }; return }
      if (word === 'octave') step.octave = ARP_OCTAVES[(ARP_OCTAVES.indexOf(step.octave) + 1) % ARP_OCTAVES.length]
      else step[word] = !step[word]
      return this.tell()
    }
    // The chosen cell tapped again is a rest; any other cell is that step's note, and it keeps what else the step had.
    const note = at.row + 1, same = !step.tie && step.note === note
    Object.assign(step, same ? arpStep() : { note, tie: false })
    this.from = same ? null : at.i
    this.before = this.pattern.map((was) => ({ ...was })) // what each step was, for one that is tied over and then let go again
    this.tell()
  }
  move(p) {
    const u = this.u
    if (this.sizing) {
      // Its own length: up for longer, down for shorter, a tenth of a step for each few points.
      const z = this.sizing, length = clamp(z.was + Math.round((z.y - p.y) / (5 * u)), 0, 9)
      if (Math.abs(p.y - z.y) > TAP_REACH * u) z.moved = true
      if (length !== this.pattern[z.i].length) { this.pattern[z.i].length = length; this.tell() }
      return
    }
    if (this.from == null) return
    // Dragged sideways from a note: it is held across the steps the finger has passed, and no further.
    const s = this.grid(u), to = clamp(Math.floor((p.x - s.x) / s.w), this.from, this.count - 1)
    let changed = false
    for (let i = this.from + 1; i <= Math.max(to, this.reach || 0); i++) {
      const step = this.pattern[i]
      if (i <= to && !step.tie) { Object.assign(step, arpStep({ tie: true })); changed = true }
      else if (i > to && step.tie) { Object.assign(step, this.before[i]); changed = true }
    }
    this.reach = to
    if (changed) this.tell()
  }
  up() {
    // A tap on a step's length: half a step, or back to the arpeggio's own.
    const z = this.sizing
    if (z && !z.moved) { this.pattern[z.i].length = z.was ? 0 : 5; this.tell() }
    this.from = this.sizing = null
    this.reach = 0
  }
  frame() {
    if (!this.target) return
    const now = soundingOf(this.target, this.count, 'arpStep')
    if (now != null) this.step = now
    if (this.held) return
    const there = readTarget(this.target, this.param)
    if (there == null || there === '') return
    const said = typeof there === 'string' ? arpToText(arpFromText(named(there, this.presets))) : null
    if (said === this.text || (said == null && arpToText([...there].map((s) => (typeof s === 'object' && s ? arpStep(s) : typeof s === 'string' ? arpFromText(s)[0] || arpStep() : arpStep({ note: Number(s) || 0 })))) === this.text)) return
    this.read(there, true)
    this.panel.arrange = true
  }
  draw(g, u) {
    const s = this.grid(u)
    words(g, this.label, this.x + 8 * u, this.y + 13 * u, 12 * u, THEME.dim, 'left', '', this.w - 104 * u)
    drawCount(g, this, u, this.count)
    for (let row = 0; row < this.rows; row++) {
      const y = s.y + (this.rows - 1 - row) * s.h
      words(g, String(row + 1), this.x + 26 * u, y + s.h / 2, 10 * u, THEME.dim, 'right')
      for (let i = 0; i < this.count; i++) {
        rounded(g, s.x + i * s.w + 1.5 * u, y + 1.5 * u, s.w - 3 * u, s.h - 3 * u, 4 * u)
        g.fillStyle = i === this.playing ? THEME.track : i % 4 === 0 ? THEME.knob : THEME.well
        g.fill()
      }
    }
    // The notes, each as long as it is held: a note and the steps after it that are tied to it are one bar.
    for (let i = 0; i < this.count; i++) {
      const step = this.pattern[i]
      if (!step.note || step.tie) continue
      let last = i
      while (last + 1 < this.count && this.pattern[last + 1].tie) last++
      const row = clamp(step.note - 1, 0, this.rows - 1), y = s.y + (this.rows - 1 - row) * s.h
      rounded(g, s.x + i * s.w + 1.5 * u, y + 1.5 * u, (last - i + 1) * s.w - 3 * u, s.h - 3 * u, 4 * u)
      g.fillStyle = this.accent
      g.globalAlpha = step.accent ? 1 : 0.72
      g.fill()
      g.globalAlpha = 1
      if (i <= this.playing && this.playing <= last) { g.strokeStyle = THEME.text; g.lineWidth = 1.5 * u; g.stroke() }
    }
    ARP_LANES.forEach(([mark, word], lane) => {
      const y = s.under + lane * 24 * u + 11 * u
      words(g, mark, this.x + 26 * u, y, 12 * u, THEME.dim, 'right', '600')
      for (let i = 0; i < this.count; i++) {
        const step = this.pattern[i], cx = s.x + (i + 0.5) * s.w, has = step.note ? step[word] : 0
        if (word === 'octave' && has) words(g, has > 0 ? '+' + has : String(has), cx, y, 11 * u, this.accent, 'center', '600')
        else if (word === 'length' && has) {
          // Its own length, as a bar so much of the step long.
          rounded(g, cx - s.w / 2 + 3 * u, y - 4 * u, (s.w - 6 * u) * has / 10, 8 * u, 3 * u)
          g.fillStyle = this.accent
          g.fill()
        } else {
          g.beginPath(); g.arc(cx, y, (has ? 6 : step.note ? 3.5 : 2) * u, 0, TAU)
          g.fillStyle = has ? this.accent : THEME.track
          g.fill()
        }
      }
    })
  }
}

/** A step of a grid is never drawn narrower than this, in points: a row too long for its room is put on two lines, or four. */
const STEP_LEAST = 24

/**
 * A GRID OF STEPS: a row for each sound and a column for each step of a bar, every cell on or off.
 * `grid.value` is the rows, each a list of 0 and 1 (or of how hard, 0 to 1, with `velocity: true`);
 * `grid.get(row, step)` reads one cell and `grid.put(row, step, on)` writes one, a row being named or
 * numbered. `grid.step = 3` lights that column as the one playing. A tap turns a cell on or off, and
 * a finger dragged along turns on (or off) every cell it crosses.
 */
class StepGrid extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.steps = Math.max(1, Math.round(spec.steps || 16))
    this.rows = (Array.isArray(spec.rows) ? spec.rows : Array.from({ length: spec.rows || 1 }, (_, i) => String(i + 1))).map(String)
    this.velocity = !!spec.velocity
    // Each row is a lane of steps: the grid says where they are drawn, and the lanes keep them and know what a finger does.
    this.lanes = this.rows.map((_, r) => { const lane = new Lane(this.steps, this.steps, { velocity: this.velocity }); lane.take(spec.value?.[r] || []); return lane })
    this.playing = -1
    this.per = this.steps // how many steps to a line
    this.many = false
  }
  get cells() { return this.lanes.map((lane) => lane.level) }
  get value() { return this.lanes.map((lane) => lane.levels) }
  set value(rows) { this.lanes.forEach((lane, r) => lane.take(typeof rows === 'string' ? rows.split('\n')[r] : rows?.[r])); this.touch() }
  /** The rows as text, a line for each: "x...x...". */
  get text() { return this.lanes.map((lane) => lane.text).join('\n') }
  set text(rows) { this.value = rows }
  /** The column that is playing now (none: -1). */
  get step() { return this.playing }
  set step(n) { n = n == null || n < 0 ? -1 : Math.floor(n) % this.steps; if (n !== this.playing) { this.playing = n; this.touch() } }
  rowOf(row) { return typeof row === 'number' ? row : this.rows.indexOf(String(row)) }
  /** One cell: 0 for off, else how hard (1 unless it was told otherwise). */
  get(row, step) { return this.cells[this.rowOf(row)]?.[step] || 0 }
  /** A whole row, by its name or its number. */
  row(row) { return [...(this.cells[this.rowOf(row)] || [])] }
  put(row, step, on) {
    if (!this.lanes[this.rowOf(row)]?.put(step, on)) return false
    this.touch()
    return true
  }
  clear() { for (const lane of this.lanes) lane.take([]); this.touch() }
  /** A step changed by hand. */
  said(r, s) {
    const level = this.lanes[r].level[s]
    if (this.onChange) this.onChange(this.rows[r], s, level, this)
    this.panel.told.push(this.id, [r, s, level])
    this.touch()
  }
  scaleOf() { return 1 }
  natural(u, room, g) {
    g.font = `${11 * u}px ${THEME.font}`
    this.names = 0
    for (const name of this.rows) this.names = Math.max(this.names, g.measureText(name).width)
    this.names = Math.min(this.names, 64 * u) + 10 * u
    const side = (per) => (room - this.names - 14 * u) / per
    this.per = this.steps
    while (side(this.per) < STEP_LEAST * u && this.per > 4) this.per = Math.ceil(this.per / 2)
    const cell = clamp(side(this.per), STEP_LEAST * u, 32 * u), lines = Math.ceil(this.steps / this.per)
    this.sizes = [cell, Math.max(cell, 26 * u)]
    return [this.names + this.per * cell + 14 * u, (this.label ? 22 : 6) * u + lines * (this.rows.length * this.sizes[1] + 8 * u)]
  }
  /** Where a cell is drawn. */
  spotOf(r, s, u) {
    const [cw, ch] = this.sizes, line = Math.floor(s / this.per), across = (this.w - this.names - 14 * u) / this.per
    return { x: this.x + 7 * u + this.names + (s % this.per) * across, y: this.y + (this.label ? 22 : 6) * u + line * (this.rows.length * ch + 8 * u) + r * ch, w: across, h: ch, cw }
  }
  cellAt(p, u) {
    const first = this.spotOf(0, 0, u), block = this.rows.length * first.h + 8 * u
    const line = Math.floor((p.y - first.y) / block), r = Math.floor((p.y - first.y - line * block) / first.h), col = Math.floor((p.x - first.x) / first.w)
    const s = line * this.per + col
    return line >= 0 && r >= 0 && r < this.rows.length && col >= 0 && col < this.per && s < this.steps ? [r, s] : null
  }
  /** How far down its cell a point is: 0 at the top, 1 at the bottom. */
  downIn(p, at) { const c = this.spotOf(at[0], at[1], this.u); return clamp((p.y - c.y) / c.h, 0, 1) }
  down(p) {
    const at = this.cellAt(p, this.u)
    this.drawn = at ? at[0] : null
    if (at && this.lanes[at[0]].begin(at[1], this.downIn(p, at))) this.said(at[0], at[1])
  }
  move(p) {
    const at = this.drawn == null ? null : this.cellAt(p, this.u)
    if (!at) return
    // Along its own row a finger paints; on another row it paints there the same way.
    const lane = this.lanes[this.drawn], own = lane.stroke && at[1] === lane.stroke.first
    if (!lane.stroke) return
    if (at[0] === this.drawn || own) { if (lane.drag(at[1], this.downIn(p, [this.drawn, at[1]]))) this.said(this.drawn, at[1]) } else if (this.lanes[at[0]].put(at[1], lane.stroke.paint)) this.said(at[0], at[1])
  }
  up() { if (this.drawn != null) this.lanes[this.drawn].end(); this.drawn = null }
  draw(g, u) {
    if (this.label) words(g, this.label, this.x + 8 * u, this.y + 12 * u, 12 * u, THEME.dim, 'left', '', this.w - 16 * u)
    const lines = Math.ceil(this.steps / this.per)
    for (let r = 0; r < this.rows.length; r++) {
      for (let line = 0; line < lines; line++) {
        const c = this.spotOf(r, line * this.per, u)
        words(g, this.rows[r], this.x + 7 * u + this.names - 8 * u, c.y + c.h / 2, 11 * u, THEME.dim, 'right', '', this.names - 8 * u)
      }
      for (let s = 0; s < this.steps; s++) { const c = this.spotOf(r, s, u); this.lanes[r].drawStep(g, c.x, c.y, c.w, c.h, u, s, this.accent, s === this.playing) }
    }
  }
}

/** The notes of a drum kit that pads play when they are named for its drums, as most instruments number them. */
const DRUMS = { kick: 36, rim: 37, snare: 38, clap: 39, tom: 45, hat: 42, 'closed hat': 42, 'open hat': 46, crash: 49, ride: 51, cowbell: 56 }
/** How long a pad stays lit after it is flashed from the scene's code, in milliseconds. */
const PAD_FLASH_MS = 140

/**
 * PADS: big squares to hit, several at once. Each plays a note of its target for as long as it is
 * held (`noteOn(note, velocity)`, then `noteOff(note)`), harder the nearer its middle it is hit.
 * Pads named for drums play those drums' notes (a kick is 36); others count up from 36, or are told
 * with `notes`. `onNoteOn(note, velocity, name)` hears them, and `drums.flash("kick")` lights one
 * from the scene's code, as when a song plays it.
 */
class Pads extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.target = spec.target || null
    this.names = (Array.isArray(spec.pads) ? spec.pads : Array.from({ length: spec.pads || 4 }, (_, i) => String(i + 1))).map(String)
    this.notes = this.names.map((name, i) => spec.notes?.[i] ?? DRUMS[name.toLowerCase()] ?? 36 + i)
    this.columns = spec.columns || (this.names.length <= 3 ? this.names.length : this.names.length <= 8 ? Math.ceil(this.names.length / 2) : 4)
    this.onNoteOn = spec.onNoteOn || null
    this.onNoteOff = spec.onNoteOff || null
    this.fingers = new Map() // pointer id -> the pad under it
    this.lit = this.names.map(() => 0) // when each was last flashed
    this.many = true
  }
  /** The pads held now, by their place in the list. */
  get value() { return [...new Set(this.fingers.values())].sort((a, b) => a - b) }
  scaleOf() { return 1 }
  get side() { return sized(this.size, 56, 72, 96) }
  natural(u, room) {
    const side = Math.max(48 * u, Math.min(this.side * u, (room - 12 * u) / this.columns))
    return [this.columns * side + 12 * u, (this.label ? 22 : 6) * u + Math.ceil(this.names.length / this.columns) * side + 6 * u]
  }
  stretch() { return [1, 1.25] }
  spot(i, u) {
    const top = this.y + (this.label ? 22 : 6) * u, lines = Math.ceil(this.names.length / this.columns)
    const w = (this.w - 12 * u) / this.columns, h = (this.y + this.h - 6 * u - top) / lines
    return { x: this.x + 6 * u + (i % this.columns) * w, y: top + Math.floor(i / this.columns) * h, w, h }
  }
  padAt(p, u) {
    const first = this.spot(0, u), col = Math.floor((p.x - first.x) / first.w), line = Math.floor((p.y - first.y) / first.h), i = line * this.columns + col
    return col >= 0 && col < this.columns && line >= 0 && i < this.names.length ? i : -1
  }
  /** Hit a pad from the scene's code as a finger would, by its name or its place; `lift` lets it go again. */
  hit(pad, velocity = 0.8) {
    const i = typeof pad === 'number' ? pad : this.names.indexOf(String(pad))
    if (i < 0 || i >= this.names.length) return
    const play = method(this.target, 'noteOn', 'note_on')
    if (play) play(this.notes[i], velocity)
    if (this.onNoteOn) this.onNoteOn(this.notes[i], velocity, this.names[i], this)
    this.panel.played.push(this.id, this.notes[i], velocity)
    this.touch()
  }
  lift(pad) {
    const i = typeof pad === 'number' ? pad : this.names.indexOf(String(pad))
    if (i < 0 || i >= this.names.length) return
    const stop = method(this.target, 'noteOff', 'note_off')
    if (stop) stop(this.notes[i])
    if (this.onNoteOff) this.onNoteOff(this.notes[i], this.names[i], this)
    this.panel.played.push(this.id, this.notes[i], 0)
    this.touch()
  }
  /** Light a pad for a moment without playing it: a song that plays the drum itself shows it so. */
  flash(pad) {
    const i = typeof pad === 'number' ? pad : this.names.indexOf(String(pad))
    if (i >= 0 && i < this.names.length) { this.lit[i] = performance.now(); this.touch() }
  }
  down(p) {
    const i = this.padAt(p, this.u)
    if (i < 0) return
    this.fingers.set(p.id, i)
    // Harder the nearer the middle of the pad.
    const s = this.spot(i, this.u), far = Math.hypot((p.x - s.x - s.w / 2) / (s.w / 2), (p.y - s.y - s.h / 2) / (s.h / 2))
    this.hit(i, Math.round(clamp(1 - 0.6 * far, 0.35, 1) * 100) / 100)
  }
  up(p) {
    const i = this.fingers.get(p.id)
    this.fingers.delete(p.id)
    if (i != null && ![...this.fingers.values()].includes(i)) this.lift(i)
  }
  frame(now) { if (this.lit.some((at) => at && performance.now() - at < PAD_FLASH_MS + 40)) this.touch() }
  draw(g, u) {
    if (this.label) words(g, this.label, this.x + 8 * u, this.y + 12 * u, 12 * u, THEME.dim, 'left', '', this.w - 16 * u)
    const held = new Set(this.fingers.values()), now = performance.now()
    this.names.forEach((name, i) => {
      const s = this.spot(i, u), on = held.has(i), flashed = this.lit[i] && now - this.lit[i] < PAD_FLASH_MS
      rounded(g, s.x + 3 * u, s.y + 3 * u, s.w - 6 * u, s.h - 6 * u, 10 * u)
      g.fillStyle = on ? this.accent : THEME.knob
      g.fill()
      if (flashed && !on) { g.globalAlpha = 0.55; g.fillStyle = this.accent; g.fill(); g.globalAlpha = 1 }
      g.strokeStyle = on ? THEME.text : this.accent
      g.globalAlpha = on ? 1 : 0.7
      g.lineWidth = 1.75 * u
      g.stroke()
      g.globalAlpha = 1
      words(g, name, s.x + s.w / 2, s.y + s.h / 2, 13 * u, on ? THEME.well : THEME.text, 'center', '600', s.w - 14 * u)
    })
  }
}

/** Patterns to start a drum sequencer from, by name: a row of steps for each drum it knows, sixteen steps long (repeated for a longer bar). */
const DRUM_PRESETS = {
  'four on the floor': { kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', hat: '..x...x...x...x.' },
  backbeat: { kick: 'x.......x.x.....', snare: '....X.......X...', clap: '............x...', hat: 'x.x.x.x.x.x.x.x.' },
  breakbeat: { kick: 'x.x.......x..x..', snare: '....X..x.x..X...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx' },
}
/** How far ahead of its time a step is handed to a target that can be told when, in seconds: far enough that a busy page does not make it late. */
const SEQ_AHEAD = 0.12
/** The swings a tap on the word steps through: how late every other step is, as a part of a step. */
const SWINGS = [0, 0.2, 0.33, 0.5]

/**
 * THE DRUM SEQUENCER: `drumSeq("beat", ["kick", "snare", "hat", "clap"])`. A row of steps for each
 * drum, and on the widget itself what it takes to play them: play and stop, a tempo (− and +, or tap
 * the number in time), swing, starter patterns and clear. Tap a step on and off, drag across to
 * paint, drag up on a step for an accent. Tap a drum's name to hear it, and the dot beside it to
 * mute its row. On a narrow screen it shows as many steps as fit a finger and turns the page as it plays.
 *
 * IT PLAYS BY ITSELF when it has something to play: `target` (or `targets`, one for each row or
 * by name) is anything with noteOn(note, velocity), and each row plays its drum's note (a kick is
 * 36; `notes` says otherwise). `onStep(row, step, velocity, at)` hears every step that sounds.
 *
 * THE BEAT IS KEPT TIGHT BY THE SOUND'S OWN CLOCK when there is one: `clock: soundTime` (a function
 * that gives the time in seconds), or a target or `clock` that offers time(). Each step is then
 * handed over a little before it is due, as
 * noteOn(note, velocity, { at }) and noteOff(note, { at }), to play at exactly that time. With no
 * such clock a step is played on the frame it falls due, which wobbles when the page is busy.
 */
class DrumSeq extends Control {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.rows = (Array.isArray(spec.rows) ? spec.rows : ['kick', 'snare', 'hat', 'clap']).map(String)
    this.count = clamp(Math.round(spec.steps || 16), 1, 32)
    this.lanes = this.rows.map(() => new Lane(32, this.count, { accents: true }))
    this.notes = this.rows.map((name, i) => spec.notes?.[i] ?? spec.notes?.[name] ?? DRUMS[name.toLowerCase()] ?? 36 + i)
    this.targets = this.rows.map((name, i) => (Array.isArray(spec.targets) ? spec.targets[i] : spec.targets?.[name]) ?? spec.target ?? null)
    // The clock: a function that gives the time in seconds (a scene's soundTime), or the first thing given that has a time() of its own.
    const timed = [spec.clock, ...this.targets].find((thing) => method(thing, 'time', 'soundTime'))
    this.clock = typeof spec.clock === 'function' ? { time: spec.clock } : timed ? { time: method(timed, 'time', 'soundTime') } : null
    this.onStep = spec.onStep || null
    this.tempo = clamp(spec.tempo ?? 120, 30, 300)
    this.swing = clamp(spec.swing ?? 0, 0, 0.75)
    this.muted = this.rows.map(() => false)
    this.lit = this.rows.map(() => 0)
    this.on = false
    this.pos = -1 // the step that is sounding
    this.queue = [] // steps handed over that have not sounded yet: { s, at }
    this.offs = [] // notes to let go, for a target that cannot be told when: { r, at }
    this.page = 0
    this.per = this.count
    this.taps = []
    this.preset_ = ''
    this.many = false
    if (spec.value != null) this.value = spec.value
    else if (spec.pattern) this.pattern = spec.pattern
    if (spec.playing) this.play()
  }
  /** The rows, each a list of levels (0 for off); set from the same, from rows of text, or from text with a line for each drum. */
  get value() { return this.lanes.map((lane) => lane.levels) }
  set value(given) {
    const rows = typeof given === 'string' ? given.split('\n').map((line) => line.slice(line.indexOf(':') + 1)).filter((line) => line.trim()) : given
    this.lanes.forEach((lane, r) => lane.take(rows?.[r] ?? []))
    this.touch()
  }
  get text() { return this.lanes.map((lane) => lane.text).join('\n') }
  set text(given) { this.value = given }
  get steps() { return this.lanes.map((lane) => lane.steps) }
  get v() { return this.text }
  get length() { return this.count }
  set length(n) { n = clamp(Math.round(n), 1, 32); if (n !== this.count) { this.count = n; for (const lane of this.lanes) lane.length = n; this.panel.arrange = true } }
  get step() { return this.pos }
  set step(n) { n = n == null || n < 0 ? -1 : Math.floor(n) % this.count; if (n !== this.pos) { this.pos = n; this.touch() } }
  /** A starter pattern, by its name: "four on the floor", "backbeat", "breakbeat". */
  get pattern() { return this.preset_ }
  set pattern(name) {
    const rows = DRUM_PRESETS[name]
    if (!rows) return
    this.preset_ = name
    this.lanes.forEach((lane, r) => lane.take((rows[this.rows[r].toLowerCase()] || '').repeat(2).slice(0, 32)))
    this.touch()
  }
  rowOf(row) { return typeof row === 'number' ? row : this.rows.indexOf(String(row)) }
  get(row, step) { return this.lanes[this.rowOf(row)]?.level[step] || 0 }
  put(row, step, on, accent) { if (this.lanes[this.rowOf(row)]?.put(step, on, accent)) this.touch() }
  clear() { for (const lane of this.lanes) lane.take([]); this.preset_ = ''; this.touch() }
  mute(row, on = true) { const r = this.rowOf(row); if (r >= 0) { this.muted[r] = !!on; this.touch() } }
  /** The time, in seconds: the clock's if there is one, else the page's. */
  now() { return this.clock ? this.clock.time() : performance.now() / 1000 }
  get long() { return 60 / this.tempo / 4 } // one step: a quarter of a beat
  get playing() { return this.on }
  set playing(on) { if (on) this.play(); else this.stop() }
  play() {
    if (this.on) return
    this.on = true
    this.next = 0
    this.due = this.now() + 0.05
    this.touch()
  }
  stop() {
    if (!this.on) return
    this.on = false
    this.queue.length = 0
    this.pos = -1
    this.touch()
  }
  /** Play one drum now, as a tap on its name does. */
  hit(row, velocity = 0.9, at) {
    const r = this.rowOf(row), target = this.targets[r]
    if (r < 0) return
    const play = method(target, 'noteOn', 'note_on'), stop = method(target, 'noteOff', 'note_off'), timed = this.clock && at != null
    if (play) timed ? play(this.notes[r], velocity, { at }) : play(this.notes[r], velocity)
    if (stop && timed) stop(this.notes[r], { at: at + this.long * 0.9 })
    else if (stop) this.offs.push({ r, at: this.now() + this.long * 0.9 })
    this.lit[r] = performance.now() + (timed ? Math.max(0, at - this.now()) * 1000 : 0)
  }
  /** Step s sounds at this time: every drum that is on there, and not muted, is played. */
  fire(s, at) {
    this.queue.push({ s, at })
    this.lanes.forEach((lane, r) => {
      const level = lane.level[s]
      if (!level || this.muted[r]) return
      const velocity = lane.accent[s] ? 1 : Math.round(0.7 * level * 100) / 100
      this.hit(r, velocity, at)
      if (this.onStep) this.onStep(this.rows[r], s, velocity, at, this)
      this.panel.told.push(this.id, ['step', r, s, velocity])
    })
  }
  frame() {
    const now = this.now()
    for (let i = this.offs.length - 1; i >= 0; i--) {
      if (this.offs[i].at > now) continue
      const { r } = this.offs.splice(i, 1)[0], stop = method(this.targets[r], 'noteOff', 'note_off')
      if (stop) stop(this.notes[r])
    }
    if (this.tapped && performance.now() - this.tapped > 250) { this.tapped = 0; this.touch() }
    if (this.side && performance.now() >= this.again) { this.again = performance.now() + STEP_AGAIN_MS; this.speed(this.side) }
    if (this.lit.some((at) => at && performance.now() - at < PAD_FLASH_MS + 40 && performance.now() >= at)) this.touch()
    if (!this.on) return
    // Each step that falls due before the page is looked at again is handed over now, with the time it is to sound.
    const ahead = this.clock ? SEQ_AHEAD : 0
    let turns = 0
    while (this.due <= now + ahead && turns++ < 64) {
      const s = this.next % this.count
      this.fire(s, this.due + (s % 2 ? this.swing * this.long : 0))
      this.next++
      this.due += this.long
    }
    // The column that is lit is the step that has sounded, not the one handed over ahead of time.
    while (this.queue.length && this.queue[0].at <= now) {
      this.pos = this.queue.shift().s
      // On a screen too narrow for the whole bar, the page is turned to where the beat is.
      if (Math.floor(this.pos / this.per) !== this.page && performance.now() - (this.paged || 0) > 2500) this.page = Math.floor(this.pos / this.per)
      this.touch()
    }
  }
  /** Tempo up or down by hand. */
  speed(by) {
    const tempo = clamp(Math.round(this.tempo + by), 30, 300)
    if (tempo === this.tempo) return
    this.tempo = tempo
    this.panel.told.push(this.id, ['tempo', tempo])
    this.touch()
  }
  scaleOf() { return 1 }
  natural(u, room, g) {
    g.font = `${11 * u}px ${THEME.font}`
    this.side_ = 0
    for (const name of this.rows) this.side_ = Math.max(this.side_, g.measureText(name).width)
    this.side_ = Math.min(this.side_, 56 * u) + 26 * u
    // As many steps to a page as a finger can use: all of them, or else so many whole beats.
    const fit = Math.floor((room - this.side_ - 14 * u) / (STEP_LEAST * u))
    this.per = this.count <= fit ? this.count : Math.max(4, Math.floor(fit / 4) * 4)
    const each = clamp((room - this.side_ - 14 * u) / this.per, STEP_LEAST * u, 32 * u)
    return [Math.max(this.side_ + this.per * each + 14 * u, 252 * u), (34 + this.rows.length * 30 + 34) * u]
  }
  /** The parts of the strip above the rows and of the one below them: each a box to tap. */
  parts(u) {
    const x = this.x + 7 * u, y = this.y + 4 * u, h = 26 * u, low = this.y + this.h - 30 * u, right = this.x + this.w - 7 * u, pages = Math.ceil(this.count / this.per)
    const turn = pages > 1 ? 46 * u : 0
    return {
      play: { x, y, w: 34 * u, h }, slower: { x: x + 40 * u, y, w: 28 * u, h }, tempo: { x: x + 68 * u, y, w: 58 * u, h }, faster: { x: x + 126 * u, y, w: 28 * u, h },
      swing: { x: right - 82 * u, y, w: 82 * u, h },
      pattern: { x, y: low, w: right - x - 56 * u - turn - 8 * u, h }, turn: pages > 1 ? { x: right - 52 * u - turn - 4 * u, y: low, w: turn, h } : null, clear: { x: right - 52 * u, y: low, w: 52 * u, h },
    }
  }
  spotOf(r, s, u) {
    const w = (this.w - this.side_ - 14 * u) / this.per, h = 30 * u
    return { x: this.x + 7 * u + this.side_ + (s - this.page * this.per) * w, y: this.y + 34 * u + r * h, w, h }
  }
  cellAt(p, u) {
    const first = this.spotOf(0, this.page * this.per, u), r = Math.floor((p.y - first.y) / first.h), col = Math.floor((p.x - first.x) / first.w), s = this.page * this.per + col
    return r >= 0 && r < this.rows.length && col >= 0 && col < this.per && s < this.count ? [r, s, clamp((p.y - first.y - r * first.h) / first.h, 0, 1)] : null
  }
  changed_() {
    if (this.onChange) this.onChange(this.value, this)
    this.panel.told.push(this.id, this.text)
    this.touch()
  }
  down(p) {
    const u = this.u, parts = this.parts(u), on = (b) => b && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y - 4 * u && p.y < b.y + b.h + 4 * u
    this.row_ = null
    this.touch()
    if (on(parts.play)) { this.playing = !this.on; return this.panel.told.push(this.id, ['play', this.on ? 1 : 0]) }
    if (on(parts.slower) || on(parts.faster)) { this.side = on(parts.slower) ? -1 : 1; this.again = performance.now() + STEP_HOLD_MS; return this.speed(this.side) }
    if (on(parts.tempo)) {
      // Tapped in time: the tempo is the time between the last few taps.
      const now = performance.now()
      this.taps = this.taps.filter((at) => now - at < 2000).slice(-4)
      this.taps.push(now)
      this.tapped = now
      if (this.taps.length > 1) this.speed(60000 / ((now - this.taps[0]) / (this.taps.length - 1)) - this.tempo)
      return
    }
    if (on(parts.swing)) { this.swing = SWINGS[(SWINGS.findIndex((s) => Math.abs(s - this.swing) < 0.01) + 1) % SWINGS.length]; return this.panel.told.push(this.id, ['swing', this.swing]) }
    if (on(parts.clear)) { this.clear(); return this.changed_() }
    if (on(parts.turn)) { this.page = (this.page + 1) % Math.ceil(this.count / this.per); this.paged = performance.now(); return }
    if (on(parts.pattern)) { const names = Object.keys(DRUM_PRESETS); this.pattern = names[(names.indexOf(this.preset_) + 1) % names.length]; return this.changed_() }
    const top = this.y + 34 * u, r = Math.floor((p.y - top) / (30 * u))
    if (r >= 0 && r < this.rows.length && p.x < this.x + 7 * u + this.side_) {
      // The dot mutes its row; the name plays its drum.
      if (p.x < this.x + 26 * u) { this.muted[r] = !this.muted[r]; return this.panel.told.push(this.id, ['mute', r, this.muted[r] ? 1 : 0]) }
      return this.hit(r, 0.9, this.clock ? this.now() : null)
    }
    const at = this.cellAt(p, u)
    if (!at) return
    this.row_ = at[0]
    this.preset_ = ''
    if (this.lanes[at[0]].begin(at[1], at[2])) this.changed_()
  }
  move(p) {
    if (this.row_ == null) return
    const at = this.cellAt(p, this.u), lane = this.lanes[this.row_]
    if (!at || !lane.stroke) return
    // Along its own row a finger paints, and leans up for an accent (still on its own step when it has left the row that way); on another row it paints there the same way.
    const own = at[1] === lane.stroke.first, c = this.spotOf(this.row_, at[1], this.u)
    if (at[0] === this.row_ || own ? lane.drag(at[1], clamp((p.y - c.y) / c.h, 0, 1)) : this.lanes[at[0]].put(at[1], lane.stroke.paint, false)) this.changed_()
  }
  up() {
    if (this.row_ != null) this.lanes[this.row_].end()
    this.row_ = null
    this.side = 0
    this.touch()
  }
  draw(g, u) {
    const parts = this.parts(u), box = (b, fill) => { rounded(g, b.x, b.y, b.w, b.h, 7 * u); g.fillStyle = fill; g.fill() }
    const mid = (b) => [b.x + b.w / 2, b.y + b.h / 2 + 0.5 * u]
    // Play, or stop: a triangle, or a square.
    box(parts.play, this.on ? this.accent : THEME.knob)
    const [px, py] = mid(parts.play)
    g.fillStyle = this.on ? THEME.well : this.accent
    g.beginPath()
    if (this.on) g.rect(px - 5 * u, py - 5.5 * u, 10 * u, 10 * u)
    else { g.moveTo(px - 4 * u, py - 6.5 * u); g.lineTo(px + 6.5 * u, py - 0.5 * u); g.lineTo(px - 4 * u, py + 5.5 * u) }
    g.fill()
    box({ x: parts.slower.x, y: parts.slower.y, w: parts.faster.x + parts.faster.w - parts.slower.x, h: parts.slower.h }, THEME.knob)
    box({ x: parts.tempo.x, y: parts.tempo.y + 3 * u, w: parts.tempo.w, h: parts.tempo.h - 6 * u }, this.tapped ? THEME.track : THEME.well)
    g.strokeStyle = this.accent
    g.lineWidth = 2 * u
    g.lineCap = 'round'
    const [sx, sy] = mid(parts.slower), [fx, fy] = mid(parts.faster)
    g.beginPath(); g.moveTo(sx - 4 * u, sy); g.lineTo(sx + 4 * u, sy); g.moveTo(fx - 4 * u, fy); g.lineTo(fx + 4 * u, fy); g.moveTo(fx, fy - 4 * u); g.lineTo(fx, fy + 4 * u); g.stroke()
    words(g, `${this.tempo} bpm`, ...mid(parts.tempo), 11.5 * u, THEME.text, 'center', '600', parts.tempo.w - 4 * u)
    box(parts.swing, THEME.knob)
    words(g, `swing ${Math.round(this.swing * 100)}%`, ...mid(parts.swing), 11 * u, this.swing ? THEME.text : THEME.dim, 'center', '', parts.swing.w - 8 * u)
    if (this.label) words(g, this.label, (parts.faster.x + parts.faster.w + parts.swing.x) / 2, parts.play.y + parts.play.h / 2, 12 * u, THEME.dim, 'center', '', parts.swing.x - parts.faster.x - parts.faster.w - 12 * u)
    const now = performance.now()
    this.rows.forEach((name, r) => {
      const y = this.y + 34 * u + r * 30 * u + 15 * u, muted = this.muted[r], lit = this.lit[r] && now >= this.lit[r] && now - this.lit[r] < PAD_FLASH_MS
      g.beginPath(); g.arc(this.x + 16 * u, y, 5 * u, 0, TAU)
      g.fillStyle = muted ? THEME.well : lit ? THEME.text : this.accent
      g.fill()
      if (muted) { g.strokeStyle = THEME.track; g.lineWidth = 1.5 * u; g.stroke() }
      words(g, name, this.x + 27 * u, y + 0.5 * u, 11 * u, muted ? THEME.track : lit ? THEME.text : THEME.dim, 'left', lit ? '600' : '', this.side_ - 22 * u)
      g.save()
      if (muted) g.globalAlpha = 0.4
      for (let s = this.page * this.per; s < Math.min(this.count, (this.page + 1) * this.per); s++) {
        const c = this.spotOf(r, s, u)
        if (muted) { g.globalAlpha = 0.4; this.lanes[r].drawStep(g, c.x, c.y, c.w, c.h, u, s, THEME.dim, s === this.pos) } else this.lanes[r].drawStep(g, c.x, c.y, c.w, c.h, u, s, this.accent, s === this.pos)
      }
      g.restore()
    })
    box(parts.pattern, THEME.knob)
    words(g, this.preset_ || 'patterns', parts.pattern.x + 10 * u, parts.pattern.y + parts.pattern.h / 2 + 0.5 * u, 11 * u, this.preset_ ? THEME.text : THEME.dim, 'left', '', parts.pattern.w - 28 * u)
    words(g, '›', parts.pattern.x + parts.pattern.w - 12 * u, parts.pattern.y + parts.pattern.h / 2 - 1 * u, 15 * u, this.accent)
    if (parts.turn) { box(parts.turn, THEME.knob); words(g, `${this.page + 1} / ${Math.ceil(this.count / this.per)}`, ...mid(parts.turn), 11 * u, THEME.text, 'center', '600') }
    box(parts.clear, THEME.knob)
    words(g, 'clear', ...mid(parts.clear), 11 * u, THEME.dim)
  }
}

/** The settings that go beside a pattern, each under the names a target may give it (a synth's own first). One is made only for a setting the target has, and this table is all that says the names. */
const BESIDE = {
  tranceGate: [['depth', ['gateDepth', 'gate.depth', 'gate_depth']], ['rate', ['gateRate', 'gate.rate', 'gate_rate']], ['smooth', ['gateSmooth', 'gate.smooth', 'gate_smooth']], ['swing', ['gateSwing', 'gate.swing', 'gate_swing']], ['sends', ['gateSends', 'gate.sends', 'gate_sends']], ['stereo', ['gateStereo', 'gate.stereo', 'gate_stereo']]],
  arpPattern: [['rate', ['arpRate', 'arp_rate']], ['order', ['arpOrder', 'arp_order']], ['octaves', ['arpOctaves', 'arp_octaves']], ['length', ['arpGate', 'arp_gate']], ['style', ['arpStyle', 'arp_style']], ['swing', ['arpSwing', 'arp_swing']]],
}
/**
 * A pattern with what goes with it beside it, on one plate: the pattern, a select of the patterns
 * it can be set to by name, and for each setting of the target that goes with it a select (a
 * choice), a switch (on or off) or a small dial (a number). With no target, or `beside: false`,
 * the pattern alone.
 */
function patterned(panel, kind, spec) {
  const target = spec.target, id = spec.id, sub = (name) => (id != null ? `${id}.${name}` : undefined)
  if (!target || spec.beside === false) return panel.add(kind, spec)
  const has = BESIDE[kind].map(([label, names]) => [label, names.find((name) => name !== spec.param && Object.keys(describe(target, name)).length)]).filter(([, name]) => name)
  const box = panel.add('group', { label: spec.label, id: sub('plate') })
  let item
  box.enter()
  try {
    // (The plate has the name: the pattern on it needs none of its own.)
    item = panel.add(kind, { ...spec, label: undefined, bare: true })
    const names = Object.keys(item.presets)
    if (names.length) panel.add('select', { label: 'pattern', id: sub('preset'), choices: ['yours', ...names], onChange: (name) => item.preset(name) })
    for (const [label, name] of has) {
      const d = describe(target, name)
      panel.add(d.choices ? 'select' : d.kind === 'bool' ? 'toggle' : 'dial', { label, target, param: name, size: 'small', id: sub(label) })
    }
  } finally { box.leave() }
  return item
}

/**
 * A WHEEL, as at the left of a synth's keys: an upright slider drawn as the edge of a wheel that is
 * rolled. `spring: true` (a pitch wheel) lets it roll back to where it started when it is let go; a
 * mod wheel stays where it is put. It is a slider in every other way.
 */
class Wheel extends Slider {
  constructor(panel, kind, spec) {
    super(panel, kind, spec)
    this.vertical = true
    this.spring = !!spec.spring
  }
  natural(u) { return [54 * u, (sized(this.size, 90, 124, 170) + 56) * u] }
  up() { if (this.spring) this.reset(); super.up() }
  draw(g, u) {
    const t = this.track(u), pos = this.toPos(this.v), cx = this.x + this.w / 2, w = 30 * u, top = t.from - t.long - 8 * u, h = t.long + 16 * u
    words(g, this.label, cx, this.y + 12 * u, 12 * u, THEME.dim, 'center', '', this.w - 4 * u)
    rounded(g, cx - w / 2, top, w, h, 8 * u)
    g.fillStyle = THEME.well
    g.fill()
    g.save()
    rounded(g, cx - w / 2 + 2 * u, top + 2 * u, w - 4 * u, h - 4 * u, 6 * u)
    g.clip()
    g.fillStyle = THEME.knob
    g.fillRect(cx - w / 2, top, w, h)
    // The ridges of the wheel's edge: they roll with it, and crowd together towards the top and the bottom as on a real one.
    g.strokeStyle = THEME.track
    g.lineWidth = 1.5 * u
    g.beginPath()
    for (let i = -8; i <= 8; i++) {
      const a = (i / 8 + (pos - 0.5) * 1.2) * (Math.PI / 2)
      if (Math.abs(a) >= Math.PI / 2) continue
      const y = top + h / 2 - Math.sin(a) * h / 2
      g.moveTo(cx - w / 2, y); g.lineTo(cx + w / 2, y)
    }
    g.stroke()
    // The mark that says where it is.
    const y = t.from - t.long * pos
    g.fillStyle = this.held ? THEME.text : this.accent
    g.fillRect(cx - w / 2, y - 3 * u, w, 6 * u)
    const shade = g.createLinearGradient(0, top, 0, top + h)
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)'); shade.addColorStop(0.3, 'rgba(0, 0, 0, 0)'); shade.addColorStop(0.7, 'rgba(0, 0, 0, 0)'); shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
    g.fillStyle = shade
    g.fillRect(cx - w / 2, top, w, h)
    g.restore()
    words(g, shown(this.v, this), cx, this.y + this.h - 11 * u, 12 * u, THEME.text, 'center', '', this.w - 4 * u)
  }
}

Object.assign(KINDS, { joystick: Joystick, dpad: Dpad, actionButton: ActionButton, envelope: Envelope, stepGrid: StepGrid, pads: Pads, wheel: Wheel,
  steps: StepLane, tranceGate: TranceGate, arpPattern: ArpPattern, drumSeq: DrumSeq })
Object.assign(KINDS, { number: NumberBox, textBox: TextBox, readout: Readout, checkbox: Checkbox, choose: Choose, radio: Radio, dropdown: Dropdown,
  xyPad: XYPad, colourPicker: ColourPicker, progress: Progress, light: Light, busy: Busy, rangeSlider: RangeSlider, fader: Fader })
for (const kind of ['readout', 'progress', 'light', 'busy']) SLIDES.add(kind)

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
  if (method(a, 'level', 'samples', 'progress')) return { ...b, label, source: a }
  if (isPlain(a)) return { ...a, label }
  return { ...b, label, value: a }
}

/** An XY pad: (label, target, "across", "up", options), (label, [min, max, start], [min, max, start], options) or (label, options). */
function padded(args) {
  let [label, a, b, c, d] = args
  if (typeof label !== 'string') { [a, b, c, d] = [label, a, b, c]; label = undefined }
  let spec
  if (Array.isArray(a)) spec = { ...(Array.isArray(b) ? c : b), across: a, up: Array.isArray(b) ? b : a }
  else if (isTarget(a) && typeof b === 'string') spec = { ...d, target: a, paramX: b, paramY: c }
  else spec = { ...a }
  if (label !== undefined) spec.label = label
  return spec
}
/** A slider with two handles: (label, min, max, [low, high], options) or (label, target, "low setting", "high setting", options). */
function spanned(args) {
  let [label, a, b, c, d] = args
  if (typeof label !== 'string') { [a, b, c, d] = [label, a, b, c]; label = undefined }
  let spec
  if (typeof a === 'number') spec = Array.isArray(c) ? { ...d, min: a, max: b, value: c } : { ...c, min: a, max: b }
  else if (isTarget(a) && typeof b === 'string') spec = { ...d, target: a, param: b, paramHigh: c }
  else spec = { ...a }
  if (label !== undefined) spec.label = label
  return spec
}

/** An envelope: (label, target, options), (label, target, "attack", "decay", "sustain", "release", options) or (label, options). The label may be left out. */
function shaped(args) {
  if (typeof args[0] !== 'string') args = [undefined, ...args]
  const [label, target, ...rest] = args
  const names = rest.filter((arg) => typeof arg === 'string'), options = rest.find(isPlain)
  // One object and nothing after it is the target if it can be asked or has all four numbers; otherwise it is the options: envelope("shape", { attack: 0.1 }).
  const aimed = target != null && (!isPlain(target) || rest.length > 0 || !!method(target, 'set', 'get', 'describe') || SHAPE.every((part) => typeof target[part] === 'number'))
  const spec = aimed ? { ...options, target } : { ...target }
  if (names.length === 4) spec.params = names
  if (label !== undefined) spec.label = label
  return spec
}
/** A grid of steps: (label, steps, rows, options), the label left out or not; rows is a list of names, or how many. */
function stepped(args) {
  if (typeof args[0] !== 'string') args = [undefined, ...args]
  const [label, steps, rows, options] = args
  const spec = isPlain(steps) ? { ...steps } : isPlain(rows) ? { ...rows, steps } : { ...options, steps, rows }
  if (label !== undefined) spec.label = label
  return spec
}
/** Pads: (label, names, target, options), the label, the target or both left out; names is a list, or how many. */
function padsOf(args) {
  if (typeof args[0] !== 'string') args = [undefined, ...args]
  const [label, pads, a, b] = args
  const spec = method(a, 'noteOn', 'note_on') ? { ...b, target: a } : { ...a }
  spec.pads = pads
  if (label !== undefined) spec.label = label
  return spec
}

/** A lane of steps or a pattern: (label, how many steps, options), (label, target, "setting", options) or (label, target, options). The label may be left out. */
function laned(args) {
  if (typeof args[0] !== 'string') args = [undefined, ...args]
  const [label, a, b, c] = args
  let spec
  if (typeof a === 'number') spec = { ...b, steps: a }
  else if (typeof a === 'string' || Array.isArray(a)) spec = { ...b, value: a }
  else if (a != null && (!isPlain(a) || typeof b === 'string' || method(a, 'set', 'get', 'describe'))) spec = typeof b === 'string' ? { ...c, target: a, param: b } : { ...b, target: a }
  else spec = { ...a }
  if (label !== undefined) spec.label = label
  return spec
}
/** A drum sequencer: (label, drums, target, options), any of the first three left out. */
function sequenced(args) {
  if (typeof args[0] !== 'string') args = [undefined, ...args]
  const [label, a, b, c] = args
  const rows = Array.isArray(a) ? a : undefined, rest = rows ? [b, c] : [a, b]
  const spec = method(rest[0], 'noteOn', 'note_on') ? { ...rest[1], target: rest[0] } : { ...rest[0] }
  if (rows) spec.rows = rows
  if (label !== undefined) spec.label = label
  return spec
}

/** The functions a scene calls for the controls of this part. */
function more(panel) {
  // A control whose numbers are called x and y gives the scene what stands for it (see standIn).
  const make = (kind, read) => (...args) => { const item = panel.add(kind, read(args)); return item.face || item }
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
    /** A square where a finger sets two numbers at once: xyPad("filter", lead, "cutoff", "resonance"), or xyPad("spot", [0, 100], [0, 50]); then pad.x and pad.y. */
    xyPad: make('xyPad', padded),
    /** A patch of colour that opens a picker: ink = colourPicker("ink", "tomato"), then circle(x, y, 40, ink.value). */
    colourPicker: make('colourPicker', texted),
    colorPicker: make('colourPicker', texted),
    /** A bar that fills: progress("loading", () => done / all), or bar.value = 0.4. Options: min, max, percent: false. */
    progress: make('progress', shownFrom),
    /** A light: light("ready", true), light("signal", lead) (as bright as it is loud), or lamp.value = "red". */
    light: make('light', shownFrom),
    /** A ring that goes round while something is happening: busy("loading"), then wait.on = false. */
    busy: make('busy', shownFrom),
    /** A slider with a low and a high handle: rangeSlider("price", 0, 100, [20, 80]), then span.low and span.high. */
    rangeSlider: make('rangeSlider', spanned),
    /** An upright slider with the look of a mixing desk's: fader("volume", lead, "volume"). */
    fader: make('fader', ranged),
    /** A stick for a thumb: stick = joystick(), then x += stick.x * speed. Options: floating, asKeys, size. */
    joystick: make('joystick', ([a, b]) => (typeof a === 'string' ? { ...b, label: a } : { ...a })),
    /** A pad of arrows: pad = dpad({ asKeys: true }), then pad.left, pad.x. Options: ways (4 or 8), asKeys, size. */
    dpad: make('dpad', ([a, b]) => (typeof a === 'string' ? { ...b, label: a } : { ...a })),
    /** A round button: fire = actionButton("A"), then fire.pressed. actionButton("A", { key: "space" }) holds that key down for the scene. */
    actionButton: make('actionButton', ([label, a, b]) => (typeof a === 'function' ? { ...b, label, onPress: a } : { ...a, label })),
    /** The shape of a note as a graph with corners to drag: envelope("shape", lead) finds lead's attack, decay, sustain and release. */
    envelope: make('envelope', shaped),
    /** A grid of steps, on or off: grid = stepGrid("drums", 16, ["kick", "snare", "hat"]), then grid.get("kick", 0) and grid.step = 3. */
    stepGrid: make('stepGrid', stepped),
    /** Pads to hit, several at once, which play a target's notes: pads("kit", ["kick", "snare", "hat", "clap"], drums). */
    pads: make('pads', padsOf),
    /** A wheel that is rolled: wheel("mod", lead, "mod"). pitchWheel rolls back when it is let go (from -1 to 1 unless told otherwise); modWheel stays. */
    wheel: make('wheel', ranged),
    /** A lane of steps to tap and drag: lane = steps("accent", 16), then lane.value, lane.text and lane.step = 3. { levels: true } makes each a bar. */
    steps: make('steps', laned),
    /** A gate's pattern, each step a bar: tranceGate("gate", pad) finds pad's pattern and puts its rate, depth, smoothing and swing beside it; tranceGate("gate", 16) is one to read. */
    tranceGate: (...args) => patterned(panel, 'tranceGate', laned(args)),
    /** An arpeggio's pattern, steps across and chord notes up the side: arpPattern("arp", lead), or arpPattern("arp", "1 - 3 2 _ 1 3 5^"). */
    arpPattern: (...args) => patterned(panel, 'arpPattern', laned(args)),
    /** A drum sequencer that plays by itself: drumSeq("beat", ["kick", "snare", "hat", "clap"], drums). Options: steps, tempo, swing, pattern, playing, targets, notes, clock, onStep. */
    drumSeq: make('drumSeq', sequenced),
    /** For a host: a pattern made by number, with the settings beside it, and what it took from its target told as for any control. */
    pattern: (kind, id, spec) => { const item = patterned(panel, kind, { ...spelled(spec), id }); if (item.target) panel.made.push(id, 0, 1, 0, '', item.v) },
    modWheel: make('wheel', ranged),
    pitchWheel: make('wheel', (args) => { const spec = ranged(args); return { spring: true, ...(spec.target || spec.min != null ? null : { min: -1, max: 1, value: 0 }), ...spec } }),
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
  // A canvas another library laid over the scene (these controls' own, an effects layer, a scene transition) is not a scene.
  const found = [...document.querySelectorAll('canvas')].filter((c) => !Object.keys(c.dataset).some((key) => /(?:Layer|Transition)$/.test(key)))
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
const xyPad = (...args) => dials().xyPad(...args)
const colourPicker = (...args) => dials().colourPicker(...args)
const colorPicker = colourPicker
const progress = (...args) => dials().progress(...args)
const light = (...args) => dials().light(...args)
const busy = (...args) => dials().busy(...args)
const rangeSlider = (...args) => dials().rangeSlider(...args)
const fader = (...args) => dials().fader(...args)
const joystick = (...args) => dials().joystick(...args)
const dpad = (...args) => dials().dpad(...args)
const actionButton = (...args) => dials().actionButton(...args)
const envelope = (...args) => dials().envelope(...args)
const stepGrid = (...args) => dials().stepGrid(...args)
const pads = (...args) => dials().pads(...args)
const wheel = (...args) => dials().wheel(...args)
const steps = (...args) => dials().steps(...args)
const tranceGate = (...args) => dials().tranceGate(...args)
const arpPattern = (...args) => dials().arpPattern(...args)
const drumSeq = (...args) => dials().drumSeq(...args)
const modWheel = (...args) => dials().modWheel(...args)
const pitchWheel = (...args) => dials().pitchWheel(...args)

export { dials, dial, slider, button, toggle, select, rotary, keyboard, scope, meter, label, group, row, column, grid, page, spacer, wrap, layout, room, over, theme, version,
  number, stepper, textBox, readout, checkbox, choose, radio, dropdown, xyPad, colourPicker, colorPicker, progress, light, busy, rangeSlider, fader,
  joystick, dpad, actionButton, envelope, stepGrid, pads, wheel, modWheel, pitchWheel,
  steps, tranceGate, arpPattern, drumSeq }
