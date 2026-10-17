# Spectrum: the frequencies in a sound as bars, low notes at the left, with a level meter and the wave beside them.
# Press and hold keys on the keyboard (A S D F G H J, or a finger): the bars rise where the sound has energy, and the ticks above
# them hold a moment and fall.
# Try changing: bands=48 to 16 or 96; "lead" to "bass", "pad" or "strings"; the wave to "square" and watch the harmonics.
#
# Run it:   pyctures run spectrum.py

from pyctures import *
from pydials import *
from synths import *

lead = make_synth("lead")

select("wave", lead, "wave")
dial("cutoff", lead, "cutoff")
dial("resonance", lead, "resonance")
spectrum(lead, bands=48)         # the frequencies, 30 Hz up, from -90 dB to 0 dB: a full-strength sine reaches the top of its band
scope(lead)                      # the wave itself
meter(lead)                      # how loud it is
keyboard(lead, octave=3, octaves=2)


def draw():
    background("#0b1020")
