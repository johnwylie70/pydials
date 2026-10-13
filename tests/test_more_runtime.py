"""The controls of the second part with no browser: the commands sent to the page, and what is done with what it reports."""
from test_runtime import made, out, sent, start, stopped, tick  # noqa: F401  (stopped ends each scene)


def test_a_number_box_counts_in_ones_or_in_tenths_and_is_a_number():
    r = start("""
        from pydials import *
        lives = number("lives", 0, 9, 3)
        gain = stepper("gain", -1, 1, 0.25)
        fives = number("n", 0, 100, 23, step=5)
        print(lives.value, lives * 2, gain.value, fives.value, lives.step, gain.step)
        def update(dt):
            lives.value = 12
            print(lives.value)
    """)
    assert r["error"] is None
    assert made(r) == [("number", 1, {"min": 0, "max": 9, "value": 3, "step": 1, "label": "lives", "default": 3}),
                       ("number", 2, {"min": -1, "max": 1, "value": 0.2, "step": 0.1, "label": "gain", "default": 0.25}),
                       ("number", 3, {"min": 0, "max": 100, "value": 25, "step": 5, "label": "n", "default": 23})]
    assert out(r) == ["3", "6", "0.2", "25", "1", "0.1", "9"]
    assert sent(r, "set") == [[1, "value", 9]]


def test_what_is_typed_in_a_text_box_arrives_with_a_frame_and_enter_is_told_apart():
    r = start("""
        from pydials import *
        heard = []
        player = {"name": "Grace"}
        name = text_box("name", "Ada", placeholder="you", max=12, on_change=heard.append, on_enter=lambda text: heard.append("enter " + text))
        who = text_box("who", player, "name")
        def update(dt):
            print(name.value, len(name), name == "Ada L", who.value, player["name"], heard)
    """)
    assert r["error"] is None
    assert made(r) == [("textBox", 1, {"value": "Ada", "placeholder": "you", "max": 12, "label": "name"}),
                       ("textBox", 2, {"label": "who", "value": "Grace"})]
    r = tick({"c": [1, "Ada L", 1, ["Ada L"], 2, "Hopper"]})
    assert r["out"].strip() == "Ada L 5 True Hopper Hopper ['Ada L', 'enter Ada L']"


def test_a_text_box_set_from_python_is_sent_and_one_tied_to_a_python_object_follows_it():
    r = start("""
        from pydials import *
        player = {"name": "Grace"}
        name = text_box("name")
        who = text_box("who", player, "name")
        def update(dt):
            name.value = "Ada"
            player["name"] = "Mary"
    """)
    assert r["error"] is None
    assert sent(r, "set") == [[1, "value", "Ada"]]
    r = tick({"b": 1})
    assert sent(r, "set") == [[2, "value", "Mary"]]


def test_a_readout_is_sent_what_it_shows_only_when_that_changes():
    r = start("""
        from pydials import *
        score = 7
        ball = {"speed": 2.5}
        a = readout("score", lambda: score, size="large")
        b = readout("time", 65, format="clock")
        c = readout("status", "Ready")
        d = readout("speed", ball, "speed", unit="km/h", digits=1)
        e = readout("made", 2, format=lambda v: "x%d" % v)
        def update(dt):
            global score
            score += 1
            c.value = "Go!"
            c.value = "Go!"
            e.value = 3
    """)
    assert r["error"] is None
    assert made(r) == [("readout", 1, {"label": "score", "size": "large", "value": 7}),
                       ("readout", 2, {"label": "time", "value": 65, "format": "clock"}),
                       ("readout", 3, {"label": "status", "value": "Ready"}),
                       ("readout", 4, {"label": "speed", "unit": "km/h", "digits": 1, "value": 2.5}),
                       ("readout", 5, {"label": "made", "value": "x2"})]
    assert sent(r, "set") == [[3, "value", "Go!"], [5, "value", "x3"]]
    # The function is asked with each frame the page calls back for.
    r = tick({"b": 1})
    assert sent(r, "set") == [[1, "value", 8]]
