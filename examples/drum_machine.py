# Drum machine: a grid of steps to fill in, pads to hit by hand, a tempo to set and the shape of
# each hit to drag. Touch a pad first, so the page may make sound.
# Try changing: 16 steps to 8; the note each row plays; add a fourth row, "clap".
#
# Run it:   pyctures run drum_machine.py

from pyctures import *
from pydials import *
from standin_synth import make_synth   # a stand-in until synths is ready: then  from synths import *

kit = make_synth(wave="square", attack=0.001, decay=0.12, sustain=0, release=0.08)
rows, notes = ["kick", "snare", "hat"], [36, 50, 84]         # the note each row plays

tempo = number("tempo", 60, 200, 110, unit="bpm")
playing = toggle("play", True)
envelope("shape", kit)
row()
grid = step_grid("beat", 16, rows, value=[
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
])
hits = pads("kit", rows, kit, notes=notes)

time, step, sounding = 0, -1, []


def update(dt):
    global time, step, sounding
    if not playing:
        return
    time += dt
    now = int(time / (60 / tempo / 4)) % 16                  # four steps to a beat
    if now == step:
        return
    step = now
    grid.step = step                                         # light the column that is playing
    for note in sounding:
        kit.note_off(note)
    sounding = []
    for name, note in zip(rows, notes):
        if grid.get(name, step):
            kit.note_on(note, 0.9)
            sounding.append(note)
            hits.flash(name)
