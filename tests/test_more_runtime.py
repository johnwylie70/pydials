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


def test_a_joystick_a_pad_of_arrows_and_a_round_button_are_heard():
    r = start("""
        from pydials import *
        heard = []
        stick = joystick(floating=True)
        pad = dpad(as_keys=True, ways=4, on_change=lambda x, y: heard.append((x, y)))
        fire = action_button("A", key="space")
        def update(dt):
            print(stick.x, stick.y, round(stick.distance, 2), pad.left, pad.up, pad.x, pad.y, fire.held, fire.pressed, heard)
    """)
    assert r["error"] is None
    assert made(r) == [("joystick", 1, {"floating": True}), ("dpad", 2, {"ways": 4, "as_keys": True}),
                       ("actionButton", 3, {"label": "A", "key": "space"})]
    assert r["out"].strip() == "0.0 0.0 0.0 False False 0 0 False False []"
    r = tick({"c": [1, [0.6, -0.8], 2, 5, 3, True]})
    assert r["out"].strip() == "0.6 -0.8 1.0 True True -1 -1 True True [(-1, -1)]"
    r = tick({"c": [1, [0, 0], 2, 0, 3, False]})
    assert r["out"].strip() == "0 0 0.0 False False 0 0 False False [(-1, -1), (0, 0)]"


def test_an_envelope_is_four_numbers_and_a_python_target_has_all_four_set():
    r = start("""
        from pydials import *
        heard = []
        lead = {"attack": 0.02, "decay": 0.3, "sustain": 0.6, "release": 0.8}
        shape = envelope("shape", lead, on_change=lambda a, d, s, r: heard.append((a, d, s, r)))
        alone = envelope("alone", attack=0.2)
        print(shape.attack, shape.release, shape.value, alone.value)
        def update(dt):
            alone.sustain = 0.25
            print(lead, heard)
    """)
    assert r["error"] is None
    # (An object inside the options is sent wrapped, as the options themselves are.)
    unwrapped = [(kind, i, {k: v.get("$d", v) if isinstance(v, dict) else v for k, v in spec.items()}) for kind, i, spec in made(r)]
    assert unwrapped == [("envelope", 1, {"label": "shape", "attack": {"min": 0, "max": 2, "value": 0.02}, "decay": {"min": 0, "max": 2, "value": 0.3},
                                        "sustain": {"min": 0, "max": 1, "value": 0.6}, "release": {"min": 0, "max": 2, "value": 0.8}}),
                       ("envelope", 2, {"label": "alone", "attack": 0.2})]
    assert r["out"].splitlines()[0] == "0.02 0.8 [0.02, 0.3, 0.6, 0.8] [0.2, 0.3, 0.7, 0.5]"
    assert sent(r, "set") == [[2, "value", [0.2, 0.3, 0.25, 0.5]]]
    r = tick({"c": [1, [1, 0.5, 0.75, 2]]})
    assert r["out"].strip() == "{'attack': 1, 'decay': 0.5, 'sustain': 0.75, 'release': 2} [(1, 0.5, 0.75, 2)]"


def test_a_grid_of_steps_pads_and_a_wheel_are_sent_and_heard():
    r = start("""
        from pydials import *
        heard = []
        class Kit:
            def note_on(self, note, velocity): heard.append(("on", note))
            def note_off(self, note): heard.append(("off", note))
        grid = step_grid("drums", 8, ["kick", "snare"], on_change=lambda row, step, on: heard.append((row, step, on)))
        kit = pads("kit", ["kick", "snare", "hat", "boom"], Kit(), on_note_on=lambda note, velocity, name: heard.append(name))
        bend = pitch_wheel("bend")
        grid.put("kick", 0)
        grid.put("snare", 4, 0.5)
        grid.step = 9
        print(grid.value, grid.get("kick", 0), grid.row("snare"), grid.step, kit.notes, bend.value, bend.min)
        def update(dt):
            kit.flash("hat")
            print(grid.get("kick", 3), kit.held, heard)
    """)
    assert r["error"] is None
    assert made(r) == [("stepGrid", 1, {"label": "drums", "steps": 8, "rows": ["kick", "snare"]}),
                       ("pads", 2, {"label": "kit", "pads": ["kick", "snare", "hat", "boom"], "notes": [36, 38, 42, 39]}),
                       ("wheel", 3, {"spring": True, "label": "bend", "min": -1, "max": 1, "value": 0, "default": 0})]
    assert r["out"].splitlines()[0] == "[[1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0.5, 0, 0, 0]] 1 [0, 0, 0, 0, 0.5, 0, 0, 0] 1 [36, 38, 42, 39] 0 -1"
    assert sent(r, "call")[:2] == [[1, "put", 0, 0, 1], [1, "put", 1, 4, 0.5]] and [2, "flash", "hat"] in sent(r, "call")
    assert sent(r, "set") == [[1, "step", 1]]
    r = tick({"c": [1, [0, 3, 1]], "n": [2, 38, 0.9]})
    assert r["out"].strip() == "1 ['snare'] [('kick', 3, 1), ('on', 38), 'snare']"
    r = tick({"n": [2, 38, 0]})
    assert r["out"].strip() == "1 [] [('kick', 3, 1), ('on', 38), 'snare', ('off', 38)]"


