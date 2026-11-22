#!/usr/bin/env python3
"""Read Gyða's public "shows" calendar (an iCal address set in the admin, saved in data/site.json)
and write the shows to data/calendar.json, which the LIVE page merges with the shows typed in the admin.

Run every morning by .github/workflows/sync-calendar.yml, or straight away from the admin's "Sync now".
One all-day event per show:  title = venue (add "(with múm)" for guests; "CANCELLED" to cancel),
location = city, country;  the first link in the description = tickets.
Standard library only, so the GitHub runner needs nothing installed.
"""
import json, os, re, sys, urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
site = json.load(open(os.path.join(ROOT, 'data', 'site.json')))
url = (site.get('calendar_ics') or '').strip()
out_path = os.path.join(ROOT, 'data', 'calendar.json')
if not url:
    print('No calendar address set in the admin; nothing to do.')
    sys.exit(0)
url = re.sub(r'^webcal://', 'https://', url)

req = urllib.request.Request(url, headers={'User-Agent': 'gydadiamond-site calendar sync'})
raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
lines = []
for line in raw.splitlines():                     # undo iCal line folding
    if line[:1] in (' ', '\t') and lines:
        lines[-1] += line[1:]
    else:
        lines.append(line)


def unescape(v):
    return v.replace('\\n', '\n').replace('\\N', '\n').replace('\\,', ',').replace('\\;', ';').replace('\\\\', '\\').strip()


def to_date(prop, value):
    """DTSTART/DTEND → (date, is_all_day). Timed events are taken in their own time zone's date."""
    v = value.strip()
    if 'VALUE=DATE' in prop or re.fullmatch(r'\d{8}', v):
        return datetime.strptime(v[:8], '%Y%m%d').date(), True
    d = datetime.strptime(v[:15], '%Y%m%dT%H%M%S')
    if v.endswith('Z'):
        d = d.replace(tzinfo=timezone.utc)
    return d.date(), False


events, ev = [], None
for line in lines:
    if line == 'BEGIN:VEVENT':
        ev = {}
    elif line == 'END:VEVENT':
        if ev is not None:
            events.append(ev)
        ev = None
    elif ev is not None and ':' in line:
        prop, value = line.split(':', 1)
        ev[prop.split(';')[0].upper()] = (prop, value)

shows = []
since = date.today() - timedelta(days=3 * 365)
for ev in events:
    if 'DTSTART' not in ev or 'RRULE' in ev:
        continue
    start, all_day = to_date(*ev['DTSTART'])
    if start < since:
        continue
    end = None
    if 'DTEND' in ev:
        e, _ = to_date(*ev['DTEND'])
        if all_day:
            e -= timedelta(days=1)                # iCal all-day ends are exclusive
        if e > start:
            end = e
    title = unescape(ev.get('SUMMARY', ('', ''))[1])
    status = ''
    if re.search(r'\bcancel+ed\b|\baflýst', title, re.I) or ev.get('STATUS', ('', ''))[1].upper() == 'CANCELLED':
        status = 'cancelled'
        title = re.sub(r'\s*[-–:]?\s*\(?\b(cancel+ed|aflýst)\b\)?\s*[-–:]?\s*', ' ', title, flags=re.I).strip()
    if re.search(r'\bsold ?out\b|\buppselt', title, re.I):
        status = status or 'soldout'
        title = re.sub(r'\s*[-–:]?\s*\(?\b(sold ?out|uppselt)\b\)?', '', title, flags=re.I).strip()
    with_ = ''
    m = re.search(r'\((?:with|með)\s+([^)]+)\)', title, re.I)
    if m:
        with_ = m.group(1).strip()
        title = (title[:m.start()] + title[m.end():]).strip()
    desc = unescape(ev.get('DESCRIPTION', ('', ''))[1])
    link_m = re.search(r'https?://[^\s<>"]+', desc)
    desc = re.sub(r'<[^>]+>', ' ', desc)          # Google sometimes sends HTML
    link = unescape(ev['URL'][1]) if 'URL' in ev else (link_m.group(0) if link_m else '')
    note = re.sub(r'https?://\S+', '', desc).strip().split('\n')[0].strip()[:120]
    loc = unescape(ev.get('LOCATION', ('', ''))[1])
    parts = [p.strip() for p in loc.split(',') if p.strip()]
    # Google often gives "Venue, Street 1, 101 City, Country": keep the last two parts
    if len(parts) >= 2:
        city, country = re.sub(r'^\d[\d\s-]*', '', parts[-2]).strip(), parts[-1]
    else:
        city, country = (parts[0] if parts else ''), ''
    shows.append({'date': start.isoformat(), 'end': end.isoformat() if end else '', 'venue': title or loc or 'Concert',
                  'city': city, 'country': country, 'with': with_, 'note': note, 'link': link,
                  'status': status, 'source': 'calendar'})

shows.sort(key=lambda s: s['date'])
new = json.dumps(shows, ensure_ascii=False, indent=1) + '\n'
old = open(out_path).read() if os.path.exists(out_path) else ''
if new != old:
    open(out_path, 'w').write(new)
    print(f'Updated data/calendar.json: {len(shows)} shows.')
else:
    print(f'No change ({len(shows)} shows).')
