"""The Python half with no browser: the commands it sends the page, and what it does with what the page reports."""
import json
import textwrap

import pytest

from conftest import JS_REPO, ROOT

import pyctures

# A Pyctures that has the dials built in keeps them at this handle; one that has not is sent the library as text.
BUILT_IN = getattr(pyctures, "H_DIALS", None) or getattr(pyctures, "H_CONTROLS", None)

INFO = json.dumps({"width": 400, "height": 300, "pixel_ratio": 2})


def start(src):
    return json.loads(pyctures.start(textwrap.dedent(src), INFO))


def tick(report=None):
    """One frame; `report` is what the page tells the library (it listens with the first callback made)."""
    events = [{"k": "cb", "id": 1, "e": dict({"c": [], "n": [], "m": [], "b": 0}, **report)}] if report else []
    return json.loads(pyctures.tick(json.dumps({"dt": 1 / 60, "events": events})))


def made(reply):
    """The controls a frame made: (kind, id, spec)."""
    return [(c[5][0], c[5][1], c[5][2]["$d"]) for c in reply["cmds"] if c[0] == "call" and c[4] == "make"]


def sent(reply, name):
    return [c[5] for c in reply["cmds"] if c[0] == "call" and c[4] == name]   # update() runs once as the scene starts


def out(reply):
    return reply["out"].split()


@pytest.fixture(autouse=True)
def stopped():
    yield
    pyctures.stop()


def test_the_page_is_given_the_library_once_and_one_command_for_each_control():
    r = start("""
        from pydials import *
        a = dial("speed", 0, 10)
        b = dial("size", 5, 50, 20, step=5, unit="px")
    """)
    assert r["error"] is None
    news = [c for c in r["cmds"] if c[0] == "new"]
    if BUILT_IN:
        assert news == [] and all(c[3] == BUILT_IN for c in r["cmds"] if c[0] == "call")
    else:
        assert len(news) == 1 and news[0][4] == "Function" and "return { dials" in news[0][5][0]
        assert "export {" not in news[0][5][0]
    assert made(r) == [("dial", 1, {"min": 0, "max": 10, "label": "speed", "default": 0, "value": 0}),
                       ("dial", 2, {"min": 5, "max": 50, "value": 20, "step": 5, "unit": "px", "label": "size", "default": 20})]
    # The scene has no draw(), and still runs: its controls are listened to.
    assert r["running"] is True


def test_a_control_is_a_number_wherever_one_is_wanted():
    r = start("""
        from pydials import *
        speed = dial("speed", 0, 10, 4)
        mute = toggle("mute", True)
        print(speed.value, speed * 2, 1 + speed, speed / 8, -speed, speed > 3, speed == 4, int(speed), f"{speed:.1f}")
        print(bool(mute), "on" if mute else "off", [10, 20, 30, 40, 50][dial("i", 0, 4, 2, step=1)])
        circle(speed, 20, speed * 3, "red")
    """)
    assert r["error"] is None
    assert out(r) == ["4", "8", "5", "0.5", "-4", "True", "True", "4", "4.0", "True", "on", "30"]
    assert sent(r, "circle") == [[4, 20, 12, "red"]]


def test_what_a_hand_changes_arrives_with_the_next_frame_and_on_change_is_called():
    start("""
        from pydials import *
        heard = []
        speed = dial("speed", 0, 10, on_change=heard.append)
        mute = toggle("mute", on_change=lambda on: heard.append(on))
        wave = select("wave", ["sine", "saw", "square"], "saw", on_change=heard.append)
        fire = button("fire", lambda: heard.append("fire"))
        def update(dt):
            print(speed.value, mute.on, wave.value, wave.index, fire.held, fire.pressed, fire.pressed, heard)
    """)
    r = tick({"c": [1, 7.5, 2, True, 3, 2, 4, True]})
    assert r["error"] is None
    assert r["out"].strip() == "7.5 True square 2 True True False [7.5, True, 'square', 'fire']"
    r = tick({"c": [4, False]})
    assert r["out"].strip().startswith("7.5 True square 2 False False False")


