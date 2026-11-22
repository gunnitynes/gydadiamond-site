#!/usr/bin/env python3
"""Local preview that behaves like GitHub Pages: /About serves About.html."""
import http.server, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def send_head(self):
        p = self.path.split('?')[0]
        if p != '/' and '.' not in os.path.basename(p) and os.path.exists(os.path.join(ROOT, p.lstrip('/') + '.html')):
            self.path = p + '.html'
        return super().send_head()
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
