# Drum machine: a sequencer that plays by itself, pads to hit by hand, and the shape of each hit
# to drag. Press play (the first touch lets the page make sound), then tap steps on and off.
# Try changing: the drums and the note each plays; pattern="breakbeat"; steps=32.
#
# Run it:   pyctures run drum_machine.py

from pyctures import *
from pydials import *
from standin_synth import make_synth   # a stand-in until synths is ready: then  from synths import *

kit = make_synth(wave="square", attack=0.001, decay=0.12, sustain=0, release=0.08)
drums, notes = ["kick", "snare", "hat", "clap"], [36, 50, 84, 62]     # the note each drum plays

envelope("shape", kit)
hits = pads("kit", drums, kit, notes=notes)
row()
# Tap a step on and off, drag across to paint, drag up on one for an accent; tap a drum's name to hear it.
# The page plays the beat, so it keeps time however busy Python is.
beat = drum_seq("beat", drums, kit, notes=notes, pattern="backbeat", tempo=110,
                on_step=lambda drum, step, velocity: hits.flash(drum))
