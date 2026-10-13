# Dial: one dial, and a drawing that follows it. Turn it and the star grows more points.
# Try changing: 3 and 12, the fewest and the most points; "gold"; add a second dial for the size.
#
# Run it:   pyctures run dial.py

from pyctures import *
from pydials import *

points = dial("points", 3, 12, 5, step=1)
turn = 0


def update(dt):
    global turn
    turn += dt * 0.5


def draw():
    background("midnightblue")
    ctx.save()
    ctx.translate(width / 2, height / 2 + 50)
    ctx.rotate(turn)
    star(0, 0, min(width, height) / 4, points, "gold")
    ctx.restore()
