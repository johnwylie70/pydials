"""The controls of the second part in a real (headless) Chromium, run by `pyctures run`: worked in the page, heard in Python."""
from test_browser import PANEL, Watched, browser, scene_file  # noqa: F401  (browser is the fixture)


def test_a_number_is_stepped_and_typed_and_text_is_typed_and_python_has_them(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

heard = []
lives = number("lives", 0, 9, 3)
name = text_box("name", "Ada", on_enter=lambda text: heard.append("enter " + text))
score = readout("score", lambda: lives * 10, size="large")
status = readout("status", "Ready")

def update(dt):
    status.value = "Hello " + name.value
    js.result = [lives.value, name.value, heard, list(keys)]
""")).url)
    w.ready(4)
    w.wait("JSON.stringify(window.result) === '[3,\"Ada\",[],[]]'")
    w.page.mouse.click(*w.spot(0, 0.88, 0.65))                  # the +
    w.page.mouse.click(*w.spot(0, 0.88, 0.65))
    w.wait("window.result[0] === 5 && %s.items[2].text === '50'" % PANEL)
    w.page.mouse.click(*w.spot(0, 0.5, 0.65))                   # the number itself: it is typed
    w.wait("document.activeElement.matches('input[data-dials-typing]')")
    w.page.keyboard.type("8")
    w.page.keyboard.press("Enter")
    w.wait("window.result[0] === 8 && %s.items[2].text === '80'" % PANEL)
    w.page.mouse.click(*w.spot(1, 0.5, 0.65))
    w.wait("document.activeElement.matches('input[data-dials-typing]')")
    w.page.keyboard.type(" L")
    # What is typed is the text box's, not the scene's: `keys` stays empty.
    w.wait("window.result[1] === 'Ada L' && window.result[3].length === 0 && %s.items[3].text === 'Hello Ada L'" % PANEL)
    w.page.keyboard.press("Enter")
    w.wait("JSON.stringify(window.result[2]) === '[\"enter Ada L\"]' && !document.querySelector('input[data-dials-typing]')")
    w.clean()
    w.page.close()


def test_a_box_is_ticked_a_choice_is_made_and_a_list_is_opened_and_picked_from(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

sound = checkbox("sound")
mode = choose("mode", ["easy", "medium", "hard"])
size = radio("size", ["small", "medium", "large"])
planet = dropdown("planet", ["Mercury", "Venus", "Earth", "Mars"], "Earth")

def update(dt):
    js.result = [bool(sound), mode.value, size.index, planet.value]
""")).url)
    w.ready(4)
    w.wait("JSON.stringify(window.result) === '[false,\"easy\",0,\"Earth\"]'")
    w.page.mouse.click(*w.spot(0))
    w.page.mouse.click(*w.spot(1, 5 / 6, 0.7))                  # the third of three, side by side
    w.page.mouse.click(*w.spot(2, 0.5, 0.86))                   # the last of three, one under another
    w.page.mouse.click(*w.spot(3, 0.5, 0.65))
    w.wait("%s.popup.w > 0" % PANEL)                           # the list is open, and has been drawn
    # The list's first line: Mercury.
    x, y = w.page.evaluate("(() => { const c = document.querySelector('[data-pyctures-src] canvas'), l = c[Symbol.for('dials.panel')].popup, b = c.getBoundingClientRect(); return [b.left + l.x + l.w / 2, b.top + l.y + 24 * l.u - l.scroll] })()")
    w.page.mouse.click(x, y)
    w.wait("JSON.stringify(window.result) === '[true,\"hard\",2,\"Mercury\"]' && !%s.popup" % PANEL)
    w.clean()
    w.page.close()


