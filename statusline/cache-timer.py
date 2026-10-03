"""Claude Code status line: the prompt-cache timer.

Green, counting down to when the prompt cache expires (an hour after the last message).
Once it has expired: red, counting up, so you can see how long it has been cold.
Blank once the session has been idle for six hours, and in sessions with no cache yet.
Reads the `prompt_cache.expires_at` Claude Code passes on stdin; re-run every second
by `"refreshInterval": 1` in settings.json.
"""
import json
import math
import sys
import time

GREEN = '\033[38;2;95;211;138m'
RED = '\033[38;2;255;107;129m'
RESET = '\033[0m'
HIDE_AFTER = 5 * 3600  # seconds past expiry = six hours since the last message


def clock(secs: int) -> str:
    h, rest = divmod(secs, 3600)
    m, s = divmod(rest, 60)
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'


try:
    data = json.load(sys.stdin)
    expires = (data.get('prompt_cache') or {}).get('expires_at')
except Exception:
    expires = None

if not expires:
    print('')
else:
    left = float(expires) - time.time()
    if left > 0:
        print(f'{GREEN}{clock(math.ceil(left))}{RESET}')
    elif -left < HIDE_AFTER:
        print(f'{RED}{clock(int(-left))}{RESET}')
    else:
        print('')
