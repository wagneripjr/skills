# Sign off on the settlement-api manifests before Thursday

I'm the only backend person left on the settlement squad at Kettleford Logistics and I've been
asked to get `settlement-api` onto the shared cluster before Thursday. The change ticket I filed
says "no downtime expected". My manager wants a second pair of eyes on the manifests first, and
whatever you find, I need the corrected files back so I can commit them.

There is no cluster access from where you are, so please don't try to apply or query anything —
just work from the files and the notes below.

## What the service is

`settlement-api` is a Spring Boot service on the JVM. On a warm node it takes about 40 seconds
from process start until it answers its first request — Hibernate builds the entity metadata and
the connection pool warms up before the HTTP listener binds.

It talks to `ledger-db`, a Postgres instance in the same namespace. The `/health` endpoint the
manifests use opens a connection to `ledger-db` and runs `SELECT 1` before returning 200. That
database goes through a nightly vacuum window where it has been observed to stall for 20 to 30
seconds at a time.

The cluster is 9 nodes spread across 3 availability zones. Other teams share it. We deploy with
`kubectl apply -f manifests/` from a CI job.

## The manifests as they stand

`manifests/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: settlement-api
  namespace: settlement
spec:
  replicas: 1
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: settlement-api
  template:
    metadata:
      labels:
        app: settlement-api
    spec:
      containers:
        - name: settlement-api
          image: registry.kettleford.internal/settlement-api:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: prod
            - name: LEDGER_DB_URL
              value: jdbc:postgresql://ledger-db.settlement.svc:5432/ledger
            - name: LEDGER_DB_PASSWORD
              value: "Tr0ubador-prod-2024"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
```

`manifests/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: settlement-api
  namespace: settlement
spec:
  selector:
    app: settlement-api
  ports:
    - port: 80
      targetPort: 8080
```

## Notes I already have

- The manifests have been in our git repository, on the default branch, for about three weeks.
- The image is rebuilt and pushed under the same tag by every CI run on the default branch.
- Nobody has set anything up around these two files — what you see is the whole of it.

## Output Specification

Write into the working directory:

- `review/findings.md` — the written review I can attach to the ticket
- `manifests/deployment.yaml` — the corrected Deployment
- `manifests/service.yaml` — the corrected Service
- any further YAML files the corrected setup needs, also under `manifests/`