def test_a_pad_is_pressed_a_colour_is_picked_and_a_fader_is_raised_and_python_has_them(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

pad = xy_pad("spot", [0, 100], [0, 100])
ink = colour_picker("ink", "tomato")
vol = fader("vol", 0, 100, 0)
price = range_slider("price", 0, 100, [20, 80])
bar = progress("vol", lambda: vol / 100)
lamp = light("loud", lambda: vol > 50)

def update(dt):
    js.result = [round(pad.x), round(pad.y), ink.value, round(vol.value), [round(v) for v in price]]
""")).url)
    w.ready(6)
    w.wait("JSON.stringify(window.result) === '[50,50,\"tomato\",0,[20,80]]'")
    # A quarter of the way across the pad's square and four fifths of the way up it.
    x, y = w.page.evaluate("(() => { const c = document.querySelector('[data-pyctures-src] canvas'), p = c[Symbol.for('dials.panel')].items[0], s = p.pad(p.u), b = c.getBoundingClientRect(); return [b.left + s.x + s.side * 0.25, b.top + s.y + s.side * 0.2] })()")
    w.page.mouse.click(x, y)
    w.page.mouse.click(*w.spot(1, 0.5, 0.65))
    w.wait("%s.popup.w > 0" % PANEL)
    # The ninth of the named colours is the first of the second line: blue.
    x, y = w.page.evaluate("(() => { const c = document.querySelector('[data-pyctures-src] canvas'), n = c[Symbol.for('dials.panel')].popup.names, b = c.getBoundingClientRect(); return [b.left + n.x + 0.5 * n.each, b.top + n.y + 1.5 * n.h] })()")
    w.page.mouse.click(x, y)
    w.drag(2, 0, -500)                      # the fader, all the way up
    w.wait("JSON.stringify(window.result) === '[25,80,\"blue\",100,[20,80]]' && %s.items[4].done === 1 && %s.items[5].on" % (PANEL, PANEL))
    w.clean()
    w.page.close()


def test_a_game_written_for_the_arrow_keys_is_played_with_a_pad_of_arrows_and_a_stick_is_pushed(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

pad = dpad(as_keys=True)
stick = joystick()
jump = action_button("jump", key="space")
x = 0

def update(dt):
    global x
    if "ArrowRight" in keys:
        x += 1
    js.result = [x > 0, sorted(keys), pad.right, pad.x, round(stick.x, 1), round(stick.y, 1), jump.held]
""")).url)
    w.ready(3)
    w.wait("JSON.stringify(window.result) === '[false,[],false,0,0,0,false]'")
    w.page.mouse.move(*w.spot(0, 0.9, 0.5))                     # the pad's right arrow, held
    w.page.mouse.down()
    w.wait("JSON.stringify(window.result) === '[true,[\"ArrowRight\"],true,1,0,0,false]'")
    w.page.mouse.up()
    w.wait("JSON.stringify(window.result.slice(1)) === '[[],false,0,0,0,false]'")
    x, y = w.spot(1)
    w.page.mouse.move(x, y)
    w.page.mouse.down()
    w.page.mouse.move(x, y + 300, steps=3)                      # the stick, pulled down as far as it goes
    w.wait("JSON.stringify(window.result.slice(4)) === '[0,1,false]'")
    w.page.mouse.up()
    w.page.mouse.move(*w.spot(2))
    w.page.mouse.down()
    w.wait("JSON.stringify(window.result.slice(1)) === '[[\" \"],false,0,0,0,true]'")
    w.page.mouse.up()
    w.clean()
    w.page.close()


