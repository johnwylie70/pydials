"""Scenes in a real (headless) Chromium, run by `pyctures run`: the controls are drawn and worked in the page, and Python hears.

Needs Playwright:  pip install playwright && playwright install chromium
Screenshots land in tests/screenshots/.
"""
import time

import pytest

from conftest import EXAMPLES, ROOT, SHOTS

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
        b = p.chromium.launch(args=["--mute-audio"])       # the examples make sound: none of it is heard
        yield b
        b.close()


class Watched:
    """A page showing one scene, with its errors collected."""

    def __init__(self, browser, url, size=(900, 700), touch=False):
        self.page = browser.new_page(viewport={"width": size[0], "height": size[1]}, has_touch=touch, is_mobile=touch)
        self.errors = []
        self.page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        # A Pyctures that has the dials built in serves a copy of its own: these tests are of the page's half that is here.
        self.page.route("**/dials/dials.js", lambda route: route.fulfill(path=str(ROOT / "src" / "pydials" / "web" / "dials.js"), content_type="text/javascript"))
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
        self.wait("%s.items.length >= %d && %s.items.every((c) => c.w > 0 || c.kind === 'row' || c.hidden || c.ghost)" % (PANEL, count, PANEL))

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
    rows: by('select').y > d.y, low: d.y > p.H / 3, heading: by('label').heading && by('label').y + by('label').h <= d.y && by('label').box === d.box,
    octave: by('keyboard').octave, held: by('keyboard').notes, red: ring.some((v, i) => i %% 4 === 0 && v > 200 && ring[i + 1] < 80),
  }
})()""" % PANEL)
    assert got == {"kinds": "label,dial,row,select,toggle,keyboard", "dial": 7, "wave": "square", "toggle": [60, 50],
                   "rows": True, "low": True, "heading": True, "octave": 2, "held": [40], "red": True}
    w.clean()
    w.page.close()


# The plates as they stand: their titles line by line down the picture, and anything wrong with a heading
# (not on its controls' plate, or not above them all) or with where a control is (outside the picture, or over another).
PLATES = """(() => {
  const p = %s, wrong = []
  const shown = (c) => !c.items && !c.ghost && !c.hidden && c.w > 0
  const inside = (box) => box.items.flatMap((kid) => (kid.items ? inside(kid) : shown(kid) ? [kid] : []))
  const lines = []
  for (const box of p.boxes.filter((b) => b.w > 0 && b.kind !== 'page' && p.plated(b)).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const head = box.heading && box.heading.heading ? box.heading : null, title = head ? head.label : box.label
    if (!title) continue
    const at = head ? head.y + head.h / 2 : (p.titles.find((t) => t.text === title && t.x >= box.x && t.x <= box.x + box.w && t.y >= box.y && t.y <= box.y + box.h) || {}).y
    if (at === undefined || at < box.y || at > box.y + box.h) wrong.push(title + ' has no title on its plate')
    for (const c of inside(box)) if (c.y < at || c.x < box.x - 1 || c.x + c.w > box.x + box.w + 1 || c.y + c.h > box.y + box.h + 1) wrong.push(title + ' does not hold ' + c.label)
    const line = lines.find((l) => Math.abs(l.y - box.y) < 1)
    line ? line.titles.push(title) : lines.push({ y: box.y, titles: [title] })
  }
  const all = p.items.filter(shown)
  for (const c of all) if (c.x < 0 || c.y < 0 || c.x + c.w > p.W + 0.5 || (!c.view && c.y + c.h > p.H + 0.5)) wrong.push(c.label + ' is outside the picture')
  for (const a of all) for (const b of all) if (a.id < b.id && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) wrong.push(a.label + ' is over ' + b.label)
  return { lines: lines.map((l) => l.titles), wrong, free: p.free.map(Math.round), tabs: p.tabs.map((t) => t.page.label), moved: !!p.viewport }
})()""" % PANEL

# A synth in the page with the settings of the scene in the owner's picture, that makes no sound.
LEAD = """
from pyctures import *
from pydials import *

