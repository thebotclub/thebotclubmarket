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

variable "database_username" {
  description = "Database administrator username"
  type        = string
}

variable "database_password" {
  description = "Database administrator password"
  type        = string
  sensitive   = true
}

variable "database_tier" {
  description = "Cloud SQL machine tier"
  type        = string
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
}

variable "nextauth_secret" {
  description = "NextAuth.js secret"
  type        = string
  sensitive   = true
}

variable "github_client_id" {
  description = "GitHub OAuth client ID"
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "microsoft_client_id" {
  description = "Microsoft OAuth client ID"
  type        = string
  default     = ""
}

variable "microsoft_client_secret" {
  description = "Microsoft OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "microsoft_tenant_id" {
  description = "Microsoft tenant ID"
  type        = string
  default     = "common"
}

variable "resend_api_key" {
  description = "Resend API key"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# AI Integration Secrets
# =============================================================================

variable "openai_api_key" {
  description = "OpenAI API key for AI integrations"
  type        = string
  sensitive   = true
  default     = ""
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI integrations"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Stripe Billing Secrets
# =============================================================================

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

variable "stripe_starter_price_id" {
  description = "Stripe Starter plan price ID"
  type        = string
  default     = ""
}

variable "stripe_professional_price_id" {
  description = "Stripe Professional plan price ID"
  type        = string
  default     = ""
}

variable "stripe_business_price_id" {
  description = "Stripe Business plan price ID"
  type        = string
  default     = ""
}

# =============================================================================
# Cron Job Authentication
# =============================================================================

variable "cron_secret" {
  description = "Secret for cron job authentication"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Custom Domain
# =============================================================================

variable "custom_domain" {
  description = "Custom domain for the application (e.g., m8x.ai)"
  type        = string
  default     = ""
}

variable "database_authorized_networks" {
  description = "Authorized networks for Cloud SQL access (empty = no public access, use Cloud SQL Proxy)"
  type = list(object({
    name = string
    cidr = string
  }))
  default = []
}
