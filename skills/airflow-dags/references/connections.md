# Connections & Secrets

## Contents
- [Connection Basics](#connection-basics)
- [Creating Connections](#creating-connections)
- [URI Format](#uri-format)
- [JSON Format](#json-format)
- [Secrets Backends](#secrets-backends)
- [Security](#security)
- [Testing Connections](#testing-connections)

## Connection Basics

Airflow connections store credentials and configuration for external systems. Operators and hooks use connections via `conn_id` — never hardcode credentials.

```python
# GOOD: Credentials from Airflow connection
hook = PostgresHook(postgres_conn_id="my_postgres")

# BAD: Hardcoded credentials
import psycopg2
conn = psycopg2.connect(host="db.example.com", password="secret123")
```

### Connection Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `conn_id` | Unique identifier | `aws_default` |
| `conn_type` | Connection type | `postgres`, `aws`, `http` |
| `host` | Hostname or URL | `db.example.com` |
| `port` | Port number | `5432` |
| `schema` | Database name | `mydb` |
| `login` | Username | `admin` |
| `password` | Password | `***` |
| `extra` | JSON with additional params | `{"region": "us-east-1"}` |

## Creating Connections

### 1. Airflow UI

Admin → Connections → Add. Best for manual/ad-hoc setup.

### 2. Environment Variables

```bash
# URI format
export AIRFLOW_CONN_MY_POSTGRES="postgresql://user:pass@host:5432/mydb"

# JSON format (preferred for complex connections)
export AIRFLOW_CONN_MY_AWS='{"conn_type": "aws", "extra": {"region_name": "us-east-1"}}'
```

Naming convention: `AIRFLOW_CONN_` + `CONN_ID` (uppercase).

### 3. Secrets Backend

Fetch from external secrets manager at runtime. See [Secrets Backends](#secrets-backends).

### 4. Airflow REST API

```bash
curl -X POST "http://localhost:8080/api/v1/connections" \
  -H "Content-Type: application/json" \
  -d '{"connection_id": "my_conn", "conn_type": "postgres", "host": "db.example.com"}'
```

### 5. airflow_settings.yaml (Astro CLI)

```yaml
airflow:
  connections:
    - conn_id: my_postgres
      conn_type: postgres
      conn_host: localhost
      conn_port: 5432
      conn_schema: mydb
      conn_login: admin
      conn_password: password123
```

Loaded automatically by `astro dev start`.

## URI Format

```
conn-type://login:password@host:port/schema?param1=val1&param2=val2
```

Examples:

```bash
# PostgreSQL
export AIRFLOW_CONN_MY_PG="postgresql://user:pass@host:5432/mydb"

# MySQL
export AIRFLOW_CONN_MY_MYSQL="mysql://user:pass@host:3306/mydb"

# HTTP
export AIRFLOW_CONN_MY_API="http://api.example.com"

# S3 (no host needed — uses AWS config)
export AIRFLOW_CONN_MY_S3="aws://"
```

**URL-encode special characters** in password: `p@ss` → `p%40ss`

## JSON Format

Preferred for complex connections with extra parameters:

```bash
export AIRFLOW_CONN_MY_AWS='{
  "conn_type": "aws",
  "login": "AKIAIOSFODNN7EXAMPLE",
  "password": "secret_access_key",
  "extra": {
    "region_name": "us-east-1",
    "role_arn": "arn:aws:iam::123456789:role/my-role"
  }
}'

export AIRFLOW_CONN_MY_PG='{
  "conn_type": "postgres",
  "host": "db.example.com",
  "port": 5432,
  "schema": "mydb",
  "login": "admin",
  "password": "secret123",
  "extra": {
    "sslmode": "require"
  }
}'
```

## Secrets Backends

Fetch credentials from external secrets managers. More secure than storing in Airflow metadata DB or env vars.

### Supported Backends

| Backend | Provider Package | Config Class |
|---------|-----------------|--------------|
| AWS Secrets Manager | `apache-airflow-providers-amazon` | `SecretsManagerBackend` |
| AWS Systems Manager | `apache-airflow-providers-amazon` | `SystemsManagerParameterStoreBackend` |
| Azure Key Vault | `apache-airflow-providers-microsoft-azure` | `AzureKeyVaultBackend` |
| Google Secret Manager | `apache-airflow-providers-google` | `CloudSecretManagerBackend` |
| HashiCorp Vault | `apache-airflow-providers-hashicorp` | `VaultBackend` |

### Configuration

```bash
# AWS Secrets Manager
AIRFLOW__SECRETS__BACKEND=airflow.providers.amazon.aws.secrets.secrets_manager.SecretsManagerBackend
AIRFLOW__SECRETS__BACKEND_KWARGS='{"connections_prefix": "airflow/connections", "variables_prefix": "airflow/variables"}'

# Azure Key Vault
AIRFLOW__SECRETS__BACKEND=airflow.providers.microsoft.azure.secrets.key_vault.AzureKeyVaultBackend
AIRFLOW__SECRETS__BACKEND_KWARGS='{"connections_prefix": "airflow-connections", "vault_url": "https://my-vault.vault.azure.net/"}'
```

### Lookup Order

1. Secrets backend (if configured)
2. Environment variables
3. Airflow metadata database

First match wins. This allows secrets backend for production while using env vars for local development.

## Security

### Hiding Sensitive Fields

```bash
# Hide password and extra fields in UI and logs (default: True)
AIRFLOW__CORE__HIDE_SENSITIVE_VAR_CONN_FIELDS=True
```

### Best Practices

1. **Never commit credentials to version control**
2. **Use secrets backends in production** — not env vars or UI
3. **Rotate credentials regularly** — secrets backends support automatic rotation
4. **Use IAM roles** instead of access keys where possible (AWS, GCP)
5. **Restrict connection access** — Airflow RBAC controls who can view/edit connections
6. **Encrypt at rest** — Airflow encrypts `password` and `extra` fields using Fernet key

### Fernet Encryption

Airflow encrypts sensitive connection fields. Generate a key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set via: `AIRFLOW__CORE__FERNET_KEY=your_generated_key`

## Testing Connections

Connection testing is disabled by default. Enable it:

```bash
AIRFLOW__CORE__TEST_CONNECTION=Enabled
```

### CLI

```bash
airflow connections test my_postgres
# Output: Connection successfully tested

astro dev run connections test my_postgres  # Astro CLI
```

### UI

Test button available on the Connections page when enabled.

### In Code

```python
from airflow.hooks.base import BaseHook

conn = BaseHook.get_connection("my_postgres")
print(f"Host: {conn.host}, Port: {conn.port}")
```
