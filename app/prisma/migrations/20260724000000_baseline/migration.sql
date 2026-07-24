-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "initials" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "employmentStatus" TEXT NOT NULL DEFAULT 'active',
    "departmentId" TEXT,
    "managerId" TEXT,
    "defaultCountry" TEXT,
    "defaultRegion" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "mfaSecret" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Residenziale',
    "phase" TEXT NOT NULL DEFAULT 'ETUDE/AP',
    "client" TEXT,
    "year" INTEGER,
    "commune" TEXT,
    "typology" TEXT,
    "terrain" TEXT,
    "roof" TEXT,
    "description" TEXT,
    "pageLink" TEXT,
    "image" TEXT,
    "floors" INTEGER,
    "area" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "workStatus" TEXT NOT NULL DEFAULT 'todo',
    "billing" TEXT,
    "notes" TEXT,
    "country" TEXT,
    "operatingRegion" TEXT,
    "regionCode" TEXT,
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "next" TEXT,
    "blockers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStatusUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "type" TEXT NOT NULL DEFAULT 'task',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "color" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "googleEventId" TEXT,
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "type" TEXT NOT NULL DEFAULT 'render',
    "tags" TEXT,
    "colors" TEXT,
    "materials" TEXT,
    "shapes" TEXT,
    "floors" INTEGER,
    "year" INTEGER,
    "aiAnalysis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'floor_plan',
    "floors" INTEGER,
    "siteArea" DOUBLE PRECISION,
    "buildingArea" DOUBLE PRECISION,
    "typology" TEXT,
    "apartmentMix" TEXT,
    "shape" TEXT,
    "year" INTEGER,
    "aiAnalysis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'public',
    "projectId" TEXT,
    "createdBy" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "lastRead" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "fileUrl" TEXT,
    "fileName" TEXT,
    "parentId" TEXT,
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "importedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomUrl" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL DEFAULT 'video',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedBy" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "transcriptId" TEXT,
    "transcriptText" TEXT,
    "summaryMode" TEXT,
    "summary" JSONB,
    "summaryHtml" TEXT,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "shareRevokedAt" TIMESTAMP(3),
    "summarizedAt" TIMESTAMP(3),
    "summaryError" TEXT,
    "detectedLang" TEXT,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMeetingMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "condensed" TEXT NOT NULL,
    "openItems" JSONB,
    "keyDecisions" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMeetingMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "summary" TEXT,
    "errorLog" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdMap" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "importRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedAsset" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "projectId" TEXT,
    "messageId" TEXT,
    "fileName" TEXT,
    "originalUrl" TEXT,
    "storedUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" TEXT NOT NULL,
    "rows" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "country" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRegionAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "operatingRegion" TEXT,
    "accessLevel" TEXT NOT NULL,

    CONSTRAINT "UserRegionAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "toRole" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationLog" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceKind" TEXT,
    "resourceId" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedAiResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Saved insight',
    "text" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "projectId" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_status_updatedAt_idx" ON "Project"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Project_phase_idx" ON "Project"("phase");

-- CreateIndex
CREATE INDEX "Project_country_operatingRegion_idx" ON "Project"("country", "operatingRegion");

-- CreateIndex
CREATE INDEX "Project_commune_idx" ON "Project"("commune");

-- CreateIndex
CREATE INDEX "ProjectStatusUpdate_projectId_createdAt_idx" ON "ProjectStatusUpdate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectStatusUpdate_authorId_idx" ON "ProjectStatusUpdate"("authorId");

-- CreateIndex
CREATE INDEX "ProjectAssignment_userId_idx" ON "ProjectAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignment_projectId_userId_key" ON "ProjectAssignment"("projectId", "userId");

-- CreateIndex
CREATE INDEX "AgendaItem_date_status_idx" ON "AgendaItem"("date", "status");

-- CreateIndex
CREATE INDEX "AgendaItem_userId_date_idx" ON "AgendaItem"("userId", "date");

-- CreateIndex
CREATE INDEX "AgendaItem_projectId_date_idx" ON "AgendaItem"("projectId", "date");

-- CreateIndex
CREATE INDEX "GalleryImage_projectId_createdAt_idx" ON "GalleryImage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "FloorPlan_projectId_createdAt_idx" ON "FloorPlan"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_type_createdAt_idx" ON "Activity"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_projectId_createdAt_idx" ON "Activity"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Channel_type_createdAt_idx" ON "Channel"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Channel_projectId_type_idx" ON "Channel"("projectId", "type");

