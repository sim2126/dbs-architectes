-- CreateTable
CREATE TABLE "SavedBoardView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedBoardView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedBoardView_userId_board_idx" ON "SavedBoardView"("userId", "board");

-- CreateIndex
CREATE UNIQUE INDEX "SavedBoardView_userId_board_name_key" ON "SavedBoardView"("userId", "board", "name");

-- AddForeignKey
ALTER TABLE "SavedBoardView" ADD CONSTRAINT "SavedBoardView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

