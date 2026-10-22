Most sounds are synthesised with WebAudio (client/audio.js), so no audio files are required for them.

RECORDED FILES (used by the Iphone Kupi skill) - put these two files in THIS folder:
  kupiaudio.mp3       played loudly for every player for 30 s (looped if the file is shorter than 30 s, cut at 30 s)
  ggfuggingez.mp3     played once, only to a player who dies during those 30 s

The paths come from SKILLS.kupi in shared/skills.js. If a file is missing or cannot be decoded the game logs
"[AUDIO] FAILED: <path>" in the browser console and shows an "AUDIO FILE MISSING" banner / toast; `npm run check` prints a warning.
