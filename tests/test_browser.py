"""Scenes in a real (headless) Chromium, run by `pyctures run`: the controls are drawn and worked in the page, and Python hears.

Needs Playwright:  pip install playwright && playwright install chromium
Screenshots land in tests/screenshots/.
"""
import time

import pytest

from conftest import EXAMPLES, SHOTS

playwright = pytest.importorskip("playwright.sync_api")

SCENES = sorted(p.name for p in EXAMPLES.glob("*.py") if p.name != "standin_synth.py")

# The scene's controls, as the page keeps them (the panel its canvas holds).
PANEL = "document.querySelector('[data-pyctures-src] canvas')[Symbol.for('dials.panel')]"
# The middle of control number `i` (or the point fx, fy of the way across and down it), in the page.
SPOT = """([i, fx, fy]) => {
  const canvas = document.querySelector('[data-pyctures-src] canvas'), c = canvas[Symbol.for('dials.panel')].items[i], b = canvas.getBoundingClientRect()
  return [b.left + c.x + c.w * fx, b.top + c.y + c.h * fy]
}"""


@pytest.fixture(scope="module")
def browser():
    with playwright.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


class Watched:
    """A page showing one scene, with its errors collected."""

    def __init__(self, browser, url, size=(900, 700)):
        self.page = browser.new_page(viewport={"width": size[0], "height": size[1]})
        self.errors = []
        self.page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto(url)

    def wait(self, what, timeout=20):
        """Wait until the JavaScript expression `what` is true in the page; say what the scene reported if it never is."""
        end = time.time() + timeout
        while time.time() < end:
            if self.page.evaluate("(() => { try { return !!(%s) } catch (e) { return false } })()" % what):
                return
            self.page.wait_for_timeout(50)
        scene = self.page.query_selector("[data-pyctures-src]")
        raise AssertionError("never true: %s (status %s, error %s, page errors %s)" % (
            what, scene and scene.get_attribute("data-pyctures-status"), scene and scene.get_attribute("data-pyctures-error"), self.errors))

    def ready(self, count=1):
        """The controls are made and laid out."""
        self.wait("%s.items.length >= %d && %s.items.every((c) => c.w > 0 || c.kind === 'row')" % (PANEL, count, PANEL))

    def spot(self, i, fx=0.5, fy=0.5):
        return self.page.evaluate(SPOT, [i, fx, fy])

    def drag(self, i, dx, dy):
        x, y = self.spot(i)
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        self.page.mouse.move(x + dx, y + dy, steps=4)
        self.page.mouse.up()

    def clean(self):
        scene = self.page.query_selector("[data-pyctures-src]")
        assert scene.get_attribute("data-pyctures-error") is None
        assert not self.errors, self.errors


def scene_file(tmp_path, source):
    path = tmp_path / "scene.py"
    path.write_text(source)
    return path


@pytest.mark.parametrize("scene", SCENES)
def test_each_example_runs_and_shows_its_controls(browser, pyctures_run, scene):
    w = Watched(browser, pyctures_run(EXAMPLES / scene).url)
    w.ready()
    w.page.wait_for_timeout(600)
    kinds = w.page.evaluate("%s.items.map((c) => c.kind)" % PANEL)
    if "keyboard" in kinds:
        # A chord from the computer's keys: the stand-in synth sounds it, and its keys are held.
        w.page.locator("[data-pyctures-src] canvas[tabindex]").first.click(position={"x": 5, "y": 5})
        for key in ("KeyA", "KeyD", "KeyG"):
            w.page.keyboard.down(key)
        i = kinds.index("keyboard")
        w.wait("%s.items[%d].notes.length === 3" % (PANEL, i))
        w.page.wait_for_timeout(300)
    SHOTS.mkdir(exist_ok=True)
    w.page.screenshot(path=str(SHOTS / scene.replace(".py", ".png")))
    if "keyboard" in kinds:
        for key in ("KeyA", "KeyD", "KeyG"):
            w.page.keyboard.up(key)
        w.wait("%s.items[%d].notes.length === 0" % (PANEL, kinds.index("keyboard")))
    w.clean()
    assert w.page.query_selector("[data-pyctures-src]").get_attribute("data-pyctures-status") == "running"
    w.page.close()


