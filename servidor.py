"""Serve the app and run a local BS-RoFormer worker."""
import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "modelos"
WEIGHTS = "BS-Roformer-SW.ckpt"
CONFIG = "BS-Roformer-SW.yaml"
JOBS = {}
LOCK = threading.Lock()
TEMP = None
CLI = None


def allowed_origins(port):
    origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    name = os.getenv("CODESPACE_NAME")
    domain = os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
    if os.getenv("CODESPACES") == "true" and name and domain:
        origins.add(f"https://{name}-{port}.{domain}")
    return origins


def available():
    return bool(CLI and (MODELS / WEIGHTS).is_file() and (MODELS / CONFIG).is_file())


def separate(job, folder):
    try:
        output = folder / "stems"
        subprocess.run(
            [CLI, str(next(folder.glob("entrada.*"))), "--model_filename", WEIGHTS,
             "--model_file_dir", str(MODELS), "--output_dir", str(output),
             "--output_format", "WAV"],
            cwd=folder, timeout=1200, check=True,
        )
        stems = {}
        for kind in ("guitar", "vocals"):
            matches = [path for path in output.glob("*.wav")
                       if re.search(r"\(" + kind + r"\)", path.name, re.I)]
            if len(matches) != 1:
                raise ValueError("Missing stem: " + kind)
            stems[kind] = matches[0]
        with LOCK:
            JOBS[job] = {"status": "done", "folder": folder, "stems": stems}
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"RoFormer: {error}", flush=True)
        with LOCK:
            JOBS[job] = {"status": "failed", "folder": folder}


class Handler(SimpleHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/roformer":
            return self.reply(404, {"error": "Rota inexistente."})
        if self.headers.get("Origin") not in allowed_origins(self.server.server_port):
            return self.reply(403, {"error": "Abra o app pela porta 8080 encaminhada no Codespaces ou pelo endereço local."})
        if not available():
            return self.reply(503, {"error": "Instale o separador e coloque os dois arquivos em modelos."})
        extension = {"audio/mpeg": "mp3", "audio/wav": "wav"}.get(self.headers.get("Content-Type"))
        try:
            size = int(self.headers.get("Content-Length", 0))
        except ValueError:
            size = 0
        if extension is None or not 0 < size <= 100_000_000:
            return self.reply(400, {"error": "Envie MP3 ou WAV de até 100 MB."})
        with LOCK:
            if any(item["status"] == "processing" for item in JOBS.values()):
                return self.reply(409, {"error": "Já existe uma música em processamento."})
            for item in JOBS.values():
                shutil.rmtree(item["folder"], ignore_errors=True)
            JOBS.clear()
            job = uuid.uuid4().hex
            folder = Path(TEMP.name) / job
            folder.mkdir()
            JOBS[job] = {"status": "processing", "folder": folder}
        try:
            with (folder / ("entrada." + extension)).open("wb") as stream:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise OSError("Envio incompleto")
                    stream.write(chunk)
                    remaining -= len(chunk)
        except OSError:
            with LOCK:
                JOBS[job]["status"] = "failed"
            return self.reply(400, {"error": "Envio incompleto."})
        threading.Thread(target=separate, args=(job, folder), daemon=True).start()
        self.reply(200, {"hash": job})

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path != "/api/roformer":
            return super().do_GET()
        query = parse_qs(url.query)
        if query.get("available") == ["1"]:
            return self.reply(200, {"available": available()})
        with LOCK:
            item = JOBS.get(query.get("hash", [""])[0])
            if not item:
                return self.reply(200, {"status": "not_found"})
            if "stem" not in query:
                return self.reply(200, {"status": item["status"]})
            path = item.get("stems", {}).get(query["stem"][0])
            if path is None:
                return self.reply(404, {"error": "Faixa indisponível."})
            stream = path.open("rb")
            length = path.stat().st_size
        with stream:
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            shutil.copyfileobj(stream, self.wfile)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    CLI = shutil.which("audio-separator")
    with tempfile.TemporaryDirectory(prefix="trucker-cap-") as TEMP:
        with ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT / "dist"))) as server:
            print(f"Abra http://127.0.0.1:{args.port} · RoFormer: {'pronto' if available() else 'arquivos ou dependências ausentes'}", flush=True)
            server.serve_forever()
