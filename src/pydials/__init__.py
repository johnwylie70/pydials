"""pydials: dials, sliders, buttons, a piano keyboard, a scope and meters for a Pyctures scene.

    from pyctures import *
    from pydials import *

    speed = dial("speed", 0, 10)            # a number to read: speed.value, or speed * dt
    dial("cutoff", lead, "filter_cutoff")   # the dial IS that setting of `lead`
    keyboard(lead, octave=4)                # piano keys: fingers, the mouse, the computer's keys
    scope(lead)                             # the wave `lead` is making, live

    with group("filter"):                   # a titled plate that keeps its controls together
        dial("cutoff", lead, "cutoff")
        dial("resonance", lead, "resonance")

NOTHING IS POSITIONED BY HAND unless you want it. Controls line up in the order
they are made, on plates that share a width, and what does not fit can be moved
with a finger. ``group``, ``row``, ``column``, ``grid`` and ``page`` say what goes
with what; the page decides where each thing is, so Python is asked nothing.

THE PAGE DRAWS THE CONTROLS AND FEELS THE FINGERS. Python never touches the
page (it may be in a worker, or on another computer), so a dial that Python
drew and turned would lag behind the finger. Here each function sends ONE
command that makes the control in the page, from ``web/dials.js`` (the very
file that is the JavaScript library; a Pyctures that has it built in says so
with ``H_DIALS``, and then this module is one file that reads no other), and Python keeps a small object that
stands for it. What a hand changes comes back with the next frame: the object's
``value`` is then up to date, and ``on_change`` is called.

A TARGET is anything a control can set, known only by what it can do:

    set(name, value), get(name)   else the control reads and writes target.name (or target[name])
    describe(name)                {"min", "max", "default", "unit", "step", "kind", "choices"}
    note_on(note, velocity), note_off(note)     what a keyboard plays
    samples()                     its latest output, numbers from -1 to 1: a scope draws it
    level()                       how loud it is now, 0 to 1: a meter shows it

A target that LIVES IN THE PAGE (a synth does: its sound is made there) says so
with a ``page`` attribute holding its Pyctures reference, or is such a
reference itself. Its controls are then tied to it in the page: a key sounds
the moment it is touched and a dial is heard as it turns, with no trip through
Python. Any other target is a Python object, and is told a frame later.

MIT licence.
"""
import math
import operator
import os
import sys

__version__ = "0.0.0"

__all__ = ["dial", "slider", "button", "toggle", "select", "rotary", "keyboard", "scope", "meter",
           "label", "group", "row", "column", "grid", "page", "spacer", "wrap", "layout", "room", "theme"]

_HERE = os.path.dirname(os.path.abspath(__file__))
_source = [None]

# How many points of a scope's line Python sends each frame, at most.
SCOPE_POINTS = 256


def _library():
    """The page's half as text that can be made into a function: a page is given no file to load."""
    if _source[0] is None:
        with open(os.path.join(_HERE, "web", "dials.js"), encoding="utf-8") as f:
            _source[0] = f.read().replace("export {", "return {")
    return _source[0]


class _Run:
    """One run of a scene: its page, and the controls made in it."""

    def __init__(self, js=None):
        self.js = js
        self.lib = None
        self.api = None
        self.items = {}
        self.next_id = 1
        self.beating = False
        self.room = None        # the rectangle no control is on, as the page last told it
        self.view = None        # the picture's width and height and the scale the controls are drawn at, likewise
        self.on_resize = None   # what the scene asked to be called with them when they change


_run = _Run()


def _pyctures():
    # Looked up each time: in a browser every scene has its own copy of the module.
    module = sys.modules.get("pyctures")
    if module is None:
        import pyctures as module
    return module


def _page():
    """The page's controls for the scene that is running, made the first time one is wanted."""
    global _run
    p = _pyctures()
    # A new run has a new `js`: what was made for the last run is gone with its page.
    if _run.js is not p.js:
        _run = _Run(p.js)
        handle = getattr(p, "H_DIALS", None) or getattr(p, "H_CONTROLS", None)
        if handle is not None:
            _run.api = p.JsRef(handle)      # a Pyctures that has the controls built in
        else:
            _run.lib = p.js.Function(_library())()
            _run.api = _run.lib.dials(p.canvas, {"fresh": True})
        _run.api.listen(_heard)
    return _run.api


def _beat():
    """Ask the page to call back every frame: something here must be looked at each frame."""
    api = _page()
    if not _run.beating:
        _run.beating = True
        api.beat()


def _heard(e):
    """What the page reports, with a frame: what it made, what a hand changed, what was played."""
    items = _run.items
    made = e.get("m") or ()
    for i in range(0, len(made) - 5, 6):
        item = items.get(made[i])
        if item is not None:
            item._made(*made[i + 1:i + 6])
    told = e.get("c") or ()
    for i in range(0, len(told) - 1, 2):
        item = items.get(told[i])
        if item is not None:
            item._told(told[i + 1])
    played = e.get("n") or ()
    for i in range(0, len(played) - 2, 3):
        item = items.get(played[i])
        if item is not None:
            item._played(played[i + 1], played[i + 2])
    if e.get("f"):
        said = list(e["f"])
        _run.room = said[:4]
        if len(said) >= 7 and said[4:7] != _run.view:
            _run.view = said[4:7]
            if _run.on_resize:
                _run.on_resize(Layout(*_run.view))
    if e.get("b"):
        for item in list(items.values()):
            item._frame()
        _run.api.ack()


# ---------------------------------------------------------------- targets

def _in_page(target):
    """The target as an object in the page, when that is where it lives; else None."""
    if target is None:
        return None
    if hasattr(type(target), "_enc"):
        return target
    page = getattr(target, "page", None)
    return page if hasattr(type(page), "_enc") else None


def _describe(target, name):
    ask = getattr(target, "describe", None)
    d = ask(name) if callable(ask) else None
    if d is None:
        params = getattr(target, "params", None)
        if isinstance(params, dict):
            d = params.get(name)
    d = dict(d) if isinstance(d, dict) else {}
    if "range" in d:
        d["min"], d["max"] = d["range"]
    if isinstance(d.get("choices"), str):
        d["choices"] = d["choices"].split("|") if d["choices"] else None
    if d.get("kind") == "bool":
        d["min"], d["max"] = 0, 1
    return d


def _read(target, name):
    if isinstance(target, dict):
        value = target.get(name)
    else:
        get = getattr(target, "get", None)
        value = get(name) if callable(get) else getattr(target, name, None)
    return None if callable(value) else value


def _write(target, name, value):
    if isinstance(target, dict):
        target[name] = value
        return
    put = getattr(target, "set", None)
    if callable(put):
        put(name, value)
    else:
        setattr(target, name, value)


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _method(thing, *names):
    for name in names:
        fn = getattr(thing, name, None)
        if callable(fn):
            return fn
    return None


# ---------------------------------------------------------------- controls

