# Trance: a chord whose loudness is chopped by a gate, and a lead that runs up and down its notes.
# Both patterns are yours to draw: the gate's bars, and the arpeggio's notes, rests, ties and accents.
# Try changing: the chord; "1 3 2 4" for the arpeggio; the gate to "x..x..x." and its length to 8.
#
# Run it:   pyctures run trance.py

from pyctures import *
from pydials import *
from standin_synth import make_synth   # a stand-in until synths is ready: then  from synths import *

pad = make_synth(wave="saw", attack=0.01, release=0.2, filter_cutoff=1800)
lead = make_synth(wave="square", attack=0.005, decay=0.15, sustain=0.3, release=0.1)
chord = [57, 60, 64, 67]                            # A, C, E and G: the notes the arpeggio counts from 1

tempo = number("tempo", 80, 180, 138, unit="bpm")
playing = toggle("play", False)
row()
gate = gate_pattern("gate", "x.x.xxx.x.x.x5x.")
row()
arp = arp_pattern("arp", "1 3 2 4 3' 2 4^ 1'")

time, step, on, held = 0, -1, False, None


def update(dt):
    global time, step, on, held
    if bool(playing) != on:
        # Play: the chord is held under the gate. Stop: everything is let go.
        on = bool(playing)
        for note in chord:
            pad.note_on(note - 12, 0.6) if on else pad.note_off(note - 12)
        if not on and held is not None:
            lead.note_off(held)
            held = None
    if not on:
        return
    time += dt
    now = int(time / (60 / tempo / 4))              # four steps to a beat
    if now == step:
        return
    step = now
    gate.step = step                                # light the step that is sounding
    arp.step = step
    pad.set("volume", 0.1 + 0.6 * gate.value[step % len(gate)])
    s = arp.value[step % len(arp)]                  # note, octave, tie, accent and slide
    if s["tie"]:
        return                                      # the note before is held on
    if held is not None:
        lead.note_off(held)
    held = chord[(s["note"] - 1) % len(chord)] + 12 * s["octave"] if s["note"] else None
    if held is not None:
        lead.note_on(held, 1 if s["accent"] else 0.7)
