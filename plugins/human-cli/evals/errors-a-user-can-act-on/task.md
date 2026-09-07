# Every `slatecast` failure becomes a support ticket. Fix that.

Pinegrove Media distributes video to broadcast partners. `slatecast` is the tool our customers
run to publish an asset to a channel. It works fine when everything is correct. When anything is
wrong, the customer opens a ticket, because the tool tells them nothing they can act on.

Rewrite it. Below are the four failures our support queue is made of, quoted as the tool
currently prints them, plus four other things people complain about.

## The four failures, as they look today

Customer runs `slatecast publish --asset promo.mp4 --channel atlas` on a fresh machine:

```
Error: 1
```

(The cause: no config file has ever been created on that machine.)

Customer typos the channel name, `--channel atals`:

```
Traceback (most recent call last):
  File "slatecast.py", line 88, in publish
    endpoint = CHANNELS[channel]
KeyError: 'atals'
```

Customer passes `--quality fast`:

```
invalid literal for int() with base 10: 'fast'
```

(The valid values are `draft`, `standard` and `master`. Nobody can find that written down.)

Customer points at a file that isn't there, `--asset missing.mp4`:

```
Error
```

...and the process exits 0, so their build script carries on and marks the publish as done. That
one has caused two incidents.

## The other four complaints

- We renamed `--dest` to `--channel` in the last release and broke every customer's automation
  overnight. My boss wants to know we will never do that again. For now the old spelling has to
  keep working.
- `slatecast --help` is one undifferentiated wall of text. The three questions support answers
  most often are all "how do I do X", and there is nowhere in the tool that shows how.
- Tickets never say which version the customer is on, because there is no way to find out.
- One customer runs `slatecast publish ... > publish.log 2>/dev/null` in a cron job and says the
  tool "silently does nothing" on failure. They never see any of the messages above.

## Constraints

- Python 3 standard library only, or Node.js builtins only. No pip, no npm, no network.
- One entry file, runnable with no install step.
- Commands: `slatecast publish --asset <path> --channel <name> [--quality <value>]`,
  `slatecast channels list`, and `slatecast config init`.
- Channels are `atlas`, `beacon` and `corvid`. Publishing does not need to really upload
  anything — write a line to a local file and report success.

## Output Specification

Write these four files into the working directory:

1. **`slatecast.py`** (or `slatecast.mjs`) — the complete, runnable tool.

2. **`failure-transcript.txt`** — real captured runs reproducing all four failures above against
   the rewritten tool. For each: the exact command line, the complete output, and the exit code.
   Include one of them run with stdout redirected to a file, showing what the cron customer sees.

3. **`help-transcript.txt`** — real captured output of `--help` for the root command and for
   every subcommand, plus the output of asking the tool its version. Nothing hand-written.

4. **`MIGRATION.md`** — what a customer with `--dest` in their automation needs to know.