def test_a_dial_turned_in_the_page_is_a_number_in_python(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

speed = dial("speed", 0, 100, 20)
box = {"v": 0}
tied = dial("tied", box, "v", min=0, max=100)
fire = button("fire")
mute = toggle("mute")
presses = 0

def update(dt):
    global presses
    if fire.pressed:
        presses += 1
    js.result = [round(speed.value), round(box["v"]), presses, bool(mute)]

def on_key_down(key):
    if key == "r":
        box["v"] = 5        # the target changed some other way: its dial follows
""")).url)
    w.ready(4)
    w.wait("JSON.stringify(window.result) === '[20,0,0,false]'")
    w.drag(0, 0, -45)                       # up 45 points of the 180 that are the whole dial
    w.wait("JSON.stringify(window.result) === '[45,0,0,false]'")
    w.drag(1, 90, 0)
    w.wait("JSON.stringify(window.result) === '[45,50,0,false]'")
    for _ in range(2):
        w.page.mouse.click(*w.spot(2))
        w.page.wait_for_timeout(100)
    w.page.mouse.click(*w.spot(3))
    w.wait("JSON.stringify(window.result) === '[45,50,2,true]'")
    w.page.keyboard.press("r")
    w.wait("JSON.stringify(window.result) === '[45,5,2,true]' && Math.round(%s.items[1].value) === 5" % PANEL)
    w.clean()
    w.page.close()


def test_a_keyboard_plays_a_target_in_the_page_at_once_and_python_knows_the_notes(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

# A thing in the page that can be played and has a setting, as a synth has.
lead = js.Function('''return { log: [], cutoff: 800,
  describe: (name) => ({ min: 20, max: 20000, default: 1000, unit: "Hz" }),
  get(name) { return this[name] }, set(name, value) { this[name] = value },
  noteOn(note, velocity) { this.log.push("on " + note) }, noteOff(note) { this.log.push("off " + note) } }''')()
js.lead = lead

heard = []
piano = keyboard(lead, octave=4, on_note_on=lambda note, velocity: heard.append(note))
cutoff = dial("cutoff", lead, "cutoff")

def update(dt):
    js.result = [piano.notes, heard, cutoff.min, cutoff.max, round(cutoff.value), piano.octave]
""")).url)
    w.ready(2)
    w.wait("JSON.stringify(window.result) === '[[],[],20,20000,800,4]'")
    w.page.mouse.click(*w.spot(1, 0.5, 0.05))      # a click on the page (the dial's label): the keys now go to the scene
    w.page.keyboard.down("KeyA")
    # In the page the note has already sounded: no frame of Python came between.
    assert w.page.evaluate("window.lead.log") == ["on 60"]
    w.page.keyboard.down("KeyW")
    w.wait("JSON.stringify(window.result) === '[[60,61],[60,61],20,20000,800,4]'")
    w.page.keyboard.up("KeyA")
    w.page.keyboard.up("KeyW")
    w.page.keyboard.press("KeyX")
    w.wait("JSON.stringify(window.result) === '[[],[60,61],20,20000,800,5]'")
    assert w.page.evaluate("window.lead.log") == ["on 60", "on 61", "off 60", "off 61"]
    # The dial is tied in the page too: turning it sets the thing there, and Python is told.
    w.page.keyboard.down("Shift")
    w.drag(1, 0, -180)
    w.page.keyboard.up("Shift")
    w.wait("window.lead.cutoff > 1500 && window.result[4] === Math.round(window.lead.cutoff)")
    w.clean()
    w.page.close()


def test_a_scope_and_a_meter_are_fed_from_python(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
import math
from pyctures import *
from pydials import *

t = 0
wave = scope(lambda: [math.sin(i / 8 + t) for i in range(256)])
level = meter(lambda: 0.5)
graph = scope("height")

def update(dt):
    global t
    t += dt
    graph.push(math.sin(t) * 50)
""")).url)
    w.ready(3)
    w.wait("%s.items[0].list && %s.items[0].list.length === 256" % (PANEL, PANEL))
    w.wait("Math.abs(%s.items[1].bars[0] - 0.5) < 0.01" % PANEL)
    w.wait("%s.items[2].filled > 20" % PANEL)
    # The line keeps arriving: Python is asked again each time it has answered.
    first = w.page.evaluate("%s.items[0].list[0]" % PANEL)
    w.wait("%s.items[0].list[0] !== %r" % (PANEL, first))
    w.clean()
    w.page.close()


def test_rows_places_colours_and_values_set_from_python_reach_the_page(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

layout(at="bottom")
theme(accent="rgb(255, 0, 0)")
label("Filter")
a = dial("a", 0, 10, 2)
row()
wave = select("wave", ["sine", "saw", "square"])
gone = button("gone")
moved = toggle("moved", x=40, y=30)
piano = keyboard(octave=2, octaves=1)

a.value = 7
wave.value = "square"
gone.remove()
moved.place(60, 50)
piano.press(40)

def update(dt):
    js.result = piano.notes
""")).url)
    w.ready(5)
    w.wait("JSON.stringify(window.result) === '[40]'")
    got = w.page.evaluate("""(() => {
  const p = %s, by = (kind) => p.items.find((c) => c.kind === kind), layer = p.layer.getContext('2d'), d = by('dial')
  // The lit part of the dial's ring, at its low end (lower left of the dial).
  const ring = [...layer.getImageData(Math.round((d.x + d.w / 2 - 18) * p.ratio), Math.round((d.y + d.h / 2 + 12) * p.ratio), 3, 3).data]
  return {
    kinds: p.items.map((c) => c.kind).join(), dial: d.value, wave: by('select').value, toggle: [by('toggle').x, by('toggle').y],
    rows: by('select').y > d.y, low: d.y > p.H / 3, sameRow: by('label').y < d.y + d.h && by('label').x < d.x,
    octave: by('keyboard').octave, held: by('keyboard').notes, red: ring.some((v, i) => i %% 4 === 0 && v > 200 && ring[i + 1] < 80),
  }
})()""" % PANEL)
    assert got == {"kinds": "label,dial,row,select,toggle,keyboard", "dial": 7, "wave": "square", "toggle": [60, 50],
                   "rows": True, "low": True, "sameRow": True, "octave": 2, "held": [40], "red": True}
    w.clean()
    w.page.close()
