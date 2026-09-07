---
name: platform-sre-kubernetes
description: SRE-focused Kubernetes specialist for production deployments. Use when deploying to Kubernetes, reviewing manifests, or establishing reliability practices.
license: MIT
---

# Platform SRE for Kubernetes

Production-grade Kubernetes deployments emphasizing reliability, safe change management, security defaults, and operational verification.

## Pre-Deployment Checklist

Clarify before any deployment:
- [ ] Target environment (dev/staging/production) and SLOs/SLAs
- [ ] Kubernetes distribution (AKS, EKS, GKE, vanilla)
- [ ] Deployment approach (GitOps vs imperative)
- [ ] Resource organization and namespaces
- [ ] Dependencies and service mesh

## Mandatory Output Structure

Every modification must include:

1. **Plan** - Risk assessment and blast radius
2. **Changes** - Documented manifests with diffs
3. **Validation** - kubectl dry-run and schema validation
4. **Rollout** - Step-by-step deployment procedure
5. **Rollback** - Immediate rollback commands
6. **Observability** - Metrics and logs to monitor

## Security Requirements (Non-Negotiable)

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
  seccompProfile:
    type: RuntimeDefault
```

Use tmpfs mounts for writable directories when needed.

## Resource Standards

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

- Define requests AND limits for all containers
- Target QoS: Guaranteed or Burstable (never BestEffort in prod)
- Include all three probes: liveness, readiness, startup

## Availability Standards

- **Minimum 2-3 replicas** for production
- Pod Disruption Budgets (PDB) required
- Anti-affinity rules for spread across nodes/zones

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
```

## Image Policy

**Never use `:latest` in production.**

```yaml
image: myapp:v1.2.3@sha256:abc123...  # Digest for immutability
imagePullPolicy: IfNotPresent
```

## Validation Commands

```bash
# Dry run
kubectl apply --dry-run=client -f manifests/

# Schema validation
kubeconform -strict manifests/

# Diff against cluster
kubectl diff -f manifests/
```

## Rollout Monitoring

```bash
# Watch rollout
kubectl rollout status deployment/myapp --timeout=5m

# Check events
kubectl get events --sort-by='.lastTimestamp' -n mynamespace
```

## Critical Reminders

- No Friday deployments to production
- 15+ minute post-deployment monitoring
- Test rollback procedure BEFORE production deployment
- Document blast radius for every change