def test_a_value_set_from_python_is_cleaned_and_sent_to_the_page():
    r = start("""
        from pydials import *
        a = dial("n", 0, 10, step=2)
        w = select("wave", ["sine", "saw"])
        level = meter("level")
        def update(dt):
            a.value = 7.2
            w.value = "saw"
            level.value = 0.5
            print(a.value, w.index)
    """)
    assert r["error"] is None
    assert sent(r, "set") == [[1, "value", 8], [2, "index", 1], [3, "value", 0.5]]
    assert out(r) == ["8", "1"]
    # Nothing is sent for a value that did not change.
    assert [c for c in sent(tick(), "set") if c[0] != 3] == []


def test_a_python_target_gives_its_range_and_is_set_when_the_dial_is_turned():
    r = start("""
        from pydials import *
        class Synth:
            def __init__(self): self.values = {"cutoff": 800, "wave": 1, "on": 0}; self.log = []
            def describe(self, name):
                return {"cutoff": {"min": 20, "max": 20000, "default": 1000, "unit": "Hz"},
                        "wave": {"kind": "choice", "choices": "sine|saw|square"}, "on": {"kind": "bool"}}[name]
            def get(self, name): return self.values[name]
            def set(self, name, value): self.values[name] = value; self.log.append((name, value))
        lead = Synth()
        d = dial(lead, "cutoff")
        w = select("wave", lead, "wave")
        t = toggle("power", lead, "on")
        def update(dt):
            print(lead.log, d.value)
    """)
    assert r["error"] is None
    assert made(r) == [("dial", 1, {"label": "cutoff", "min": 20, "max": 20000, "unit": "Hz", "default": 1000, "value": 800}),
                       ("select", 2, {"label": "wave", "choices": ["sine", "saw", "square"], "value": "saw"}),
                       ("toggle", 3, {"label": "power", "value": False})]
    # A Python target is looked at every frame, so the page is asked to call every frame.
    assert sent(r, "beat") == [[]]
    r = tick({"c": [1, 5000, 2, 2, 3, True]})
    assert r["out"].strip() == "[('cutoff', 5000), ('wave', 2), ('on', 1)] 5000"


def test_a_python_target_changed_some_other_way_moves_its_control():
    start("""
        from pydials import *
        ball = {"size": 30}
        d = dial("size", ball, "size", min=10, max=90)
        def update(dt):
            pass
        def on_key_down(key):
            ball["size"] = 70
    """)
    r = json.loads(pyctures.tick(json.dumps({"dt": 0.016, "events": [
        {"k": "input", "e": {"type": "keydown", "key": "a", "code": "KeyA"}},
        {"k": "cb", "id": 1, "e": {"c": [], "n": [], "m": [], "b": 1}}]})))
    assert r["error"] is None
    assert sent(r, "set") == [[1, "value", 70]]
    assert sent(r, "ack") == [[]]


def test_a_target_in_the_page_is_tied_there_and_its_range_is_told_to_python():
    r = start("""
        from pydials import *
        class Synth:
            page = js.lead              # where its sound is made
        lead = Synth()
        d = dial("cutoff", lead, "filter_cutoff")
        w = select("wave", js.lead, "wave")
        k = keyboard(lead, octave=3)
        s = scope(lead)
        m = meter(lead)
        def update(dt):
            print(d.min, d.max, d.default, d.value, w.choices, w.value, k.notes, k.octave)
    """)
    assert r["error"] is None
    [get] = [c for c in r["cmds"] if c[0] == "get"]
    ref = {"$h": get[2]}
    assert made(r) == [("dial", 1, {"label": "cutoff", "target": ref, "param": "filter_cutoff"}),
                       ("select", 2, {"label": "wave", "target": ref, "param": "wave"}),
                       ("keyboard", 3, {"octave": 3, "target": ref}),
                       ("scope", 4, {"source": ref}),
                       ("meter", 5, {"source": ref})]
    # Nothing here needs Python every frame: the page does it all.
    assert sent(r, "beat") == []
    r = tick({"m": [1, 60, 12000, 2400, "", 2400, 2, 0, 1, 0, "sine|saw", 1], "n": [3, 48, 0.8, 3, 52, 0.8, 3, 48, 0], "c": [3, 4]})
    assert r["out"].strip() == "60 12000 2400 2400 ['sine', 'saw'] saw [52] 4"


