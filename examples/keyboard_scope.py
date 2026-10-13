# Keyboard and scope: every note you hold is a ring, and the scope shows the sound's wave.
# Play with a finger (several at once), the mouse, or the keys A S D F G H J and W E T Y U.
# Try changing: octaves=2 to 3; the colours; what is drawn for a note.
#
# Run it:   pyctures run keyboard_scope.py

from pyctures import *
from controls import *
from standin_synth import make_synth   # a stand-in until synths is ready: then  from synths import *

lead = make_synth(wave="triangle")

scope(lead, width=420)
meter(lead)
piano = keyboard(lead, octave=3, octaves=2)


def draw():
    background("#0b1020")
    for note in piano.notes:
        x = width * (note - 48 + 0.5) / 25           # 48 is the lowest key: the C of octave 3
        circle(x, height * 0.45, 26, outline="hsl(%d, 90%%, 65%%)" % (note * 30), thickness=5)
