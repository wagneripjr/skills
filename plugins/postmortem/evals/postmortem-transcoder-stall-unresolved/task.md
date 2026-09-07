# Tuesday's transcoder stall — I need the writeup and I never found the cause

This one is going to annoy you as much as it annoyed me. Everything I have is below. Put the
document in the repo under `docs/`.

## What happened

Alarm `transcode-queue-age` paged me. `ApproximateAgeOfOldestMessage` on the `transcode-jobs`
SQS queue went from its normal ~30s to 41 minutes. CloudWatch shows the age starting to climb
at 08:47 UTC; the alarm crossed its threshold and fired at 09:12 UTC. We're on CET (GMT+1), so
in our heads the page came in at 10:12 — I keep writing both and confusing myself.

9 `clip-transcoder` worker pods on the `media-prod` EKS cluster. 6 of them stopped pulling from
the queue. The `ffmpeg` child processes on those pods were sitting at 0% CPU and had *not*
exited. `kubectl describe` on all six: restart count 0, no OOMKilled, no evictions, no events at
all. They were just wedged.

The 3 pods that kept working were all on node `ip-10-42-7-19`. The 6 stalled ones were spread
across the other two nodes in the `transcode-c5` group.

`live-ingest` was completely unaffected the whole time — it's on its own node group with its own
queue and never touches `transcode-jobs`.

## What I did

At 11:05 UTC I cordoned and drained the two nodes and let the ASG replace them. Replacement
nodes joined at 11:14 UTC, pods rescheduled, and queue age was back to ~30s at 11:31 UTC. That's
what I've got as "recovery confirmed".

I want to be honest with you: I do not know that the drain fixed it. I know the queue drained
after I did it. Nobody can show me that the stall wouldn't have cleared on its own, and I have
no way to test it now.

## Things I ruled out

- **The v2.9.0 release.** It went out that morning on a staggered rollout. But two of the six
  stalled pods were still on v2.8.4, and one of the three *healthy* pods was on v2.9.0. Version
  doesn't separate the sick from the well, so it isn't the release.
- **A poison message.** I pulled the 4 messages that were in flight on the stalled pods and
  replayed them on a healthy pod after recovery. All 4 transcoded fine, about 50s each.
- **EBS throttling.** `VolumeQueueLength` on the gp3 volumes was flat below 1 across the entire
  window on every node, healthy or not.

## Things I could not check

- The kubelet and containerd logs on the two drained nodes are gone. The ASG terminated the
  instances before anyone thought to pull them, and we only ship container stdout to CloudWatch,
  not the node-level logs. Whatever the node would have told us about wedged processes went with
  the instances.
- The two stalled nodes were running a different AMI generation than `ip-10-42-7-19` — different
  kernel line. That is the only difference I found that lines up with sick-vs-healthy, and I have
  absolutely nothing that connects a kernel version to a stalled ffmpeg. It's a thread, not a
  finding.
- I can't tell you how many customer uploads were delayed. We emit queue depth and queue age and
  nothing per job. Depth peaked at 1,880 messages. One upload fans out into several rendition
  jobs but we don't measure that ratio anywhere, so I can't turn 1,880 into a number of users.

## The part I'm not looking forward to writing

We have an April writeup on this same service — INC-037, the queue backlog one. Its action item
#3 was "enable node-problem-detector and ship kubelet logs to CloudWatch", due 2026-05-02.
Marta owned it. It never got done. That's precisely why I have no node logs today. I don't want
this to turn into a thing about Marta — she's had two projects dumped on her since April — but I
also can't pretend the item didn't exist.

## Other stuff I tripped over while digging

- `thumbnail-api`'s health check returns 200 even when its Redis is down. Unrelated to any of
  this, but it's real.
- The `transcode-jobs` DLQ has 112 messages sitting in it from March that nobody ever triaged.

## Loose end

Someone in the channel said they thought they'd seen the same "pods alive, ffmpeg asleep" thing
back in February. I searched our alerts and the channel history and found nothing. I can't
confirm it and I can't rule it out.

## Output Specification

One Markdown document, written to the repository under `docs/`, recording this incident. It has
to survive being read six months from now by someone who was not on call, and it has to be
honest about what is known versus what is guessed.
