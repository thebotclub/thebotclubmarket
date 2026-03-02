# =============================================================================
# GCP Module Variables
# =============================================================================

variable "project_name" {
  description = "Project identifier"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
}

variable "container_image" {
  description = "Container image URI"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 3000
}

variable "database_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "database_version" {
  description = "PostgreSQL version string"
  type        = string
  default     = "POSTGRES_15"
}

variable "database_username" {
  description = "Database administrator username"
  type        = string
  default     = "thebotclub"
}

variable "database_password" {
  description = "Database administrator password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "database_authorized_networks" {
  description = "Authorized networks for direct Cloud SQL access (empty = Cloud SQL Auth Proxy only)"
  type = list(object({
    name = string
    cidr = string
  }))
  default = []
}

variable "custom_domain" {
  description = "Custom domain for the application"
  type        = string
  default     = ""
}

variable "github_org" {
  description = "GitHub organization or username for Workload Identity"
  type        = string
  default     = "thebotclub"
}

variable "github_repo" {
  description = "GitHub repository name for Workload Identity"
  type        = string
  default     = "thebotclub"
}

variable "nextauth_secret" {
  description = "NextAuth.js secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_secret_key" {
  description = "Stripe secret key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook secret"
  type        = string
  sensitive   = true
  default     = ""
}