class Control:
    """What Python keeps of a control that lives in the page."""
    kind = ""

    def __init__(self, spec):
        api = _page()
        self._id = _run.next_id
        _run.next_id += 1
        _run.items[self._id] = self
        self.label = spec.get("label") or ""
        self.on_change = spec.pop("on_change", None)
        api.make(self.kind, self._id, {k: v for k, v in spec.items() if v is not None})

    def _set(self, name, value):
        _page().set(self._id, name, value)

    def _call(self, name, *args):
        _page().call(self._id, name, *args)

    # What the page reports for this control; each kind takes what it needs.
    def _made(self, low, high, default, choices, value):
        pass

    def _told(self, value):
        pass

    def _played(self, note, velocity):
        pass

    def _frame(self):
        pass

    def remove(self):
        """Take it off the scene."""
        _run.items.pop(self._id, None)
        _page().drop(self._id)

    def place(self, x=None, y=None):
        """Put it at x, y (its top left corner); with nothing, the layout places it again."""
        self._call("place", x, y)

    def __repr__(self):
        return "<%s %s %r>" % (self.kind, self.label, getattr(self, "value", None))


class _Number:
    """A control that can be used where its value could: speed * dt, circle(x, y, size), if mute: …"""

    def tolist(self):          # how Pyctures takes a value that is not plain: this one's number
        return self.value

    def __float__(self):
        return float(self.value)

    def __int__(self):
        return int(self.value)

    def __index__(self):
        value = self.value
        if isinstance(value, bool) or float(value) != int(value):
            raise TypeError("%r is not a whole number here; use int(…) or give the control step=1" % (self,))
        return int(value)

    def __bool__(self):
        return bool(self.value)

    def __str__(self):
        return str(self.value)

    def __format__(self, how):
        return format(self.value, how)

    def __neg__(self):
        return -self.value

    def __pos__(self):
        return +self.value

    def __abs__(self):
        return abs(self.value)

    def __round__(self, places=None):
        return round(self.value, places)

    def __eq__(self, other):
        return self.value == (other.value if isinstance(other, _Number) else other)

    def __ne__(self, other):
        return not self.__eq__(other)

    __hash__ = object.__hash__


def _value_of(v):
    return v.value if isinstance(v, _Number) else v


for _name in ("add", "sub", "mul", "truediv", "floordiv", "mod", "pow", "lt", "le", "gt", "ge"):
    _op = getattr(operator, _name)
    setattr(_Number, "__%s__" % _name, lambda self, other, _op=_op: _op(self.value, _value_of(other)))
    if _name not in ("lt", "le", "gt", "ge"):
        setattr(_Number, "__r%s__" % _name, lambda self, other, _op=_op: _op(_value_of(other), self.value))


class _Bound(Control):
    """A control that may be tied to a setting of a target, in the page or in Python."""

    def _tie(self, spec, target, param):
        """Fill the spec from the target. Returns what the target says of the setting ({} for one in the page)."""
        self._target = None
        self._owner = None
        self._param = param
        self._out = None
        if target is None:
            return {}
        page = _in_page(target)
        if page is not None:
            # Tied in the page: the page asks it for the range and tells us (`_made`).
            spec["target"], spec["param"] = page, param
            # The Python object that stands for it is told what a hand changed, so `lead.cutoff` reads what the dial says.
            self._owner = target if target is not page else None
            return {}
        self._target = target
        d = _describe(target, param)
        if not spec.get("label"):
            spec["label"] = d.get("label") or d.get("name") or str(param)
        _beat()     # a Python target is looked at each frame: changed some other way, it moves the control
        return d

    def _send(self, value):
        if self._target is not None:
            _write(self._target, self._param, self._out(value) if self._out else value)
        elif self._owner is not None:
            hear = getattr(self._owner, "_told", None)
            if callable(hear):
                hear(self._param, value)       # the page has already made the change: this only remembers it


class _Ranged(_Number, _Bound):
    def __init__(self, label, a, b, c, spec):
        if label is not None and not isinstance(label, str):
            label, a, b, c = None, label, a, b
        spec["label"] = label
        target = None
        if _is_number(a) or _is_number(b):
            spec.setdefault("min", a)
            spec.setdefault("max", b)
            if c is not None:
                spec.setdefault("value", c)
        elif a is not None:
            if not isinstance(b, str):
                raise TypeError('%s("%s", …) takes a lowest and a highest number, or a target and the name of its setting: %s("cutoff", lead, "filter_cutoff")'
                                % (self.kind, label or "", self.kind))
            target = a
        d = self._tie(spec, target, b if target is not None else None)
        for key in ("min", "max", "step", "unit", "log"):
            if spec.get(key) is None and d.get(key) is not None:
                spec[key] = d[key]
        # A value with a name of its own (0 that means "auto"), and where a dial turned by ratio from 0 starts.
        labels = spec.get("labels") or d.get("labels")
        if labels:
            spec["labels"] = {str(at): str(name) for at, name in labels.items()}
        if spec.get("logFrom") is None and d.get("log_from") is not None:
            spec["logFrom"] = d["log_from"]
        if spec.get("step") is None and d.get("kind") == "int":
            spec["step"] = 1
        self._steps(spec)
        self.min = spec.get("min", 0) if spec.get("min") is not None else 0
        self.max = spec.get("max", 1) if spec.get("max") is not None else 1
        self.step = spec.get("step") or 0
        self.unit = spec.get("unit") or ""
        now = spec.get("value")
        given = now is not None
        if now is None and self._target is not None:
            now = _read(self._target, self._param)
        if not _is_number(now):
            now = None
        self.default = spec.get("default")
        if self.default is None:
            self.default = d.get("default")
        if "target" in spec:
            # Tied in the page: its range and where it stands are told to us a frame from now (`_made`).
            self._v = now if now is not None else 0.0
        else:
            if self.default is None:
                self.default = now if now is not None else self.min
            spec["default"] = self.default
            self._v = self._clean(now if now is not None else self.default)
            spec["value"] = self._v
            if given:
                self._send(self._v)
        Control.__init__(self, spec)

    def _steps(self, spec):
        """A kind that always moves in steps says here what its step is when it was told none."""

    def _clean(self, value):
        low, high = min(self.min, self.max), max(self.min, self.max)
        value = min(max(value, low), high)
        if self.step:
            places = max(0, -int(math.floor(math.log10(self.step)))) if self.step < 1 else 0
            value = round(self.min + round((value - self.min) / self.step) * self.step, places)
            if not places and isinstance(self.step, int) and isinstance(self.min, int):
                value = int(value)
        return value

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, value):
        value = self._clean(_value_of(value))
        if value == self._v:
            return
        self._v = value
        self._set("value", value)
        self._send(value)

    def reset(self):
        """Back to where it started."""
        self.value = self.default

    def _made(self, low, high, default, choices, value):
        self.min, self.max, self.default, self._v = low, high, default, value

    def _told(self, value):
        self._v = value
        self._send(value)
        if self.on_change:
            self.on_change(value)

    def _frame(self):
        if self._target is None:
            return
        now = _read(self._target, self._param)
        if _is_number(now) and abs(now - self._v) > abs(self.max - self.min) * 1e-6:
            self._v = min(max(now, min(self.min, self.max)), max(self.min, self.max))
            self._set("value", self._v)


class Dial(_Ranged):
    kind = "dial"


class Slider(_Ranged):
    kind = "slider"


class Button(Control):
    kind = "button"

    def __init__(self, spec):
        self.on_press = spec.pop("on_press", None)
        self.on_release = spec.pop("on_release", None)
        self.held = False
        self._presses = 0
        Control.__init__(self, spec)

    @property
    def value(self):
        return self.held

    @property
    def pressed(self):
        """Was it pressed since this was last asked? `if fire.pressed:` in update() acts once for each press."""
        if not self._presses:
            return False
        self._presses = 0
        return True

    def _told(self, down):
        self.held = bool(down)
        if down:
            self._presses += 1
            if self.on_press:
                self.on_press()
        elif self.on_release:
            self.on_release()


