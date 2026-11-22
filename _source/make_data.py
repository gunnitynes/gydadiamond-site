#!/usr/bin/env python3
"""One-time migration: turn the recovered Cargo pages into the editable data files in data/.

After this has run once, data/*.json is the master copy (edited through /admin/).
Do NOT run it again unless you want to throw away every edit made since.
Also copies the full-size press photos into press/.
"""
import json, os, shutil, sys

SRC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SRC)
ORIG = os.path.expanduser('~/gydadiamond-site-originals')
DATA = os.path.join(ROOT, 'data')

if os.path.exists(os.path.join(DATA, 'site.json')) and '--force' not in sys.argv:
    raise SystemExit('data/ already exists; edits are made in the admin now. Use --force to overwrite.')
os.makedirs(DATA, exist_ok=True)


def img(prefix):
    hits = [f for f in os.listdir(os.path.join(ROOT, 'images')) if f.startswith(prefix)]
    assert len(hits) == 1, prefix
    return 'images/' + hits[0]


def dump(name, obj):
    with open(os.path.join(DATA, name), 'w') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')


# ---------------------------------------------------------------- site settings
dump('site.json', {
    'name': 'GYDA VALTYSDOTTIR',
    'tagline': 'CELLIST ・ COMPOSER ・ PRODUCER ・ FILMS',
    'hero': img('4f4f1ca5'),
    'hero_focus': '55% 35%',
    'menu': [
        {'label': 'About', 'href': 'About'},
        {'label': 'Work', 'href': 'Work'},
        {'label': 'Film', 'href': 'FILM'},
        {'label': 'Live', 'href': 'LIVE'},
        {'label': 'Photos', 'href': 'PHOTOS'},
        {'label': 'News', 'href': 'NEWS'},
        {'label': 'Contact', 'href': 'CONTACT'},
    ],
    'show_next_show': True,
    'email': '[email removed: see data/site.json]',
    'press_email': '[email removed: see data/site.json]',
    'links': [
        {'label': 'Bandcamp', 'url': 'https://gyda.bandcamp.com/'},
        {'label': 'Facebook', 'url': 'https://www.facebook.com/gydavaltys/'},
    ],
    'calendar_ics': '',
    'press_intro': 'Photos for press and promotion. Free to use with the photographer credited. '
                   'Click a photo to see it large, or download the full-resolution file.',
    'press_bio': (
        'Gyða Valtýsdóttir is an Icelandic cellist, composer and singer, and a founding member of the '
        'experimental group múm. Classically trained, she has made music for film, theatre and dance, and '
        'collaborated with Kronos Quartet, Aaron & Bryce Dessner, Josephine Foster, Damien Rice, '
        'Dustin O’Halloran, Colin Stetson, Kjartan Sveinsson and Ragnar Kjartansson, among many others. '
        'She received the Nordic Council Music Prize in 2019. Her albums are Epicycle (2017), Evolution (2018), '
        'Epicycle II (2020) and Ox (2021).'),
})

# ---------------------------------------------------------------- films
F = []
def film(cat, title, year, director, role, link='', text='', image=''):
    F.append({'category': cat, 'title': title, 'year': year, 'director': director, 'role': role,
              'text': text, 'link': link, 'image': image})

film('Film', 'MIHKEL', '2018', 'Ari Alexander Ergis Magnússon', 'Composer',
     'https://open.spotify.com/album/7017tAcs4NVTD9GDfNllqT',
     'Gyða’s first feature-film score. The soundtrack album came out on Smekkleysa and was nominated '
     'for soundtrack of the year at the Icelandic Music Awards and at the Edda, the Icelandic film awards.',
     img('b784a330'))
film('Film', 'MISSIR (Epilogues)', '2024', 'Ari Alexander Ergis Magnússon', 'Composer')
film('Film', 'La Stanza', '2020', 'Stefano Lodovichi', 'Theme song')
film('Film', 'La Vita ti Arriva Addosso', '2018', 'Paolo Sassanelli', 'Additional music',
     'https://www.imdb.com/title/tt7023016/')
film('Film', 'There Is a Light', '2017', 'Fabio Mollo', 'Theme song, written with Giorgio Giampà',
     'https://www.youtube.com/watch?v=9LIitwVYdiI')
film('Film', 'Breathe In', '2013', 'Drake Doremus', 'Co-writer of the score with Dustin O’Halloran',
     'https://www.imdb.com/title/tt1999987/')
