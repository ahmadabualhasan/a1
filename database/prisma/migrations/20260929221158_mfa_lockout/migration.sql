-- AlterTable
ALTER TABLE "two_factors" ADD COLUMN     "failed_verification_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT true;