class Toggle(_Number, _Bound):
    kind = "toggle"

    def __init__(self, label, a, b, spec):
        spec["label"] = label
        target = a if a is not None and isinstance(b, str) else None
        if target is None and a is not None:
            spec.setdefault("value", bool(a))
        d = self._tie(spec, target, b if target is not None else None)
        now = spec.get("value")
        if self._target is not None:
            there = _read(self._target, self._param)
            # A target that keeps 0 and 1 is given 0 and 1.
            if _is_number(there) or d.get("kind") == "bool":
                self._out = lambda on: 1 if on else 0
            if now is None:
                now = there if there is not None else d.get("default")
        self._v = bool(now)
        if "target" not in spec or now is not None:
            spec["value"] = self._v
        Control.__init__(self, spec)

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, on):
        on = bool(_value_of(on))
        if on == self._v:
            return
        self._v = on
        self._set("value", on)
        self._send(on)

    on = value

    def _made(self, low, high, default, choices, value):
        self._v = bool(value)

    def _told(self, value):
        self._v = bool(value)
        self._send(self._v)
        if self.on_change:
            self.on_change(self._v)

    def _frame(self):
        if self._target is None:
            return
        there = bool(_read(self._target, self._param))
        if there != self._v:
            self._v = there
            self._set("value", there)


class Select(_Bound):
    """One of a list. `value` is the choice, `index` its place in the list."""
    kind = "select"

    def __init__(self, label, a, b, spec):
        spec["label"] = label
        target = None
        if isinstance(a, (list, tuple)):
            spec["choices"] = list(a)
            if b is not None:
                spec.setdefault("value", b)
        elif a is not None and isinstance(b, str):
            target = a
        d = self._tie(spec, target, b if target is not None else None)
        if spec.get("choices") is None and d.get("choices"):
            spec["choices"] = list(d["choices"])
        self.choices = list(spec.get("choices") or [])
        now = spec.get("value")
        if self._target is not None:
            there = _read(self._target, self._param)
            # A target that keeps the choice as its number in the list is given the number.
            by_number = _is_number(there) or d.get("kind") == "choice"
            if by_number:
                self._out = lambda choice: self._i
            if now is None:
                now = there if there is not None else d.get("default")
            if by_number and _is_number(now):
                now = self.choices[int(now)] if 0 <= int(now) < len(self.choices) else None
        self._i = self.choices.index(now) if now in self.choices else 0
        if self.choices:
            spec["value"] = self.choices[self._i]
        Control.__init__(self, spec)

    @property
    def value(self):
        return self.choices[self._i] if self.choices else None

    @value.setter
    def value(self, choice):
        if choice in self.choices:
            self.index = self.choices.index(choice)

    @property
    def index(self):
        return self._i

    @index.setter
    def index(self, i):
        if not 0 <= i < len(self.choices) or i == self._i:
            return
        self._i = i
        self._set("index", i)
        self._send(self.choices[i])

    def _made(self, low, high, default, choices, value):
        self.choices = choices.split("|") if choices else []
        self._i = int(value) if _is_number(value) else 0

    def _told(self, i):
        self._i = int(i)
        self._send(self.value)
        if self.on_change:
            self.on_change(self.value)

    def _frame(self):
        if self._target is None:
            return
        # Changed some other way: by its place in the list, by its name in any case, or (of two) as False and True.
        there = _read(self._target, self._param)
        if isinstance(there, bool):
            i = int(there) if len(self.choices) == 2 else None
        elif there in self.choices:
            i = self.choices.index(there)
        elif _is_number(there):
            i = int(round(there))
        elif isinstance(there, str):
            low = [str(choice).lower() for choice in self.choices]
            i = low.index(there.lower()) if there.lower() in low else None
        else:
            i = None
        if i is not None and 0 <= i < len(self.choices) and i != self._i:
            self._i = i
            self._set("index", self._i)

    def __eq__(self, other):
        return self.value == (other.value if isinstance(other, Select) else other)

    __hash__ = object.__hash__

    def __str__(self):
        return str(self.value)


class Rotary(Select):
    """A knob that clicks between a few choices. `value` is the choice, `index` its place in the list."""
    kind = "rotary"


class Keyboard(Control):
    """The piano keyboard. `notes` is what is held on it now (MIDI numbers: 60 is middle C)."""
    kind = "keyboard"

    def __init__(self, target, spec):
        self.on_note_on = spec.pop("on_note_on", None)
        self.on_note_off = spec.pop("on_note_off", None)
        self._octave = spec.get("octave", 4) if spec.get("octave") is not None else 4
        self._held = set()
        page = _in_page(target)
        self._target = None if page is not None else target
        spec["target"] = page
        Control.__init__(self, spec)

    @property
    def notes(self):
        return sorted(self._held)

    @property
    def octave(self):
        return self._octave

    @octave.setter
    def octave(self, n):
        self._octave = max(0, min(8, int(n)))
        self._set("octave", self._octave)

    value = octave

    def press(self, note, velocity=0.8):
        """Play a note as a finger would."""
        self._call("press", note, velocity)

    def release(self, note=None):
        """Let a note go; with no note, every note that is held."""
        self._call("release", note)

    def _told(self, octave):
        self._octave = int(octave)

    def _played(self, note, velocity):
        if velocity:
            self._held.add(note)
            play = _method(self._target, "note_on", "noteOn")
            if play:
                play(note, velocity)
            if self.on_note_on:
                self.on_note_on(note, velocity)
        else:
            self._held.discard(note)
            stop = _method(self._target, "note_off", "noteOff")
            if stop:
                stop(note)
            if self.on_note_off:
                self.on_note_off(note)


