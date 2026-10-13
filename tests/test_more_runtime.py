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


def test_a_checkbox_is_true_or_false_and_choose_radio_and_dropdown_are_one_of_a_list():
    r = start("""
        from pydials import *
        heard = []
        sound = checkbox("sound", True, on_change=heard.append)
        mode = choose("mode", ["easy", "medium", "hard"], "medium", on_change=heard.append)
        size = radio("size", ["small", "large"])
        planet = dropdown("planet", ["Mercury", "Venus", "Earth"], "Earth")
        print(bool(sound), mode.value, mode.index, size.value, planet.value, mode == "medium")
        def update(dt):
            planet.value = "Venus"
            print(sound.on, mode.value, size.index, heard)
    """)
    assert r["error"] is None
    assert made(r) == [("checkbox", 1, {"value": True, "label": "sound"}),
                       ("choose", 2, {"value": "medium", "label": "mode", "choices": ["easy", "medium", "hard"]}),
                       ("radio", 3, {"label": "size", "choices": ["small", "large"], "value": "small"}),
                       ("dropdown", 4, {"value": "Earth", "label": "planet", "choices": ["Mercury", "Venus", "Earth"]})]
    assert out(r)[:6] == ["True", "medium", "1", "small", "Earth", "True"]
    assert sent(r, "set") == [[4, "index", 1]]
    r = tick({"c": [1, False, 2, 2, 3, 1]})
    assert r["out"].strip() == "False hard 1 [False, 'hard']"


def test_an_xy_pad_is_two_numbers_and_a_python_target_is_set_both_ways():
    r = start("""
        from pydials import *
        heard = []
        lead = {"cutoff": 800, "res": 0.3}
        spot = xy_pad("spot", [0, 100], [0, 50], on_change=lambda x, y: heard.append((x, y)))
        tied = xy_pad("filter", lead, "cutoff", "res")
        print(spot.x, spot.y, spot.value, tied.x, tied.y)
        def update(dt):
            spot.x = 150
            print(spot.value, tied.value, lead, heard)
    """)
    assert r["error"] is None
    assert made(r) == [("xyPad", 1, {"label": "spot", "across": [0, 100], "up": [0, 50]}),
                       ("xyPad", 2, {"label": "filter", "across": [0, 1, 800], "up": [0, 1, 0.3]})]
    assert out(r)[:6] == ["50.0", "25.0", "[50.0,", "25.0]", "800", "0.3"]
    assert sent(r, "set") == [[1, "value", [100, 25.0]]]
    r = tick({"c": [1, [10, 20], 2, [0.5, 0.25]]})
    assert r["out"].strip() == "[100, 20] [0.5, 0.25] {'cutoff': 0.5, 'res': 0.25} [(10, 20)]"


def test_a_colour_a_bar_a_light_and_a_busy_ring_are_sent_what_they_show():
    r = start("""
        from pydials import *
        done = 3
        class Amp:
            def level(self): return 0.5
        ink = colour_picker("ink", "tomato")
        sky = color_picker("sky")
        bar = progress("files", lambda: done, max=12)
        ready = light("ready", True)
        signal = light("signal", Amp())
        wait = busy("working")
        print(ink.value, sky.value, bool(ready), wait.on)
        def update(dt):
            print(ink.value, ready.on)
            ink.value = "gold"
            ready.on = False
            ready.value = "red"
            wait.on = False
    """)
    assert r["error"] is None
    assert made(r) == [("colourPicker", 1, {"value": "tomato", "label": "ink"}), ("colourPicker", 2, {"value": "tomato", "label": "sky"}),
                       ("progress", 3, {"label": "files", "max": 12, "value": 3}), ("light", 4, {"label": "ready", "value": True}),
                       ("light", 5, {"label": "signal", "value": 0.5}), ("busy", 6, {"label": "working", "value": True})]
    assert out(r) == ["tomato", "tomato", "True", "True", "tomato", "True"]
    assert sent(r, "set") == [[1, "value", "gold"], [4, "value", False], [4, "value", "red"], [6, "value", False]]
    r = tick({"c": [1, "#00ff00"]})
    assert r["out"].strip() == "#00ff00 True"         # what a hand mixed, and the light that was told a colour


def test_a_slider_with_two_handles_is_a_low_and_a_high_and_a_fader_is_a_number():
    r = start("""
        from pydials import *
        heard = []
        price = range_slider("price", 0, 100, [20, 80], on_change=lambda low, high: heard.append((low, high)))
        vol = fader("vol", 0, 1, 0.7)
        print(price.low, price.high, list(price), vol * 2)
        def update(dt):
            price.low = 95
            print(price.value, heard)
    """)
    assert r["error"] is None
    assert made(r) == [("rangeSlider", 1, {"min": 0, "max": 100, "value": [20, 80], "label": "price"}),
                       ("fader", 2, {"min": 0, "max": 1, "value": 0.7, "label": "vol", "default": 0.7})]
    assert out(r)[:5] == ["20", "80", "[20,", "80]", "1.4"]
    assert sent(r, "set") == [[1, "value", [80, 80]]]
    r = tick({"c": [1, [30, 60]]})
    assert r["out"].strip() == "[60, 60] [(30, 60)]"     # update() has run again: the low end is put as far up as the high one
