# Three workloads misbehaving on the same node pool — write up what's actually wrong

I'm on the data platform team at Alderpoint Analytics. Three of our workloads in the `reporting`
namespace have been unhappy for a week and I've been asked to justify an infrastructure request
before we spend the money. My working theory is that the nodes are too small and we should move
the pool to a larger instance type. My director wants that argued on paper, per workload, with
the manifests we'd actually ship.

You have no cluster access — everything I could collect is pasted below. Please don't attempt to
run or query anything.

## The node pool

9 identical nodes. Each reports:

```
Capacity:
  cpu:     4
  memory:  16Gi
Allocatable:
  cpu:     3860m
  memory:  15196Mi
```

Nothing else runs in `reporting`. Other namespaces use roughly half the pool.

## Workload A — report-renderer

Keeps disappearing. `kubectl get pods` shows a trail of them:

```
report-renderer-6b7d5c9f4-4wq2n   0/1   Evicted   0   3h
report-renderer-6b7d5c9f4-8kzp7   0/1   Evicted   0   9h
report-renderer-6b7d5c9f4-lm4vt   1/1   Running   0   40m
```

`kubectl describe pod report-renderer-6b7d5c9f4-4wq2n` ends with:

```
Status:   Failed
Reason:   Evicted
Message:  The node was low on resource: memory. Threshold quantity: 100Mi,
          available: 84Mi. Container renderer was using 612Mi, request is 0.
```

`manifests/report-renderer.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: report-renderer
  namespace: reporting
spec:
  replicas: 2
  selector:
    matchLabels:
      app: report-renderer
  template:
    metadata:
      labels:
        app: report-renderer
    spec:
      containers:
        - name: renderer
          image: registry.alderpoint.internal/report-renderer:1.9.0
          ports:
            - containerPort: 8080
```

Measured steady-state usage across a week: 550-700Mi memory, 200-400m CPU.

## Workload B — metrics-rollup

Never starts at all. Sits `Pending` forever:

```
Events:
  Type     Reason            Message
  ----     ------            -------
  Warning  FailedScheduling  0/9 nodes are available: 9 Insufficient cpu.
```

`manifests/metrics-rollup.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-rollup
  namespace: reporting
spec:
  replicas: 1
  selector:
    matchLabels:
      app: metrics-rollup
  template:
    metadata:
      labels:
        app: metrics-rollup
    spec:
      containers:
        - name: rollup
          image: registry.alderpoint.internal/metrics-rollup:0.4.2
          resources:
            requests:
              cpu: "4"
              memory: "8Gi"
            limits:
              cpu: "4"
              memory: "8Gi"
```

Whoever wrote this told me they set the request to 4 CPUs "because the node has 4". Measured
usage from when it last ran on a developer machine: about 900m CPU sustained, 2.1Gi memory.

## Workload C — ingest-worker

Restarts every 20 minutes or so. `kubectl describe` shows:

```
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
    Restart Count:  38
```

It's a Node.js worker (Node 20) that buffers batches in memory before writing them out. We
already tried bumping the request from 64Mi to 128Mi last Tuesday and it made no difference at
all.

`manifests/ingest-worker.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingest-worker
  namespace: reporting
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ingest-worker
  template:
    metadata:
      labels:
        app: ingest-worker
    spec:
      containers:
        - name: worker
          image: registry.alderpoint.internal/ingest-worker:3.2.1
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "200m"
              memory: "256Mi"
```

Measured working set when it is healthy: 180-240Mi, spiking to about 400Mi while a large batch
is being assembled. CPU sits near 190m during those spikes.

## Output Specification

Write into the working directory:

- `analysis/diagnosis.md` — the per-workload write-up my director will read, including whether
  the larger instance type is justified
- `manifests/report-renderer.yaml`
- `manifests/metrics-rollup.yaml`
- `manifests/ingest-worker.yaml`