def _short(values):
    """A line of numbers as the page is sent it: no more points than SCOPE_POINTS, three decimal places."""
    values = getattr(values, "tolist", lambda: values)()
    n = len(values)
    stride = max(1, -(-n // SCOPE_POINTS))
    return [round(float(values[i]), 3) for i in range(0, n, stride)]


class Scope(Control):
    """A line of numbers: a sound's wave, or any value over time (`graph.push(value)`)."""
    kind = "scope"

    def __init__(self, source, spec):
        page = _in_page(source)
        self._pull = None
        self._list = None
        if page is not None:
            spec["source"] = page
        elif source is not None:
            self._pull = source if callable(source) else _method(source, "samples", "scope")
            if self._pull is None:
                self._list = source
            # A wave: held still, and drawn from -1 to 1, as one from the page is.
            spec.setdefault("steady", True)
            spec.setdefault("min", -1)
            spec.setdefault("max", 1)
            _beat()
        self.value = None
        Control.__init__(self, spec)

    def push(self, value):
        """One more point on the right; the oldest drops off the left."""
        self.value = float(_value_of(value))
        self._call("push", self.value)

    def _frame(self):
        if self._pull is None and self._list is None:
            return
        values = self._pull() if self._pull else self._list
        if values is not None and len(values):
            self._call("feed", _short(values))


class Meter(Control):
    """A level from 0 to 1 (or a left and a right) as a bar of lights."""
    kind = "meter"

    def __init__(self, source, spec):
        page = _in_page(source)
        self._pull = None
        if page is not None:
            spec["source"] = page
        elif source is not None:
            self._pull = source if callable(source) else _method(source, "level")
            _beat()
        self._v = 0.0
        Control.__init__(self, spec)

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, level):
        level = _value_of(level)
        self._v = list(level) if isinstance(level, (list, tuple)) else float(level)
        self._set("value", self._v)

    def _frame(self):
        if self._pull:
            self.value = self._pull()


class Label(Control):
    kind = "label"

    @property
    def value(self):
        return self.label

    @value.setter
    def value(self, text):
        self.label = str(text)
        self._set("value", self.label)


class Box:
    """A group, row, column, grid or page. Used with `with`, what is made inside is in it:

        with group("filter"):
            dial("cutoff", lead, "cutoff")

    Used alone (`group("filter")`), what is made next is in it, until the next group, row or page.
    """

    def __init__(self, kind, spec):
        api = _page()
        self.kind = kind
        self._id = _run.next_id
        _run.next_id += 1
        self.label = spec.get("label") or ""
        api.make(kind, self._id, spec)

    def __enter__(self):
        _page().call(self._id, "enter")
        return self

    def __exit__(self, *error):
        _page().call(self._id, "leave")
        return False

    @property
    def title(self):
        return self.label

    @title.setter
    def title(self, text):
        self.label = str(text)
        _page().set(self._id, "label", self.label)

    def show(self):
        """Turn to this page."""
        _page().call(self._id, "show")

    def remove(self):
        """Take it, and everything in it, off the scene."""
        _page().drop(self._id)

    def __repr__(self):
        return "<%s %s>" % (self.kind, self.label)


class Layout:
    """What the layout came to: the picture's width and height, and the scale the controls are drawn at."""

    def __init__(self, width, height, scale):
        self.width, self.height, self.scale = width, height, scale

    def __repr__(self):
        return "Layout(width=%r, height=%r, scale=%r)" % (self.width, self.height, self.scale)


class Room:
    """A rectangle: x, y, width and height, and its left, top, right and bottom edges."""

    def __init__(self, x, y, width, height):
        self.x, self.y, self.width, self.height = x, y, width, height

    left = property(lambda self: self.x)
    top = property(lambda self: self.y)
    right = property(lambda self: self.x + self.width)
    bottom = property(lambda self: self.y + self.height)

    def __iter__(self):
        return iter((self.x, self.y, self.width, self.height))

    def __repr__(self):
        return "Room(x=%r, y=%r, width=%r, height=%r)" % tuple(self)


# ---------------------------------------------------------------- what a scene calls

def _options(**given):
    """The options as the page reads them: None is left out, and colour may be spelled color."""
    if given.get("colour") is None:
        given["colour"] = given.get("color")
    given.pop("color", None)
    return {name: value for name, value in given.items() if value is not None}


def dial(label=None, a=None, b=None, c=None, *, min=None, max=None, value=None, step=None, unit=None, log=None,
         log_from=None, labels=None, digits=None, default=None, x=None, y=None, size=None, share=None, span=None, colour=None, color=None,
         on_change=None):
    """A dial: dial("speed", 0, 10), dial("speed", 0, 10, 5) or dial("cutoff", lead, "filter_cutoff").

    size="small" or "large" (or how many points across); in a grid, span=2 covers two columns."""
    return Dial(label, a, b, c, _options(min=min, max=max, value=value, step=step, unit=unit, log=log, logFrom=log_from,
                                         labels=labels, digits=digits,
                                         default=default, x=x, y=y, size=size, share=share, span=span, colour=colour,
                                         color=color, on_change=on_change))


def slider(label=None, a=None, b=None, c=None, *, min=None, max=None, value=None, step=None, unit=None, log=None,
           log_from=None, labels=None, digits=None, default=None, vertical=None, x=None, y=None, size=None, share=None, span=None, colour=None,
           color=None, on_change=None):
    """A slider, across or (vertical=True) upright: slider("volume", 0, 1) or slider("attack", lead, "attack").

    share=1 gives it the room left over on its line."""
    return Slider(label, a, b, c, _options(min=min, max=max, value=value, step=step, unit=unit, log=log, logFrom=log_from,
                                           labels=labels, digits=digits,
                                           default=default, vertical=vertical, x=x, y=y, size=size, share=share, span=span,
                                           colour=colour, color=color, on_change=on_change))


def button(label="", on_press=None, *, on_release=None, x=None, y=None, width=None, size=None, share=None, span=None,
           colour=None, color=None):
    """A button: `fire = button("fire")`, then `if fire.pressed:` in update(); or button("fire", shoot)."""
    return Button(_options(label=label, on_press=on_press, on_release=on_release, x=x, y=y, width=width, size=size,
                           share=share, span=span, colour=colour, color=color))


def toggle(label="", a=None, b=None, *, value=None, x=None, y=None, size=None, share=None, span=None, colour=None,
           color=None, on_change=None):
    """A switch: `mute = toggle("mute")`, then `if mute:`; toggle("mute", True); toggle("sync", lead, "sync")."""
    return Toggle(label, a, b, _options(value=value, x=x, y=y, size=size, share=share, span=span, colour=colour, color=color,
                                        on_change=on_change))


def select(label="", a=None, b=None, *, value=None, style=None, x=None, y=None, size=None, share=None, span=None,
           colour=None, color=None, on_change=None):
    """One of a list: select("wave", ["sine", "saw", "square"]), or select("wave", lead, "wave").

    style="rotary" draws it as a knob that clicks between the choices: the same as rotary(…)."""
    kind = Rotary if style == "rotary" else Select
    return kind(label, a, b, _options(value=value, x=x, y=y, size=size, share=share, span=span, colour=colour, color=color,
                                      on_change=on_change))


def rotary(label="", a=None, b=None, *, value=None, show_value=None, x=None, y=None, size=None, share=None, span=None,
           colour=None, color=None, on_change=None):
    """A knob that clicks between a few choices, as the one on a synth that picks a waveform does.

    rotary("mode", ["room", "hall", "plate", "spring"], "hall"), or rotary("wave", lead, "wave") for a setting
    that has choices. Drag to turn it from notch to notch, or tap a name; `mode.value` is the choice and
    `mode.index` its place. The names are written round it where there is room: size="large" shows more. The
    choice is written under the knob only where no names are round it; show_value=True or False says otherwise."""
    return Rotary(label, a, b, _options(value=value, showValue=show_value, x=x, y=y, size=size, share=share, span=span, colour=colour, color=color,
                                        on_change=on_change))


def keyboard(target=None, *, octave=None, octaves=None, keys=None, hints=None, animate=None, x=None, y=None, width=None,
             height=None, share=None, span=None, colour=None, color=None, on_note_on=None, on_note_off=None):
    """A piano keyboard that plays `target`: keyboard(lead, octave=4). With no target, read `notes` or give on_note_on.

    Made outside any group it lies along the bottom; made in one, it is where the group puts it. The keys slide
    when the octave changes; animate=False makes them jump."""
    return Keyboard(target, _options(octave=octave, octaves=octaves, keys=keys, hints=hints, animate=animate, x=x, y=y, width=width,
                                     height=height, share=share, span=span, colour=colour, color=color,
                                     on_note_on=on_note_on, on_note_off=on_note_off))


def _labelled(label, source):
    if isinstance(label, str):
        return label, source
    return (source if isinstance(source, str) else None), label


def scope(label=None, source=None, *, points=None, min=None, max=None, steady=None, x=None, y=None, width=None,
          height=None, share=None, span=None, colour=None, color=None):
    """A scope: scope(lead) draws its wave; `graph = scope("height")` then graph.push(value) draws a value over time.

    Made outside any group it is as wide as the picture; in a group, share=1 gives it the room left over."""
    label, source = _labelled(label, source)
    return Scope(source, _options(label=label, points=points, min=min, max=max, steady=steady, x=x, y=y, width=width,
                                  height=height, share=share, span=span, colour=colour, color=color))


def meter(label=None, source=None, *, vertical=None, x=None, y=None, size=None, share=None, span=None, colour=None,
          color=None):
    """A level meter: meter(lead), or `level = meter("level")` then level.value = 0.7."""
    label, source = _labelled(label, source)
    return Meter(source, _options(label=label, vertical=vertical, x=x, y=y, size=size, share=share, span=span,
                                  colour=colour, color=color))


def label(text, *, x=None, y=None, span=None, colour=None, color=None):
    """Words. Made just before some controls and outside any group, it is their heading: the title of their plate."""
    return Label(_options(label=str(text), x=x, y=y, span=span, colour=colour, color=color))


def _box(kind, title, **options):
    spec = _options(**options)
    if title is not None:
        spec["label"] = str(title)
    return Box(kind, spec)


def group(title=None, *, columns=None, wrap=None, at=None, share=None, span=None, x=None, y=None, width=None, height=None,
          plate=None, dividers=None, gap=None, align=None, colour=None, color=None):
    """A titled plate that keeps its controls together.

        with group("filter"):                 # what is made inside is in the group
            dial("cutoff", lead, "cutoff")

        group("filter")                       # or in a straight line: what is made next is in it,
        dial("cutoff", lead, "cutoff")        # until the next group, row or page

    wrap=False keeps its controls on one line whatever the width; columns=3 lines them up three to a line; at="left" (or "right", "top", "bottom") makes it a strip along
    that edge; share=2 gives it twice its neighbour's part of the line; colour= is the colour of its controls."""
    return _box("group", title, columns=columns, wrap=wrap, at=at, share=share, span=span, x=x, y=y, width=width, height=height,
                plate=plate, dividers=dividers, gap=gap, align=align, colour=colour, color=color)


def row(title=None, *, wrap=None, share=None, span=None, plate=None, dividers=None, gap=None, align=None, colour=None,
        color=None):
    """`with row():` what is made inside stands in a line. `row()` alone: the controls made after this start a new line.

    `with row(wrap=False):` never splits: two groups made inside it stay side by side."""
    return _box("row", title, wrap=wrap, share=share, span=span, plate=plate, dividers=dividers, gap=gap, align=align,
                colour=colour, color=color)


def column(title=None, *, share=None, span=None, plate=None, dividers=None, gap=None, align=None, colour=None, color=None):
    """`with column():` what is made inside stands one under another."""
    return _box("column", title, share=share, span=span, plate=plate, dividers=dividers, gap=gap, align=align,
                colour=colour, color=color)


def grid(columns=None, title=None, *, share=None, span=None, plate=None, dividers=None, gap=None, align=None,
         colour=None, color=None):
    """`with grid(3):` what is made inside is three to a line, in columns that line up (fewer where three will not fit)."""
    if isinstance(columns, str):
        columns, title = (title if _is_number(title) else None), columns
    return _box("grid", title, columns=columns, share=share, span=span, plate=plate, dividers=dividers, gap=gap,
                align=align, colour=colour, color=color)


def page(name=None, *, colour=None, color=None):
    """A page of plates, turned to with a tab: `with page("fx"):`, or page("fx") and then its controls.

    What is made before the first page is above the tabs on every page. page() alone ends the pages: what is
    made next is below them on every page."""
    return _box("page", name, colour=colour, color=color)


def wrap():
    """If this line has to be split, here is where. Nothing happens while everything fits."""
    api = _page()
    _run.next_id += 1
    api.make("row", _run.next_id - 1, {"soft": True})


def spacer(size=None, *, share=None):
    """Room between controls: spacer(20) is that many points, spacer() all the room that is left over."""
    api = _page()
    _run.next_id += 1
    api.make("spacer", _run.next_id - 1, _options(size=size, share=share))


def layout(**options):
    """How it is all laid out, each of these left out or given:

    wrap=False              every row stays one row; everything is drawn smaller until the widest fits the width
    wrap=True               every row() is a new line, and a row is split only when it does not fit
    min_scale=0.8           told not to wrap, no smaller than this: wider rows are moved from side to side
    fit="width"             as wrap=False, and drawn bigger too where there is room, no bigger than max_scale= (1.6)
    columns=3               so many plates to a line; or by width: columns={"phone": 1, "tablet": 2, "wide": 3}
    size=(800, 480)         the panel is laid out at this size on every screen, then made to fit the picture whole;
                            size=800 is a width alone (as is fit="width"): what does not fit is moved up and down
    scale=1.2               everything bigger or smaller
    on_resize=fn            fn(now) is called when the picture changes size: now.width, now.height, now.scale
    at="bottom" (or "top", "left", "right"), margin=10, align="center", compact=True, dividers=True, plates=False,
    backdrop="navy", image="panel.png" (a picture behind the controls)

    It gives back the picture's width and height and the scale the controls are drawn at, as the page last said
    them: `layout().width`. In a scene's first lines the page has said nothing yet, and the scale is 1."""
    api = _page()
    if "on_resize" in options:
        _run.on_resize = options.pop("on_resize")
    for name, theirs in (("min_scale", "minScale"), ("max_scale", "maxScale")):
        if name in options:
            options[theirs] = options.pop(name)
    for name in ("size", "design"):
        if isinstance(options.get(name), tuple):
            options[name] = list(options[name])
    if options:
        api.layout(options)
    if _run.view:
        return Layout(*_run.view)
    size = getattr(_pyctures(), "_scene_size", None)
    return Layout(*(size() if size else (0, 0)), 1)


def room():
    """The rectangle of the picture that no control is on, for the scene to draw in: its x, y, width and height.

    The page works it out and says so with a frame, so in the scene's first lines it is still the whole picture."""
    _page()
    if _run.room:
        return Room(*_run.room[:4])
    size = getattr(_pyctures(), "_scene_size", None)
    return Room(0, 0, *(size() if size else (0, 0)))


def theme(**colours):
    """Change the colours: theme(accent="deepskyblue")."""
    _page().theme(colours)


# ================================================================ more controls
# Each kind below is made in the page by one command, as the ones above are. They are in the order of
# the README: for any program, for games, for music.

__all__ += ["number", "stepper", "text_box", "readout", "checkbox", "choose", "radio", "dropdown", "xy_pad", "colour_picker",
            "color_picker", "progress", "light", "busy", "range_slider", "fader", "joystick", "dpad", "action_button"]


class Number(_Ranged):
    """A number with − and + at its sides, which can be typed."""
    kind = "number"

    def _steps(self, spec):
        # Told no step, it counts in ones; a range too small for that, in tenths or hundredths. (Tied in the page, the page says.)
        if spec.get("step") is None and "target" not in spec and spec.get("min") is not None and spec.get("max") is not None:
            wide = abs(spec["max"] - spec["min"])
            spec["step"] = 1 if wide >= 5 else 0.1 if wide >= 0.5 else 0.01


class TextBox(_Bound):
    """One line of text that is typed. `value` is the text."""
    kind = "textBox"

    def __init__(self, label, a, b, spec):
        self.on_enter = spec.pop("on_enter", None)
        spec["label"] = label
        target = a if a is not None and not isinstance(a, (str, int, float)) and isinstance(b, str) else None
        if target is None and a is not None:
            spec.setdefault("value", str(a))
        self._tie(spec, target, b if target is not None else None)
        now = spec.get("value")
        if now is None and self._target is not None:
            now = _read(self._target, self._param)
        self._v = "" if now is None else str(now)
        if "target" not in spec:
            spec["value"] = self._v
        Control.__init__(self, spec)

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, text):
        text = str(text)
        if text == self._v:
            return
        self._v = text
        self._set("value", text)
        self._send(text)

    def _made(self, low, high, default, choices, value):
        self._v = "" if value is None else str(value)

    def _told(self, value):
        # Enter is told with the text in a list of its own.
        if isinstance(value, (list, tuple)):
            if self.on_enter:
                self.on_enter(self._v)
            return
        self._v = str(value)
        self._send(self._v)
        if self.on_change:
            self.on_change(self._v)

    def _frame(self):
        if self._target is None:
            return
        there = _read(self._target, self._param)
        if there is not None and str(there) != self._v:
            self._v = str(there)
            self._set("value", self._v)

    def __str__(self):
        return self._v

    def __eq__(self, other):
        return self._v == (other.value if isinstance(other, TextBox) else other)

    __hash__ = object.__hash__

    def __len__(self):
        return len(self._v)


