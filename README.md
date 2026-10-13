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

A `button` is asked in `update`: `kick.pressed` is true once for each press, and `kick.held` for as long as it is down. A `toggle` is a switch: `if trail:`. `select("level", ["easy", "hard"])` is one of a list. The controls line themselves up in the order you make them; `row()` starts another line. [Laying it out](#laying-it-out) has the rest.

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

## Laying it out

**There is nothing to do.** Controls line up in the order you make them, on a plate, with the keyboard along the bottom. On a narrow screen the line wraps evenly (six dials are three and three, never five and one), on a touch screen everything is a little bigger, and when the picture changes size it is all laid out again. Controls are drawn a little smaller before a line has to wrap, but never tiny: when there is more than fits, the plates can be moved with a finger, the mouse wheel or the bar beside them, while the keyboard and the scope above it stay where they are.

**A label is a heading.** A `label` made just before some controls is the title of their plate, and they are kept together: a plate moves to the next line whole, never leaving its heading behind. `row()` starts a new line of plates. This is a whole synth panel, and it needs nothing else:

```python
label("oscillator")
select("wave", lead, "wave")
dial("width", lead, "width")

row()
label("unison")
dial("voices", lead, "voices")
dial("detune", lead, "detune")
label("filter")
dial("cutoff", lead, "cutoff")
dial("resonance", lead, "resonance")
```

![A synth panel made of labels and controls: six titled plates, two of them side by side twice, a scope and a keyboard, at the width of a tablet's split view](docs/images/layout-headings.png)

**Groups.** `group` says the same thing out loud, and takes options. What is made inside `with` is in the group:

```python
with group("filter"):
    dial("cutoff", lead, "cutoff")
    dial("resonance", lead, "resonance")
```

Or in a straight line, with nothing to indent: `group("filter")` and then its controls, until the next `group`, `row()` or `page`. The plates of a line share its width and are as tall as each other, and every line is as wide as the widest, so the panel looks made rather than poured. `examples/front_panel.py` is a whole synth in seven groups:

![The front panel example: oscillator, unison, filter, envelope, delay, reverb and output plates above a keyboard](docs/images/front-panel.png)

**Inside a group**, controls stand in a line. To arrange them another way, put these in it (they nest):

| | |
|---|---|
| `with row():` | In a line. (`row()` alone starts a new line.) |
| `with column():` | One under another. |
| `with grid(3):` | Three to a line, in columns that line up; fewer where three will not fit. `span=2` on a control covers two columns. |
| `spacer()` | All the room that is left over, so what follows is pushed to the far end. `spacer(20)` is 20 points. |
| `size="small"`, `"large"` | On any control. A dial, slider and meter also take a number. |
| `share=1` | On a control or a group: it takes the room its line has left over. Two things with shares of 2 and 1 split the line two to one. |

A group takes `colour=` (for its title and every control in it), `columns=3` (a grid), `gap=`, `align=` (`"start"`, `"center"`, `"end"`; left out, its controls are spread along the line), `dividers=True` (a line between the groups inside it) and `plate=False`.

```python
with group("filter", colour="deepskyblue"):
    with column():
        select("kind", lead, "filter")
        toggle("drive")
    with grid(2):
        dial("cutoff", lead, "cutoff", size="large", span=2)
        dial("resonance", lead, "resonance", size="small")
        dial("chorus", lead, "chorus", size="small")
```

**Pages.** When there is too much for one screen, give it pages. Each has a tab; the keyboard, and what is made before the first page and after the last, stay on every page.

```python
page("osc")
group("oscillator")
select("wave", lead, "wave")
dial("width", lead, "width")
page("filter")
group("filter")
dial("cutoff", lead, "cutoff")
dial("resonance", lead, "resonance")
page()                      # the pages end here
scope(lead)
keyboard(lead)
```

`with page("fx") as fx:` works too, and `fx.show()` turns to a page from your code.

![Three tabs, osc, filter and fx, with the filter page on show: two plates, then a scope and a keyboard that are on every page](docs/images/layout-pages.png)

**Along an edge, and the room that is left.** `layout(at="bottom")` puts the plates at the bottom, and `"left"` or `"right"` in a column down that side. One group can be a strip along an edge, and `room()` is the rectangle no control is on, for the scene to draw in:

```python
with group("moves", at="left"):
    speed = dial("speed", 0, 10, 4)
    jump = button("jump")
    spacer()
    trail = toggle("trail")
with group(at="bottom"):
    button("left")
    button("right")
    spacer()
    button("fire", size="large")

def draw():
    area = room()                         # its x, y, width and height
    rect(area.x, area.y, area.width, area.height, "steelblue")
```

The page works the rectangle out and tells Python with a frame, so in the scene's very first lines `room()` is still the whole picture.

![A strip of controls down the left, a strip of buttons along the bottom, and the scene drawn in the rectangle between them](docs/images/layout-strips.png)

Nothing here asks Python anything: each line above is one command to the page, and the page decides where things go.

**Exactly where you say.** `x=` and `y=` on a control or a group place its top left corner, and `control.place(x, y)` moves it. With `layout(design=(800, 480))` those numbers are in a panel 800 by 480 that is scaled to fit the picture, so a front panel drawn once is right on every screen:

```python
layout(design=(800, 480), image="panel.png")            # a picture behind the controls
dial("cutoff", lead, "cutoff", x=360, y=30, size="large")
with group("osc", x=20, y=20, width=300):
    select("wave", lead, "wave")
    dial("sub", lead, "sub")
keyboard(lead, x=20, y=340, width=760, height=120)
```

**The look.** `layout` also takes `compact=True` (less room around everything), `dividers=True`, `plates=False` (no plates: a picture of your own behind), `backdrop=` (a colour), `image=`, `align="center"` (plates keep their own widths) and `scale=`. `theme(accent="deepskyblue", plate="#20242c")` is still one call for the colours.

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
| `label(text)` | Words. Made just before some controls, it is their heading. |
| `group`, `row`, `column`, `grid`, `page`, `spacer` | What goes with what: see [Laying it out](#laying-it-out). |
| `layout(at="bottom")` | Where the plates go (`"top"`, `"bottom"`, `"left"`, `"right"`), `scale=`, `margin=`, `compact=`, `dividers=`, `plates=`, `align=`, `backdrop=` (True, False or a colour), `image=` and `design=`. |
| `room()` | The rectangle no control is on: its `x`, `y`, `width` and `height`. |
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

`tests/test_runtime.py` needs no browser. `tests/test_browser.py` runs scenes with `pyctures run` in a real Chromium (muted) and turns, presses and plays the controls, and lays out a panel written with labels alone, and one written with `with group(…)`, to see that every heading is on its controls' plate. The page's half is this repository's copy, whatever the Pyctures installed carries.

## Licence

MIT. See [LICENSE](LICENSE).
