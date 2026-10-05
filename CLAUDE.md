# IMLP App — Claude Instructions

## Standing instruction: Coaching Notes check

Before starting any work on the IMLP app, check `drive: Claude-Ironman Training/` in Drive for the newest `Coaching_Notes_*.md` file.

Steps:
1. Run `rclone ls "drive: Claude-Ironman Training/"` and find any `Coaching_Notes_*.md` files.
2. Compare against `processedCoachingNotes` in `data/sync-state.json`.
3. If an unprocessed file exists, download it with `rclone copy "drive: Claude-Ironman Training/<filename>" /tmp/` and follow the "How to process this file" instructions inside it before doing any other work.
4. After processing, add the filename to `processedCoachingNotes` in `data/sync-state.json` so no file is applied twice.