class Readout(Control):
    """A value or a message shown: it takes no hand. `value` is what it shows."""
    kind = "readout"
    _asks = ()          # what a source is asked when no setting of it is named: a light asks its level()

    def __init__(self, source, param, spec):
        self._pull = None
        self._format = spec.pop("format", None)
        if callable(self._format):
            self._show = self._format            # Python makes the words, and the page shows them
        else:
            self._show = None
            if self._format is not None:
                spec["format"] = self._format
        page = _in_page(source) if isinstance(param, str) else None
        if page is not None:
            spec["target"], spec["param"] = page, param
        elif self._asks and _in_page(source) is not None:
            spec["source"] = _in_page(source)
        elif callable(source):
            self._pull = source
        elif self._asks and _method(source, *self._asks):
            self._pull = _method(source, *self._asks)
        elif source is not None and isinstance(param, str):
            self._pull = lambda: _read(source, param)
            d = _describe(source, param)
            for key in ("unit", "digits"):
                if spec.get(key) is None and d.get(key) is not None:
                    spec[key] = d[key]
            if not spec.get("label"):
                spec["label"] = d.get("label") or d.get("name") or param
        elif source is not None:
            spec.setdefault("value", source)
        self._v = self._pull() if self._pull else spec.get("value", "")
        if self._pull:
            _beat()
        spec["value"] = self._sent = self._shown()
        Control.__init__(self, spec)

    def _shown(self):
        v = _value_of(self._v)
        return str(self._show(v)) if self._show else v

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, value):
        self._v = value
        now = self._shown()
        if now != self._sent:
            self._sent = now
            self._set("value", now)

    def _frame(self):
        if self._pull:
            self.value = self._pull()


