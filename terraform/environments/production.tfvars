# =============================================================================
# Production Environment - The Bot Club
# =============================================================================

project_name   = "thebotclub"
environment    = "production"
gcp_project_id = "thebotclub"
gcp_region     = "australia-southeast1"

container_image = "australia-southeast1-docker.pkg.dev/thebotclub/thebotclub/thebotclub:latest"
container_port  = 3000

database_tier    = "db-f1-micro"
database_version = "POSTGRES_15"
database_username = "thebotclub"

custom_domain = "thebot.club"

github_org  = "thebotclub"
github_repo = "thebotclub"

# Secrets — set via TF_VAR_* env vars or a secrets.tfvars (gitignored)
# database_password     = ""
# nextauth_secret       = ""
# stripe_secret_key     = ""
# stripe_webhook_secret = ""
