# Settings: a name to type, a number to step, a choice to make, a colour to pick and a box to tick,
# and a drawing that changes with each of them.
# Try changing: the choices of shape; the most shapes there can be; what the tick box does.
#
# Run it:   pyctures run settings_panel.py

from pyctures import *
from pydials import *

name = text_box("name", "Ada")
count = number("how many", 1, 8, 5)
shape = choose("shape", ["circle", "square", "star"], "star")
ink = colour_picker("colour", "gold")
outline = checkbox("outline")
readout("letters", lambda: len(name))


def draw():
    background("midnightblue")
    area = room()                                   # the part of the picture no control is on
    size = min(area.width / (count * 2.6), area.height / 5)
    y = area.y + area.height / 2
    edge = "white" if outline else None
    for i in range(int(count)):
        x = area.x + area.width * (i + 0.5) / count
        if shape == "circle":
            circle(x, y, size, ink.value, edge)
        elif shape == "square":
            rect(x - size, y - size, size * 2, size * 2, ink.value, edge)
        else:
            star(x, y, size, 5, ink.value, edge)
    text(name.value or "type a name", width / 2, y + size + 44, "white", 28, "centre")
