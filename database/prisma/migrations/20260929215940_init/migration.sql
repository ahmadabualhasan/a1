-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('business', 'creator', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('email_verification', 'password_reset', 'mfa_other');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('platform', 'business', 'creator');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'suspended', 'expired');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('invited', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "SocialConnectionStatus" AS ENUM ('not_connected', 'connected', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "MetricVerificationState" AS ENUM ('verified', 'self_reported');

-- CreateEnum
CREATE TYPE "CatalogItemType" AS ENUM ('product', 'service', 'subscription', 'other');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'pending_review', 'published', 'active', 'paused', 'ended', 'archived');

-- CreateEnum
CREATE TYPE "CompensationType" AS ENUM ('commission_only', 'gift_commission', 'fixed_fee_commission', 'paid_content');

-- CreateEnum
CREATE TYPE "ConversionSourceType" AS ENUM ('webhook_api', 'pos', 'booking_api', 'redemption_interface', 'manual_evidence', 'other');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('online', 'offline', 'hybrid');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'waitlisted', 'accepted', 'rejected', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('pending', 'active', 'paused', 'completed', 'cancelled', 'disputed', 'terminated');

-- CreateEnum
CREATE TYPE "PromotionAssetStatus" AS ENUM ('pending', 'active', 'paused', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "QrStatus" AS ENUM ('active', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "TouchpointMethod" AS ENUM ('code', 'link', 'qr', 'other');

-- CreateEnum
CREATE TYPE "ConflictState" AS ENUM ('none', 'conflict', 'unresolved');

-- CreateEnum
CREATE TYPE "DedupeState" AS ENUM ('unique', 'duplicate', 'suspect');

-- CreateEnum
CREATE TYPE "DecisionState" AS ENUM ('attributed', 'unattributed', 'conflicted', 'invalid', 'duplicate');

-- CreateEnum
CREATE TYPE "ConversionType" AS ENUM ('sale', 'booking', 'redemption', 'lead', 'registration', 'other');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('received', 'validated', 'attributed', 'approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded', 'reversed');

-- CreateEnum
CREATE TYPE "VerifiedState" AS ENUM ('verified', 'self_reported', 'unknown');

-- CreateEnum
CREATE TYPE "ConversionEventState" AS ENUM ('received', 'processed', 'failed', 'ignored');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('percentage', 'fixed', 'hybrid');

-- CreateEnum
CREATE TYPE "CommissionBaseType" AS ENUM ('gross', 'discounted', 'net', 'custom');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('half_up', 'half_even', 'floor', 'ceil');

-- CreateEnum
CREATE TYPE "RefundBehavior" AS ENUM ('clawback', 'reverse', 'none');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('pending', 'approved', 'funded', 'available', 'payout_requested', 'processing', 'paid', 'reversed', 'clawback');

-- CreateEnum
CREATE TYPE "LedgerOwnerType" AS ENUM ('platform', 'business', 'creator', 'provider');

-- CreateEnum
CREATE TYPE "LedgerAccountStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('pending', 'confirmed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('available', 'requested', 'processing', 'paid', 'failed', 'reversed', 'cancelled');

-- CreateEnum
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('pending', 'processing', 'success', 'failed');

-- CreateEnum
CREATE TYPE "ProviderEnvironment" AS ENUM ('test', 'live');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('running', 'completed', 'failed', 'needs_review');

-- CreateEnum
CREATE TYPE "ReconciliationItemStatus" AS ENUM ('matched', 'missing_local', 'missing_external', 'mismatch', 'duplicate', 'late');

-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('ecommerce', 'pos', 'booking', 'payment', 'crm', 'custom', 'other');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('not_connected', 'connecting', 'connected', 'testing', 'live', 'paused', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "WebhookProcessingState" AS ENUM ('received', 'queued', 'processing', 'processed', 'failed', 'ignored', 'dead_letter');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'push', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'file', 'system');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('not_started', 'submitted', 'changes_requested', 'resubmitted', 'approved');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('submitted', 'approved', 'changes_requested', 'resubmitted', 'rejected');

-- CreateEnum
CREATE TYPE "VerificationSubjectType" AS ENUM ('business', 'creator', 'user');

-- CreateEnum
CREATE TYPE "VerificationCaseStatus" AS ENUM ('unverified', 'pending', 'verified', 'suspended', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "FraudFlagStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "FraudCaseStatus" AS ENUM ('open', 'evidence', 'review', 'decision', 'closed');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'evidence', 'hold', 'review', 'decision', 'adjustment', 'closed');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('not_required', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('private', 'restricted', 'public');

-- CreateEnum
CREATE TYPE "LegalDocumentStatus" AS ENUM ('draft', 'published', 'retired');

-- CreateEnum
CREATE TYPE "SettingEnvironment" AS ENUM ('dev', 'staging', 'production');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('access', 'deletion', 'rectification', 'portability');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMPTZ(6),
    "display_name" TEXT NOT NULL,
    "image" TEXT,
    "account_type" "AccountType" NOT NULL DEFAULT 'creator',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "password_hash" TEXT,
    "access_token_ref" TEXT,
    "refresh_token_ref" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "user_id" UUID,
    "purpose" "VerificationPurpose",
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "country" CHAR(2) NOT NULL,
    "city" TEXT,
    "timezone" TEXT NOT NULL,
    "website_url" TEXT,
    "logo_file_id" UUID,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "billing_ready" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "allowed_destination_hosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_members" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creators" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "avatar_file_id" UUID,
    "country" CHAR(2),
    "city" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portfolio_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "payout_readiness" TEXT NOT NULL DEFAULT 'not_ready',
    "payout_method" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_account_id" TEXT,
    "handle" TEXT,
    "profile_url" TEXT,
    "connection_status" "SocialConnectionStatus" NOT NULL DEFAULT 'not_connected',
    "verification_state" "MetricVerificationState" NOT NULL DEFAULT 'self_reported',
    "follower_count" BIGINT,
    "average_views" BIGINT,
    "engagement_rate" DECIMAL(9,6),
    "likes_avg" BIGINT,
    "comments_avg" BIGINT,
    "audience_data" JSONB,
    "source_platform_version" TEXT,
    "metric_definition_version" TEXT,
    "fetched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CatalogItemType" NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "price_minor" BIGINT,
    "currency" CHAR(3),
    "external_ref" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "media_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image_file_id" UUID,
    "category" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "timezone" TEXT NOT NULL,
    "creator_capacity" INTEGER,
    "participant_cap" INTEGER,
    "application_deadline_at" TIMESTAMPTZ(6),
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "compensation_type" "CompensationType" NOT NULL,
    "product_service_provided" BOOLEAN NOT NULL DEFAULT false,
    "fixed_fee_minor" BIGINT,
    "destination_url" TEXT,
    "conversion_source_type" "ConversionSourceType" NOT NULL,
    "integration_id" UUID,
    "fulfillment_mode" "FulfillmentMode" NOT NULL DEFAULT 'online',
    "location_country" CHAR(2),
    "location_city" TEXT,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" CHAR(3) NOT NULL,
    "customer_discount_config" JSONB NOT NULL,
    "commission_rule_id" UUID,
    "attribution_policy" JSONB NOT NULL,
    "attribution_policy_version" TEXT NOT NULL,
    "hold_period_days" INTEGER NOT NULL,
    "conversion_approval_mode" TEXT NOT NULL DEFAULT 'auto_verified',
    "deliverable_config" JSONB,
    "content_rights_config" JSONB,
    "promotion_rules" JSONB,
    "cancellation_refund_config" JSONB,
    "disclosure_requirements" JSONB,
    "legal_document_version" TEXT,
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_eligibility_rules" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "rule_type" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "campaign_eligibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_applications" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "rejection_reason" TEXT,
    "waitlist_position" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaign_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_invitations" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "proposed_terms_json" JSONB,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaign_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnerships" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "application_id" UUID,
    "invitation_id" UUID,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'pending',
    "accepted_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "terms_snapshot_id" UUID,
    "attribution_policy_version" TEXT NOT NULL,
    "commission_rule_version" TEXT NOT NULL,
    "legal_document_version" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "partnerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_terms_snapshots" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "campaign_config_version" INTEGER NOT NULL,
    "terms_json" JSONB NOT NULL,
    "commission_config" JSONB NOT NULL,
    "discount_config" JSONB NOT NULL,
    "attribution_policy" JSONB NOT NULL,
    "deliverables_json" JSONB,
    "content_rights_json" JSONB,
    "promotion_rules_json" JSONB,
    "payout_schedule_json" JSONB,
    "hold_period_days" INTEGER NOT NULL,
    "refund_policy_json" JSONB,
    "fee_plan_json" JSONB NOT NULL,
    "accepted_by" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "partnership_terms_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_events" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partnership_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_codes" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "normalized_code" TEXT NOT NULL,
    "status" "PromotionAssetStatus" NOT NULL DEFAULT 'pending',
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "rules_json" JSONB,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotion_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_code_redemptions" (
    "id" UUID NOT NULL,
    "promotion_code_id" UUID NOT NULL,
    "conversion_id" UUID,
    "customer_ref_hash" TEXT,
    "redeemed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "promotion_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_links" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "destination_url" TEXT NOT NULL,
    "allowed_host" TEXT NOT NULL,
    "status" "PromotionAssetStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_assets" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "referral_link_id" UUID,
    "asset_file_id" UUID NOT NULL,
    "encoded_url" TEXT NOT NULL,
    "status" "QrStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_clicks" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "campaign_id" UUID,
    "partnership_id" UUID,
    "creator_id" UUID,
    "referral_link_id" UUID,
    "tracking_session_id" UUID,
    "click_ref" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'link',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_key_hash" TEXT,
    "source" TEXT,
    "landing_url" TEXT,
    "user_agent_hash" TEXT,
    "ip_hash" TEXT,
    "consent_state" TEXT,
    "suspected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tracking_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_sessions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "campaign_id" UUID,
    "partnership_id" UUID,
    "creator_id" UUID,
    "session_key_hash" TEXT NOT NULL,
    "first_touch_at" TIMESTAMPTZ(6),
    "last_touch_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "consent_state" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_touchpoints" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversion_id" UUID,
    "campaign_id" UUID,
    "partnership_id" UUID,
    "creator_id" UUID,
    "method" "TouchpointMethod" NOT NULL,
    "event_type" TEXT NOT NULL,
    "external_event_id" TEXT,
    "source_ref" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "ineligible_reason" TEXT,
    "metadata" JSONB,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_touchpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_decisions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "conversion_id" UUID NOT NULL,
    "selected_partnership_id" UUID,
    "selected_creator_id" UUID,
    "selected_touchpoint_id" UUID,
    "method" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "window_seconds" BIGINT,
    "competing_touchpoints" JSONB,
    "conflict_state" "ConflictState" NOT NULL,
    "dedupe_state" "DedupeState" NOT NULL,
    "decision_state" "DecisionState" NOT NULL,
    "reason" TEXT NOT NULL,
    "supersedes_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "campaign_id" UUID,
    "partnership_id" UUID,
    "creator_id" UUID,
    "integration_id" UUID,
    "type" "ConversionType" NOT NULL,
    "status" "ConversionStatus" NOT NULL DEFAULT 'received',
    "external_ref" TEXT NOT NULL,
    "gross_minor" BIGINT,
    "discount_minor" BIGINT,
    "tax_minor" BIGINT,
    "shipping_fee_minor" BIGINT,
    "other_fee_minor" BIGINT,
    "net_minor" BIGINT,
    "commissionable_minor" BIGINT,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3),
    "line_items" JSONB,
    "verified_state" "VerifiedState" NOT NULL,
    "source_system" TEXT NOT NULL,
    "customer_ref_hash" TEXT,
    "attribution_decision_id" UUID,
    "review_reason" TEXT,
    "paid_confirmed_at" TIMESTAMPTZ(6),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" UUID NOT NULL,
    "conversion_id" UUID,
    "webhook_event_id" UUID,
    "business_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_event_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_json" JSONB NOT NULL,
    "processing_state" "ConversionEventState" NOT NULL DEFAULT 'received',
    "processing_note" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" TEXT,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "CommissionType" NOT NULL,
    "rate" DECIMAL(9,6),
    "fixed_minor" BIGINT,
    "base_type" "CommissionBaseType" NOT NULL,
    "include_tax" BOOLEAN NOT NULL DEFAULT false,
    "include_shipping" BOOLEAN NOT NULL DEFAULT false,
    "excluded_items" JSONB,
    "min_minor" BIGINT,
    "max_minor" BIGINT,
    "currency" CHAR(3),
    "rounding_mode" "RoundingMode" NOT NULL DEFAULT 'half_up',
    "refund_behavior" "RefundBehavior" NOT NULL DEFAULT 'reverse',
    "active_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_calculations" (
    "id" UUID NOT NULL,
    "conversion_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "terms_snapshot_id" UUID NOT NULL,
    "commission_rule_id" UUID NOT NULL,
    "commission_rule_version" INTEGER NOT NULL,
    "rule_snapshot" JSONB NOT NULL,
    "base_minor" BIGINT NOT NULL,
    "rate" DECIMAL(9,6),
    "fixed_minor" BIGINT,
    "commission_minor" BIGINT NOT NULL,
    "fee_minor" BIGINT NOT NULL DEFAULT 0,
    "fee_plan_snapshot" JSONB NOT NULL,
    "reversed_minor" BIGINT NOT NULL DEFAULT 0,
    "fee_reversed_minor" BIGINT NOT NULL DEFAULT 0,
    "clawback_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'pending',
    "trace" JSONB,
    "hold_until" TIMESTAMPTZ(6) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "funded_at" TIMESTAMPTZ(6),
    "available_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "on_hold" BOOLEAN NOT NULL DEFAULT false,
    "hold_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "owner_type" "LedgerOwnerType" NOT NULL,
    "owner_id" UUID,
    "owner_key" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "LedgerAccountStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "entry_type" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "idempotency_key" TEXT,
    "currency" CHAR(3) NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "description" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry_lines" (
    "id" UUID NOT NULL,
    "ledger_entry_id" UUID NOT NULL,
    "ledger_account_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "line_order" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ledger_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_fundings" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "funding_method" TEXT NOT NULL,
    "provider_reference" TEXT,
    "provider_transaction_id" UUID,
    "status" "FundingStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "requested_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "failure_reason" TEXT,
    "received_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_fundings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "business_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'requested',
    "provider" TEXT NOT NULL,
    "payout_method_snapshot" JSONB,
    "idempotency_key" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "provider_transaction_id" UUID,
    "failure_reason_code" TEXT,
    "risk_hold" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_items" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "commission_calculation_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_attempts" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "status" "PayoutAttemptStatus" NOT NULL DEFAULT 'pending',
    "error_code" TEXT,
    "error_message_safe" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_transactions" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" "ProviderEnvironment" NOT NULL,
    "provider_transaction_id" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount_minor" BIGINT,
    "currency" CHAR(3),
    "related_entity_type" TEXT,
    "related_entity_id" UUID,
    "raw_reference" TEXT,
    "occurred_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_provider_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" UUID NOT NULL,
    "integration_id" UUID,
    "kind" TEXT NOT NULL,
    "scope_start" TIMESTAMPTZ(6) NOT NULL,
    "scope_end" TIMESTAMPTZ(6) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'running',
    "triggered_by" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "summary_json" JSONB,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_items" (
    "id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "external_ref" TEXT,
    "local_amount_minor" BIGINT,
    "external_amount_minor" BIGINT,
    "currency" CHAR(3),
    "status" "ReconciliationItemStatus" NOT NULL,
    "difference_minor" BIGINT,
    "notes" TEXT,
    "resolution" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "environment" "ProviderEnvironment" NOT NULL DEFAULT 'test',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'not_connected',
    "display_name" TEXT NOT NULL,
    "config" JSONB,
    "external_account_ref" TEXT,
    "credential_ref_id" UUID,
    "health_status" TEXT,
    "last_test_at" TIMESTAMPTZ(6),
    "last_test_result" TEXT,
    "last_success_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "disconnected_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials_refs" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "secret_manager_key" TEXT NOT NULL,
    "credential_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_credentials_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encrypted_secrets" (
    "key" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "encrypted_secrets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "integration_id" UUID,
    "business_id" UUID,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "signature_valid" BOOLEAN NOT NULL,
    "replay_check_passed" BOOLEAN NOT NULL,
    "idempotency_key" TEXT,
    "occurred_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload" JSONB NOT NULL,
    "processing_state" "WebhookProcessingState" NOT NULL DEFAULT 'received',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "correlation_id" TEXT,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "business_id" UUID,
    "correlation_id" TEXT,
    "payload_json" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data_json" JSONB,
    "dedupe_key" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_type" TEXT NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "message_type" "MessageType" NOT NULL,
    "body" TEXT,
    "file_id" UUID,
    "hidden_at" TIMESTAMPTZ(6),
    "hidden_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reports" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "status" "DeliverableStatus" NOT NULL DEFAULT 'not_started',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_submissions" (
    "id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "caption" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "review_note" TEXT,

    CONSTRAINT "content_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_rights" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "ownership" TEXT NOT NULL,
    "organic_allowed" BOOLEAN NOT NULL,
    "paid_ads_allowed" BOOLEAN NOT NULL,
    "whitelisting_allowed" BOOLEAN NOT NULL,
    "duration_days" INTEGER,
    "territory" TEXT,
    "exclusivity_json" JSONB,
    "terms_snapshot_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_rights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_cases" (
    "id" UUID NOT NULL,
    "subject_type" "VerificationSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" "VerificationCaseStatus" NOT NULL DEFAULT 'pending',
    "submitted_by" UUID,
    "reviewer_user_id" UUID,
    "evidence_json" JSONB,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "signal_type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "score" DECIMAL(9,4),
    "evidence_json" JSONB,
    "dedupe_key" TEXT,
    "status" "FraudFlagStatus" NOT NULL DEFAULT 'open',
    "fraud_case_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_cases" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" "FraudCaseStatus" NOT NULL DEFAULT 'open',
    "risk_level" "Severity" NOT NULL,
    "summary" TEXT NOT NULL,
    "decision_reason" TEXT,
    "resolution_code" TEXT,
    "reviewer_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "fraud_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "creator_id" UUID,
    "partnership_id" UUID,
    "conversion_id" UUID,
    "type" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "opened_by_user_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "decision_code" TEXT,
    "decision_reason" TEXT,
    "decided_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "file_id" UUID,
    "external_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "payload_json" JSONB,
    "approval_state" "ApprovalState" NOT NULL,
    "approved_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "executed_at" TIMESTAMPTZ(6),
    "result_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "actor_type" TEXT NOT NULL DEFAULT 'user',
    "tenant_business_id" UUID,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "ip_hash" TEXT,
    "request_id" TEXT,
    "prev_hash" TEXT,
    "hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "purpose" TEXT NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'private',
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price_minor" BIGINT,
    "currency" CHAR(3),
    "fee_plan_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_customers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_customer_id" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" UUID NOT NULL,
    "billing_customer_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subscription_id" TEXT,
    "plan_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fee_plan_snapshot" JSONB NOT NULL,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" UUID NOT NULL,
    "billing_customer_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_invoice_id" TEXT,
    "status" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "line_items" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "jurisdiction" CHAR(2),
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "LegalDocumentStatus" NOT NULL DEFAULT 'draft',
    "required_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_id" UUID,
    "creator_id" UUID,
    "legal_document_id" UUID NOT NULL,
    "context" TEXT,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'setting',
    "value_json" JSONB NOT NULL,
    "environment" "SettingEnvironment" NOT NULL DEFAULT 'dev',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "request_type" "DataRequestType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "details" TEXT,
    "handled_by" UUID,
    "result_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily_stats" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "scope_key" TEXT NOT NULL,
    "business_id" UUID NOT NULL,
    "campaign_id" UUID,
    "partnership_id" UUID,
    "creator_id" UUID,
    "currency" CHAR(3),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "qr_scans" INTEGER NOT NULL DEFAULT 0,
    "tracked_visits" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "approved_conversions" INTEGER NOT NULL DEFAULT 0,
    "verified_sales_minor" BIGINT NOT NULL DEFAULT 0,
    "commission_minor" BIGINT NOT NULL DEFAULT 0,
    "fee_minor" BIGINT NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "verification_tokens_identifier_idx" ON "verification_tokens"("identifier");

-- CreateIndex
CREATE INDEX "two_factors_user_id_idx" ON "two_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "businesses_owner_user_id_idx" ON "businesses"("owner_user_id");

-- CreateIndex
CREATE INDEX "business_members_user_id_idx" ON "business_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_business_id_user_id_key" ON "business_members"("business_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creators_user_id_key" ON "creators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creators_handle_key" ON "creators"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_creator_id_platform_key" ON "social_accounts"("creator_id", "platform");

-- CreateIndex
CREATE INDEX "catalog_items_business_id_active_idx" ON "catalog_items"("business_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_business_id_slug_key" ON "catalog_items"("business_id", "slug");

-- CreateIndex
CREATE INDEX "campaigns_status_category_idx" ON "campaigns"("status", "category");

-- CreateIndex
CREATE INDEX "campaigns_business_id_status_idx" ON "campaigns"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_business_id_slug_key" ON "campaigns"("business_id", "slug");

-- CreateIndex
CREATE INDEX "campaign_eligibility_rules_campaign_id_idx" ON "campaign_eligibility_rules"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_applications_campaign_id_status_idx" ON "campaign_applications"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_applications_campaign_id_creator_id_key" ON "campaign_applications"("campaign_id", "creator_id");

-- CreateIndex
CREATE INDEX "campaign_invitations_creator_id_status_idx" ON "campaign_invitations"("creator_id", "status");

-- CreateIndex
CREATE INDEX "campaign_invitations_campaign_id_idx" ON "campaign_invitations"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "partnerships_application_id_key" ON "partnerships"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "partnerships_invitation_id_key" ON "partnerships"("invitation_id");

-- CreateIndex
CREATE UNIQUE INDEX "partnerships_terms_snapshot_id_key" ON "partnerships"("terms_snapshot_id");

-- CreateIndex
CREATE INDEX "partnerships_business_id_status_idx" ON "partnerships"("business_id", "status");

-- CreateIndex
CREATE INDEX "partnerships_creator_id_status_idx" ON "partnerships"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "partnerships_campaign_id_creator_id_key" ON "partnerships"("campaign_id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "partnership_terms_snapshots_partnership_id_version_key" ON "partnership_terms_snapshots"("partnership_id", "version");

-- CreateIndex
CREATE INDEX "partnership_events_partnership_id_created_at_idx" ON "partnership_events"("partnership_id", "created_at");

-- CreateIndex
CREATE INDEX "promotion_codes_partnership_id_idx" ON "promotion_codes"("partnership_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_codes_business_id_normalized_code_key" ON "promotion_codes"("business_id", "normalized_code");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_code_redemptions_conversion_id_key" ON "promotion_code_redemptions"("conversion_id");

-- CreateIndex
CREATE INDEX "promotion_code_redemptions_promotion_code_id_customer_ref_h_idx" ON "promotion_code_redemptions"("promotion_code_id", "customer_ref_hash");

-- CreateIndex
CREATE UNIQUE INDEX "referral_links_token_key" ON "referral_links"("token");

-- CreateIndex
CREATE INDEX "referral_links_partnership_id_idx" ON "referral_links"("partnership_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_clicks_click_ref_key" ON "tracking_clicks"("click_ref");

-- CreateIndex
CREATE INDEX "tracking_clicks_business_id_occurred_at_idx" ON "tracking_clicks"("business_id", "occurred_at");

-- CreateIndex
CREATE INDEX "tracking_clicks_partnership_id_occurred_at_idx" ON "tracking_clicks"("partnership_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_sessions_business_id_session_key_hash_key" ON "tracking_sessions"("business_id", "session_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "attribution_touchpoints_dedupe_key_key" ON "attribution_touchpoints"("dedupe_key");

-- CreateIndex
CREATE INDEX "attribution_touchpoints_conversion_id_idx" ON "attribution_touchpoints"("conversion_id");

-- CreateIndex
CREATE INDEX "attribution_touchpoints_business_id_occurred_at_idx" ON "attribution_touchpoints"("business_id", "occurred_at");

-- CreateIndex
CREATE INDEX "attribution_decisions_conversion_id_idx" ON "attribution_decisions"("conversion_id");

-- CreateIndex
CREATE INDEX "attribution_decisions_business_id_decision_state_idx" ON "attribution_decisions"("business_id", "decision_state");

-- CreateIndex
CREATE UNIQUE INDEX "conversions_attribution_decision_id_key" ON "conversions"("attribution_decision_id");

-- CreateIndex
CREATE INDEX "conversions_business_id_occurred_at_idx" ON "conversions"("business_id", "occurred_at");

-- CreateIndex
CREATE INDEX "conversions_partnership_id_status_idx" ON "conversions"("partnership_id", "status");

-- CreateIndex
CREATE INDEX "conversions_creator_id_status_idx" ON "conversions"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversions_business_id_source_system_external_ref_key" ON "conversions"("business_id", "source_system", "external_ref");

-- CreateIndex
CREATE INDEX "conversion_events_conversion_id_idx" ON "conversion_events"("conversion_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_events_business_id_source_external_event_id_key" ON "conversion_events"("business_id", "source", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_business_id_rule_key_version_key" ON "commission_rules"("business_id", "rule_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "commission_calculations_conversion_id_key" ON "commission_calculations"("conversion_id");

-- CreateIndex
CREATE INDEX "commission_calculations_creator_id_status_idx" ON "commission_calculations"("creator_id", "status");

-- CreateIndex
CREATE INDEX "commission_calculations_business_id_status_idx" ON "commission_calculations"("business_id", "status");

-- CreateIndex
CREATE INDEX "ledger_accounts_owner_type_owner_id_idx" ON "ledger_accounts"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_owner_type_owner_key_account_type_currency_key" ON "ledger_accounts"("owner_type", "owner_key", "account_type", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_reference_type_reference_id_idx" ON "ledger_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_entries_business_id_effective_at_idx" ON "ledger_entries"("business_id", "effective_at");

-- CreateIndex
CREATE INDEX "ledger_entry_lines_ledger_account_id_idx" ON "ledger_entry_lines"("ledger_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_lines_ledger_entry_id_line_order_key" ON "ledger_entry_lines"("ledger_entry_id", "line_order");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_fundings_idempotency_key_key" ON "merchant_fundings"("idempotency_key");

-- CreateIndex
CREATE INDEX "merchant_fundings_business_id_status_idx" ON "merchant_fundings"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotency_key_key" ON "payouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "payouts_creator_id_status_idx" ON "payouts"("creator_id", "status");

-- CreateIndex
CREATE INDEX "payout_items_commission_calculation_id_idx" ON "payout_items"("commission_calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_items_payout_id_commission_calculation_id_key" ON "payout_items"("payout_id", "commission_calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_attempts_payout_id_attempt_number_key" ON "payout_attempts"("payout_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_transactions_provider_environment_provider_key" ON "payment_provider_transactions"("provider", "environment", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "reconciliations_integration_id_started_at_idx" ON "reconciliations"("integration_id", "started_at");

-- CreateIndex
CREATE INDEX "reconciliation_items_reconciliation_id_status_idx" ON "reconciliation_items"("reconciliation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_credential_ref_id_key" ON "integrations"("credential_ref_id");

-- CreateIndex
CREATE INDEX "integrations_business_id_status_idx" ON "integrations"("business_id", "status");

-- CreateIndex
CREATE INDEX "integrations_provider_external_account_ref_idx" ON "integrations"("provider", "external_account_ref");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_refs_secret_manager_key_key" ON "integration_credentials_refs"("secret_manager_key");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotency_key_key" ON "webhook_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "webhook_events_processing_state_received_at_idx" ON "webhook_events"("processing_state", "received_at");

-- CreateIndex
CREATE INDEX "webhook_events_integration_id_received_at_idx" ON "webhook_events"("integration_id", "received_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_notification_type_key" ON "notification_preferences"("user_id", "notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_partnership_id_key" ON "conversations"("partnership_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_reports_message_id_reporter_user_id_key" ON "message_reports"("message_id", "reporter_user_id");

-- CreateIndex
CREATE INDEX "deliverables_partnership_id_idx" ON "deliverables"("partnership_id");

-- CreateIndex
CREATE INDEX "content_submissions_deliverable_id_idx" ON "content_submissions"("deliverable_id");

-- CreateIndex
CREATE INDEX "content_rights_partnership_id_idx" ON "content_rights"("partnership_id");

-- CreateIndex
CREATE INDEX "verification_cases_subject_type_subject_id_idx" ON "verification_cases"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "verification_cases_status_idx" ON "verification_cases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_flags_dedupe_key_key" ON "fraud_flags"("dedupe_key");

-- CreateIndex
CREATE INDEX "fraud_flags_status_severity_idx" ON "fraud_flags"("status", "severity");

-- CreateIndex
CREATE INDEX "fraud_flags_subject_type_subject_id_idx" ON "fraud_flags"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "fraud_cases_status_idx" ON "fraud_cases"("status");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_business_id_idx" ON "disputes"("business_id");

-- CreateIndex
CREATE INDEX "disputes_creator_id_idx" ON "disputes"("creator_id");

-- CreateIndex
CREATE INDEX "dispute_evidence_dispute_id_idx" ON "dispute_evidence"("dispute_id");

-- CreateIndex
CREATE INDEX "admin_actions_approval_state_created_at_idx" ON "admin_actions"("approval_state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_business_id_created_at_idx" ON "audit_logs"("tenant_business_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_object_type_object_id_idx" ON "audit_logs"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_owner_type_owner_id_idx" ON "files"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_plans_plan_key_key" ON "pricing_plans"("plan_key");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_business_id_key" ON "billing_customers"("business_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_business_id_status_idx" ON "billing_subscriptions"("business_id", "status");

-- CreateIndex
CREATE INDEX "billing_invoices_business_id_created_at_idx" ON "billing_invoices"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_document_type_version_jurisdiction_key" ON "legal_documents"("document_type", "version", "jurisdiction");

-- CreateIndex
CREATE INDEX "legal_acceptances_user_id_idx" ON "legal_acceptances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_idx" ON "data_subject_requests"("status");

-- CreateIndex
CREATE INDEX "analytics_daily_stats_business_id_day_idx" ON "analytics_daily_stats"("business_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_stats_day_business_id_scope_key_key" ON "analytics_daily_stats"("day", "business_id", "scope_key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creators" ADD CONSTRAINT "creators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_commission_rule_id_fkey" FOREIGN KEY ("commission_rule_id") REFERENCES "commission_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_eligibility_rules" ADD CONSTRAINT "campaign_eligibility_rules_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_applications" ADD CONSTRAINT "campaign_applications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_applications" ADD CONSTRAINT "campaign_applications_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_terms_snapshots" ADD CONSTRAINT "partnership_terms_snapshots_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_events" ADD CONSTRAINT "partnership_events_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_codes" ADD CONSTRAINT "promotion_codes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_codes" ADD CONSTRAINT "promotion_codes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_codes" ADD CONSTRAINT "promotion_codes_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_codes" ADD CONSTRAINT "promotion_codes_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_code_redemptions" ADD CONSTRAINT "promotion_code_redemptions_promotion_code_id_fkey" FOREIGN KEY ("promotion_code_id") REFERENCES "promotion_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_assets" ADD CONSTRAINT "qr_assets_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_assets" ADD CONSTRAINT "qr_assets_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_assets" ADD CONSTRAINT "qr_assets_asset_file_id_fkey" FOREIGN KEY ("asset_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_clicks" ADD CONSTRAINT "tracking_clicks_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_touchpoints" ADD CONSTRAINT "attribution_touchpoints_conversion_id_fkey" FOREIGN KEY ("conversion_id") REFERENCES "conversions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_decisions" ADD CONSTRAINT "attribution_decisions_conversion_id_fkey" FOREIGN KEY ("conversion_id") REFERENCES "conversions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_conversion_id_fkey" FOREIGN KEY ("conversion_id") REFERENCES "conversions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_calculations" ADD CONSTRAINT "commission_calculations_conversion_id_fkey" FOREIGN KEY ("conversion_id") REFERENCES "conversions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_calculations" ADD CONSTRAINT "commission_calculations_commission_rule_id_fkey" FOREIGN KEY ("commission_rule_id") REFERENCES "commission_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry_lines" ADD CONSTRAINT "ledger_entry_lines_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry_lines" ADD CONSTRAINT "ledger_entry_lines_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_fundings" ADD CONSTRAINT "merchant_fundings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_fundings" ADD CONSTRAINT "merchant_fundings_provider_transaction_id_fkey" FOREIGN KEY ("provider_transaction_id") REFERENCES "payment_provider_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_provider_transaction_id_fkey" FOREIGN KEY ("provider_transaction_id") REFERENCES "payment_provider_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_commission_calculation_id_fkey" FOREIGN KEY ("commission_calculation_id") REFERENCES "commission_calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials_refs" ADD CONSTRAINT "integration_credentials_refs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_submissions" ADD CONSTRAINT "content_submissions_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_rights" ADD CONSTRAINT "content_rights_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_fraud_case_id_fkey" FOREIGN KEY ("fraud_case_id") REFERENCES "fraud_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
