# Rocks: a game for two thumbs. The stick flies the ship and the round button fires; on a computer
# the arrow keys and the space bar do the same.
# Try changing: how fast the rocks fall; how big they are; a second button that clears the screen.
#
# Run it:   pyctures run joystick_game.py

import math

from pyctures import *
from pydials import *

score = 0
with group(at="bottom", plate=False):
    stick = joystick()
    spacer()
    readout("score", lambda: score, size="large")
    spacer()
    fire = action_button("fire")

ship = {"x": 0, "y": 0}
shots, rocks = [], []
wait, space, began = 0, False, False


def on_key_down(key):
    global space
    if key == " ":
        space = True


def update(dt):
    global score, wait, space, began
    area = room()                                   # the part of the picture no control is on
    if not began and area.height < height:          # (the page says where the controls are with its first frame)
        ship["x"], ship["y"], began = area.x + area.width / 2, area.bottom - 40, True
    # The stick, or else the arrow keys: each gives a push from -1 to 1.
    dx = stick.x or ("ArrowRight" in keys) - ("ArrowLeft" in keys)
    dy = stick.y or ("ArrowDown" in keys) - ("ArrowUp" in keys)
    ship["x"] = min(area.right - 20, max(area.x + 20, ship["x"] + dx * 340 * dt))
    ship["y"] = min(area.bottom - 20, max(area.y + 20, ship["y"] + dy * 340 * dt))
    if fire.pressed or space:
        shots.append({"x": ship["x"], "y": ship["y"] - 20})
    space = False
    wait -= dt
    if wait <= 0:
        rocks.append({"x": area.x + random() * area.width, "y": area.y - 20, "size": 10 + random() * 12})
        wait = 0.7
    for shot in shots:
        shot["y"] -= 520 * dt
    for rock in rocks:
        rock["y"] += 110 * dt
        for shot in shots:
            if math.hypot(rock["x"] - shot["x"], rock["y"] - shot["y"]) < rock["size"] + 4:
                rock["hit"] = shot["hit"] = True
                score += 10
    shots[:] = [shot for shot in shots if not shot.get("hit") and shot["y"] > area.y]
    rocks[:] = [rock for rock in rocks if not rock.get("hit") and rock["y"] < area.bottom + 30]


def draw():
    background("#0b1026")
    for rock in rocks:
        circle(rock["x"], rock["y"], rock["size"], "slategray")
    for shot in shots:
        rect(shot["x"] - 2, shot["y"] - 8, 4, 16, "gold")
    triangle(ship["x"], ship["y"] - 20, ship["x"] - 16, ship["y"] + 16, ship["x"] + 16, ship["y"] + 16, "deepskyblue")