def test_a_keyboard_plays_a_python_target_and_calls_on_note_on():
    start("""
        from pydials import *
        log = []
        class Bell:
            def note_on(self, note, velocity): log.append(("on", note, velocity))
            def note_off(self, note): log.append(("off", note))
        piano = keyboard(Bell(), on_note_on=lambda note, velocity: log.append("heard"))
        def update(dt):
            print(log, piano.notes)
    """)
    r = tick({"n": [1, 60, 0.5, 1, 64, 1, 1, 60, 0]})
    assert r["out"].strip() == "[('on', 60, 0.5), 'heard', ('on', 64, 1), 'heard', ('off', 60)] [64]"


def test_a_scope_and_a_meter_fed_from_python_send_a_short_line_each_frame_the_page_asks():
    r = start("""
        import math
        from pydials import *
        wave = scope(lambda: [math.sin(i / 10) for i in range(1000)])
        level = meter(lambda: 0.25)
        graph = scope("height")
        def update(dt):
            graph.push(3)
    """)
    assert r["error"] is None
    assert made(r)[0] == ("scope", 1, {"steady": True, "min": -1, "max": 1})
    assert sent(r, "beat") == [[]]
    r = tick({"b": 1})
    calls = sent(r, "call")
    feed = [c for c in calls if c[1] == "feed"]
    assert len(feed) == 1 and feed[0][0] == 1 and len(feed[0][2]) == 250 and feed[0][2][1] == round(__import__("math").sin(0.4), 3)
    assert [3, "push", 3.0] in calls
    assert sent(r, "set") == [[2, "value", 0.25]]
    assert sent(r, "ack") == [[]]
    # No beat from the page, no line sent: Python never gets ahead of the page.
    assert [c for c in sent(tick(), "call") if c[1] == "feed"] == []


def boxes(reply):
    """What a frame did to the layout, in order: a control or box made (its kind), and a box gone into or left (enter, leave)."""
    said = []
    for c in reply["cmds"]:
        if c[0] != "call":
            continue
        if c[4] == "make":
            spec = c[5][2]["$d"]
            said.append("%s %s" % (c[5][0], spec.get("label", "")) if c[5][0] in ("group", "row", "column", "grid", "page") else c[5][0])
        elif c[4] == "call" and c[5][1] in ("enter", "leave"):
            said.append("%s %d" % (c[5][1], c[5][0]))
    return said


def test_with_group_says_where_the_group_begins_and_ends_and_what_is_made_between_is_in_it():
    r = start("""
        from pydials import *
        with group("filter", colour="deepskyblue") as g:
            dial("cutoff", 20, 20000)
            with column():
                toggle("drive")
                with grid(2):
                    dial("a", 0, 1, size="small", span=2)
        dial("outside", 0, 1)
        print(g.title, g)
    """)
    assert r["error"] is None
    # Each box has a number like a control's, and the page is told when it is gone into and left: nothing is asked of it.
    assert boxes(r) == ["group filter", "enter 1", "dial", "column ", "enter 3", "toggle", "grid ", "enter 5", "dial", "leave 5",
                        "leave 3", "leave 1", "dial"]
    by_kind = {m[0]: m[2] for m in made(r)}
    assert by_kind["group"] == {"colour": "deepskyblue", "label": "filter"}
    assert by_kind["grid"] == {"columns": 2}
    assert [m[2] for m in made(r) if m[0] == "dial"][1]["size"] == "small" and [m[2] for m in made(r) if m[0] == "dial"][1]["span"] == 2
    assert out(r) == ["filter", "<group", "filter>"]
    assert not [c for c in r["cmds"] if c[0] == "read"]


