-- CreateEnum
CREATE TYPE "PriceRevisionStatus" AS ENUM ('NONE', 'PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('GENERAL', 'BEFORE_WORK', 'AFTER_WORK', 'CUSTOMER_PROOF', 'SIGNATURE', 'QUALIFICATION_DOC', 'IDENTITY_DOC');

-- CreateEnum
CREATE TYPE "ReviewLanguage" AS ENUM ('EN', 'HI', 'PA');

-- CreateEnum
CREATE TYPE "UserLanguage" AS ENUM ('EN', 'HI', 'PA');

-- CreateEnum
CREATE TYPE "AppTheme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REPORTED_BY_CUSTOMER', 'CONFIRMED_BY_WORKER', 'SETTLED', 'DISPUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('BOOKING', 'PAYMENT', 'WORKER', 'CUSTOMER', 'ACCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferredLanguage" "UserLanguage" NOT NULL DEFAULT 'EN',
ADD COLUMN "preferredTheme" "AppTheme" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN "profilePhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "ProviderProfile_isOnline_idx" ON "ProviderProfile"("isOnline");

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
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CustomerFavourite" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavourite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerFavourite_customerId_providerId_key" ON "CustomerFavourite"("customerId", "providerId");
CREATE INDEX "CustomerFavourite_customerId_idx" ON "CustomerFavourite"("customerId");
ALTER TABLE "CustomerFavourite" ADD CONSTRAINT "CustomerFavourite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavourite" ADD CONSTRAINT "CustomerFavourite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ProviderLeave" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderLeave_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProviderLeave_providerId_startDate_endDate_idx" ON "ProviderLeave"("providerId", "startDate", "endDate");
ALTER TABLE "ProviderLeave" ADD CONSTRAINT "ProviderLeave_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "agreedAmount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionReference" TEXT,
    "reportedByCustomerId" TEXT,
    "reportedAt" TIMESTAMP(3),
    "confirmedByWorkerId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentRecord_bookingId_key" ON "PaymentRecord"("bookingId");
CREATE INDEX "PaymentRecord_paymentStatus_idx" ON "PaymentRecord"("paymentStatus");
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "BookingReschedule" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingReschedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingReschedule_bookingId_idx" ON "BookingReschedule"("bookingId");
ALTER TABLE "BookingReschedule" ADD CONSTRAINT "BookingReschedule_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "serviceId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SearchHistory_userId_createdAt_idx" ON "SearchHistory"("userId", "createdAt");
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "RecentlyViewedWorker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentlyViewedWorker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecentlyViewedWorker_userId_providerId_key" ON "RecentlyViewedWorker"("userId", "providerId");
CREATE INDEX "RecentlyViewedWorker_userId_viewedAt_idx" ON "RecentlyViewedWorker"("userId", "viewedAt");
ALTER TABLE "RecentlyViewedWorker" ADD CONSTRAINT "RecentlyViewedWorker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentlyViewedWorker" ADD CONSTRAINT "RecentlyViewedWorker_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SupportFaq" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "questionEn" TEXT NOT NULL,
    "questionHi" TEXT NOT NULL,
    "questionPa" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "answerHi" TEXT NOT NULL,
    "answerPa" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportFaq_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportFaq_category_active_idx" ON "SupportFaq"("category", "active");

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedAdminId" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
CREATE INDEX "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "UserRole" NOT NULL,
    "message" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
