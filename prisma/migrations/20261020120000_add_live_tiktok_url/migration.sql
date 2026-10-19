-- Existing Lives remain valid without a TikTok LIVE URL.
ALTER TABLE "Live" ADD COLUMN "tiktokLiveUrl" TEXT;
