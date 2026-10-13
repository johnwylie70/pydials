// A stand-in synth, so the examples make sound today: the browser's own oscillators through one
// filter. It is here only until synths.js is ready, and it is a TARGET in the sense dials.js
// means: set, get, describe, noteOn, noteOff, notes, samples and level. Anything with those
// (or some of them) can be put behind a dial, a keyboard, a scope and a meter.

const WAVES = ['sine', 'triangle', 'saw', 'square']
const PARAMS = {
  wave: { kind: 'choice', choices: WAVES, default: 2 },
  filter_cutoff: { min: 60, max: 12000, default: 2400, unit: 'Hz' },
  filter_resonance: { min: 0.1, max: 20, default: 4 },
  attack: { min: 0.002, max: 1.5, default: 0.01, unit: 's' },
  release: { min: 0.02, max: 3, default: 0.3, unit: 's' },
  volume: { min: 0, max: 1, default: 0.5 },
}

function makeSynth(options = {}) {
  const values = {}
  for (const name in PARAMS) values[name] = PARAMS[name].default
  let audio = null, filter = null, master = null, analyser = null
  const voices = new Map() // note -> { osc, gain }
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
    master.connect(analyser)
    analyser.connect(audio.destination)
    for (const name in values) apply(name)
  }
  const apply = (name) => {
    if (!audio) return
    const now = audio.currentTime, value = values[name]
    if (name === 'filter_cutoff') filter.frequency.setTargetAtTime(value, now, 0.01)
    else if (name === 'filter_resonance') filter.Q.setTargetAtTime(value, now, 0.01)
    else if (name === 'volume') master.gain.setTargetAtTime(value, now, 0.01)
    else if (name === 'wave') for (const voice of voices.values()) voice.osc.type = shape()
  }
  const shape = () => (WAVES[values.wave] === 'saw' ? 'sawtooth' : WAVES[values.wave])

  const synth = {
    set(name, value) {
      if (!(name in PARAMS)) throw new Error(`This synth has no setting called "${name}". It has: ${Object.keys(PARAMS).join(', ')}`)
      if (name === 'wave' && typeof value === 'string') value = Math.max(0, WAVES.indexOf(value === 'sawtooth' ? 'saw' : value))
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
      const osc = audio.createOscillator(), gain = audio.createGain()
      osc.type = shape()
      osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.4 * velocity, now + values.attack)
      osc.connect(gain)
      gain.connect(filter)
      osc.start()
      voices.set(note, { osc, gain })
    },
    noteOff(note) {
      const voice = voices.get(note)
      if (!voice) return
      voices.delete(note)
      const now = audio.currentTime
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setTargetAtTime(0, now, values.release / 4)
      voice.osc.stop(now + values.release * 1.5 + 0.05)
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