lead = js.Function('''const P = { wave: { kind: "choice", choices: "sine|saw|pulse", default: 2 }, filter: { kind: "choice", choices: "lowpass|highpass", default: 0 },
  cutoff: { min: 20, max: 20000, default: 2800, unit: "Hz" }, "lfo2.rate": { min: 0.01, max: 20, default: 0.5, unit: "Hz" }, voices: { min: 1, max: 8, default: 1, kind: "int" } }
const values = {}
return { describe: (n) => P[n] || { min: 0, max: 1, default: 0.5 }, get: (n) => values[n] ?? (P[n] || { default: 0.5 }).default, set: (n, v) => { values[n] = v },
  noteOn() {}, noteOff() {}, samples: () => new Float32Array(64) }''')()
"""


def test_the_scene_in_the_owners_picture_is_grouped_plates_with_no_heading_stranded(browser, pyctures_run, tmp_path):
    # Line for line what was on the owner's screen: labels, controls and row(), with nothing said of layout.
    w = Watched(browser, pyctures_run(scene_file(tmp_path, LEAD + """
label("oscillator")
select("wave", lead, "wave")
dial("width", lead, "width")
dial("pwm", lead, "lfo2.pulse_width")
dial("pwm speed", lead, "lfo2.rate")
dial("sub", lead, "sub")

row()
label("unison")
dial("voices", lead, "voices")
dial("detune", lead, "detune")
dial("spread", lead, "spread")
label("filter")
select("filter", lead, "filter")
dial("cutoff", lead, "cutoff")
dial("resonance", lead, "resonance")

row()
label("shape")
slider("attack", lead, "attack")
slider("decay", lead, "decay")
slider("sustain", lead, "sustain")
slider("release", lead, "release")

row()
label("delay")
dial("delay", lead, "echo")
dial("time", lead, "delay.time")
dial("feedback", lead, "delay.feedback")
label("reverb")
dial("reverb", lead, "reverb")
dial("size", lead, "reverb.size")
dial("chorus", lead, "chorus")
scope(lead)

keyboard(lead, octave=3, octaves=2)
""")).url, size=(560, 1100), touch=True)
    w.ready(30)
    w.page.wait_for_timeout(300)
    got = w.page.evaluate(PLATES)
    assert got["wrong"] == []
    assert got["lines"] == [["oscillator"], ["unison", "filter"], ["shape"], ["delay", "reverb"]]
    SHOTS.mkdir(exist_ok=True)
    w.page.screenshot(path=str(SHOTS / "owner_split.png"))
    w.clean()
    w.page.close()


def test_with_group_the_straight_line_form_pages_and_room_lay_out_in_the_page(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, LEAD + """
with group("moves", at="left"):
    speed = dial("speed", 0, 100, 20)
    jump = button("jump")
page("osc")
with group("oscillator", colour="deepskyblue"):
    select("wave", lead, "wave")
    with column():
        dial("width", lead, "width", size="small")
        dial("sub", lead, "sub", size="small")
group("unison")
dial("voices", lead, "voices")
dial("detune", lead, "detune")
with page("fx") as fx:
    with grid(2, "delay"):
        dial("time", lead, "delay.time")
        dial("feedback", lead, "delay.feedback")
        slider("mix", lead, "echo", span=2)
page()
graph = scope("speed")

def update(dt):
    graph.push(speed.value)
    js.result = [list(room()), speed.value]

def on_key_down(key):
    if key == "f":
        fx.show()
