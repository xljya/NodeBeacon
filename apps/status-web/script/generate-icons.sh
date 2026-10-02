#!/usr/bin/env bash
# Rebuild checked-in browser icons from the approved transparent master.
# Requires ImageMagick 7; not part of the application build/runtime.
set -euo pipefail
cd "$(dirname "$0")/.."

for size in 16 32 48 180 192 512; do
  magick design/nodebeacon-icon.png -resize "${size}x${size}" -strip \
    "public/branding/nodebeacon-v1-${size}.png"
done

magick public/branding/nodebeacon-v1-16.png \
  public/branding/nodebeacon-v1-32.png \
  public/branding/nodebeacon-v1-48.png public/favicon.ico

# Compatibility asset for existing consumers. New references use versioned URLs.
magick public/branding/nodebeacon-v1-512.png -define webp:lossless=true \
  public/assets/pwa-icon.webp
