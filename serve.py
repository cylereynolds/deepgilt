#!/usr/bin/env python3
"""Deepgilt dev server.

Plain `python3 -m http.server` sends no cache headers, so browsers heuristically
serve STALE js/json/html — which is why edits (e.g. removing the black floor tiles)
don't show up without a hard reload. This server fixes that two ways:

  1. Every response is sent with no-store / no-cache headers → the browser never
     caches anything, so a normal reload always gets the latest files.
  2. A tiny live-reload snippet is injected into every HTML page. It polls
     /__mtime (the newest mtime across client/ + data/) once a second and reloads
     the page automatically when any source file changes — true live update.

Run:  python3 serve.py     (serves http://localhost:8138/client/)
"""
import http.server
import socketserver
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8138
WATCH_DIRS = ['client', 'data']
WATCH_EXTS = ('.html', '.js', '.json', '.css')

LIVERELOAD = (
    b"<script>(function(){var last=null;setInterval(function(){"
    b"fetch('/__mtime',{cache:'no-store'}).then(function(r){return r.text();})"
    b".then(function(t){if(last===null){last=t;}else if(t!==last){location.reload();}})"
    b".catch(function(){});},1000);})();</script>"
)


def max_mtime():
    m = 0.0
    for d in WATCH_DIRS:
        for root, _dirs, files in os.walk(os.path.join(ROOT, d)):
            for f in files:
                if f.endswith(WATCH_EXTS):
                    try:
                        m = max(m, os.path.getmtime(os.path.join(root, f)))
                    except OSError:
                        pass
    return m


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _send(self, body, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/__mtime':
            return self._send(('%.3f' % max_mtime()).encode(), 'text/plain')
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if path.endswith('.html') and os.path.isfile(path):
            with open(path, 'rb') as f:
                data = f.read()
            if b'</body>' in data:
                data = data.replace(b'</body>', LIVERELOAD + b'</body>', 1)
            else:
                data += LIVERELOAD
            return self._send(data, 'text/html; charset=utf-8')
        return super().do_GET()

    def log_message(self, *a):
        pass  # quiet


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print('Deepgilt dev server (no-cache + live-reload) -> http://localhost:%d/client/' % PORT)
        httpd.serve_forever()