""")).url, size=(900, 700))
    w.ready(8)
    w.wait("window.result && window.result[0][0] > 0")
    got = w.page.evaluate(PLATES)
    assert got["wrong"] == []
    assert got["tabs"] == ["osc", "fx"]
    assert got["lines"] == [["moves"], ["oscillator", "unison"]]      # the strip from the top; the page's plates under the tabs
    # Python is told the rectangle the page worked out: to the right of the strip, below the pages.
    assert w.page.evaluate("window.result[0]") == got["free"] and got["free"][0] > 80 and got["free"][0] + got["free"][2] == 900
    # A dial inside a group is still a number in Python.
    w.drag(0, 0, -45)
    w.wait("window.result[1] === 45")
    # Turned from Python, the other page is on show, and its grid is there.
    w.page.locator("[data-pyctures-src] canvas[tabindex]").first.focus()
    w.page.keyboard.press("f")
    w.wait("%s.shown.label === 'fx'" % PANEL)
    w.page.wait_for_timeout(200)
    turned = w.page.evaluate(PLATES)
    assert turned["wrong"] == [] and turned["lines"] == [["moves"], ["delay"]]
    cells = w.page.evaluate("%s.items.filter((c) => c.w > 0 && ['time', 'feedback', 'mix'].includes(c.label)).map((c) => [c.label, Math.round(c.x), Math.round(c.y), Math.round(c.w)])" % PANEL)
    (_, tx, ty, tw), (_, fx_, fy, _), (_, mx, my, mw) = cells
    assert ty == fy and fx_ > tx and my > ty and mw > tw * 1.5
    SHOTS.mkdir(exist_ok=True)
    w.page.screenshot(path=str(SHOTS / "groups_pages.png"))
    w.clean()
    w.page.close()


@pytest.mark.parametrize("size,lines", [((560, 1100), [2, 2, 1, 2]), ((1200, 1600), [4, 3])])
def test_a_panel_written_as_seven_short_rows_fills_the_width_at_a_split_view_and_at_full_width(browser, pyctures_run, tmp_path, size, lines):
    # The owner's second writing of the panel: a row() after every group, so that nothing would wrap in a narrow view.
    w = Watched(browser, pyctures_run(scene_file(tmp_path, LEAD + """
label("oscillator"); select("wave", lead, "wave"); dial("width", lead, "width"); dial("sub", lead, "sub")
row()
label("pwm"); dial("amount", lead, "lfo2.pulse_width"); dial("speed", lead, "lfo2.rate")
row()
label("unison"); dial("voices", lead, "voices"); dial("detune", lead, "detune"); dial("spread", lead, "spread")
row()
label("filter"); select("filter", lead, "filter"); dial("cutoff", lead, "cutoff"); dial("resonance", lead, "resonance")
row()
label("shape"); dial("attack", lead, "attack"); dial("decay", lead, "decay"); dial("sustain", lead, "sustain"); dial("release", lead, "release")
row()
label("delay"); dial("amount", lead, "echo"); dial("time", lead, "delay.time"); dial("feedback", lead, "delay.feedback")
row()
label("reverb"); dial("amount", lead, "reverb"); dial("size", lead, "reverb.size"); dial("chorus", lead, "chorus")
scope(lead)
keyboard(lead, octave=3, octaves=2)
""")).url, size=size, touch=True)
    w.ready(30)
    w.page.wait_for_timeout(800)
    got = w.page.evaluate(PLATES)
    assert got["wrong"] == []
    assert [len(line) for line in got["lines"]] == lines
    # Each line of plates reaches both edges, and its plates are as tall as each other.
    edges = w.page.evaluate("""(() => { const p = %s, rows = new Map()
  for (const b of p.boxes.filter((b) => b.w > 0 && p.plated(b) && b.heading)) rows.set(Math.round(b.y), [...(rows.get(Math.round(b.y)) || []), b])
  return [...rows.values()].map((line) => [line[0].x, p.W - (line.at(-1).x + line.at(-1).w), Math.max(...line.map((b) => b.h)) - Math.min(...line.map((b) => b.h))]) })()""" % PANEL)
    assert all(left <= size[0] * 0.03 and right <= size[0] * 0.03 and uneven < 0.5 for left, right, uneven in edges), edges
    SHOTS.mkdir(exist_ok=True)
    w.page.screenshot(path=str(SHOTS / ("owner_rows_%d.png" % size[0])))
    w.clean()
    w.page.close()
