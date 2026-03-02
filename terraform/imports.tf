# =============================================================================
# Import blocks for existing GCP resources
# =============================================================================
# These resources were created outside Terraform (via gcloud CLI).
# Run: terraform plan -generate-config-out=generated.tf  (first time)
# Then: terraform apply
# =============================================================================

# Artifact Registry - thebotclub docker repo
import {
  to = module.gcp.google_artifact_registry_repository.app
  id = "projects/thebotclub/locations/australia-southeast1/repositories/thebotclub"
}

# GitHub Actions service account
import {
  to = module.gcp.google_service_account.github_actions
  id = "projects/thebotclub/serviceAccounts/github-actions@thebotclub.iam.gserviceaccount.com"
}

# Workload Identity Pool
import {
  to = module.gcp.google_iam_workload_identity_pool.github
  id = "projects/thebotclub/locations/global/workloadIdentityPools/github-pool"
}

# Workload Identity Pool Provider
import {
  to = module.gcp.google_iam_workload_identity_pool_provider.github
  id = "projects/thebotclub/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
}

# Cloud Run service (thebotclub-production)
import {
  to = module.gcp.google_cloud_run_v2_service.app
  id = "projects/thebotclub/locations/australia-southeast1/services/thebotclub-production"
}