film('Film', 'With Dustin O’Halloran', '2012–2019', '', 'Collaborator on several scores',
     '', 'The Other Dream Team (2012), Now Is Good (2012), Umrika (2014), Transparent (2017) '
     'and A Christmas Carol (2019).')
film('Film', 'Tales from the Gimli Hospital – Reframed', '2011', 'Guy Maddin', 'Live score',
     '', 'A live score for a performance at the Performa festival in New York, produced by Lana Wilson.')
film('Documentary', 'Four Down', '2025', 'Steven Cantor', 'Music', 'https://www.imdb.com/title/tt13182610/')
film('Documentary', 'Super Moss', '2023', 'Bruno Victor-Pujebet', 'Composer')
film('Documentary', 'Miss Americana', '2020', 'Lana Wilson', 'Cellist')
film('Documentary', 'Síðasta haustið', '2019', 'Yrsa Roca Fannberg', 'Music')
film('Documentary', 'E-Team', '2014', 'Ross Kauffman & Katy Chevigny', 'Cellist')
film('Documentary', 'Gríð ég því hatt minn og staf', '2010', 'Hjálmtýr Heiðdal', 'Music')
film('Art', 'Earthbound', '2025', 'Clare Langan', 'Music')
film('Art', 'Alchemy', '2023', 'Clare Langan', 'Music')
film('Art', 'Death Is Elsewhere', '2019', 'Ragnar Kjartansson', 'Performer',
     'https://www.metmuseum.org/press/exhibitions/2019/ragnar-kjartansson-death-is-elsewhere-2019',
     'A seven-channel video installation that premiered at the Metropolitan Museum of Art in New York, '
     'performed with Kristín Anna Valtýsdóttir and Aaron & Bryce Dessner.')
film('Art', 'Traverse', '2019', 'Rachel Garrard', 'Music for an art film and installation',
     'https://vimeo.com/323810282')
film('Art', 'Forever Love', '2015', 'Ragnar Kjartansson', 'Performer')
film('Art', 'Wake the Dust', '2014', 'Emily McMehen', 'Music for an art film and installation')
film('Art', 'The Visitors', '2013', 'Ragnar Kjartansson', 'Performer',
     'https://www.luhringaugustine.com/artists/ragnar-kjartansson/artworks/videos2?view=slider#17')
dump('films.json', F)

# ---------------------------------------------------------------- shows
S = []
def show(date, venue, city, country='', with_='', note='', link='', status='', image=''):
    S.append({'date': date, 'venue': venue, 'city': city, 'country': country, 'with': with_,
              'note': note, 'link': link, 'status': status, 'image': image})