-- CreateIndex
CREATE INDEX "Channel_createdBy_createdAt_idx" ON "Channel"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");

-- CreateIndex
CREATE INDEX "ChannelMember_channelId_lastRead_idx" ON "ChannelMember"("channelId", "lastRead");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMember_channelId_userId_key" ON "ChannelMember"("channelId", "userId");

-- CreateIndex
CREATE INDEX "Message_channelId_deletedAt_parentId_createdAt_idx" ON "Message"("channelId", "deletedAt", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_parentId_createdAt_idx" ON "Message"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "Call_roomName_key" ON "Call"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "Call_shareToken_key" ON "Call"("shareToken");

-- CreateIndex
CREATE INDEX "Call_createdAt_idx" ON "Call"("createdAt");

-- CreateIndex
CREATE INDEX "Call_status_createdAt_idx" ON "Call"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Call_startedBy_createdAt_idx" ON "Call"("startedBy", "createdAt");

-- CreateIndex
CREATE INDEX "Call_projectId_createdAt_idx" ON "Call"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Call_shareToken_shareExpiresAt_idx" ON "Call"("shareToken", "shareExpiresAt");

-- CreateIndex
CREATE INDEX "CallParticipant_userId_idx" ON "CallParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CallParticipant_callId_userId_key" ON "CallParticipant"("callId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMeetingMemory_projectId_key" ON "ProjectMeetingMemory"("projectId");

-- CreateIndex
CREATE INDEX "AiChatSession_userId_updatedAt_idx" ON "AiChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalImportRun_source_status_createdAt_idx" ON "ExternalImportRun"("source", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdMap_source_sourceType_sourceId_key" ON "ExternalIdMap"("source", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ImportedAsset_projectId_createdAt_idx" ON "ImportedAsset"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportedAsset_messageId_createdAt_idx" ON "ImportedAsset"("messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedAsset_source_sourceAssetId_key" ON "ImportedAsset"("source", "sourceAssetId");

-- CreateIndex
CREATE INDEX "Sheet_userId_updatedAt_idx" ON "Sheet"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarToken_userId_key" ON "GoogleCalendarToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "UserRegionAccess_country_operatingRegion_idx" ON "UserRegionAccess"("country", "operatingRegion");

-- CreateIndex
CREATE UNIQUE INDEX "UserRegionAccess_userId_country_operatingRegion_key" ON "UserRegionAccess"("userId", "country", "operatingRegion");

-- CreateIndex
CREATE INDEX "RoleChangeLog_userId_createdAt_idx" ON "RoleChangeLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RoleChangeLog_changedBy_createdAt_idx" ON "RoleChangeLog"("changedBy", "createdAt");

-- CreateIndex
CREATE INDEX "AuthorizationLog_subjectId_createdAt_idx" ON "AuthorizationLog"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthorizationLog_action_decision_createdAt_idx" ON "AuthorizationLog"("action", "decision", "createdAt");

-- CreateIndex
CREATE INDEX "AuthorizationLog_resourceKind_resourceId_createdAt_idx" ON "AuthorizationLog"("resourceKind", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthorizationLog_decision_createdAt_idx" ON "AuthorizationLog"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_entityType_entityId_idx" ON "Favorite"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_entityType_entityId_key" ON "Favorite"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SavedAiResponse_userId_pinned_createdAt_idx" ON "SavedAiResponse"("userId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "SavedAiResponse_userId_createdAt_idx" ON "SavedAiResponse"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_userId_status_position_idx" ON "Task"("userId", "status", "position");

-- CreateIndex
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");

-- CreateIndex
CREATE INDEX "Invitation_status_expiresAt_idx" ON "Invitation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_usedAt_idx" ON "PasswordReset"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_lastSeenAt_idx" ON "UserSession"("userId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusUpdate" ADD CONSTRAINT "ProjectStatusUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusUpdate" ADD CONSTRAINT "ProjectStatusUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_startedBy_fkey" FOREIGN KEY ("startedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingMemory" ADD CONSTRAINT "ProjectMeetingMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdMap" ADD CONSTRAINT "ExternalIdMap_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ExternalImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedAsset" ADD CONSTRAINT "ImportedAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedAsset" ADD CONSTRAINT "ImportedAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarToken" ADD CONSTRAINT "GoogleCalendarToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegionAccess" ADD CONSTRAINT "UserRegionAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChangeLog" ADD CONSTRAINT "RoleChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChangeLog" ADD CONSTRAINT "RoleChangeLog_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAiResponse" ADD CONSTRAINT "SavedAiResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
