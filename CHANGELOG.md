# Changes

## Unreleased

- Fixed: a select or rotary did not follow a choice changed in code when its target reads the choice back by name (`lead.wave = "sine"`). It now takes a place in the list, a name in any case, or `false` and `true` for two choices, and says nothing back to the target.
- The keyboard keeps its height: when everything does not fit, the scope is made shorter and then the plates are moved, under a scope and a keyboard that stay put. `keyboard(lead, height=200)` is kept to.
- A dial turned by ratio may start at 0 (`{"min": 0, "log": True}` from a target's `describe`), and `labels={0: "auto"}` shows a name in place of a value.
- A rotary with its names round it no longer names its choice a second time underneath (`show_value=True` or `False` says otherwise), and its title and knob are on a line with the dials beside it.
- Moving the plates is what a panel does when there is more than fits: they carry on a little when a finger lets go, and a finger going up or down a slider that lies across moves the plates.
- `layout(fit="width")` fills the width whichever way: rows as written, drawn smaller to fit or bigger where there is room, no bigger than `max_scale=` (1.6).
- A target in the page that says its choices or its range changed (`onChange`) has its control ask again, and Python is told the new choices and range.
- `rotary("mode", ["room", "hall", "plate", "spring"], "hall")`, or `rotary("wave", lead, "wave")`: a knob that clicks between a few choices, with a notch for each and their names round it where there is room. `select(…, style="rotary")` is the same.
- The piano keys slide to a new octave (the arrows, Z and X, an arrow held down, or a finger dragging the strip above the keys). `keyboard(lead, animate=False)` makes them jump.
- Wrapping is yours to say: `layout(wrap=False)` keeps every row as written and draws the whole panel at one scale that fits the widest to the width (not below `min_scale=`); `layout(wrap=True)` makes every `row()` a new line; `layout(columns=3)`, or `columns={"phone": 1, "tablet": 2, "wide": 3}`; `with group("shape", wrap=False):` never splits; `with row(wrap=False):` keeps the groups in it side by side; `wrap()` marks where a line may be split.
- `layout(size=(900, 640))`: a panel of a set size, laid out once and made to fit any screen whole, keeping its shape.
- A size may be so many times the usual (`size=1.5`), and is kept at every scale.
- `layout()` gives back the picture's `width` and `height` and the `scale`, as the page last said them, and `layout(on_resize=fn)` is called when they change.
- Layout. Controls are kept on titled plates: a `label` made just before some controls is their heading, and `with group("filter"):` (or `group("filter")` and then the controls) says so with options. Plates wrap whole, so a heading is never left behind; wrapped lines are balanced; the plates of a line share its width. Scenes written with `label` and `row()` alone are laid out this way with no change.
- Plates with titles fill the width: they stand side by side in balanced lines set against both edges of the picture, as many to a line as fit, and a `row()` between them says where a line should end when one has to. A few controls with no titles keep their own width and their rows as written.
- `with row():`, `with column():` and `with grid(3):` arrange what is inside a group, and nest. `spacer()` takes the room left over. Any control takes `size="small"` or `"large"`, `share=` and `span=`. A group takes `colour=`, `columns=`, `gap=`, `align=`, `dividers=` and `plate=`.
- Controls are drawn a little smaller before a line wraps, and never tiny. What still does not fit is moved with a finger, the wheel or a bar, while the keyboard and the scope above it stay put.
- `page("fx")`: pages of plates, turned with a tab. `fx.show()` turns to one.
- `with group("moves", at="left"):` is a strip along an edge, `layout(at="left")` puts every plate down one side, and `room()` is the rectangle no control is on, told by the page with a frame.
- `layout(design=(800, 480))`: `x=` and `y=` are in a panel of that size, scaled to the picture. `layout(image=, compact=, dividers=, plates=, align=)` for the look.
- All of it is one command to the page for each control or group: the page decides where things go, and Python is asked nothing.
- `examples/front_panel.py`: a whole synth in seven groups.
- Dials, sliders (across or upright), buttons, toggles and selects for a Pyctures scene: `speed = dial("speed", 0, 10)` is a number to use (`speed * dt`, `speed.value`), and `dial("cutoff", lead, "filter_cutoff")` is that setting of `lead`, with its range, unit and starting value taken from it.
- A piano keyboard, `keyboard(lead, octave=4)`: several fingers at once, sliding from key to key, the computer's keys by where they are (the row from A is the white keys), Z and X to step the octave, and keys lit while they sound.
- A scope, `scope(lead)`, for a sound's wave or any value over time (`graph.push(value)`), and a level meter, `meter(lead)`.
- The page draws the controls and feels the fingers, so a dial turns smoothly however busy Python is; what a hand changes reaches Python with the next frame. A target that lives in the page (a synth) is tied to its controls there, so a key sounds the moment it is touched.
- Controls lay themselves out in rows, with the keyboard along the bottom. `x=` and `y=` place one by hand; `row()` starts a new row; `layout(at="bottom")` moves the rows.
- Four examples: a dial that shapes a star, a synth panel, a keyboard with a scope, and a bouncing ball with no sound at all.
