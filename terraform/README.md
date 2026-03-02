# The Bot Club — Terraform Infrastructure

Manages GCP infrastructure for [thebot.club](https://thebot.club) via Terraform.

## Architecture

- **Cloud Run v2** — containerised Next.js app (`thebotclub-production`)
- **Cloud SQL** — PostgreSQL 15 (`thebotclub-production-db`)
- **Secret Manager** — `database-url`, `nextauth-secret`, `stripe-secret-key`, `stripe-webhook-secret`
- **Artifact Registry** — Docker images (`thebotclub`)
- **Workload Identity** — GitHub Actions OIDC auth (`github-pool / github-provider`)

## Prerequisites

1. GCS bucket for Terraform state: `thebotclub-terraform-state`
   ```bash
   gcloud storage buckets create gs://thebotclub-terraform-state \
     --project=thebotclub --location=australia-southeast1 \
     --uniform-bucket-level-access
   ```
2. Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```

## First-Time Setup (import existing resources)

```bash
cd terraform/

terraform init
terraform plan -var-file=environments/production.tfvars \
  -var="database_password=$DB_PASSWORD" \
  -var="nextauth_secret=$NEXTAUTH_SECRET"
terraform apply -var-file=environments/production.tfvars \
  -var="database_password=$DB_PASSWORD" \
  -var="nextauth_secret=$NEXTAUTH_SECRET"
```

## Secrets

Never commit secrets. Pass them via environment variables:

```bash
export TF_VAR_database_password="..."
export TF_VAR_nextauth_secret="..."
export TF_VAR_stripe_secret_key="..."
export TF_VAR_stripe_webhook_secret="..."
```

Or create a gitignored `secrets.tfvars` file and pass `-var-file=secrets.tfvars`.

## GitHub Actions

The Workload Identity setup allows GitHub Actions to authenticate without long-lived keys:

```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ steps.tf-outputs.outputs.workload_identity_provider }}
    service_account: github-actions@thebotclub.iam.gserviceaccount.com
```

## Database Connection

Cloud Run uses the **Cloud SQL Auth Proxy** sidecar. The `DATABASE_URL` secret uses the Unix socket format:

```
postgresql://user:pass@localhost/thebotclub?host=/cloudsql/<project>:<region>:<instance>
```
