from pathlib import Path
from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.exceptions import HTTPException
from rge.commands import SCHEMAS, generate, parse
from rge.workbook import read_workbook

ROOT = Path(__file__).parent
app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(ROOT / "public" / "assets", filename)


@app.get("/api/schema")
def schemas():
    return jsonify(SCHEMAS)


def json_object():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError("Send a JSON object.")
    return body


@app.post("/api/generate")
def build():
    body = json_object()
    return jsonify(code=generate(body.get("kind", ""), body.get("values", {})))


@app.post("/api/parse")
def parse_commands():
    body = json_object()
    code = body.get("code")
    if not isinstance(code, str) or len(code) > 1000000:
        raise ValueError("Enter up to 1 MB of command text.")
    lines = [line for line in code.splitlines() if line.strip()]
    if not lines or len(lines) > 2000:
        raise ValueError("Enter between 1 and 2,000 command lines.")
    return jsonify(entries=[parse(line) for line in lines])


@app.post("/api/import-workbook")
def import_workbook():
    upload = request.files.get("file")
    if upload is None or not upload.filename.lower().endswith(".xlsx"):
        raise ValueError("Choose an .xlsx workbook.")
    return jsonify(read_workbook(upload.read()))


@app.errorhandler(ValueError)
def bad_input(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify(error=error.description), error.code


@app.after_request
def headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
