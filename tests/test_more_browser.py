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
