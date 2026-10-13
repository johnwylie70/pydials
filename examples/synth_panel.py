# Synth panel: a synth you can play. Dials and sliders for its settings, the wave it is making,
# and a piano keyboard: play it with a finger, the mouse, or the computer's keys (A S D F G H J
# are the white keys, W E T Y U the black ones, Z and X step down and up an octave).
# Try changing: "saw" to "square"; octave=4 to 2; add dial("volume", lead, "volume").
#
# Run it:   pyctures run synth_panel.py

from pyctures import *
from pydials import *
from standin_synth import make_synth   # a stand-in until synths is ready: then  from synths import *

lead = make_synth(wave="saw")

select("wave", lead, "wave")
dial("cutoff", lead, "filter_cutoff")
dial("resonance", lead, "filter_resonance")
slider("attack", lead, "attack")
slider("release", lead, "release")
scope(lead)
keyboard(lead, octave=4)
