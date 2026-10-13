# Front panel: a whole synth, laid out like the front of a real one. Each group is a plate with a
# title that keeps its controls together; the plates arrange themselves to fit a phone, a tablet
# or a wide window, and what does not fit can be moved with a finger while the keys stay put.
# Try changing: move a dial to another group; with group("filter", colour="deepskyblue"):
# add row() between two groups to start a new line of plates; layout(compact=True).
#
# Run it:   pyctures run front_panel.py

from pyctures import *
from pydials import *
from standin_synth import make_synth   # a stand-in until synths is ready: then  from synths import *

lead = make_synth(wave="saw", voices=3, delay=0.25, reverb=0.3)

with group("oscillator"):
    select("wave", lead, "wave")
    dial("sub", lead, "sub")
with group("unison"):
    dial("voices", lead, "voices")
    dial("detune", lead, "detune")
with group("filter"):
    dial("cutoff", lead, "filter_cutoff")
    dial("resonance", lead, "filter_resonance")
with group("envelope"):
    for stage in ("attack", "decay", "sustain", "release"):
        slider(stage, lead, stage, vertical=True)
with group("delay"):
    dial("mix", lead, "delay")
    dial("time", lead, "delay_time")
    dial("feedback", lead, "delay_feedback")
with group("reverb"):
    dial("mix", lead, "reverb")
    dial("size", lead, "reverb_size")
with group("output"):
    scope(lead, share=1)                  # the scope takes the room the others leave
    meter(lead)
    dial("volume", lead, "volume")
keyboard(lead, octave=3, octaves=2)
