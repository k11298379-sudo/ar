import http.server
import socketserver
import os
import sys
import socket
import subprocess
import re
import json
import threading
import ssl
import webbrowser

# Enable UTF-8 encoding in Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

HTTP_PORT = 8000
HTTPS_PORT = 8443
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_network_ips():
    """Dynamically finds all local network IP addresses, prioritizing home Wi-Fi (192.168.x.x)."""
    candidates = []

    # 1. Primary socket routing test
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        if not ip.startswith('127.'):
            candidates.append(ip)
    except Exception:
        pass

    # 2. Windows ipconfig scan to find all physical adapters
    try:
        out = subprocess.check_output('ipconfig', shell=True, text=True, errors='ignore')
        for match in re.finditer(r'IPv4[^\:]*:\s*([\d\.]+)', out):
            ip = match.group(1).strip()
            if not ip.startswith('127.') and not ip.startswith('169.254.') and ip not in candidates:
                candidates.append(ip)
    except Exception:
        pass

    # Sort priorities: 192.168.* (typical Wi-Fi) > 10.* > others
    def priority(ip):
        if ip.startswith('192.168.'): return 0
        if ip.startswith('10.'): return 1
        if ip.startswith('172.'): return 2
        return 3

    candidates.sort(key=priority)
    return candidates or ['127.0.0.1']

NETWORK_IPS = get_network_ips()
PRIMARY_IP = NETWORK_IPS[0]

def ensure_ssl_certs():
    """Ensures self-signed SSL cert and key exist for HTTPS (required by mobile cameras)."""
    cert_path = os.path.join(DIRECTORY, 'cert.pem')
    key_path = os.path.join(DIRECTORY, 'key.pem')

    if os.path.exists(cert_path) and os.path.exists(key_path):
        return cert_path, key_path

    try:
        import datetime, ipaddress
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u'AR-Emerald-City'),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, u'AR-Dev'),
        ])
        alt_names = [
            x509.DNSName(u'localhost'),
            x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
        ]
        for ip in NETWORK_IPS:
            try:
                alt_names.append(x509.IPAddress(ipaddress.IPv4Address(ip)))
            except Exception:
                pass

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1))
            .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650))
            .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
            .sign(key, hashes.SHA256())
        )
        with open(key_path, 'wb') as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))
        with open(cert_path, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        return cert_path, key_path
    except Exception as e:
        print(f"SSL cert warning: {e}")
        return None, None

CERT_PATH, KEY_PATH = ensure_ssl_certs()

PUBLIC_TUNNEL_URL = None

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # API endpoint for the web page to know URLs and display QR code
        if self.path == '/api/info':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            data = json.dumps({
                'local_url': f'http://localhost:{HTTP_PORT}',
                'local_https': f'https://localhost:{HTTPS_PORT}',
                'phone_http': f'http://{PRIMARY_IP}:{HTTP_PORT}',
                'phone_https': f'https://{PRIMARY_IP}:{HTTPS_PORT}',
                'phone_url': PUBLIC_TUNNEL_URL or f'https://{PRIMARY_IP}:{HTTPS_PORT}',
                'public_url': PUBLIC_TUNNEL_URL,
                'all_ips': NETWORK_IPS,
                'http_port': HTTP_PORT,
                'https_port': HTTPS_PORT
            }, ensure_ascii=False)
            self.wfile.write(data.encode('utf-8'))
            return

        super().do_GET()

    def end_headers(self):
        # Enable CORS and disable caching during development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        if path.endswith('.svg'):
            return 'image/svg+xml'
        if path.endswith('.mp4'):
            return 'video/mp4'
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.json'):
            return 'application/json'
        return super().guess_type(path)

# Allow immediate restart without 'Address already in use' error
socketserver.TCPServer.allow_reuse_address = True

def start_public_tunnel():
    """Starts cloudflared in background to create a free, public internet HTTPS link."""
    global PUBLIC_TUNNEL_URL
    import shutil
    if not shutil.which('cloudflared'):
        return

    def run_tunnel():
        global PUBLIC_TUNNEL_URL
        try:
            proc = subprocess.Popen(
                ['cloudflared', 'tunnel', '--url', f'http://127.0.0.1:{HTTP_PORT}'],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors='replace'
            )
            for line in proc.stdout:
                m = re.search(r'https://[a-zA-Z0-9\-]+\.trycloudflare\.com', line)
                if m and not PUBLIC_TUNNEL_URL:
                    PUBLIC_TUNNEL_URL = m.group(0)
                    print(f"\n" + "═" * 68)
                    print(f"  🌐 ПУБЛИЧНЫЙ САЙТ В ИНТЕРНЕТЕ (доступен всем отовсюду):")
                    print(f"     -> {PUBLIC_TUNNEL_URL}")
                    print(f"     -> Афиша: {PUBLIC_TUNNEL_URL}/poster.html")
                    print(f"  (Действует доверенный SSL: камера включается сразу!)")
                    print("═" * 68 + "\n")
                    sys.stdout.flush()
        except Exception:
            pass

    t = threading.Thread(target=run_tunnel, daemon=True)
    t.start()

def print_banner():
    phone_https_url = f"https://{PRIMARY_IP}:{HTTPS_PORT}"
    local_url = f"http://localhost:{HTTP_PORT}"
    poster_url = f"http://localhost:{HTTP_PORT}/poster.html"

    print("\n" + "=" * 68)
    print("  ВОЛШЕБНИК ИЗУМРУДНОГО ГОРОДА — AR СЕРВЕР ЗАПУЩЕН!")
    print("=" * 68)
    print(f"\n  [Компьютер]:")
    print(f"     -> {local_url}")
    print(f"  [АФИША ФИЛЬМА ДЛЯ СКАНИРОВАНИЯ И ПЕЧАТИ]:")
    print(f"     -> {poster_url}\n")
    print(f"  [Локальная сеть Wi-Fi (с доступом к камере AR)]:")
    print(f"     -> {phone_https_url}\n")
    print("  Запуск публичного туннеля для доступа из интернета...")
    print("=" * 68)
    print("  Для остановки сервера нажмите Ctrl + C\n")
    sys.stdout.flush()

if __name__ == '__main__':
    # Start Cloudflare Tunnel if available to provide free public website URL
    start_public_tunnel()

    # 1. Start HTTP server (port 8000) in background thread
    httpd_http = socketserver.TCPServer(("0.0.0.0", HTTP_PORT), CustomHandler)
    threading.Thread(target=httpd_http.serve_forever, daemon=True).start()

    # 2. Start HTTPS server (port 8443) on main thread if SSL cert exists
    if CERT_PATH and KEY_PATH:
        httpd_https = socketserver.TCPServer(("0.0.0.0", HTTPS_PORT), CustomHandler)
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.load_cert_chain(certfile=CERT_PATH, keyfile=KEY_PATH)
        httpd_https.socket = ssl_ctx.wrap_socket(httpd_https.socket, server_side=True)

        # Auto-open browser on PC
        if '--no-browser' not in sys.argv:
            threading.Timer(0.8, lambda: webbrowser.open(f'http://localhost:{HTTP_PORT}')).start()

        print_banner()
        try:
            httpd_https.serve_forever()
        except KeyboardInterrupt:
            print("\n Сервер остановлен пользователем.")
    else:
        # Fallback to HTTP only if SSL failed
        print_banner()
        try:
            httpd_http.serve_forever()
        except KeyboardInterrupt:
            print("\n Сервер остановлен пользователем.")
