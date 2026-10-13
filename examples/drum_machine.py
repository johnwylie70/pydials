# Drum machine: a sequencer that plays by itself, and pads to hit by hand. Press play (the first
# touch lets the page make sound), then tap steps on and off.
# Try changing: pattern="breakbeat"; steps=32; a fourth drum, made with make_synth("chipSnare").
#
# Run it:   pyctures run drum_machine.py

from pyctures import *
from pydials import *
from synths import *

kit = {"kick": make_synth("kick"), "snare": make_synth("snare"), "hat": make_synth("hat")}
drums, notes = list(kit), [36, 52, 60]              # the note each drum is played at

hits = pads("kit", drums, notes=notes, on_note_on=lambda note, velocity, drum: kit[drum].note_on(note, velocity),
            on_note_off=lambda note, drum: kit[drum].note_off(note))
row()
# Tap a step on and off, drag across to paint, drag up on one for an accent; tap a drum's name to hear it.
# The page plays the beat, so it keeps time however busy Python is.
beat = drum_seq("beat", drums, targets=kit, notes=notes, pattern="backbeat", tempo=110,
                on_step=lambda drum, step, velocity: hits.flash(drum))
