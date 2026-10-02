<div align="center">

# trek-band

**Star Trek, playing above your Claude Code prompt.**

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview): a lilac band with your live 5-hour and weekly usage, a prompt-cache timer, and Clawd acting out thirteen iconic Star Trek scenes in hand-made pixel art.

<img src="media/demo.webp" alt="trek-band: the usage band above the Claude Code prompt, then all thirteen scenes" width="880">

</div>

## What you get

- **Usage at a glance.** Two rings for the 5-hour and the weekly limit, each with how long until it resets: `4:39` (hours:minutes), `1:18:03` (days:hours:minutes). The rings turn amber at 75% and red at 90%.
- **A prompt-cache timer** under the prompt. Claude Code's prompt cache lasts an hour from the last message. The timer counts down in green while the cache is warm; once it expires it turns red and counts up, so you know a cache miss is coming. It hides in sessions that have been idle for more than six hours.
- **Thirteen scenes**, each a 17-second story that plays twice before the next one:

| The Next Generation | | Voyager |
| --- | --- | --- |
| Darmok | The Inner Light | The Cloud |
| All Good Things… | Déjà Q | Caretaker |
| Chain of Command | Tapestry | Scorpion |
| Q Who | The Best of Both Worlds | The Doctor |
| *First Contact* (film) | | |

- **Calm by design.** No white-outs, strobing or flicker. Every scene is measured frame by frame (every 0.05 s, whole frame and eight regions) before it ships; see [`tools/scene-kit/flashcheck.py`](tools/scene-kit/flashcheck.py).

## Install

Requires Claude Code **2.1.287 or later** (mods). In a Claude Code session:

```
/plugin marketplace add rb17080/trek-band
/plugin install trek-band@trek-band
```

Or from your shell:

```bash
claude plugin marketplace add rb17080/trek-band
claude plugin install trek-band@trek-band
```

The scenes draw in the **Code tab of the Claude desktop app**. In a terminal the band shows the usage figures as text.

## Controls

| | |
| --- | --- |
| `/trek` or ⏭ | next scene |
| `/trek pause` or ⏸ | stay on this scene |
| `/trek play` or ▶ | rotate again |

## How it works

trek-band is a mod: JavaScript hooks that run inside Claude Code. It draws the `AbovePrompt` band (rings, countdowns and the scene, an SVG with SMIL animation) and the `PromptHint` line under the prompt (the cache timer).

One detail matters: redrawing the band restarts the scene's animation. So the band only redraws when something actually changes (a new scene, new usage figures), and the cache timer ticks in its own line, through state that only that line reads.

Like any mod, it runs with your permissions. Read [`plugins/trek-band/hooks/register.tsx`](plugins/trek-band/hooks/register.tsx), or run `claude plugin validate plugins/trek-band` to list every event it hooks and every call it makes. It reads usage figures, keeps a timer, and draws. It makes no network requests and touches no files.

## Make a scene

[`tools/scene-kit`](tools/scene-kit) has the shared pixel-art helpers, every scene's source, a preview script that freezes a scene at each second, and the flash check. The preview tooling expects Windows with Microsoft Edge, Node 22+ and Python with Pillow.

The README video is rendered from the same scene code: [`tools/video`](tools/video).

## Credits

Built with Claude Code. Star Trek and its episodes are trademarks of CBS Studios / Paramount; Clawd is Anthropic's mascot. This is an unofficial fan project, not affiliated with or endorsed by either. All artwork is original pixel art.

MIT license.