M = 'múm'
show('2025-12-14', 'Wonderfruit Festival', '', 'Thailand')
show('2025-11-27', 'Lido', 'Berlin', 'DE', M)
show('2025-11-25', 'Botanique', 'Brussels', 'BE', M)
show('2025-11-24', 'Islington Assembly Hall', 'London', 'UK', M)
show('2025-11-21', 'De Helling', 'Utrecht', 'NL', M)
show('2025-11-20', 'Reflektor', 'Liège', 'BE', M)
show('2025-11-19', 'Trabendo', 'Paris', 'FR', M)
show('2025-11-09', 'Eldborg, Harpa', 'Reykjavík', 'IS', M, 'Iceland Airwaves partner event')
show('2025-10-09', 'The Regent', 'Los Angeles, CA', 'US', M, '+ solo set')
show('2025-10-08', 'The Independent', 'San Francisco, CA', 'US', M)
show('2025-10-07', 'Harlows', 'Sacramento, CA', 'US', M)
show('2025-10-05', 'Neptune Theatre', 'Seattle, WA', 'US', M, '+ solo set')
show('2025-10-04', 'The Pearl', 'Vancouver, BC', 'CA', M)
show('2025-10-03', 'Wonder Ballroom', 'Portland, OR', 'US', M, '+ solo set')
show('2025-09-30', 'Meow Wolf', 'Denver, CO', 'US', M)
show('2025-09-28', 'Turf Club', 'St Paul, MN', 'US', M, '+ solo set')
show('2025-09-26', 'Old Town School of Folk', 'Chicago, IL', 'US', M)
show('2025-09-25', 'Axis', 'Toronto, ON', 'CA', M, '+ solo set')
show('2025-09-23', 'SPACE', 'Portland, ME', 'US', M)
show('2025-09-21', 'Crystal Ballroom', 'Boston, MA', 'US', M, '+ solo set')
show('2025-09-20', 'Hudson Hall', 'Hudson, NY', 'US', M)
show('2025-09-19', 'Pioneer Works', 'Brooklyn, NY', 'US', M)
show('2025-09-17', 'The Atlantic', 'Washington, DC', 'US', M)
show('2025-09-16', 'Underground Arts', 'Philadelphia, PA', 'US', M, '+ solo set')
show('2025-09-05', 'Extreme Chill Festival', 'Reykjavík', 'IS', 'ROR')
show('2025-06-22', 'Tongeren', 'Tongeren', 'BE', 'JFDR', 'Solo')
show('2025-04-12', 'Outline Fest, Knockdown Center', 'New York, NY', 'US', M)
show('2025-03-30', 'Big Ears Festival', 'Knoxville, TN', 'US', M)
show('2025-03-26', 'Treefort Music Fest', 'Boise, ID', 'US', M, '26–30 March')
show('2023-04-22', 'Underlook, Michelberger Hotel', 'Berlin', 'DE')
show('2023-02-12', 'Merleyn', 'Nijmegen', 'NL', link='https://www.intonijmegen.com/agenda/agenda-overzicht/2552362384/gyda-valtysdottir')
show('2023-02-11', 'Rock Lobster', 'Antwerp', 'BE', note='Solo')
show('2023-02-10', '30CC', 'Leuven', 'BE', link='https://www.30cc.be/en/programma/item/an-evening-with-gyda-valtysdottir-is')
show('2023-02-09', 'CCHA', 'Hasselt', 'BE', link='https://www.hasselt.be/nl/agenda/e/ox-gyda-valtysdottir/0f21dad8-83f3-4d14-b690-545d71e5787f')
show('2022-11-30', 'Floating show, Audubon Center', 'Los Angeles, CA', 'US')
show('2022-11-19', 'The Lighthouse, Secular Sabbath', 'Los Angeles, CA', 'US', link='https://www.secular-sabbath.com/calendar/overnight-at-lighthouse')
show('2022-11-18', 'Mengi', 'Reykjavík', 'IS')
show('2022-11-13', 'Floating show, California Botanic Garden', 'Los Angeles, CA', 'US', link='https://www.feelslikefloating.com/')
show('2022-07-17', 'LungA Festival', 'Seyðisfjörður', 'IS')
show('2022-07-07', 'Gamla Bíó', 'Reykjavík', 'IS', 'Merope', 'Ox release concert', image=img('4d9746c8'))
show('2022-06-25', 'Theatro Circo', 'Braga', 'PT', link='https://theatrocirco1.bol.pt/Projecto/EntidadesAderentes/81-theatro_circo')
show('2021-09-23', 'Norðurljós, Harpa', 'Reykjavík', 'IS', 'Skúli Sverrisson, Kjartan Sveinsson, Úlfur Hansson, Daníel Böðvarsson & Magnús Trygvason Eliasen', 'Epicycle I & II')
C = 'cancelled'
show('2020-04-06', 'The Crocodile', 'Seattle, WA', 'US', M, status=C)
show('2020-04-05', 'Mississippi Studios', 'Portland, OR', 'US', M, status=C)
show('2020-04-01', 'The Fillmore', 'San Francisco, CA', 'US', M, status=C)
show('2020-03-31', 'Downtown Palace', 'Los Angeles, CA', 'US', M, status=C)
show('2020-03-28', 'Big Ears Festival', 'Knoxville, TN', 'US', M, 'Solo', status=C)
show('2020-03-26', 'Murmrr Theatre', 'New York, NY', 'US', M, '+ solo set', status=C)
show('2020-03-25', 'Hudson Hall', 'Hudson, NY', 'US', M, status=C)
show('2020-03-21', 'Black Cat', 'Washington, DC', 'US', M, status=C)
show('2020-02-14', 'Pianeo 2020, Konzertsaal Friedenskapelle', 'Münster', 'DE')
show('2020-02-13', 'Muziekgebouw', 'Eindhoven', 'NL')
show('2020-02-12', 'Bach Recomposed, 30CC', 'Leuven', 'BE')
show('2020-02-11', 'CCHA (Cultuurcentrum Hasselt)', 'Hasselt', 'BE')
show('2020-02-10', 'Elbphilharmonie', 'Hamburg', 'DE')
show('2020-02-09', 'Michelberger Hotel', 'Berlin', 'DE')
show('2020-02-08', 'Spike Cello Festival', 'Dublin', 'IE', 'Julian Sartorius & Shahzad Ismaily', 'Epicycle')
show('2020-02-07', 'Spailpín Fánach', 'Cork', 'IE', 'Julian Sartorius & Shahzad Ismaily', 'Epicycle')
show('2019-11-24', 'OMNI Space', 'Beijing', 'CN', M)
show('2019-11-23', 'MAO Livehouse', 'Shanghai', 'CN', M)
show('2019-11-22', 'MAO Livehouse', 'Hangzhou', 'CN', M)
show('2019-11-21', 'B10', 'Shenzhen', 'CN', M)
show('2019-11-17', 'Queen Elizabeth Stadium', 'Hong Kong', 'HK', 'JFDR', 'Solo and with JFDR')
show('2019-10-05', 'Bina', 'Istanbul', 'TR')
show('2019-09-29', 'Opera', 'St Petersburg', 'RU', M, '+ solo set')
show('2019-09-28', 'Aglomerat', 'Moscow', 'RU', M, '+ solo set')
show('2019-09-27', 'Planetarium', 'Berlin', 'DE', M)
show('2019-09-26', 'Planetarium', 'Berlin', 'DE', M, '+ solo set')
show('2019-09-22', 'Church of Sint-Denijs', 'Kortrijk', 'BE', M, '+ solo set')
show('2019-09-21', 'Union Chapel', 'London', 'UK', '', 'Solo')
show('2019-09-20', 'Neuadd Ogwen', 'Bethesda', 'UK', M)
show('2019-09-19', 'Church of Laeken', 'Brussels', 'BE', M, '+ solo set')
show('2019-09-18', 'La Maroquinerie', 'Paris', 'FR', M)
show('2019-09-17', 'Rote Fabrik', 'Zürich', 'CH', M)
show('2019-09-14', 'Sounds from a Safe Harbour', 'Cork', 'IE')
show('2019-07-18', 'Cava del Sole', 'Matera', 'IT', '', 'Opening for The Apollo Soundtrack',
     'https://www.matera-basilicata2019.it/en/programme/themes/ancient-future/1543-the-apollo-soundtrack.html')
