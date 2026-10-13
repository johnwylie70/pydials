# Changes

## Unreleased

- Layout. Controls are kept on titled plates: a `label` made just before some controls is their heading, and `with group("filter"):` (or `group("filter")` and then the controls) says so with options. Plates wrap whole, so a heading is never left behind; wrapped lines are balanced; the plates of a line share its width. Scenes written with `label` and `row()` alone are laid out this way with no change.
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