def test_a_group_left_by_a_mistake_is_still_left():
    r = start("""
        from pydials import *
        try:
            with group("a"):
                dial("x", 0, 1)
                raise ValueError("oops")
        except ValueError:
            pass
        dial("y", 0, 1)
    """)
    assert r["error"] is None
    assert boxes(r) == ["group a", "enter 1", "dial", "leave 1", "dial"]


def test_groups_rows_and_pages_in_a_straight_line_are_one_command_each():
    r = start("""
        from pydials import *
        label("oscillator")
        dial("width", 0, 1)
        row()
        page("fx")
        group("delay", columns=3)
        dial("time", 0, 1)
        spacer()
        spacer(12)
        grid("lfo", 2)
        dial("rate", 0, 1)
        page()
        layout(design=(800, 480), compact=True)
        dial("placed", 0, 1, x=40, y=60, share=2)
    """)
    assert r["error"] is None
    assert boxes(r) == ["label", "dial", "row ", "page fx", "group delay", "dial", "spacer", "spacer", "grid lfo", "dial", "page ", "dial"]
    specs = [m[2] for m in made(r)]
    assert specs[4] == {"columns": 3, "label": "delay"} and specs[6] == {} and specs[7] == {"size": 12} and specs[8] == {"columns": 2, "label": "lfo"}
    assert specs[-1]["x"] == 40 and specs[-1]["share"] == 2
    assert sent(r, "layout") == [[{"$d": {"design": [800, 480], "compact": True}}]]
    # No box was gone into: each lasts until the next.
    assert not [c for c in sent(r, "call") if c[1] in ("enter", "leave")]


def test_room_is_the_whole_picture_until_the_page_says_what_the_controls_left():
    start("""
        from pydials import *
        with group("moves", at="left"):
            dial("speed", 0, 10)
        def update(dt):
            r = room()
            x, y, w, h = r
            print(r.x, r.y, r.width, r.height, r.right, r.bottom, w)
    """)
    assert out(tick()) == ["0", "0", "400", "300", "400", "300", "400"]
    assert out(tick({"f": [102, 0, 298, 300]})) == ["102", "0", "298", "300", "400", "300", "298"]
    assert out(tick()) == ["102", "0", "298", "300", "400", "300", "298"]


def test_a_rotary_is_a_select_drawn_as_a_knob_and_python_knows_its_choice():
    r = start("""
        from pydials import *
        mode = rotary("mode", ["room", "hall", "plate", "spring"], "hall", size="large", on_change=print)
        other = select("kind", ["a", "b"], style="rotary")
        def update(dt):
            print(mode.value, mode.index, other.value)
    """)
    assert [(m[0], m[2]) for m in made(r)] == [
        ("rotary", {"value": "hall", "size": "large", "label": "mode", "choices": ["room", "hall", "plate", "spring"]}),
        ("rotary", {"label": "kind", "choices": ["a", "b"], "value": "a"})]
    assert out(r) == ["hall", "1", "a"]
    # Turned by hand in the page: its place in the list arrives, on_change is called with the choice.
    assert out(tick({"c": [1, 3]})) == ["spring", "spring", "3", "a"]
    r = start("""
        from pydials import *
        mode = rotary("mode", ["room", "hall"])
        mode.value = "hall"
    """)
    assert sent(r, "set") == [[1, "index", 1]]