show('2019-07-16', 'Disorder Festival', 'Eboli', 'IT')
show('2019-07-10', 'The Nordic House', 'Reykjavík', 'IS')
show('2019-07-06', 'Siglufjörður Folk Festival', 'Siglufjörður', 'IS', '', 'Epicycle')
show('2019-06-28', 'Halfway Festival', 'Białystok', 'PL', 'Julian Sartorius & strings')
show('2019-06-09', 'Clandestino Festival', 'Gothenburg', 'SE', link='http://clandestinofestival.org/2019/gyda-valtysdottir/')
show('2019-05-19', 'Opera', 'St Petersburg', 'RU', 'Anna von Hausswolff')
show('2019-05-18', 'Aglomerat', 'Moscow', 'RU', 'Anna von Hausswolff')
show('2019-05-16', 'The Strand', 'London', 'UK', '', 'Supporting Kristín Anna')
show('2019-03-09', 'Mengi', 'Reykjavík', 'IS')
show('2019-03-07', 'Radar', 'Aarhus', 'DK')
show('2019-03-06', 'The Secret Loft', 'Copenhagen', 'DK')
dump('shows.json', S)

# ---------------------------------------------------------------- news
N = []
def news(date, title, text, image='', link='', link_label=''):
    N.append({'date': date, 'title': title, 'text': text, 'image': image, 'link': link, 'link_label': link_label})

