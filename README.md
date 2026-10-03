<div align="center">

# trek-band

**Star Trek above your Claude Code prompt.**

<img src="media/demo.webp" alt="trek-band: usage meters and a pixel-art Star Trek scene above the Claude Code prompt" width="880">

</div>

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that puts a lilac band above the prompt: your usage on the left, Clawd acting out a Star Trek scene on the right.

## What's in it

**Usage meters.** Four rings, two per row:

- 5-hour session
- weekly, all models
- weekly per-model limits your plan has, such as Fable
- context window

Each ring shows the percentage and the time to reset, or the token count for context. Hover a ring for the exact figure and reset time. A ring turns amber when your current pace would use it up before it resets, and red at 90%.

**Cache timer.** `Cache: 59:57` next to the model name. The prompt cache lasts an hour from the last message. The timer counts down in green, then turns red and counts up once the cache has expired. It hides after six hours idle.

**23 scenes**, 10 seconds each, in shuffled order:

| The Next Generation | | Voyager |
| --- | --- | --- |
| Darmok | Yesterday's Enterprise | Caretaker |
| All Good Things… | The Measure of a Man | The Cloud |
| Q Who | Cause and Effect | Scorpion |
| Chain of Command | Relics | The Doctor |
| The Inner Light | Ode to Spot | Blink of an Eye |
| Déjà Q | *First Contact* (film) | Year of Hell |
| Tapestry | | Threshold |
| The Best of Both Worlds | | Timeless |
| | | Endgame |

No flashes, no strobing, no white-outs. Every scene is checked frame by frame with [`flashcheck.py`](tools/scene-kit/flashcheck.py).

## Install

Needs Claude Code 2.1.286 or later.

```
/plugin marketplace add rb17080/trek-band
/plugin install trek-band@trek-band
```

The scenes draw in the Code tab of the Claude desktop app. A terminal shows the usage figures as text.

## Commands

| | |
| --- | --- |
| `/startrek` | next scene |
| `/startrek darmok`, `/startrek 7` | jump to a scene by name or number |
| `/startrek list` | all scenes |
| `/startrek fav <scene>` | add or remove a favourite; with favourites set, only those play |
| `/startrek favs clear` | play everything again |
| `/startrek pause`, `/startrek play` | hold the current scene, or resume |

## How it works

It's a mod: JavaScript hooks running inside Claude Code. It draws the `AbovePrompt` band and adds the cache timer to the footer.

The usage figures come from `api.anthropic.com/api/oauth/usage`, fetched every three minutes and shared across your open sessions. The request goes out with your Claude login, which the engine attaches itself, so the mod never sees your token. That's the only network request the mod makes, and it doesn't touch your files.

The desktop app redraws the whole band whenever anything changes, including every tick of the cache timer. Each redraw hands the scene over at the point it had reached, so the animation never restarts. The same redraw is why the band has no buttons: the app drops clicks on a redrawn band ([anthropics/claude-code#99211](https://github.com/anthropics/claude-code/issues/99211)).

Run `claude plugin validate plugins/trek-band` to list every event the mod hooks and every call it makes.

## Make a scene

[`tools/scene-kit`](tools/scene-kit) has the pixel-art helpers, every scene's source, a preview script and the flash check. You need Windows with Microsoft Edge, Node 22+ and Python with Pillow. The video above is rendered from the same code by [`tools/video`](tools/video).

## Credits

Star Trek is a trademark of CBS Studios / Paramount, and Clawd is Anthropic's mascot. This is an unofficial fan project, not endorsed by either. All artwork is original.

MIT license.