def test_wrapping_columns_a_set_size_and_marks_are_said_to_the_page_in_its_own_spelling():
    r = start("""
        from pydials import *
        layout(wrap=False, min_scale=0.8)
        layout(fit="width", max_scale=1.3)
        layout(columns={"phone": 1, "wide": 3}, size=(800, 480), scale=1.2)
        with group("shape", wrap=False):
            dial("a", 0, 1, size=1.5)
            wrap()
            dial("b", 0, 1)
        with row(wrap=False):
            group("delay")
        keyboard(animate=False)
    """)
    assert r["error"] is None
    assert sent(r, "layout") == [[{"$d": {"wrap": False, "minScale": 0.8}}], [{"$d": {"fit": "width", "maxScale": 1.3}}], [{"$d": {"columns": {"$d": {"phone": 1, "wide": 3}}, "size": [800, 480], "scale": 1.2}}]]
    specs = {m[1]: (m[0], m[2]) for m in made(r)}
    assert specs[1] == ("group", {"wrap": False, "label": "shape"})
    assert specs[2][1]["size"] == 1.5 and specs[3] == ("row", {"soft": True}) and specs[5] == ("row", {"wrap": False})
    assert specs[7] == ("keyboard", {"animate": False})


def test_layout_says_the_size_and_scale_the_page_last_told_and_on_resize_is_called_when_they_change():
    start("""
        from pydials import *
        seen = []
        first = layout(on_resize=lambda now: seen.append((now.width, now.height, now.scale)))
        def update(dt):
            now = layout()
            print(first.width, first.height, first.scale, now.width, now.height, now.scale, seen)
    """)
    assert tick()["out"].strip() == "400 300 1 400 300 1 []"
    assert tick({"f": [0, 120, 400, 180, 400, 300, 0.9]})["out"].strip() == "400 300 1 400 300 0.9 [(400, 300, 0.9)]"
    # The rectangle changed and the size did not: nothing is called.
    assert tick({"f": [0, 140, 400, 160, 400, 300, 0.9]})["out"].strip().endswith("[(400, 300, 0.9)]")
    assert tick({"f": [0, 140, 800, 160, 800, 300, 1]})["out"].strip().endswith("800 300 1 [(400, 300, 0.9), (800, 300, 1)]")


def test_a_value_with_a_name_and_a_dial_turned_by_ratio_from_nothing_are_said_to_the_page():
    r = start("""
        from pydials import *
        class Verb:
            decay = 0
            def describe(self, name): return {"min": 0, "max": 20, "unit": "s", "log": True, "log_from": 0.05, "labels": {0: "auto"}}
        dial("decay", Verb(), "decay")
        dial("gain", 0, 10, log=True, log_from=0.1, labels={10: "full"})
    """)
    assert r["error"] is None
    first, second = [m[2] for m in made(r)]
    assert first["labels"] == {"$d": {"0": "auto"}} and first["logFrom"] == 0.05 and first["log"] is True and first["min"] == 0
    assert second["labels"] == {"$d": {"10": "full"}} and second["logFrom"] == 0.1


def test_each_run_starts_with_no_controls_and_a_page_of_its_own():
    first = start("from pydials import *\ndial('a', 0, 1)\ndial('b', 0, 1)")
    second = start("from pydials import *\ndial('c', 0, 1)")
    assert [m[1] for m in made(first)] == [1, 2] and [m[1] for m in made(second)] == [1]
    # Each run listens anew: the last run's page, and what was made in it, is gone.
    assert len(sent(first, "listen")) == 1 and len(sent(second, "listen")) == 1
    if not BUILT_IN:
        assert len([c for c in second["cmds"] if c[0] == "new"]) == 1
        assert sent(second, "dials")[0][1] == {"$d": {"fresh": True}}


def test_a_mistake_says_what_to_write_and_names_the_line():
    r = start("""
        from pydials import *
        dial("cutoff", {"a": 1})
    """)
    assert r["errorLine"] == 3
    assert 'dial("cutoff", lead, "filter_cutoff")' in r["error"]


def test_the_pages_half_is_the_javascript_library_itself():
    if not JS_REPO.exists():
        pytest.skip("the JavaScript repository is not beside this one")
    for theirs, ours in (("dials.js", "src/pydials/web/dials.js"), ("examples/standin-synth.js", "examples/standin-synth.js")):
        assert (JS_REPO / theirs).read_bytes() == (ROOT / ours).read_bytes(), "run scripts/sync_js.py: %s is not the library's" % ours