def number(label=None, a=None, b=None, c=None, *, min=None, max=None, value=None, step=None, unit=None, digits=None,
           default=None, x=None, y=None, share=None, span=None, colour=None, color=None, on_change=None):
    """A number with − and + at its sides: number("lives", 0, 9, 3), or number("voices", lead, "voices").

    Tap − or + to step and hold one to keep stepping, drag up or down on the number, or tap it and type.
    It counts in ones unless step= says otherwise (a small range counts in tenths). `lives.value`, or `lives * 2`."""
    return Number(label, a, b, c, _options(min=min, max=max, value=value, step=step, unit=unit, digits=digits, default=default,
                                           x=x, y=y, share=share, span=span, colour=colour, color=color, on_change=on_change))


stepper = number


def text_box(label="", a=None, b=None, *, value=None, placeholder=None, max=None, width=None, x=None, y=None, share=None,
             span=None, colour=None, color=None, on_change=None, on_enter=None):
    """A line of text that is typed: `name = text_box("name", "Ada")`, then `name.value`.

    text_box("name", player, "name") is that setting of `player`. placeholder= is shown while it is empty and
    max= is the most letters it takes; on_change(text) is called as each letter is typed (a frame later) and
    on_enter(text) when Enter is pressed."""
    return TextBox(label, a, b, _options(value=value, placeholder=placeholder, max=max, width=width, x=x, y=y, share=share,
                                         span=span, colour=colour, color=color, on_change=on_change, on_enter=on_enter))


def readout(label="", source=None, setting=None, *, value=None, unit=None, digits=None, format=None, size=None, width=None,
            x=None, y=None, share=None, span=None, colour=None, color=None):
    """A value or a message shown: readout("score", lambda: score), or `score = readout("score")` and `score.value = 12`.

    readout("cutoff", lead, "cutoff") shows a setting. size="large" is for a score; format="clock" shows seconds as
    minutes and seconds, and format= may be a function that makes the words; unit= and digits= are for a number."""
    return Readout(source, setting, _options(label=label, value=value, unit=unit, digits=digits, format=format, size=size,
                                             width=width, x=x, y=y, share=share, span=span, colour=colour, color=color))


class Checkbox(Toggle):
    """A box that is ticked. `on` (or `value`) is True or False."""
    kind = "checkbox"


class Choose(Select):
    """One of a few, side by side. `value` is the choice, `index` its place in the list."""
    kind = "choose"


class Radio(Select):
    """One of a few, one under another. `value` is the choice, `index` its place in the list."""
    kind = "radio"


class Dropdown(Select):
    """One of a long list, which opens over the controls. `value` is the choice, `index` its place in the list."""
    kind = "dropdown"


def checkbox(label="", a=None, b=None, *, value=None, x=None, y=None, share=None, span=None, colour=None, color=None,
             on_change=None):
    """A box that is ticked: `sound = checkbox("sound", True)`, then `if sound:`; checkbox("sync", lead, "sync")."""
    return Checkbox(label, a, b, _options(value=value, x=x, y=y, share=share, span=span, colour=colour, color=color,
                                          on_change=on_change))


def _chosen(kind, label, a, b, value, x, y, share, span, colour, color, on_change):
    return kind(label, a, b, _options(value=value, x=x, y=y, share=share, span=span, colour=colour, color=color,
                                      on_change=on_change))


def choose(label="", a=None, b=None, *, value=None, x=None, y=None, share=None, span=None, colour=None, color=None,
           on_change=None):
    """One of a few, all in sight side by side: `mode = choose("mode", ["easy", "medium", "hard"], "medium")`.

    `mode.value` is the choice and `mode.index` its place; choose("wave", lead, "wave") is a setting that has
    choices. Where they do not fit on one line they take two."""
    return _chosen(Choose, label, a, b, value, x, y, share, span, colour, color, on_change)


def radio(label="", a=None, b=None, *, value=None, x=None, y=None, share=None, span=None, colour=None, color=None,
          on_change=None):
    """One of a few, one under another with a round mark each: radio("size", ["small", "medium", "large"])."""
    return _chosen(Radio, label, a, b, value, x, y, share, span, colour, color, on_change)


def dropdown(label="", a=None, b=None, *, value=None, x=None, y=None, share=None, span=None, colour=None, color=None,
             on_change=None):
    """One of a long list: dropdown("planet", planets, "Earth"). A tap opens the list over the controls; it is
    moved with a finger or the wheel when it is long, and closes on a pick or a touch outside it."""
    return _chosen(Dropdown, label, a, b, value, x, y, share, span, colour, color, on_change)


