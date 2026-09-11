-- Firebase Authentication migration
-- passwordHash is no longer required: credentials are now owned by Firebase Auth
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Links each app-level User row to its Firebase Auth account
ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT;

CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
