# =============================================================================
# The Bot Club - GCP Infrastructure
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.16"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "gcs" {
    bucket = "thebotclub-terraform-state"
    prefix = "thebotclub.tfstate"
  }
}

# =============================================================================
# Provider
# =============================================================================

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# =============================================================================
# GCP Module
# =============================================================================

module "gcp" {
  source = "./modules/gcp"

  project_name   = var.project_name
  environment    = var.environment
  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region

  # Container
  container_image = var.container_image
  container_port  = var.container_port

  # Database
  database_tier     = var.database_tier
  database_version  = var.database_version
  database_username = var.database_username
  database_password = var.database_password

  # Custom domain
  custom_domain = var.custom_domain

  # GitHub Actions CI/CD
  github_org  = var.github_org
  github_repo = var.github_repo

  # Secrets
  nextauth_secret       = var.nextauth_secret
  stripe_secret_key     = var.stripe_secret_key
  stripe_webhook_secret = var.stripe_webhook_secret
}

# =============================================================================
# Outputs
# =============================================================================

output "application_url" {
  description = "Cloud Run service URL"
  value       = module.gcp.application_url
}

output "database_connection_name" {
  description = "Cloud SQL connection name for Cloud SQL Auth Proxy"
  value       = module.gcp.database_connection_name
  sensitive   = true
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = module.gcp.artifact_registry_url
}

output "workload_identity_provider" {
  description = "Workload Identity Provider resource name for GitHub Actions"
  value       = module.gcp.workload_identity_provider
}

output "github_actions_service_account" {
  description = "Service account email for GitHub Actions"
  value       = module.gcp.github_actions_service_account
}
