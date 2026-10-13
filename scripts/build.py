#!/usr/bin/env python3
"""Build a single-file HTML deck from a deck directory.

    python3 -I build.py <deck_dir> <out.html> [--title T] [--lang en|zh-CN]

deck_dir/
  slides.html   one <section class="slide ..."> per slide (required)
  deck.css      the deck's own styles (optional; the shell only supplies layout mechanics)
  head.html     extra <head> tags, e.g. web-font <link>s (optional)
  notes.json    JSON array of strings, one per slide, "" for none (optional)
  media/        files referenced from slides.html as <img data-i="file.png"> (optional)
"""
import argparse, base64, json, mimetypes, os, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('deck'); ap.add_argument('out')
ap.add_argument('--title'); ap.add_argument('--lang', default='en')
a = ap.parse_args()

here = os.path.dirname(os.path.abspath(__file__))
def read(p, required=True):
    if not os.path.exists(p):
        if required: sys.exit('missing ' + p)
        return ''
    return open(p, encoding='utf-8').read()

shell = read(os.path.join(here, '..', 'assets', 'shell.html'))
slides = read(os.path.join(a.deck, 'slides.html'))
css = read(os.path.join(a.deck, 'deck.css'), False)
head = read(os.path.join(a.deck, 'head.html'), False)
notes_raw = read(os.path.join(a.deck, 'notes.json'), False)

n = len(re.findall(r'<section\b[^>]*\bclass="[^"]*\bslide\b', slides))
if not n: sys.exit('slides.html has no <section class="slide">')
notes = json.loads(notes_raw) if notes_raw else []
if notes and (not isinstance(notes, list) or any(not isinstance(x, str) for x in notes)):
    sys.exit('notes.json must be a JSON array of strings')
if notes and len(notes) != n:
    sys.exit('notes.json has %d entries but slides.html has %d slides' % (len(notes), n))

imgs, missing = {}, []
for k in sorted(set(re.findall(r'<img\b[^>]*?\bdata-i="([^"]+)"', slides))):
    p = os.path.join(a.deck, 'media', k)
    if os.path.dirname(os.path.normpath(k)) or not os.path.isfile(p):
        missing.append(k); continue
    mime = mimetypes.guess_type(k)[0] or 'application/octet-stream'
    imgs[k] = 'data:%s;base64,%s' % (mime, base64.b64encode(open(p, 'rb').read()).decode())
if missing: sys.exit('media/ is missing: ' + ', '.join(missing))

title = a.title
if not title:
    m = re.search(r'<h1[^>]*>(.*?)</h1>', slides, re.S)
    title = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(1))).strip() if m else 'Slides'
esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;')
js = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')

parts = {'__LANG__': a.lang, '__TITLE__': esc(title), '<!--__HEAD__-->': head.strip(),
         '/*__DECK_CSS__*/': css.strip(), '<!--__SLIDES__-->': slides.strip(),
         '/*__IMG__*/{}': js(imgs), '/*__NOTES__*/[]': js(notes)}
for k in parts:
    if shell.count(k) != 1: sys.exit('shell.html placeholder %s not found exactly once' % k)
# single pass, so text inside slides/notes that happens to look like a placeholder is left alone
html = re.sub('|'.join(re.escape(k) for k in parts), lambda m: parts[m.group(0)], shell)

open(a.out, 'w', encoding='utf-8').write(html)
print('%d slides, %d images, %d notes, %.2f MB -> %s' % (n, len(imgs), sum(1 for x in notes if x), len(html.encode()) / 1e6, a.out))
