#!/usr/bin/env python3
"""Generate macOS-style rounded icon with transparent background from logo."""

from PIL import Image, ImageDraw
import os, subprocess, sys

BUILD = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BUILD, 'icon.png')

def superellipse_mask(size, radius_frac=0.225):
    """Create a macOS-style superellipse (squircle) mask."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * radius_frac)
    draw.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=255)
    return mask

def make_rounded_icon(src_path, out_size=1024, padding_frac=0.1):
    """Create icon with transparent bg, padded and masked."""
    src = Image.open(src_path).convert('RGBA')
    
    # Canvas with transparent bg
    canvas = Image.new('RGBA', (out_size, out_size), (0, 0, 0, 0))
    
    # Inset the artwork with padding
    padding = int(out_size * padding_frac)
    inner = out_size - 2 * padding
    resized = src.resize((inner, inner), Image.LANCZOS)
    
    # Create rounded mask for the inset area  
    mask = superellipse_mask(inner)
    
    # Apply mask to resized artwork
    r, g, b, a = resized.split()
    masked = Image.composite(resized, Image.new('RGBA', (inner, inner), (0,0,0,0)), mask)
    
    # Paste centered
    canvas.paste(masked, (padding, padding))
    return canvas

icon = make_rounded_icon(SRC)

# Save main icon
rounded_path = os.path.join(BUILD, 'icon_rounded.png')
icon.save(rounded_path)

# Generate iconset
iconset = os.path.join(BUILD, 'icon.iconset')
os.makedirs(iconset, exist_ok=True)

sizes = [16, 32, 64, 128, 256, 512]
for s in sizes:
    img = icon.resize((s, s), Image.LANCZOS)
    img.save(os.path.join(iconset, f'icon_{s}x{s}.png'))
    img2x = icon.resize((s*2, s*2), Image.LANCZOS)
    img2x.save(os.path.join(iconset, f'icon_{s}x{s}@2x.png'))

# 512@2x is 1024
icon.save(os.path.join(iconset, 'icon_512x512@2x.png'))

# Generate .icns
icns_path = os.path.join(BUILD, 'icon.icns')
subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', icns_path], check=True)

# Also overwrite icon.png with rounded version for linux/win
icon.save(os.path.join(BUILD, 'icon.png'))

print(f"Done! Generated rounded icon at {icns_path}")
