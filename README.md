# controls

[![MIT licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

controls puts dials, sliders, buttons, a piano keyboard, a scope and level meters on a [Pyctures](https://github.com/johnwylie70/pyctures) scene, in Python. You say what you want and it appears: nothing to position, nothing to draw, nothing to wire up. It works with a finger (several at once on the keyboard), with the mouse and with the computer's keys. It is designed for projects made in [Circuitry Studio](https://www.circuitry.dev).

Prefer JavaScript? The same library for [pictures.js](https://github.com/johnwylie70/pictures.js) is in the `controls.js` repository.

Nothing here is published yet, and its name is not settled.

## A synth you can play

```python
from pyctures import *
from synths import *
from controls import *

lead = make_synth(wave="saw")

select("wave", lead, "wave")
dial("cutoff", lead, "filter_cutoff")
dial("resonance", lead, "filter_resonance")
slider("attack", lead, "attack")
scope(lead)
keyboard(lead, octave=4)
```

Each dial is that setting of the synth: it takes its range, its unit and where it starts from the synth, and turning it sets it. The scope draws the wave the synth is making. The keyboard plays it: with fingers, with the mouse, and with the keys A S D F G H J (the white keys) and W E T Y U (the black ones); Z and X step down and up an octave.

`synths` is not ready yet. Until it is, `examples/standin_synth.py` is a small stand-in made from the browser's own oscillators, so the examples make sound today: `from standin_synth import make_synth`.

## A number for anything

A control needs no synth. It is a number for a game or an animation:

```python
from pyctures import *
from controls import *

points = dial("points", 3, 12, 5, step=1)     # from 3 to 12, starting at 5

def draw():
    background("midnightblue")
    star(width / 2, height / 2, 120, points, "gold")
```

The control stands for its number wherever a number is wanted: `speed * dt`, `circle(x, y, size)`, `if mute:`. `points.value` is the number itself, and `points.value = 8` sets it.

## Run it

With Pyctures and this library installed (`pip install -e .` in this folder, until it is published):

```
pyctures run examples/synth_panel.py
```

## The controls

All of them take `x=` and `y=` (to place it by hand: its top left corner) and `colour=`.

| | |
|---|---|
| `dial(label, min, max, start)` | A dial. Also `step=`, `unit=`, `log=True` (turned by ratio, as a pitch is), `digits=`, `size=`, `on_change=`. |
| `dial(label, target, "setting")` | A dial that is a setting of a target. The label may be left out: `dial(lead, "volume")`. |
| `slider(…)` | The same as a dial, as a slider. `vertical=True` stands it upright. |
| `button(label, on_press)` | A button. `fire.pressed` is true once for each press (ask it in `update`); `fire.held` while it is down. |
| `toggle(label, on)` | A switch: `if mute:`. `toggle(label, target, "setting")` ties it to a setting. |
| `select(label, choices, start)` | One of a list, stepped through with the arrows at its sides. `wave.value` is the choice, `wave.index` its place. `select(label, target, "setting")` takes the choices from the target. |
| `keyboard(target, octave=4, octaves=2)` | A piano keyboard along the bottom. `piano.notes` is what is held now (60 is middle C). Also `keys=False` (no computer keys), `hints=False` (no letters on the keys), `on_note_on=` (given the note and how hard), `on_note_off=`. |
| `scope(source)` | A line of numbers, live: a target with `samples()`, a function that returns a list, or a list. With no source, `graph.push(value)` adds a point, to draw any value over time. Also `min=`, `max=`, `width=`, `height=`, `points=`. |
| `meter(source)` | A level from 0 to 1 as a bar of lights: a target with `level()`, a function, or `level.value = 0.7`. |
| `label(text)` | Words in the row, as a heading. |
| `row()` | The controls after this start a new row. |
| `layout(at="bottom")` | Where the rows go (`"top"` or `"bottom"`), `scale=`, `margin=`, and `backdrop=` (True, False or a colour). |
| `theme(accent="deepskyblue")` | The colours. |

Every control has `value`, `remove()` and `place(x, y)`. `on_change(value)` is called when a hand changes it.

## With your hands

- Drag up or to the right on a dial to turn it up. The drag is the dial's until you let go, wherever the pointer wanders.
- Hold Shift to turn a tenth as far. On a touch screen, pull your finger well away from the dial for a quarter.
- Tap twice to put a dial or slider back where it started.
- Each finger on the keyboard holds its own key, and sliding along plays each key in turn.

## Targets

A control can be tied to anything. No library is named: a target is known by what it can do, and every part is optional.

| | |
|---|---|
| `set(name, value)`, `get(name)` | Without them the control reads and writes `target.name`, or `target[name]` for a dictionary: `dial("size", ball, "radius", min=5, max=80)`. |
| `describe(name)` | `{"min", "max", "default", "unit", "step", "kind", "choices"}`. `kind` is `"float"`, `"int"`, `"bool"` or `"choice"`. |
| `note_on(note, velocity)`, `note_off(note)` | What a keyboard plays. |
| `samples()` | Its latest output, numbers from -1 to 1: a scope draws it. |
| `level()` | How loud it is now, from 0 to 1: a meter shows it. |

**A target that lives in the page.** A synth's sound is made in the browser page, not in Python. Such a target says so with a `page` attribute holding its Pyctures reference to the object there (or is such a reference itself). Its controls are then tied to it in the page: a key sounds the moment it is touched and a dial is heard as it turns, with no trip through Python. Python is still told, a frame later, so `cutoff.value` and `piano.notes` are right.

## How it is made

Python never touches the page: it may be in a worker or on another computer, and it sends one batch of commands a frame. So the page draws the controls and feels the fingers (it is `controls.js`, the JavaScript library itself, carried in this package as `src/controls/web/controls.js`), and a dial turns smoothly however busy Python is. Each function here sends one command that makes the control in the page, and keeps a small object that stands for it. What a hand changes comes back with the next frame.

A scope or meter fed from Python (`scope(my_function)`) is asked for its numbers once for each frame the page has drawn, so Python never gets ahead of the page.

`scripts/sync_js.py` copies the page's half from the JavaScript repository; the tests fail while the copy differs.

## Tests

```
pip install -e ".[test]" && playwright install chromium
pytest
```

`tests/test_runtime.py` needs no browser. `tests/test_browser.py` runs scenes with `pyctures run` in a real Chromium and turns, presses and plays the controls.

## Licence

MIT. See [LICENSE](LICENSE).
