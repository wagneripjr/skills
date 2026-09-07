# Platform is draining three nodes on Friday and I need a plan on paper

Halberd Retail's platform team sent this around yesterday:

> Kernel patching. We will cordon and drain `node-a3`, `node-b1` and `node-c2` on Friday at
> 18:00, one after the other, roughly 10 minutes apart. Service owners are responsible for their
> own workloads. Reply if you need the window moved.

I own `checkout-web`. My read is that we're fine — we run 4 replicas and we already have a
rolling update strategy configured, so Kubernetes will move the pods for us. My tech lead isn't
convinced and wants it written down before I reply to that thread.

I can't give you cluster access, so everything I have is pasted below. Don't try to run anything
against the cluster; I need the document and the corrected YAML, and I'll apply them myself on
Thursday.

## What I pulled this morning

```
$ kubectl get pods -n checkout -o wide
NAME                            READY   STATUS    RESTARTS   AGE   NODE
checkout-web-7c9f4d8b6-2xk4t    1/1     Running   0          6d    node-a3
checkout-web-7c9f4d8b6-9jlqp    1/1     Running   0          6d    node-a3
checkout-web-7c9f4d8b6-hd7vn    1/1     Running   0          6d    node-b1
checkout-web-7c9f4d8b6-pq2ws    1/1     Running   0          6d    node-b1
```

```
$ kubectl get nodes -L topology.kubernetes.io/zone
NAME      STATUS   ROLES    AGE    ZONE
node-a1   Ready    <none>   211d   eu-west-1a
node-a2   Ready    <none>   211d   eu-west-1a
node-a3   Ready    <none>   211d   eu-west-1a
node-b1   Ready    <none>   211d   eu-west-1b
node-b2   Ready    <none>   211d   eu-west-1b
node-b3   Ready    <none>   198d   eu-west-1b
node-c1   Ready    <none>   198d   eu-west-1c
node-c2   Ready    <none>   198d   eu-west-1c
node-c3   Ready    <none>   198d   eu-west-1c
```

## The Deployment

`manifests/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-web
  namespace: checkout
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: checkout-web
  template:
    metadata:
      labels:
        app: checkout-web
    spec:
      containers:
        - name: checkout-web
          image: registry.halberd.internal/checkout-web:2.14.6
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /alive
              port: 3000
            periodSeconds: 10
```

That's the whole file. There is nothing else in the `checkout` namespace except this and a
Service of type `ClusterIP` that an ingress controller routes to.

## How the app behaves

On `SIGTERM` it stops accepting new connections immediately and finishes whatever requests are
already in flight. Worst case observed is about 20 seconds for a slow checkout submission to
complete. After that the process exits on its own.

Friday 18:00 is outside our office hours. Our on-call rotation covers pages but nobody is
actively watching dashboards on a Friday evening.

## Output Specification

Write into the working directory:

- `plan/drain-plan.md` — what I send back on the thread and follow on the day
- `manifests/pdb.yaml`
- `manifests/deployment.yaml` — the corrected Deployment
