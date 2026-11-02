-- CreateEnum
CREATE TYPE "PriceRevisionStatus" AS ENUM ('NONE', 'PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('GENERAL', 'BEFORE_WORK', 'AFTER_WORK', 'CUSTOMER_PROOF', 'SIGNATURE', 'QUALIFICATION_DOC', 'IDENTITY_DOC');

-- CreateEnum
CREATE TYPE "ReviewLanguage" AS ENUM ('EN', 'HI');

-- AlterTable
ALTER TABLE "PhoneVerification" ADD COLUMN "lastSentAt" TIMESTAMP(3),
ADD COLUMN "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "VerificationRequest" ADD COLUMN "oauthState" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VerificationDocumentMetadata" ADD COLUMN "dobMatch" BOOLEAN,
ADD COLUMN "gender" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "documentDetails" JSONB;

-- AlterTable
ALTER TABLE "UploadedFile" ADD COLUMN "category" "FileCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "revisedPrice" DECIMAL(10,2),
ADD COLUMN "priceRevisionNote" TEXT,
ADD COLUMN "priceRevisionStatus" "PriceRevisionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "customerSignatureData" TEXT,
ADD COLUMN "customerSignatureAt" TIMESTAMP(3),
ADD COLUMN "completionNote" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "language" "ReviewLanguage" NOT NULL DEFAULT 'EN';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentUrl" TEXT,
ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "type" TEXT,
ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
