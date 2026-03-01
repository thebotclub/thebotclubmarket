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
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

module "gcp" {
  source = "./modules/gcp"

  project_name   = "thebotclub"
  environment    = var.environment
  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region
  container_image = var.container_image
  
  database_username = var.database_username
  database_password = var.database_password

  nextauth_secret      = var.nextauth_secret
  github_client_id     = var.github_client_id
  github_client_secret = var.github_client_secret
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  stripe_secret_key    = var.stripe_secret_key
  stripe_webhook_secret = var.stripe_webhook_secret
  openai_api_key       = var.openai_api_key
}
