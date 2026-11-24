#!/usr/bin/env python3
"""Change the admin password. Stores only a salted PBKDF2 hash in admin/admin.js (the repo is public).
Usage: python3 tools/set_admin_password.py   (asks for the new password)"""
import getpass, hashlib, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pw = getpass.getpass('New admin password: ')
if pw != getpass.getpass('Again: ') or len(pw) < 10:
    raise SystemExit('Passwords differ or shorter than 10 characters; nothing changed.')
salt = os.urandom(16).hex()
h = hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), 250000).hex()
p = os.path.join(ROOT, 'admin', 'admin.js')
s = open(p).read()
s = re.sub(r"var PASS = \{[^}]*\};", f"var PASS = {{ salt: '{salt}', iter: 250000, hash: '{h}' }};", s)
open(p, 'w').write(s)
print('Password changed. Commit and push admin/ to make it live.')
# the guide is locked with the password's hash, so it has to be made again with the new one
guide = os.path.expanduser('~/gydadiamond-guide/build.mjs')
if os.path.exists(guide):
    import subprocess
    subprocess.run(['node', guide], env={**os.environ, 'SITE': ROOT})
