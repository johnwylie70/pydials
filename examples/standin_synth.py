"""A stand-in synth, so the examples make sound today. It is here only until `synths` is ready.

The sound is made in the page (standin-synth.js, the browser's own oscillators), and this is
the Python name for it. Its ``page`` attribute is what tells a dial or a keyboard that the
synth lives in the page, so they are tied to it there: a key sounds the moment it is touched.
"""
import os
import sys


class Synth:
    def __init__(self, page):
        self.page = page

    def set(self, name, value):
        self.page.set(name, value)

    def note_on(self, note, velocity=0.8):
        self.page.noteOn(note, velocity)

    def note_off(self, note):
        self.page.noteOff(note)


def make_synth(**settings):
    """A synth: make_synth(wave="saw"). Its settings: wave, filter_cutoff, filter_resonance, attack, release, volume."""
    js = sys.modules["pyctures"].js
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "standin-synth.js"), encoding="utf-8") as f:
        source = f.read().replace("export {", "return {")
    return Synth(js.Function(source)().makeSynth(settings))
