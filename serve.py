#!/usr/bin/env python3
"""Tiny local test server for PRISMFALL (no caching, correct MIME types).

    python3 serve.py          -> http://localhost:8080
    python3 serve.py 9000     -> http://localhost:9000
"""
import http.server, os, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f'PRISMFALL running at http://localhost:{port}  (Ctrl+C to stop)')
    http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
