# pydials

[![MIT licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

![A synth panel made with pydials: a select, two dials and two sliders in a row, a scope showing the wave, and a piano keyboard with three keys held](docs/images/synth-panel.png)

pydials puts dials, sliders, buttons, switches, a piano keyboard, a scope and level meters on a [Pyctures](https://github.com/johnwylie70/pyctures) scene, in Python, and it is for enjoying. It is for any age and any level: you write one line and a dial appears, and you turn it and something changes. There is nothing to position, nothing to draw and nothing to wire up. It works with a finger (several at once on the keyboard), with the mouse and with the computer's keys. It is a sibling of [Pyctures](https://github.com/johnwylie70/pyctures) and [synths](https://github.com/johnwylie70/synths-py), designed for projects made in [Circuitry Studio](https://www.circuitry.dev).

Prefer JavaScript? [dials.js](https://github.com/johnwylie70/dials.js) is the same library for [pictures.js](https://github.com/johnwylie70/pictures.js).

## Start with four small scenes

Each one is a whole program. Each scene starts with two lines of imports. [How to run one](#run-it) is just below.

**1. A dial is a number.**

```python
from pyctures import *
from pydials import *

size = dial("size", 10, 150, 60)       # from 10 to 150, starting at 60

def draw():
    background("midnightblue")
    circle(width / 2, height / 2, size, "gold")
```

The dial stands for its number wherever a number is wanted: `circle(x, y, size)`, `size * 2`. `size.value` is the number itself, and `size.value = 100` sets it. Hold Shift while you turn for fine steps, and tap twice to put it back to 60.

**2. Buttons and switches.**

```python
from pyctures import *
from pydials import *

layout(at="bottom")                     # the controls go along the bottom
gravity = dial("gravity", 0, 2000, 900)
kick = button("kick")
trail = toggle("trail")

y = 100
speed = 0

def update(dt):
    global y, speed
    if kick.pressed:                    # true once for each press
        speed = -700
    speed += gravity * dt
    y += speed * dt
    if y > height - 200:
        y = height - 200
        speed = -speed * 0.8

def draw():
    background("rgba(16, 24, 48, 0.08)" if trail else "rgb(16, 24, 48)")
    circle(width / 2, y, 24, "tomato")
```

![The second scene: a ball in the air above a row with a dial, a button and a switch](docs/images/bounce.png)

A `button` is asked in `update`: `kick.pressed` is true once for each press, and `kick.held` for as long as it is down. A `toggle` is a switch: `if trail:`. `select("level", ["easy", "hard"])` is one of a list. The controls line themselves up in a row in the order you make them; `row()` starts another row.

**3. A synth you can play.**

```python
from pyctures import *
from synths import *
from pydials import *

lead = make_synth("lead")

dial("cutoff", lead, "cutoff")
dial("resonance", lead, "resonance")
slider("attack", lead, "attack")
scope(lead)
keyboard(lead, octave=4)
```

Each dial is that setting of the synth: it takes its range, its unit and where it starts from the synth, and turning it sets it. The scope draws the wave the synth is making. The keyboard plays it: with fingers, with the mouse, and with the keys A S D F G H J (the white keys) and W E T Y U (the black ones); Z and X step down and up an octave. `make_synth` is from [synths](https://github.com/johnwylie70/synths-py), the sound library.

**4. Watch a number.**

```python
import math
from pyctures import *
from pydials import *

graph = scope("height")
level = meter("speed")
t = 0

def update(dt):
    global t
    t += dt
    graph.push(math.sin(t * 2) * 100)            # one more point on the line
    level.value = abs(math.cos(t * 2))           # from 0 to 1
```

A scope with nothing behind it draws whatever you `push`, so you can watch any number change: a ball's height, a score, a speed. A meter shows a level from 0 to 1.

## Run it

Save a scene as `panel.py` and run it with Pyctures:

```bash
pyctures run panel.py
```

Your browser opens on the scene. Save the file and it runs again.

Nothing here is published yet. Until it is, install it from a copy of this repository with `pip install -e .`, beside Pyctures.

The scenes in `examples/` use a small stand-in synth (`examples/standin_synth.py`, the browser's own oscillators) so that they need no sound library: `pyctures run examples/synth_panel.py`.

## With your hands

- Drag up or to the right on a dial to turn it up. The drag is the dial's until you let go, wherever the pointer wanders: off the dial, off the picture.
- Hold Shift to turn a tenth as far. On a touch screen, pull your finger well away from the dial for a quarter.
- Tap twice to put a dial or slider back where it started.
- Tap a slider's track and the handle comes to your finger; drag the handle to move it from where it is.
- Each finger on the keyboard holds its own key, and sliding along plays each key in turn.
- On a touch screen the controls are made a little bigger, for fingers.

## The controls

All of them take `x=` and `y=` (to place it by hand: its top left corner) and `colour=`.

| | |
|---|---|
| `dial(label, min, max, start)` | A dial. Also `step=`, `unit=`, `log=True` (turned by ratio, as a pitch is), `digits=`, `size=`, `on_change=`. |
| `dial(label, target, "setting")` | A dial that is a setting of a target. The label may be left out: `dial(lead, "volume")`. |
| `slider(…)` | The same as a dial, as a slider. `vertical=True` stands it upright. |
| `button(label, on_press)` | A button. `fire.pressed` is true once for each press; `fire.held` while it is down. |
| `toggle(label, on)` | A switch: `if mute:`. `toggle(label, target, "setting")` ties it to a setting. |
| `select(label, choices, start)` | One of a list, stepped through with the arrows at its sides. `wave.value` is the choice, `wave.index` its place. `select(label, target, "setting")` takes the choices from the target. |
| `keyboard(target, octave=4, octaves=2)` | A piano keyboard along the bottom. `piano.notes` is what is held now (60 is middle C). Also `keys=False` (no computer keys), `hints=False` (no letters on the keys), `on_note_on=` (given the note and how hard), `on_note_off=`. |
| `scope(source)` | A line of numbers, live: a target with `samples()`, a function that returns a list, or a list. With no source, `graph.push(value)` adds a point. Also `min=`, `max=`, `width=`, `height=`, `points=`. |
| `meter(source)` | A level from 0 to 1 as a bar of lights: a target with `level()`, a function, or `level.value = 0.7`. |
| `label(text)` | Words in the row, as a heading. |
| `row()` | The controls after this start a new row. |
| `layout(at="bottom")` | Where the rows go (`"top"` or `"bottom"`), `scale=`, `margin=`, and `backdrop=` (True, False or a colour). |
| `theme(accent="deepskyblue")` | The colours. |

Every control has `value`, `remove()` and `place(x, y)`. `on_change(value)` is called when a hand changes it.

## Targets

A control can be tied to anything. No library is named: a target is known by what it can do, and every part is optional.

| | |
|---|---|
| `set(name, value)`, `get(name)` | Without them the control reads and writes `target.name`, or `target[name]` for a dictionary: `dial("size", ball, "radius", min=5, max=80)`. |
| `describe(name)` | `{"min", "max", "default", "unit", "step", "kind", "choices"}`. `kind` is `"float"`, `"int"`, `"bool"` or `"choice"`. |
| `note_on(note, velocity)`, `note_off(note)` | What a keyboard plays. `note` is a MIDI number, `velocity` is from 0 to 1. |
| `samples()` | Its latest output, numbers from -1 to 1: a scope draws it. |
| `level()` | How loud it is now, from 0 to 1: a meter shows it. |

A Python target that is changed some other way moves its controls.

**A target that lives in the page.** A synth's sound is made in the browser page, not in Python. Such a target says so with a `page` attribute holding its Pyctures reference to the object there (or is such a reference itself). Its controls are then tied to it in the page: a key sounds the moment it is touched and a dial is heard as it turns, with no trip through Python. Python is still told, a frame later, so `cutoff.value` and `piano.notes` are right; and the Python object is told too, if it has a `_told(name, value)` method.

## How it is made

Python never touches the page: it may be in a worker or on another computer, and it sends one batch of commands a frame. So the page draws the controls and feels the fingers (it is [dials.js](https://github.com/johnwylie70/dials.js) itself, carried here as `src/pydials/web/dials.js`), and a dial turns smoothly however busy Python is. Each function here sends one command that makes the control in the page, and keeps a small object that stands for it. What a hand changes comes back with the next frame.

A scope or meter fed from Python (`scope(my_function)`) is asked for its numbers once for each frame the page has drawn, so Python never gets ahead of the page.

A Pyctures that has the dials built in says so with `H_DIALS`, and then this module is one file. `scripts/sync_js.py` copies the page's half from the dials.js repository; the tests fail while the copy differs.

## Tests

```bash
pip install -e ".[test]" && playwright install chromium
pytest
```

`tests/test_runtime.py` needs no browser. `tests/test_browser.py` runs scenes with `pyctures run` in a real Chromium and turns, presses and plays the controls.

## Licence

MIT. See [LICENSE](LICENSE).
