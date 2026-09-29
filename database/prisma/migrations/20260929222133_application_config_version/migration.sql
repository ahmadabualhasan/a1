-- AlterTable
ALTER TABLE "campaign_applications" ADD COLUMN     "campaign_config_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "campaign_invitations" ADD COLUMN     "campaign_config_version" INTEGER NOT NULL DEFAULT 1;
