# Changes

## Unreleased

- Dials, sliders (across or upright), buttons, toggles and selects for a Pyctures scene: `speed = dial("speed", 0, 10)` is a number to use (`speed * dt`, `speed.value`), and `dial("cutoff", lead, "filter_cutoff")` is that setting of `lead`, with its range, unit and starting value taken from it.
- A piano keyboard, `keyboard(lead, octave=4)`: several fingers at once, sliding from key to key, the computer's keys by where they are (the row from A is the white keys), Z and X to step the octave, and keys lit while they sound.
- A scope, `scope(lead)`, for a sound's wave or any value over time (`graph.push(value)`), and a level meter, `meter(lead)`.
- The page draws the controls and feels the fingers, so a dial turns smoothly however busy Python is; what a hand changes reaches Python with the next frame. A target that lives in the page (a synth) is tied to its controls there, so a key sounds the moment it is touched.
- Controls lay themselves out in rows, with the keyboard along the bottom. `x=` and `y=` place one by hand; `row()` starts a new row; `layout(at="bottom")` moves the rows.
- Four examples: a dial that shapes a star, a synth panel, a keyboard with a scope, and a bouncing ball with no sound at all.
