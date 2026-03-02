# =============================================================================
# The Bot Club - GCP Module
# =============================================================================
# Manages: Cloud SQL, Secret Manager, Cloud Run v2, Service Accounts,
#          Artifact Registry, Workload Identity Pool for GitHub Actions
# =============================================================================

locals {
  app_name = "${var.project_name}-${var.environment}"

  app_url = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${local.app_name}-${var.gcp_project_id}.${var.gcp_region}.run.app"
}

# =============================================================================
# Service Account - Cloud Run runtime
# =============================================================================

resource "google_service_account" "cloud_run" {
  account_id   = "${local.app_name}-sa"
  display_name = "Cloud Run service account for ${local.app_name}"
  project      = var.gcp_project_id
}

# =============================================================================
# Service Account - GitHub Actions (existing, imported)
# =============================================================================

resource "google_service_account" "github_actions" {
  account_id   = "github-actions"
  display_name = "GitHub Actions CI/CD"
  project      = var.gcp_project_id
}

# =============================================================================
# Artifact Registry
# =============================================================================

resource "google_artifact_registry_repository" "app" {
  repository_id = var.project_name
  location      = var.gcp_region
  format        = "DOCKER"
  description   = "Docker images for ${local.app_name}"
  project       = var.gcp_project_id
}

# =============================================================================
# Workload Identity Pool + Provider (GitHub Actions OIDC)
# =============================================================================

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions OIDC authentication"
  project                   = var.gcp_project_id
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Provider"
  project                            = var.gcp_project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.github_org}/${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow GitHub Actions to impersonate the github-actions service account
resource "google_service_account_iam_member" "github_actions_wif" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# GitHub Actions SA permissions
resource "google_project_iam_member" "github_actions_run_admin" {
  project = var.gcp_project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_ar_writer" {
  project = var.gcp_project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_sa_user" {
  project = var.gcp_project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# =============================================================================
# Cloud SQL - PostgreSQL
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
  name     = var.project_name
  instance = google_sql_database_instance.postgres.name
  project  = var.gcp_project_id
}

resource "google_sql_user" "app_user" {
  name     = var.database_username
  instance = google_sql_database_instance.postgres.name
  password = var.database_password
  project  = var.gcp_project_id
}

# Grant Cloud Run SA access to Cloud SQL
resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# =============================================================================
# Secret Manager
# =============================================================================

resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
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
  secret = google_secret_manager_secret.database_url.id
  # Uses Cloud SQL Auth Proxy socket path format for Cloud Run
  secret_data = "postgresql://${var.database_username}:${var.database_password}@localhost/${google_sql_database.app_db.name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"

  depends_on = [google_sql_database_instance.postgres, google_sql_database.app_db]
}

resource "google_secret_manager_secret" "nextauth_secret" {
  secret_id = "nextauth-secret"
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
  secret_data = var.nextauth_secret != "" ? var.nextauth_secret : "change-me-generate-with-openssl-rand-base64-32"
}

resource "google_secret_manager_secret" "stripe_secret_key" {
  secret_id = "stripe-secret-key"
  project   = var.gcp_project_id

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "stripe_secret_key" {
  secret      = google_secret_manager_secret.stripe_secret_key.id
  secret_data = var.stripe_secret_key != "" ? var.stripe_secret_key : "placeholder"
}

resource "google_secret_manager_secret" "stripe_webhook_secret" {
  secret_id = "stripe-webhook-secret"
  project   = var.gcp_project_id

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "stripe_webhook_secret" {
  secret      = google_secret_manager_secret.stripe_webhook_secret.id
  secret_data = var.stripe_webhook_secret != "" ? var.stripe_webhook_secret : "placeholder"
}

# =============================================================================
# IAM - Secret access for Cloud Run SA
# =============================================================================

resource "google_secret_manager_secret_iam_member" "run_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "run_nextauth_secret" {
  secret_id = google_secret_manager_secret.nextauth_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "run_stripe_secret_key" {
  secret_id = google_secret_manager_secret.stripe_secret_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "run_stripe_webhook_secret" {
  secret_id = google_secret_manager_secret.stripe_webhook_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# =============================================================================
# Cloud Run v2 Service
# =============================================================================

resource "google_cloud_run_v2_service" "app" {
  name     = "${var.project_name}-${var.environment}"
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

      # Cloud SQL Auth Proxy sidecar
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # Secrets from Secret Manager
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
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_secret_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_webhook_secret.secret_id
            version = "latest"
          }
        }
      }

      # Static env vars
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "NEXTAUTH_URL"
        value = local.app_url
      }

      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = local.app_url
      }

      env {
        name  = "NEXT_PUBLIC_BASE_DOMAIN"
        value = var.custom_domain
      }
    }

    # Cloud SQL Auth Proxy sidecar container
    containers {
      image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2"
      args  = ["--structured-logs", "--unix-socket=/cloudsql", google_sql_database_instance.postgres.connection_name]

      resources {
        limits = {
          cpu    = "0.5"
          memory = "128Mi"
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      empty_dir {}
    }

    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    timeout = "300s"
  }

  depends_on = [
    google_sql_database.app_db,
    google_sql_user.app_user,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.nextauth_secret,
    google_secret_manager_secret_version.stripe_secret_key,
    google_secret_manager_secret_version.stripe_webhook_secret,
    google_secret_manager_secret_iam_member.run_database_url,
    google_secret_manager_secret_iam_member.run_nextauth_secret,
    google_secret_manager_secret_iam_member.run_stripe_secret_key,
    google_secret_manager_secret_iam_member.run_stripe_webhook_secret,
  ]
}

# =============================================================================
# IAM - Public invoker for Cloud Run
# =============================================================================

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
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

output "database_connection_name" {
  value     = google_sql_database_instance.postgres.connection_name
  sensitive = true
}

output "artifact_registry_url" {
  value = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "github_actions_service_account" {
  value = google_service_account.github_actions.email
}