def test_patterns_are_lists_and_the_engines_text_and_what_a_hand_draws_arrives_as_text():
    r = start("""
        from pydials import *
        pad = {"trance_gate": "x.x."}
        lane = steps("accent", 8)
        gate = trance_gate("gate", "x.5.9..3")
        tied = trance_gate("tied", pad)
        arp = arp_pattern("arp", "1 - 3 2 _ 1^ ~3 5':4")
        named = arp_pattern("named", "acid")
        print(lane.value, [round(v * 9) for v in gate.value], gate.text, len(gate), tied.text, arp.text, arp.value[4]["tie"], arp.value[7], named.text)
        def update(dt):
            lane.text = "x..X"
            gate.put(1, 3 / 9)
            lane.step = 2
            arp.value = [1, 0, "2'", {"note": 3, "octave": -1, "accent": True, "length": 6}, "~4"]
            tied.preset("pump")
            print(lane.value, lane.steps[3]["accent"], pad, arp.text, len(arp))
    """)
    assert r["error"] is None
    assert made(r) == [("steps", 1, {"steps": 8, "label": "accent", "value": "........"}),
                       ("tranceGate", 2, {"value": "x.5.x..3", "label": "gate", "steps": 8}),
                       ("tranceGate", 3, {"label": "tied", "value": "x.x.", "steps": 4}),
                       ("arpPattern", 4, {"value": "1 - 3 2 _ 1^ ~3 5':4", "label": "arp"}),
                       ("arpPattern", 5, {"value": "1^ 1 ~3 - 1' ~1 2^ -", "label": "named"})]
    lines = r["out"].splitlines()
    assert lines[0] == ("[0, 0, 0, 0, 0, 0, 0, 0] [9, 0, 5, 0, 9, 0, 0, 3] x.5.x..3 8 x.x. 1 - 3 2 _ 1^ ~3 5':4 True "
                        "{'note': 5, 'octave': 1, 'tie': False, 'accent': False, 'slide': False, 'length': 4} 1^ 1 ~3 - 1' ~1 2^ -")
    assert sent(r, "set") == [[1, "value", "x..X"], [2, "value", "x35.x..3"], [1, "step", 2], [4, "value", "1 - 2' 3,^:6 ~4"], [3, "value", "2468246824682468"]]
    assert lines[1] == "[1, 0, 0, 1] True {'trance_gate': '2468246824682468'} 1 - 2' 3,^:6 ~4 5"
    r = tick({"c": [3, "X..x", 4, "3 2 1"]})
    assert "{'trance_gate': '2468246824682468'}" in r["out"]         # update() has run again and set the name once more


def test_a_drum_sequencer_is_worked_from_python_and_its_steps_are_heard():
    r = start("""
        from pydials import *
        heard = []
        class Kit:
            def note_on(self, note, velocity): heard.append(note)
        beat = drum_seq("beat", ["kick", "snare"], Kit(), steps=8, tempo=100, value=["x...x...", "..X....."],
                        on_step=lambda row, step, velocity: heard.append((row, step, velocity)))
        print(beat.value[1], beat.get("kick", 4), beat.notes, beat.tempo, beat.playing)
        def update(dt):
            beat.tempo = 140
            beat.play()
            print(beat.text.split()[1], beat.step, beat.muted, heard)
    """)
    assert r["error"] is None
    assert made(r) == [("drumSeq", 1, {"label": "beat", "steps": 8, "tempo": 100, "value": "x...x...\n..X.....", "rows": ["kick", "snare"], "notes": [36, 38]})]
    assert r["out"].splitlines()[0] == "[0, 0, 1, 0, 0, 0, 0, 0] 1 [36, 38] 100 False"
    assert sent(r, "set") == [[1, "tempo", 140], [1, "playing", True]]
    r = tick({"c": [1, ["step", 1, 2, 1], 1, "x.......\n..X...x.", 1, ["mute", 0, 1], 1, ["tempo", 96]]})
    assert r["out"].strip() == "..X...x. 2 [True, False] [38, ('snare', 2, 1)]"
    assert sent(r, "set") == [[1, "tempo", 140]]            # a hand set it to 96, and update() put it back