def test_a_step_is_turned_on_a_pad_is_hit_and_a_corner_of_the_shape_is_dragged(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

heard = []
lead = {"attack": 0.5, "decay": 0.5, "sustain": 0.5, "release": 0.5}
grid = step_grid("drums", 8, ["kick", "snare"])
kit = pads("kit", ["kick", "snare"], on_note_on=lambda note, velocity, name: heard.append(name))
shape = envelope("shape", lead)
grid.step = 2

def update(dt):
    js.result = [grid.row("snare"), kit.held, heard, round(lead["release"], 1)]
""")).url)
    w.ready(3)
    w.wait("JSON.stringify(window.result) === '[[0,0,0,0,0,0,0,0],[],[],0.5]' && %s.items[0].step === 2" % PANEL)
    cell = "(() => { const c = document.querySelector('[data-pyctures-src] canvas'), g = c[Symbol.for('dials.panel')].items[0], s = g.spotOf(1, 3, g.u), b = c.getBoundingClientRect(); return [b.left + s.x + s.w / 2, b.top + s.y + s.h / 2] })()"
    w.page.mouse.click(*w.page.evaluate(cell))                  # the snare's fourth step
    w.page.mouse.move(*w.spot(1, 0.75, 0.6))                    # the second pad, held
    w.page.mouse.down()
    w.wait("JSON.stringify(window.result.slice(0, 3)) === '[[0,0,0,1,0,0,0,0],[\"snare\"],[\"snare\"]]'")
    w.page.mouse.up()
    corner = "(() => { const c = document.querySelector('[data-pyctures-src] canvas'), e = c[Symbol.for('dials.panel')].items[2], p = e.shape(e.u).points[4], b = c.getBoundingClientRect(); return [b.left + p[0], b.top + p[1]] })()"
    x, y = w.page.evaluate(corner)                              # the last corner: the release
    w.page.mouse.move(x, y)
    w.page.mouse.down()
    w.page.mouse.move(x + 900, y, steps=3)
    w.page.mouse.up()
    w.wait("JSON.stringify(window.result) === '[[0,0,0,1,0,0,0,0],[],[\"snare\"],2]'")
    w.clean()
    w.page.close()


def test_a_gate_is_drawn_and_a_drum_sequencer_plays_a_thing_in_the_page_by_itself(browser, pyctures_run, tmp_path):
    w = Watched(browser, pyctures_run(scene_file(tmp_path, """
from pyctures import *
from pydials import *

# A thing in the page that can be played, and keeps a gate's pattern as text, as a synth would.
kit = js.Function('return { log: [], gatePattern: "x.x.", get(name) { return this[name] }, set(name, value) { this[name] = value }, describe(name) { return name === "gatePattern" ? { kind: "pattern" } : undefined }, noteOn(note, velocity) { this.log.push(note) }, noteOff(note) {} }')()
js.kit = kit
heard = []
gate = trance_gate("gate", kit)
beat = drum_seq("beat", ["kick", "snare"], kit, steps=8, tempo=240, value=["x.x.x.x.", "....X..."],
                on_step=lambda drum, step, velocity: heard.append(drum))

def update(dt):
    js.result = [gate.text, beat.playing, beat.step >= 0, "kick" in heard and "snare" in heard, beat.tempo]
""")).url)
    w.ready(2)
    w.wait("JSON.stringify(window.result) === '[\"x.x.\",false,false,false,240]'")
    gate = "document.querySelector('[data-pyctures-src] canvas')[Symbol.for('dials.panel')].items.find((c) => c.kind === 'tranceGate')"
    seq = "document.querySelector('[data-pyctures-src] canvas')[Symbol.for('dials.panel')].items.find((c) => c.kind === 'drumSeq')"
    # The gate's second bar, tapped on: the thing in the page and Python both have the new pattern.
    x, y = w.page.evaluate("(() => { const g = %s, c = g.spotOf(1, g.u), b = document.querySelector('[data-pyctures-src] canvas').getBoundingClientRect(); return [b.left + c.x + c.w / 2, b.top + c.y + c.h / 2] })()" % gate)
    w.page.mouse.click(x, y)
    w.wait("window.result[0] === 'xxx.' && window.kit.gatePattern === 'xxx.'")
    x, y = w.page.evaluate("(() => { const s = %s, p = s.parts(s.u).play, b = document.querySelector('[data-pyctures-src] canvas').getBoundingClientRect(); return [b.left + p.x + p.w / 2, b.top + p.y + p.h / 2] })()" % seq)
    w.page.mouse.click(x, y)                                    # play: the page plays the kit, and Python hears each step
    w.wait("window.result[1] && window.result[2] && window.result[3] && window.kit.log.includes(36) && window.kit.log.includes(38)")
    w.page.mouse.click(x, y)
    w.wait("!window.result[1] && !window.result[2]")
    w.clean()
    w.page.close()
