# Trance: a held chord chopped by a trance gate, and a lead that runs up and down the chord's notes.
# Both patterns are yours to draw: the gate's bars, and the arpeggio's notes, rests, ties and accents.
# Try changing: the chord ("Am7" to "Dm7"); the patterns to start from ("pump", "acid"); the tempo.
#
# Run it:   pyctures run trance.py

from pyctures import *
from pydials import *
from synths import *

set_tempo(138)
pad = make_synth("pad", echo=0.3)
lead = make_synth("lead")
pad.trance_gate = "trance"                          # a pattern by name: the editor below shows it, and changes it
lead.arp_pattern = "trance"

chord = None


def play(on):
    # Play: the pad holds the chord under its gate, and the lead plays the same chord as an arpeggio. Stop: both are let go.
    global chord
    if on:
        pad.start(["A3", "C4", "E4", "G4"])
        chord = lead.start_arp("Am7", step="sixteenth")
    else:
        pad.stop()
        if chord:
            chord.stop()


number("tempo", 80, 180, 138, unit="bpm", on_change=set_tempo)
toggle("play", False, on_change=play)
row()
trance_gate("gate", pad)                            # pad.trance_gate, with its depth, rate and the rest beside it
row()
arp_pattern("arp", lead)                            # lead.arp_pattern