news('2022-09-14', 'Ox nominated for the Nordic Music Prize', 'My dear Ox was nominated for the Nordic Music Prize!', img('2a52efb0'))
news('2022-06-22', 'Ox release concert at Gamla Bíó', 'Celebrating Ox with a concert at Gamla Bíó in Reykjavík on 7 July, with Merope.', img('4d9746c8'), 'https://tix.is', 'Tickets at tix.is')
news('2022-03-30', 'Producer of the Year', 'So honoured to receive “Producer of the Year” at the Icelandic Music Awards for Ox, which I share with Úlfur Hansson.', img('d5b907bf'))
news('2021-11-15', 'Ox is out on 3 December', 'My new album Ox is out on 3 December on my own label, DiaMond. Pre-order the digital album and merch on Bandcamp, and the vinyl from Diggers Factory.', img('4f2a3384'), 'https://gyda.bandcamp.com/album/ox', 'Ox on Bandcamp')
news('2019-11-11', 'The Nordic Council Music Prize 2019',
     'Deeply moved to receive the Nordic Council Music Prize 2019, and for these words from the jury:\n\n'
     '“Gyða Valtýsdóttir is an Icelandic musician who is classically trained but unbound by genre. At an early age she was a founding member of the lauded electronic experimental band múm. A multifaceted performer, she has since been a prominent part of Iceland’s music scene.\n\n'
     'Fundamentally a classically trained cellist, Gyða has in recent years been performing her own music as well as collaborating with other musicians across genres. She has used her training to fulfil her visions and delivers her holistic approach to music in an organic way and with admirable technique. Gyða’s music and performance is highly unique and captivating, demonstrating a special sense of phrasing and timing. She is a particularly distinctive performer with a fascinating, earthy presence in live performance – a presence that is fragile and subtle, yet powerful and temperamental. Her deeply personal and organic performance is eminent throughout, whether playing the cello, singing, using her distinctive vocals, or playing other instruments, and has a fundamental originality to it.\n\n'
     'Gyða crosses and bridges the gap between musical genres in a unique way, not least by dismissing any notion of their differences. Whether performing her own music or the music of others she brings her personal originality to the music through her instrumental inventiveness.”',
     img('453f2474'), 'https://www.norden.org/en/nyhed/gyda-valtysdottir-has-won-2019-nordic-council-music-prize', 'Read more at norden.org')
news('2019-06-04', 'Death Is Elsewhere at the Met',
     'Ragnar Kjartansson’s video installation “Death Is Elsewhere” just opened at the Met in New York City. I am performing in it with my twin sister Kristín Anna and the twin brothers Aaron & Bryce Dessner. The piece is up until 2 September. Here are Aaron and me hanging out outside the Met!',
     img('d08ab005'), 'https://www.metmuseum.org/press/exhibitions/2019/ragnar-kjartansson-death-is-elsewhere-2019', 'At the Met')
news('2019-05-23', 'Nominated for the Nordic Council Music Prize',
     'Deeply honoured to be nominated for the Nordic Council Music Prize 2019. The award ceremony takes place on 29 October in the Stockholm Concert Hall.', img('7a63ea9e'))
news('2019-03-17', 'Evolution: Album of the Year', 'Evolution won “Album of the Year” (open category) at the Icelandic Music Awards.', img('469771af'))
news('2019-02-12', 'Evolution nominated for the Nordic Music Prize', 'Evolution was nominated for the Nordic Music Prize as album of the year.', img('9e439c64'))
dump('news.json', N)

# ---------------------------------------------------------------- press photos
os.makedirs(os.path.join(ROOT, 'press'), exist_ok=True)
groups = [
    ('Saga Sig', ['5961f598', '46ff3c35', 'e4979c77']),
    ('Viðar Logi', ['09f593f7', '3ef91e83', '90de6345', 'cceea150']),
    ('Ata Kam', ['576e7e30', '054eeb73', 'cb6e1c5d']),
    ('Antje Taiga Jandrig', ['6bc6f397', '0fb67ab0', 'cf5fb0d1', '5c0e9414']),
    ('Lilja Birgisdóttir', ['5ec7893b', '442434a8', '4624bc01', '05446587', '15e14e8e', '9c9b83fb']),
    ('Saga Sigurðardóttir', ['5828892f', 'a8950311', '37dab954', 'e29bfc1e', '9dde3f77']),
    ('Eva Schram', ['2d1d06c1', 'd5b907bf', 'fc2ed081', 'e7df659c']),
    ('R・O・R', ['165719fa', '705d382c', '3c612232', 'b9b754c2']),
]
from PIL import Image  # noqa: E402
P = []
for credit, prefixes in groups:
    for pre in prefixes:
        web = img(pre)
        orig = [f for f in os.listdir(ORIG) if f.startswith(pre)][0]
        dst = os.path.join(ROOT, 'press', orig.replace('.JPG', '.jpg').replace('.jpeg', '.jpg'))
        if not os.path.exists(dst):
            shutil.copy2(os.path.join(ORIG, orig), dst)
        with Image.open(dst) as im:
            w, h = im.size
        P.append({'src': web, 'hires': 'press/' + os.path.basename(dst), 'width': w, 'height': h,
                  'bytes': os.path.getsize(dst), 'credit': credit, 'caption': ''})
dump('photos.json', P)
print('wrote data/: site, films', len(F), 'shows', len(S), 'news', len(N), 'photos', len(P))
