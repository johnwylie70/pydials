# Your own instrument: three controls made from scratch with custom(). A ribbon you drag along to play
# a scale, a ring that lights with how loud the sound is, and a row of steps that plays itself.
# Each one is a few lines: what it looks like (draw), what a finger does (on_down, on_move, on_up) and, for the
# ring, what it listens to (source). Press the ribbon first: the first touch lets the page make sound.
# Try changing: SCALE to [0, 2, 4, 7, 9, 12, 14, 16]; the colours; "lead" to "bell" or "pluck".
#
# Run it:   pyctures run custom_instrument.py

import time

from pyctures import *
from pydials import *
from synths import *

lead = make_synth("lead")
SCALE = [0, 2, 3, 5, 7, 8, 10, 12]        # A minor, from A3 (57)

# 1. A ribbon. Across is the note, and it snaps to the scale.
sounding = None


def draw_ribbon(c):
    c.rect(0, 0, c.width, c.height, c.theme["well"], 10)
    for i in range(len(SCALE)):
        x = (i + 0.5) * c.width / len(SCALE)
        c.rect(x - c.width / 16 + 2, 4, c.width / 8 - 4, c.height - 8, c.accent if i == c.value else c.theme["knob"], 6)


def play(p, c):
    global sounding
    i = max(0, min(len(SCALE) - 1, int(p.x / c.width * len(SCALE))))
    if i == ribbon.value:
        return
    stop()
    sounding = 57 + SCALE[i]
    lead.note_on(sounding, 0.9)
    ribbon.set(i)                                   # changes the value, redraws, and calls on_change


def stop(p=None, c=None):
    global sounding
    if sounding is not None:
        lead.note_off(sounding)
    sounding = None
    ribbon.value = -1


ribbon = custom("ribbon", width=340, height=110, value=-1, draw=draw_ribbon, on_down=play, on_move=play, on_up=stop)


# 2. A ring that follows the sound. source=lead hands draw() the synth's level as c.level, every frame.
def draw_level(c):
    c.ring(c.width / 2, c.height / 2, 40, c.theme["track"], 2)
    c.circle(c.width / 2, c.height / 2, 14 + 26 * c.level, c.theme["hot"] if c.level > 0.8 else c.accent)


custom("level", width=120, height=110, source=lead, draw=draw_level)

row()

# 3. A row of steps that plays itself. on_frame is called every frame, so it can keep time.
steps = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1]
at, last = -1, 0.0
tempo = dial("tempo", 60, 180, 110)


def draw_steps(c):
    w = c.width / len(steps)
    for i, on in enumerate(steps):
        colour = (c.theme["text"] if i == at else c.accent) if on else (c.theme["track"] if i == at else c.theme["knob"])
        c.rect(i * w + 2, 6, w - 4, c.height - 12, colour, 5)


def toggle_step(p, c):
    i = int(p.x / c.width * len(steps))
    steps[i] = 0 if steps[i] else 1
    row_of_steps.redraw()


def keep_time(c):
    global at, last
    now = time.monotonic()
    if now - last < 60 / tempo.value / 4:
        return
    last = now
    at = (at + 1) % len(steps)
    if steps[at]:
        lead.play(45 + SCALE[(at % 4) * 2], 0.2)
    row_of_steps.redraw()


row_of_steps = custom("steps", width=420, height=56, draw=draw_steps, on_down=toggle_step, on_frame=keep_time)

scope(lead, width=420)


def draw():
    background("#0b1020")
