#!/usr/bin/env bash
# Download Cymatics sample packs and ingest into the local library.
# Usage: ./scripts/setup-samples.sh [--all]
#
# By default, downloads the core packs (Orchid, Venom, Infinity).
# Pass --all to download every free Cymatics sample pack (~50 packs).
#
# This is idempotent — re-running skips already-downloaded zips and
# only ingests new samples.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOWNLOAD_DIR="$PROJECT_ROOT/.sample-cache"
LIBRARY_DIR="$PROJECT_ROOT/samples/library"
CATALOG="$PROJECT_ROOT/samples/_index/catalog.jsonl"

# --- Core packs (default) ---
CORE_PACKS=(
  "https://downloads.cymatics.fm/free/Cymatics-Orchid-SamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Venom-OneShotCollection.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-INFINITY-BetaPack2.0.zip"
)

# --- All free sample packs from cymatics.fm/pages/thank-free-samples-presets ---
# Excludes: plugins, MIDI-only packs, preset packs
ALL_PACKS=(
  # Core
  "https://downloads.cymatics.fm/free/Cymatics-Orchid-SamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Venom-OneShotCollection.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-INFINITY-BetaPack2.0.zip"
  # Drums & Percussion
  "https://downloads.cymatics.fm/free/Cymatics-DopeDrumsVol1.zip"
  "https://downloads.cymatics.fm/free/Cymatics-VibesII-DrumLoopCollection.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Percussion-ToolkitVol1.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Sizzle-HihatLoop&MIDICollection.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Reaper-HihatMIDILoops.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Bang-HipHopDrumKit.zip"
  # Hip Hop & Trap
  "https://downloads.cymatics.fm/free/Cymatics-BUNNY-HipHopSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-9God-HipHopSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Humble-HipHopSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Cobra-HipHopSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Weekday-HipHopSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-OldTown-HipHopSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Trap-StarterPack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Nightmares-TrapMelodyLoops.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Frenzy-TrapMelodyLoops.zip"
  # Melody & Synth
  "https://downloads.cymatics.fm/free/Cymatics-Mantra-VintageRnBMelodies.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Utopia-FreeSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-ApexVol3-OneShots.zip"
  "https://downloads.cymatics.fm/free/Cymatics-ApexVol5-VintageSynth.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Fantasy-SynthSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-2020MelodyCollection.zip"
  # Guitar & Acoustic
  "https://downloads.cymatics.fm/free/Cymatics-Infinite-GuitarLoopCollection.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Vibrations-GuitarSamplePack.zip"
  # Bass
  "https://downloads.cymatics.fm/free/Cymatics-Rumble-BassMulti-Kit.zip"
  # Vocals & FX
  "https://downloads.cymatics.fm/free/Cymatics-Euphoria-VocalSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Specter-FXCollection.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Life-AmbientRecordings.zip"
  # Lo-fi & Misc
  "https://downloads.cymatics.fm/free/Cymatics-Lofi-StarterPack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Eternity-SamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Light-FreeSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Blaze-FreeSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Oracle-SamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-ToyShop-SamplePackVol1.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Gems-FreeTeaserPack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-MysterySamplePack-Vol4.zip"
  "https://downloads.cymatics.fm/free/CymaticsxS1-ArtistSeriesSamplePack.zip"
  # Beta Packs
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-CHAOS-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-ZODIACIII-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-ZODIACVol2-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-ZODIAC-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-PHARAOH-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-EQUINOX-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-Destiny-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-2022MelodyCollection-BetaPack.zip"
  "https://downloads.cymatics.fm/free/BetaPacks/Cymatics-PARADOXII-PreviewPack.zip"
  "https://downloads.cymatics.fm/free/SecretExpansions/Cymatics-IMMORTAL-Aftermath.zip"
  # Genre Starter Packs
  "https://downloads.cymatics.fm/free/Cymatics-House-StarterPack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-FutureBass-StarterPack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-Dubstep-StarterPack.zip"
  # Other
  "https://downloads.cymatics.fm/free/Cymatics-Mothership-DubstepSamplePack.zip"
  "https://downloads.cymatics.fm/free/Cymatics-VideoGameVol.1-SamplePack.zip"
)

# --- Parse args ---
USE_ALL=false
for arg in "$@"; do
  case "$arg" in
    --all) USE_ALL=true ;;
    --help|-h)
      echo "Usage: $0 [--all]"
      echo "  --all    Download all free Cymatics packs (~50 packs, ~10GB)"
      echo "  default  Download core packs only (Orchid, Venom, Infinity, ~3.4GB)"
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if [ "$USE_ALL" = true ]; then
  PACKS=("${ALL_PACKS[@]}")
  echo "=== Composed Sample Setup (ALL packs) ==="
else
  PACKS=("${CORE_PACKS[@]}")
  echo "=== Composed Sample Setup (core packs) ==="
fi

echo "Project root: $PROJECT_ROOT"
echo "Packs to process: ${#PACKS[@]}"
echo ""

# --- Ensure dependencies ---
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Install Python 3.10+."
  exit 1
fi

# --- Download ---
mkdir -p "$DOWNLOAD_DIR"
downloaded=0
skipped=0

for url in "${PACKS[@]}"; do
  filename=$(basename "$url")
  dest="$DOWNLOAD_DIR/$filename"

  if [ -f "$dest" ]; then
    echo "[skip] $filename"
    ((skipped++))
  else
    echo "[download] $filename ..."
    curl -L --progress-bar "$url" -o "$dest.tmp"
    mv "$dest.tmp" "$dest"
    echo "[done] $filename"
    ((downloaded++))
  fi
done

echo ""
echo "Downloaded: $downloaded new, $skipped cached"
echo ""

# --- Ingest ---
echo "=== Ingesting packs ==="

cd "$PROJECT_ROOT"

for url in "${PACKS[@]}"; do
  filename=$(basename "$url")
  zip_path="$DOWNLOAD_DIR/$filename"

  echo "[ingest] $filename ..."
  python3 -c "
from sample_agent.ingest import ingest_pack
results = ingest_pack('$zip_path', library_root='samples/library')
print(f'  -> {len(results)} samples ingested')
"
done

echo ""

# --- Build catalog ---
echo "=== Building catalog ==="
python3 -m sample_agent.cli build-catalog \
  --samples-root samples \
  --output "$CATALOG"

total=$(wc -l < "$CATALOG" | tr -d ' ')
echo "Catalog built: $total samples indexed"

echo ""
echo "=== Done! ==="
echo "Samples: $LIBRARY_DIR"
echo "Catalog: $CATALOG"
