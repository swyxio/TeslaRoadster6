"""Create 1200x630 social cards from checked-in Tesland screenshots. Requires Pillow."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/blog/social'
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

cards = [
    ('game', 'AN OPEN-SOURCE DRIVING GAME', 'Drive the Bay.\nTake the shortcuts.', 'Deliver · explore · fly with friends', 'public/blog/building-poly-av/street.jpg'),
    ('changelog', 'THE ROAD SO FAR', 'The Tesland\nchangelog', 'What changed and when', 'public/blog/building-poly-av/cockpit.jpg'),
    ('lore', 'THE STORY', 'Welcome to Tesland.\nThe year is 2050.', 'A future you can drive', 'public/blog/building-poly-av/airborne.jpg'),
    ('index', 'THE TESLAND DEV BLOG', 'Building a Bay Area\nplayground, in public', 'Stories from the driver’s seat', 'public/blog/building-poly-av/street.jpg'),
    ('making-driving-feel-smooth', 'DEVELOPMENT NOTES', 'Why our browser\ndriving game felt jerky', 'Frame pacing · prediction · multiplayer', 'public/blog/smooth-driving/manual-driving-poster.png'),
    ('planning-the-economy', 'DESIGN & SIMULATION', 'The Tesland economy:\nfrom deliveries to Mars', 'Cybercabs · property · a shared launch', 'public/blog/economy/cybercab-current.jpg'),
    ('building-poly-av', 'DEVELOPMENT NOTES', 'A flying Roadster.\nA Bay Area sandbox.', 'How Tesland began', 'public/blog/building-poly-av/airborne.jpg'),
    ('recording-webgl-playtests', 'DEVELOPMENT NOTES', 'How we record\nWebGL playtests', 'Real pixels · repeatable inputs', 'public/blog/recording-webgl-playtests/playtest-poster.jpg'),
]
parser = argparse.ArgumentParser()
parser.add_argument('--only', choices=[card[0] for card in cards])
args = parser.parse_args()
for slug, label, title, subtitle, source in cards:
    if args.only and slug != args.only:
        continue
    image = Image.new('RGB', (1200, 630), '#102b31')
    photo = ImageOps.contain(Image.open(ROOT / source).convert('RGB'), (480, 500), method=Image.Resampling.LANCZOS)
    image.paste(photo, (702 + (480 - photo.width) // 2, (630 - photo.height) // 2))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 683, 630), fill='#102b31')
    draw.rounded_rectangle((54, 49, 104, 99), radius=10, fill='#ffc77f')
    draw.text((66, 49), '↗', font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', 34), fill='#19363a')
    draw.text((120, 55), 'TESLAND', font=ImageFont.truetype(BOLD, 29), fill='#fbf3e3')
    draw.text((56, 170), label, font=ImageFont.truetype(BOLD, 19), fill='#ffc77f')
    draw.multiline_text((52, 225), title, font=ImageFont.truetype(BOLD, 51), fill='#fbf3e3', spacing=12)
    draw.text((56, 471), subtitle, font=ImageFont.truetype(FONT, 22), fill='#c9d9cf')
    draw.line((56, 539, 625, 539), fill='#66877c', width=2)
    path = {'game': '', 'changelog': '/changelog', 'lore': '/lore'}.get(slug, '/blog')
    draw.text((56, 558), f'tesland.swyx.io{path}', font=ImageFont.truetype(FONT, 19), fill='#b6cec0')
    image.save(OUT / f'{slug}.png', optimize=True)
