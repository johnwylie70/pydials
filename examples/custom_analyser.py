# Your own analyser: a level meter in dB, the spectrum as bars with peaks that hold, and the wave, drawn by custom().
# It listens to the synth with source=lead, which gives the drawing c.level, c.samples and c.spectrum every frame, and it is
# drawn for a size of 640 by 300 (design): the control scales that to fit whatever box it is given, centres it and cuts anything outside.
# Press and hold the keys A S D F G H J to hear and see it.
# Try changing: BANDS to 24 or 96; the colours; the dB scale of the level; what is drawn in the wave strip.
#
# Run it:   pyctures run custom_analyser.py

import math
import time

from pyctures import *
from pydials import *
from synths import *

lead = make_synth("lead")
rotary("wave", lead, "wave")
dial("cutoff", lead, "cutoff")

# What the analyser keeps between frames: the bars, the ticks that hold, and the level with its peak.
BANDS = 48
bars, tops, held = [0.0] * BANDS, [0.0] * BANDS, [0.0] * BANDS
vu = [0.0, 0.0, 0.0]                                       # the level now, its peak, and when the peak was set
last = [time.monotonic()]


def paint_analyser(c):
    now = time.monotonic()
    dt, last[0] = min(0.1, now - last[0]), now
    spectrum, wave = c.spectrum or [], c.samples or []
    c.clear(c.theme["well"])
    # level: dB from -60 to 0, green, then amber, then red, with a peak that holds
    db = 20 * math.log10(max(c.level or 0, 1e-4))
    vu[0] = max(0.0, min(1.0, (db + 60) / 60))
    if vu[0] >= vu[1]:
        vu[1], vu[2] = vu[0], now
    elif now - vu[2] > 1.0:
        vu[1] = max(vu[0], vu[1] - 0.5 * dt)
    c.text("LEVEL", 36, 14, c.theme["dim"], 10)
    for mark in (0, -12, -24, -48):
        y = 24 + 180 * (1 - (mark + 60) / 60)
        c.line(22, y, 50, y, c.theme["edge"], 1)
        c.text(str(mark), 64, y, c.theme["dim"], 9, "left")
    for i in range(30):                                    # thirty lights, two dB each: green, then amber from -12, then red from -3
        level_db = -60 + 2 * i
        lit = vu[0] * 60 - 60 >= level_db
        colour = c.theme["hot"] if level_db >= -3 else c.theme["warn"] if level_db >= -12 else c.theme["good"]
        c.rect(22, 24 + 180 - 6 * (i + 1) + 1, 28, 4, colour if lit else c.theme["knob"], 1)
    c.rect(22, 24 + 180 * (1 - vu[1]) - 2, 28, 2, c.theme["text"])
    # spectrum: bars that rise at once and fall away, with a tick that holds
    c.text("SPECTRUM", 100, 14, c.theme["dim"], 10, "left")
    left, width, top, tall = 100, 520, 24, 180
    for mark in (-20, -40, -60):
        y = top + tall * (1 - (mark + 90) / 90)
        c.line(left, y, left + width, y, c.theme["edge"], 1)
        c.text(str(mark), left + width - 2, y - 6, c.theme["dim"], 9, "right")
    each = width / BANDS
    for i in range(BANDS):
        v = spectrum[i] if i < len(spectrum) else 0.0
        bars[i] = max(v, bars[i] - 1.2 * dt)
        if bars[i] >= tops[i]:
            tops[i], held[i] = bars[i], now
        elif now - held[i] > 0.7:
            tops[i] = max(bars[i], tops[i] - 0.5 * dt)
        c.rect(left + i * each + 1, top + tall * (1 - bars[i]), each - 2, tall * bars[i], c.accent if bars[i] < 0.9 else c.theme["hot"])
        if tops[i] > 0.02:
            c.rect(left + i * each + 1, top + tall * (1 - tops[i]) - 2, each - 2, 2, c.theme["text"])
    for hz, name in ((100, "100"), (1000, "1k"), (10000, "10k")):
        c.text(name, left + width * math.log(hz / 30) / math.log(18000 / 30), top + tall + 12, c.theme["dim"], 9)
    # the wave itself
    c.text("WAVE", 22, 236, c.theme["dim"], 10, "left")
    c.line(100, 262, 620, 262, c.theme["edge"], 1)
    if wave:
        c.lines([(100 + 520 * i / (len(wave) - 1), 262 - 24 * wave[i]) for i in range(len(wave))], c.accent, 1.5)

label("analyser")
custom(width=640, height=300, design=(640, 300), bands=BANDS, source=lead, animate=True, draw=paint_analyser)

keyboard(lead, octave=3, octaves=2)


def draw():
    background("#0b1020")
