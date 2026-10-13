# Bounce: controls with no sound at all. Dials set the gravity and the bounce, a button kicks the
# ball, a toggle leaves a trail, and the scope draws the ball's height as it goes.
# Try changing: the ranges of the dials; what the button does; push the ball's speed to the scope.
#
# Run it:   pyctures run bounce.py

from pyctures import *
from controls import *

layout(at="bottom")
gravity = dial("gravity", 0, 2000, 900)
bounce = dial("bounce", 0, 1, 0.8)
kick = button("kick")
trail = toggle("trail", False)
graph = scope("height", width=220)

y = 100
vy = 0


def update(dt):
    global y, vy
    floor = height - 220
    if kick.pressed:
        vy = -700
    vy += gravity * dt
    y += vy * dt
    if y > floor:
        y = floor
        vy = -abs(vy) * bounce
    graph.push(floor - y)


def draw():
    background("rgba(16, 24, 48, 0.08)" if trail else "rgb(16, 24, 48)")
    circle(width / 2, y, 24, "tomato")
