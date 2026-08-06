#!/usr/bin/env python3
"""本地开发静态服务器

与生产部署（Cloudflare Pages 的 _headers: Cache-Control: no-cache）保持一致：
对所有响应附加 Cache-Control: no-cache，避免浏览器启发式缓存旧版 ESM 模块
（否则改模块后刷新可能报 "does not provide an export named ..." 类错误）。

用法：
    python scripts/serve.py [端口]     # 默认 8000，仅绑定 127.0.0.1
"""
import http.server
import functools
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # 与生产行为一致：每次请求都重新校验，文件变化立即生效
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory='.')
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'Serving HTTP on 127.0.0.1 port {port} (Cache-Control: no-cache) ...')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopping server.')
            pass


if __name__ == '__main__':
    main()