EVENT = "\u0001dials"


def test_a_control_of_your_own_is_made_drawn_as_a_list_of_shapes_and_sent_again_only_when_it_changes():
    r = start("""
        from pydials import *
        def paint(c):
            c.rect(0, 0, c.width, c.height, "#222", 8)
            c.circle(c.value * c.width, 20, 5)
            c.lines([(0, 0), (10, 10)], "white", 2)
            c.text("hi", 5, 5, size=10)
        pad = custom("pad", width=200, height=80, value=0.5, draw=paint)
        print(pad.value, pad.held)
        def update(dt):
            pad.value = 0.25
    """)
    assert r["error"] is None
    assert made(r) == [("custom", 1, {"label": "pad", "width": 200, "height": 80, "value": 0.5})]
    shapes = [[["rect", 0, 0, 200, 80, "#222", 8], ["circle", 100.0, 20, 5, None], ["lines", [[0.0, 0.0], [10.0, 10.0]], "white", 2],
               ["text", "hi", 5, 5, None, 10, "center"]]]
    assert [c[2] for c in sent(r, "set") if c[1] == "ops"][0] == shapes[0]
    # update() moved the value: it was drawn again at the new place, and the first drawing was sent once.
    assert [c[2][1][1] for c in sent(r, "set") if c[1] == "ops"] == [100.0, 50.0]
    assert out(r) == ["0.5", "False"]
    # A frame with nothing new sends no drawing.
    assert [c for c in sent(tick(), "set") if c[1] == "ops"] == []


def test_a_finger_on_a_control_of_your_own_calls_back_with_its_place_and_the_control_is_drawn_again():
    start("""
        from pydials import *
        log = []
        def paint(c):
            c.rect(0, 0, c.width * c.value, c.height)
        def down(p, c):
            log.append(("down", p.x, p.y, p.id, p.shift))
            pad.set(p.x / c.width)
        def move(p, c):
            log.append(("move", round(p.x)))
        def up(p, c):
            log.append(("up", pad.held))
        heard = []
        pad = custom("pad", width=100, height=50, value=0, draw=paint, on_down=down, on_move=move, on_up=up, on_change=heard.append)
        def update(dt):
            print(log, heard, pad.value, pad.held)
    """)
    r = tick({"c": [1, [EVENT, "pointer", "down", 25.0, 10.0, 1, 1]]})
    assert r["out"].strip() == "[('down', 25.0, 10.0, 1, True)] [0.25] 0.25 True"
    assert [c[2][0][3] for c in sent(r, "set") if c[1] == "ops"] == [25.0]
    r = tick({"c": [1, [EVENT, "pointer", "move", 60.2, 10.0, 1, 0], 1, [EVENT, "pointer", "up", 60.2, 10.0, 1, 0]]})
    assert r["out"].strip() == "[('down', 25.0, 10.0, 1, True), ('move', 60), ('up', False)] [0.25] 0.25 False"


def test_a_control_of_your_own_is_given_its_real_size_what_a_synth_in_the_page_hears_and_what_a_function_gives():
    start("""
        from pydials import *
        seen = []
        def paint(c):
            seen.append((c.width, c.height, round(c.level, 2), c.input))
        pad = custom("pad", draw=paint, source=lambda: "A4", animate=True)
        def update(dt):
            print(seen[-1], pad.value)
    """)
    r = tick({"c": [1, [EVENT, "size", 321.5, 77.0]], "b": 1})
    assert r["out"].strip() == "(321.5, 77.0, 0.0, 'A4') None"


def test_a_keyboard_asks_for_the_midi_button_only_when_it_is_told_to():
    r = start("""
        from pydials import *
        from standin_synth import make_synth
        lead = make_synth()
        keyboard(lead, octave=4, midi=True)
        keyboard(lead, octave=3)
    """.replace("from standin_synth import make_synth", "from synths import *").replace("make_synth()", "make_synth('lead')"))
    assert r["error"] is None
    specs = [m[2] for m in made(r) if m[0] == "keyboard"]
    assert specs[0].get("midi") is True and "midi" not in specs[1]
