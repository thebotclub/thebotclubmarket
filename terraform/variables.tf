# =============================================================================
# Root Variables
# =============================================================================

variable "project_name" {
  description = "Project identifier"
  type        = string
  default     = "thebotclub"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "australia-southeast1"
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
  description = "PostgreSQL version"
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

variable "custom_domain" {
  description = "Custom domain (e.g. thebot.club)"
  type        = string
  default     = ""
}

variable "github_org" {
  description = "GitHub organization or username"
  type        = string
  default     = "thebotclub"
}

variable "github_repo" {
  description = "GitHub repository name"
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
