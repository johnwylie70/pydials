// A stand-in synth, so the examples make sound today: the browser's own oscillators (several to a
// note, a little apart in pitch, and one an octave below) through one filter, an echo and a room.
// It is here only until synths.js is ready, and it is a TARGET in the sense dials.js
// means: set, get, describe, noteOn, noteOff, notes, samples and level. Anything with those
// (or some of them) can be put behind a dial, a keyboard, a scope and a meter.

const WAVES = ['sine', 'triangle', 'saw', 'square']
// How each kind of room dies away: how long it lasts beside its size, how steeply it falls, and how fast it flutters (a spring does).
const ROOMS = [[0.4, 4, 0], [1, 3, 0], [0.8, 2, 0], [0.6, 2.5, 27]]
const PARAMS = {
  wave: { kind: 'choice', choices: WAVES, default: 2 },
  sub: { min: 0, max: 1, default: 0 },
  voices: { min: 1, max: 5, default: 1, kind: 'int' },
  detune: { min: 0, max: 50, default: 12, unit: 'ct', digits: 0 },
  filter_cutoff: { min: 60, max: 12000, default: 2400, unit: 'Hz' },
  filter_resonance: { min: 0.1, max: 20, default: 4 },
  attack: { min: 0.002, max: 1.5, default: 0.01, unit: 's' },
  decay: { min: 0.01, max: 2, default: 0.2, unit: 's' },
  sustain: { min: 0, max: 1, default: 0.8 },
  release: { min: 0.02, max: 3, default: 0.3, unit: 's' },
  delay: { min: 0, max: 1, default: 0 },
  delay_time: { min: 0.05, max: 1, default: 0.3, unit: 's' },
  delay_feedback: { min: 0, max: 0.9, default: 0.4 },
  reverb: { min: 0, max: 1, default: 0 },
  reverb_type: { kind: 'choice', choices: ['room', 'hall', 'plate', 'spring'], default: 1 },
  reverb_size: { min: 0.2, max: 4, default: 1.5, unit: 's' },
  volume: { min: 0, max: 1, default: 0.5 },
}

function makeSynth(options = {}) {
  const values = {}
  for (const name in PARAMS) values[name] = PARAMS[name].default
  let audio = null, filter = null, master = null, analyser = null, echo = null, again = null, echoed = null, hall = null, halled = null
  const voices = new Map() // note -> { oscs, gain }
  const wave = new Float32Array(1024)

  // Sound starts at the first note: a browser lets a page make sound only once it has been touched.
  const start = () => {
    if (audio) return
    audio = new (window.AudioContext || window.webkitAudioContext)()
    filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    master = audio.createGain()
    analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    filter.connect(master)
    // The echo: a delay that feeds itself. The room: noise that dies away, which every sound is smeared with.
    echo = audio.createDelay(1.5); again = audio.createGain(); echoed = audio.createGain()
    filter.connect(echo); echo.connect(again); again.connect(echo); echo.connect(echoed); echoed.connect(master)
    hall = audio.createConvolver(); halled = audio.createGain()
    filter.connect(hall); hall.connect(halled); halled.connect(master)
    master.connect(analyser)
    analyser.connect(audio.destination)
    for (const name in values) apply(name)
  }
  const room = () => {
    const [lasts, falls, flutter] = ROOMS[values.reverb_type] || ROOMS[1]
    const length = Math.max(64, Math.round(audio.sampleRate * values.reverb_size * lasts)), sound = audio.createBuffer(2, length, audio.sampleRate)
    for (let side = 0; side < 2; side++) {
      const data = sound.getChannelData(side)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, falls) * (flutter ? 0.6 + 0.4 * Math.sin(i / audio.sampleRate * flutter * 6.283) : 1)
    }
    return sound
  }
  const apply = (name) => {
    if (!audio) return
    const now = audio.currentTime, value = values[name]
    if (name === 'filter_cutoff') filter.frequency.setTargetAtTime(value, now, 0.01)
    else if (name === 'filter_resonance') filter.Q.setTargetAtTime(value, now, 0.01)
    else if (name === 'volume') master.gain.setTargetAtTime(value, now, 0.01)
    else if (name === 'delay') echoed.gain.setTargetAtTime(value, now, 0.01)
    else if (name === 'delay_time') echo.delayTime.setTargetAtTime(value, now, 0.05)
    else if (name === 'delay_feedback') again.gain.setTargetAtTime(value, now, 0.01)
    else if (name === 'reverb') halled.gain.setTargetAtTime(value * 0.6, now, 0.01)
    else if (name === 'reverb_size' || name === 'reverb_type') hall.buffer = room()
    else if (name === 'wave') for (const voice of voices.values()) for (const osc of voice.oscs) if (!osc.below) osc.type = shape()
  }
  const shape = () => (WAVES[values.wave] === 'saw' ? 'sawtooth' : WAVES[values.wave])

  const synth = {
    set(name, value) {
      if (!(name in PARAMS)) throw new Error(`This synth has no setting called "${name}". It has: ${Object.keys(PARAMS).join(', ')}`)
      if (name === 'wave' && typeof value === 'string') value = Math.max(0, WAVES.indexOf(value === 'sawtooth' ? 'saw' : value))
      if (name === 'reverb_type' && typeof value === 'string') value = Math.max(0, PARAMS.reverb_type.choices.indexOf(value))
      values[name] = value
      apply(name)
    },
    get: (name) => values[name],
    describe: (name) => PARAMS[name],
    noteOn(note, velocity = 0.8) {
      start()
      if (audio.state === 'suspended') audio.resume()
      synth.noteOff(note)
      const now = audio.currentTime
      const gain = audio.createGain(), oscs = [], many = Math.round(values.voices), pitch = 440 * Math.pow(2, (note - 69) / 12)
      const sing = (type, frequency, cents, loud) => {
        const osc = audio.createOscillator(), level = audio.createGain()
        osc.type = type
        osc.frequency.value = frequency
        osc.detune.value = cents
        level.gain.value = loud
        osc.connect(level)
        level.connect(gain)
        osc.start()
        oscs.push(osc)
        return osc
      }
      // Several voices spread a little either side of the note, and one an octave below.
      for (let i = 0; i < many; i++) sing(shape(), pitch, many > 1 ? (i / (many - 1) - 0.5) * 2 * values.detune : 0, 1 / Math.sqrt(many))
      if (values.sub > 0) sing('sine', pitch / 2, 0, values.sub).below = true
      const peak = 0.4 * velocity
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(peak, now + values.attack)
      gain.gain.setTargetAtTime(peak * values.sustain, now + values.attack, values.decay / 3)
      gain.connect(filter)
      voices.set(note, { oscs, gain })
    },
    noteOff(note) {
      const voice = voices.get(note)
      if (!voice) return
      voices.delete(note)
      const now = audio.currentTime
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setTargetAtTime(0, now, values.release / 4)
      for (const osc of voice.oscs) osc.stop(now + values.release * 1.5 + 0.05)
    },
    notes: () => voices.keys(),
    samples() {
      if (analyser) analyser.getFloatTimeDomainData(wave)
      return wave
    },
    level() {
      let peak = 0
      const now = synth.samples()
      for (let i = 0; i < now.length; i += 4) peak = Math.max(peak, Math.abs(now[i]))
      return Math.min(1, peak * 1.5)
    },
  }
  for (const name in options) synth.set(name, options[name])
  return synth
}

export { makeSynth }