class XYPad(_Bound):
    """A square where a finger sets two numbers at once. `x` and `y` are the numbers, and `value` is both."""
    kind = "xyPad"

    def __init__(self, label, a, b, c, spec):
        if label is not None and not isinstance(label, str):
            label, a, b, c = None, label, a, b
        spec["label"] = label
        self._params = None
        self._ways = [[0, 1], [0, 1]]
        target = None
        if isinstance(a, (list, tuple)):
            self._ways = [list(a), list(b if isinstance(b, (list, tuple)) else a)]
            spec["across"], spec["up"] = self._ways
        elif a is not None:
            if not (isinstance(b, str) and isinstance(c, str)):
                raise TypeError('xy_pad("%s", …) takes two ranges, or a target and the names of two of its settings: '
                                'xy_pad("filter", lead, "cutoff", "resonance")' % (label or ""))
            target = a
        self._tie(spec, target, b if target is not None else None)
        if target is not None:
            self._params = (b, c)
            if "target" in spec:                 # tied in the page, which says where it stands a frame from now
                spec["paramX"], spec["paramY"] = b, c
                del spec["param"]
            else:
                self._ways = []
                for name in (b, c):
                    d = _describe(target, name)
                    now = _read(target, name)
                    self._ways.append([d.get("min", 0), d.get("max", 1)] + ([now] if _is_number(now) else []))
                spec["across"], spec["up"] = self._ways
                if not label:
                    spec["label"] = "%s / %s" % (b, c)
        self._v = [way[2] if len(way) > 2 else (way[0] + way[1]) / 2 for way in self._ways]
        Control.__init__(self, spec)

    def _clean(self, pair):
        return [min(max(_value_of(v), min(way[0], way[1])), max(way[0], way[1])) for v, way in zip(pair, self._ways)]

    @property
    def value(self):
        return list(self._v)

    @value.setter
    def value(self, pair):
        pair = self._clean(pair)
        if pair == self._v:
            return
        self._v = pair
        self._set("value", pair)
        self._both(pair)

    x = property(lambda self: self._v[0], lambda self, v: setattr(self, "value", [v, self._v[1]]))
    y = property(lambda self: self._v[1], lambda self, v: setattr(self, "value", [self._v[0], v]))

    def _both(self, pair):
        if self._target is not None:
            for name, value in zip(self._params, pair):
                _write(self._target, name, value)
        elif self._owner is not None and callable(getattr(self._owner, "_told", None)):
            for name, value in zip(self._params, pair):
                self._owner._told(name, value)

    def _made(self, low, high, default, choices, value):
        if isinstance(value, (list, tuple)):
            self._v = list(value)

    def _told(self, pair):
        self._v = list(pair)
        self._both(self._v)
        if self.on_change:
            self.on_change(self._v[0], self._v[1])

    def _frame(self):
        if self._target is None:
            return
        there = [_read(self._target, name) for name in self._params]
        if all(_is_number(v) for v in there) and there != self._v:
            self._v = there
            self._set("value", there)

    def __iter__(self):
        return iter(self._v)


class ColourPicker(TextBox):
    """A patch of colour that opens a picker. `value` is the colour as a scene writes one: "tomato", "#3a7bd5"."""
    kind = "colourPicker"


class Progress(Readout):
    """A bar that fills. `value` is how far it has got."""
    kind = "progress"
    _asks = ("progress", "level")


class Light(Readout):
    """A light: on or off, a brightness from 0 to 1, or a colour."""
    kind = "light"
    _asks = ("level",)

    @property
    def on(self):
        v = _value_of(self._v)
        if isinstance(v, (list, tuple)):
            v = max(v)
        return bool(v) and v != "off"

    @on.setter
    def on(self, on):
        self.value = bool(_value_of(on))

    def __bool__(self):
        return self.on


class Busy(Light):
    """A ring that goes round while something is happening."""
    kind = "busy"
    _asks = ()


class RangeSlider(_Bound):
    """A slider with two handles. `low` and `high` are the numbers, and `value` is both."""
    kind = "rangeSlider"

    def __init__(self, label, a, b, c, spec):
        if label is not None and not isinstance(label, str):
            label, a, b, c = None, label, a, b
        spec["label"] = label
        self._params = None
        target = None
        if _is_number(a):
            spec.setdefault("min", a)
            spec.setdefault("max", b)
            if c is not None:
                spec.setdefault("value", list(c))
        elif a is not None:
            if not (isinstance(b, str) and isinstance(c, str)):
                raise TypeError('range_slider("%s", …) takes a lowest and a highest number, or a target and the names of two '
                                'of its settings: range_slider("loop", sample, "start", "end")' % (label or ""))
            target = a
        d = self._tie(spec, target, b if target is not None else None)
        if target is not None:
            self._params = (b, c)
            if "target" in spec:
                spec["paramHigh"] = c
            else:
                for key in ("min", "max", "step", "unit"):
                    if spec.get(key) is None and d.get(key) is not None:
                        spec[key] = d[key]
                if spec.get("value") is None:
                    there = [_read(target, b), _read(target, c)]
                    if all(_is_number(v) for v in there):
                        spec["value"] = there
        self.min = spec.get("min", 0)
        self.max = spec.get("max", 1)
        self._v = self._clean(spec.get("value") or [self.min, self.max])
        if "target" not in spec:
            spec["value"] = self._v
        Control.__init__(self, spec)

    def _clean(self, pair):
        low, high = min(self.min, self.max), max(self.min, self.max)
        pair = sorted(min(max(_value_of(v), low), high) for v in pair)
        return pair

    @property
    def value(self):
        return list(self._v)

    @value.setter
    def value(self, pair):
        pair = self._clean(pair)
        if pair == self._v:
            return
        self._v = pair
        self._set("value", pair)
        self._both(pair)

    low = property(lambda self: self._v[0], lambda self, v: setattr(self, "value", [min(_value_of(v), self._v[1]), self._v[1]]))
    high = property(lambda self: self._v[1], lambda self, v: setattr(self, "value", [self._v[0], max(_value_of(v), self._v[0])]))

    _both = XYPad._both

    def _made(self, low, high, default, choices, value):
        self.min, self.max = low, high
        if isinstance(value, (list, tuple)):
            self._v = list(value)

    def _told(self, pair):
        self._v = list(pair)
        self._both(self._v)
        if self.on_change:
            self.on_change(self._v[0], self._v[1])

    _frame = XYPad._frame

    def __iter__(self):
        return iter(self._v)


class Fader(_Ranged):
    kind = "fader"


def xy_pad(label=None, a=None, b=None, c=None, *, spring=None, x=None, y=None, size=None, share=None, span=None,
           colour=None, color=None, on_change=None):
    """A square where one finger sets two numbers at once, one by going across and one by going up.

    xy_pad("filter", lead, "cutoff", "resonance") is two settings of `lead`; xy_pad("spot", [0, 100], [0, 50]) is
    two plain ranges (a third number in a range is where it starts; without one, the middle). `pad.x` and `pad.y`
    are the numbers and on_change(x, y) hears them. spring=True lets it go back when it is let go."""
    return XYPad(label, a, b, c, _options(spring=spring, x=x, y=y, size=size, share=share, span=span, colour=colour,
                                          color=color, on_change=on_change))


