variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "australia-southeast1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "container_image" {
  description = "Container image URI"
  type        = string
}

variable "database_username" {
  description = "Database username"
  type        = string
  default     = "botclub"
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}
