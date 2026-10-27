#!/bin/sh
# Synthetic footage for trying the sample: a timecode test card with a tone, and a clip.
set -e
cd "$(dirname "$0")" && mkdir -p footage
ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc=s=1920x1080:r=30:d=20 -f lavfi -i sine=f=440:d=20 -c:v libx264 -preset ultrafast -crf 30 -c:a aac -shortest footage/published.mp4
ffmpeg -hide_banner -loglevel error -y -f lavfi -i mandelbrot=s=1280x720:r=30 -t 3 -c:v libx264 -preset ultrafast footage/broll.mp4
echo "footage/ ready"