def colour_picker(label="", a=None, b=None, *, value=None, colours=None, x=None, y=None, share=None, span=None,
                  colour=None, color=None, on_change=None):
    """A patch of colour that opens a picker: `ink = colour_picker("ink", "tomato")`, then circle(x, y, 40, ink.value).

    In the picker, drag in the square for how strong and how bright, along the strip for the hue, or tap a named
    colour. colours= is your own list of named colours, or False for none; colour_picker("ink", pen, "colour") is a
    setting of `pen`."""
    if a is None and value is None:
        a = "tomato"
    return ColourPicker(label, a, b, _options(value=value, colours=colours, x=x, y=y, share=share, span=span,
                                              colour=colour, color=color, on_change=on_change))


color_picker = colour_picker


def progress(label="", source=None, setting=None, *, value=None, min=None, max=None, percent=None, size=None, width=None,
             x=None, y=None, share=None, span=None, colour=None, color=None):
    """A bar that fills: `bar = progress("loading")` then bar.value = 0.4, or progress("loading", lambda: done / total).

    It runs from 0 to 1 unless min= and max= say otherwise; percent=False leaves the number out."""
    return Progress(source, setting, _options(label=label, value=value, min=min, max=max, percent=percent, size=size,
                                              width=width, x=x, y=y, share=share, span=span, colour=colour, color=color))


def light(label="", source=None, setting=None, *, value=None, size=None, x=None, y=None, share=None, span=None,
          colour=None, color=None):
    """A light: light("ready", True), then ready.on = False; light("signal", lead) is as bright as `lead` is loud;
    `lamp.value = "red"` shines that colour, and a number from 0 to 1 is how bright."""
    return Light(source, setting, _options(label=label, value=value, size=size, x=x, y=y, share=share, span=span,
                                           colour=colour, color=color))


def busy(label="", source=None, *, value=None, size=None, x=None, y=None, share=None, span=None, colour=None, color=None):
    """A ring that goes round while something is happening: `wait = busy("loading")`, then wait.on = False."""
    return Busy(source if source is not None else True, None, _options(label=label, value=value, size=size, x=x, y=y,
                                                                         share=share, span=span, colour=colour, color=color))


def range_slider(label=None, a=None, b=None, c=None, *, min=None, max=None, value=None, step=None, unit=None, digits=None,
                 vertical=None, x=None, y=None, size=None, share=None, span=None, colour=None, color=None, on_change=None):
    """A slider with a low and a high handle: `price = range_slider("price", 0, 100, [20, 80])`, then price.low and
    price.high. range_slider("loop", sample, "start", "end") is two settings of `sample`. on_change(low, high)."""
    return RangeSlider(label, a, b, c, _options(min=min, max=max, value=value, step=step, unit=unit, digits=digits,
                                                vertical=vertical, x=x, y=y, size=size, share=share, span=span,
                                                colour=colour, color=color, on_change=on_change))


def fader(label=None, a=None, b=None, c=None, *, min=None, max=None, value=None, step=None, unit=None, log=None,
          digits=None, default=None, x=None, y=None, size=None, share=None, span=None, colour=None, color=None,
          on_change=None):
    """An upright slider with the look of a mixing desk's: fader("volume", lead, "volume") or fader("level", 0, 1, 0.7)."""
    return Fader(label, a, b, c, _options(min=min, max=max, value=value, step=step, unit=unit, log=log, digits=digits,
                                          default=default, x=x, y=y, size=size, share=share, span=span, colour=colour,
                                          color=color, on_change=on_change))


# ---------------------------------------------------------------- for games

class Joystick(Control):
    """A stick under one thumb. `x` and `y` are each from -1 to 1 (y down the picture), and 0 when it is let go."""
    kind = "joystick"

    def __init__(self, spec):
        self.x = self.y = 0.0
        Control.__init__(self, spec)

    value = property(lambda self: [self.x, self.y])
    angle = property(lambda self: math.atan2(self.y, self.x), doc="The way it is pushed, in radians: 0 to the right, as math.atan2 gives it.")
    distance = property(lambda self: min(1.0, math.hypot(self.x, self.y)), doc="How far it is pushed, from 0 to 1.")

    def _told(self, pair):
        self.x, self.y = pair
        if self.on_change:
            self.on_change(self.x, self.y)

    def __iter__(self):
        return iter((self.x, self.y))


class Dpad(Control):
    """A pad of arrows. `left`, `right`, `up` and `down` are True while pressed; `x` and `y` are -1, 0 or 1."""
    kind = "dpad"

    def __init__(self, spec):
        self.left = self.right = self.up = self.down = False
        Control.__init__(self, spec)

    x = property(lambda self: self.right - self.left)
    y = property(lambda self: self.down - self.up, doc="1 while down is pressed and -1 while up is: y goes down the picture.")
    value = property(lambda self: [self.x, self.y])

    def _told(self, arrows):
        # Which arrows are down, as one number: left 1, right 2, up 4, down 8.
        arrows = int(arrows)
        self.left, self.right, self.up, self.down = bool(arrows & 1), bool(arrows & 2), bool(arrows & 4), bool(arrows & 8)
        if self.on_change:
            self.on_change(self.x, self.y)

    def __iter__(self):
        return iter((self.x, self.y))


class ActionButton(Button):
    """A round button, as a game pad's A and B are."""
    kind = "actionButton"


def joystick(label=None, *, floating=None, as_keys=None, size=None, width=None, height=None, x=None, y=None, share=None,
             span=None, colour=None, color=None, on_change=None):
    """A stick for a thumb, which springs back when it is let go: `stick = joystick()`, then in update()
    `ship.x += stick.x * speed * dt` and `ship.y += stick.y * speed * dt`.

    `stick.x` and `stick.y` are from -1 to 1, in the scene's own directions (y goes DOWN the picture);
    `stick.angle` is the way it is pushed and `stick.distance` how far. floating=True: it appears where the thumb
    lands, anywhere in its box (width=, height=). as_keys=True: pushed, it holds the arrow keys down for the scene."""
    return Joystick(_options(label=label, floating=floating, as_keys=as_keys, size=size, width=width, height=height, x=x, y=y,
                             share=share, span=span, colour=colour, color=color, on_change=on_change))


def dpad(label=None, *, ways=None, as_keys=None, size=None, x=None, y=None, share=None, span=None, colour=None, color=None,
         on_change=None):
    """A pad of arrows under one thumb: `pad = dpad()`, then `if pad.left:` or `x += pad.x * speed * dt`.

    as_keys=True makes it the arrow keys, so a game written with `"ArrowLeft" in keys` is played on a phone
    unchanged (as_keys="wasd" for those keys). Between two arrows both are pressed, unless ways=4."""
    return Dpad(_options(label=label, ways=ways, as_keys=as_keys, size=size, x=x, y=y, share=share, span=span, colour=colour,
                         color=color, on_change=on_change))


def action_button(label="", on_press=None, *, key=None, on_release=None, size=None, x=None, y=None, share=None, span=None,
                  colour=None, color=None):
    """A round button: `fire = action_button("A")`, then `if fire.pressed:` in update(), or `fire.held`.

    key="space" (or " ", "a", "Enter") holds that key down for the scene while it is pressed. Each finger holds
    its own control, so a thumb can steer while another fires."""
    return ActionButton(_options(label=label, on_press=on_press, on_release=on_release, key=key, size=size, x=x, y=y,
                                 share=share, span=span, colour=colour, color=color))
