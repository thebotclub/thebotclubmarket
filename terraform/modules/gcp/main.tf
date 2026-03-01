# =============================================================================
# GCP Module - Cloud Run with Cloud SQL
# =============================================================================
# Simplified module for reliability

locals {
  app_name = "${var.project_name}-${var.environment}"
}

# =============================================================================
# Service Account
# =============================================================================

resource "google_service_account" "cloud_run" {
  account_id   = "${local.app_name}-sa"
  display_name = "Service account for ${local.app_name}"
  project      = var.gcp_project_id
}

# =============================================================================
# Cloud SQL
# =============================================================================

resource "google_sql_database_instance" "postgres" {
  name             = "${local.app_name}-db"
  database_version = var.database_version
  region           = var.gcp_region
  project          = var.gcp_project_id

  settings {
    tier              = var.database_tier
    availability_type = "REGIONAL"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      location                       = var.gcp_region
    }

    ip_configuration {
      ssl_mode     = "ENCRYPTED_ONLY"
      ipv4_enabled = true

      dynamic "authorized_networks" {
        for_each = var.database_authorized_networks
        content {
          name  = authorized_networks.value.name
          value = authorized_networks.value.cidr
        }
      }
    }
  }

  deletion_protection = false
}

resource "google_sql_database" "app_db" {
  name     = "botclub"
  instance = google_sql_database_instance.postgres.name
  project  = var.gcp_project_id
}

resource "google_sql_user" "app_user" {
  name     = var.database_username
  instance = google_sql_database_instance.postgres.name
  password = var.database_password
  project  = var.gcp_project_id
}

# =============================================================================
# Secret Manager - Required Secrets
# =============================================================================

resource "google_secret_manager_secret" "nextauth_secret" {
  secret_id = "${local.app_name}-nextauth-secret"
  project   = var.gcp_project_id

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "nextauth_secret" {
  secret      = google_secret_manager_secret.nextauth_secret.id
  secret_data = var.nextauth_secret
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.app_name}-database-url"
  project   = var.gcp_project_id

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  # Use Cloud SQL Unix socket connector (not private IP) so Cloud Run can reach
  # the database without VPC peering. Cloud Run mounts the socket via the
  # cloud_sql_instances volume below.
  secret_data = "postgresql://${var.database_username}:${var.database_password}@localhost/${google_sql_database.app_db.name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
}

# =============================================================================
# Secret Manager - Optional Secrets (count-based for sensitive values)
# =============================================================================

# Note: Optional secrets stored but not yet exposed to Cloud Run
# Can be added via post-deployment configuration if needed

# =============================================================================
# Cloud Run Service
# =============================================================================

resource "google_cloud_run_v2_service" "app" {
  name     = local.app_name
  location = var.gcp_region
  project  = var.gcp_project_id

  template {
    service_account = google_service_account.cloud_run.email

    containers {
      image = var.container_image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # Required env vars from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "NEXTAUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.nextauth_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      # NEXTAUTH_URL and APP_URL - uses custom domain if set, otherwise Cloud Run URL
      env {
        name  = "NEXTAUTH_URL"
        value = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${local.app_name}-${var.gcp_project_id}.${var.gcp_region}.run.app"
      }

      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${local.app_name}-${var.gcp_project_id}.${var.gcp_region}.run.app"
      }

      # Subdomain Configuration - REQUIRED for multi-tenant subdomain routing
      env {
        name  = "NEXT_PUBLIC_SUBDOMAIN_ENABLED"
        value = var.custom_domain != "" ? "true" : "false"
      }

      env {
        name  = "NEXT_PUBLIC_BASE_DOMAIN"
        value = var.custom_domain
      }

      # Cookie domain with leading dot for cross-subdomain session sharing
      env {
        name  = "NEXTAUTH_COOKIE_DOMAIN"
        value = var.custom_domain != "" ? ".${var.custom_domain}" : ""
      }

      env {
        name  = "AUTH_URL"
        value = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${local.app_name}-${var.gcp_project_id}.${var.gcp_region}.run.app"
      }

      # M8: OAuth and payment secrets passed to Cloud Run
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      env {
        name  = "GOOGLE_CLIENT_SECRET"
        value = var.google_client_secret
      }

      env {
        name  = "GITHUB_ID"
        value = var.github_client_id
      }

      env {
        name  = "GITHUB_SECRET"
        value = var.github_client_secret
      }

      env {
        name  = "STRIPE_SECRET_KEY"
        value = var.stripe_secret_key
      }

      env {
        name  = "STRIPE_WEBHOOK_SECRET"
        value = var.stripe_webhook_secret
      }

      env {
        name  = "OPENAI_API_KEY"
        value = var.openai_api_key
      }

      # M7: Mount Cloud SQL socket so the DATABASE_URL can use the Unix socket connector
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    # M7: Cloud SQL socket volume — Cloud Run manages the Cloud SQL Auth Proxy
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    timeout = "300s"

    scaling {
      max_instance_count = 100
      min_instance_count = 1
    }
  }

  depends_on = [
    google_sql_database.app_db,
    google_sql_user.app_user,
    google_secret_manager_secret_version.nextauth_secret,
    google_secret_manager_secret_version.database_url
  ]
}

# =============================================================================
# IAM - Secret Access
# =============================================================================

# M7: Grant Cloud SQL client role so the Cloud Run service account can connect
resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "nextauth_access" {
  secret_id = google_secret_manager_secret.nextauth_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "database_url_access" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Optional secret IAM bindings removed - using count-based approach
# Add individual IAM bindings here if optional secrets are needed

# =============================================================================
# Cloud Run IAM - Public Access
# =============================================================================

resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# =============================================================================
# Outputs
# =============================================================================

output "application_url" {
  value = google_cloud_run_v2_service.app.uri
}

output "database_host" {
  value     = google_sql_database_instance.postgres.private_ip_address
  sensitive = true
}
