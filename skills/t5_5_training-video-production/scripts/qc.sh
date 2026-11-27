#!/bin/bash
# Quality gates for a finished lesson video:  qc.sh <video.mp4> [more.mp4 ...]
# Fails (exit 1) if not 1080x1920, no audio, outside 120-240 s, integrated loudness outside -18..-14 LUFS, or true peak above -1 dBTP.
# Numbers cannot tell you it sounds good: listen to it, and look at a --shots contact sheet (see SKILL.md).
FF="${AIV_FFMPEG:-ffmpeg}"; rc=0
for f in "$@"; do
  info=$("$FF" -hide_banner -i "$f" 2>&1)
  dur=$(echo "$info" | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p' | awk -F: '{print $1*3600+$2*60+$3}')
  size=$(echo "$info" | grep -o '[0-9]\{3,4\}x[0-9]\{3,4\}' | head -1)
  has_audio=$(echo "$info" | grep -c 'Audio:')
  loud=$("$FF" -hide_banner -i "$f" -vn -af ebur128=peak=true -f null - 2>&1 | awk '/Integrated loudness/{f=1} f&&/I:/{i=$2} f&&/Peak:/{p=$2} END{print i, p}')
  lufs=${loud% *}; peak=${loud#* }
  sil=$("$FF" -hide_banner -i "$f" -vn -af silencedetect=n=-50dB:d=2.5 -f null - 2>&1 | grep -c silence_start)
  echo "$(basename "$f"): ${dur}s $size audio=$has_audio  ${lufs} LUFS  peak ${peak} dBTP  silences>=2.5s: $sil"
  ok=1
  [ "$size" = "1080x1920" ] || { echo "  FAIL size"; ok=0; }
  [ "$has_audio" -ge 1 ] || { echo "  FAIL no audio"; ok=0; }
  awk -v d="$dur" 'BEGIN{exit !(d>=120 && d<=240)}' || { echo "  FAIL length"; ok=0; }
  awk -v l="$lufs" 'BEGIN{exit !(l>=-18 && l<=-14)}' || { echo "  FAIL loudness"; ok=0; }
  awk -v p="$peak" 'BEGIN{exit !(p<=-1)}' || { echo "  FAIL peak"; ok=0; }
  [ $ok = 1 ] || rc=1
done
exit $rc
