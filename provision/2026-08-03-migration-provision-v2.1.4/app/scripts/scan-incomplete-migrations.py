"""Scan portal-services handlers for incomplete Next.js → Express migrations."""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "packages" / "portal-services" / "src"

ALLOWED = {
    "Promise", "Record", "Array", "Map", "Set", "Date", "JSON", "Math", "Error",
    "console", "process", "Buffer", "URL", "URLSearchParams", "FormData", "File",
    "Headers", "fetch", "AbortSignal", "TextEncoder", "TextDecoder", "Uint8Array",
    "Number", "String", "Boolean", "Object", "RegExp", "Symbol", "BigInt",
    "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
    "decodeURIComponent", "encodeURI", "decodeURI", "atob", "btoa",
    "structuredClone", "crypto", "setTimeout", "clearTimeout", "setInterval",
    "clearInterval", "queueMicrotask", "require", "module", "exports",
    "__dirname", "__filename", "Awaited", "ReturnType", "Partial", "Pick",
    "Omit", "Exclude", "Extract", "NonNullable", "Readonly", "Required",
    "Parameters", "ConstructorParameters", "InstanceType", "Intl", "Proxy",
    "WeakMap", "WeakSet", "Reflect", "globalThis", "Op",
}

KEYWORDS = {
    "if", "for", "while", "switch", "catch", "return", "await", "typeof", "new",
    "throw", "void", "delete", "yield", "async", "function", "import", "export",
    "from", "as", "of", "in", "case", "default", "try", "else", "do", "with",
    "class", "extends", "implements", "interface", "type", "enum", "const",
    "let", "var", "static", "public", "private", "protected", "readonly", "get",
    "set", "constructor", "super", "this", "satisfies", "asserts", "is", "keyof",
    "infer",
}

NEXT_PATTERNS = [
    (re.compile(r"\brequest\.(text|json|headers|cookies|url|method)\b"), "next_request"),
    (re.compile(r"NextResponse\."), "next_response"),
    (re.compile(r"\bNextRequest\b"), "next_request_type"),
    (re.compile(r"new Response\("), "web_response"),
    (re.compile(r"Response\.json\("), "web_response"),
    (re.compile(r"\.cookies\.set\("), "next_cookies_set"),
    (re.compile(r"\breq\.(json|text)\("), "next_req"),
    (re.compile(r"from ['\"]next/server['\"]"), "next_import"),
    (re.compile(r"\bguardMiniApiRoute\("), "old_mini_guard"),
    (re.compile(r"\bauthErrorResponse\("), "next_auth_error"),
    (re.compile(r"\bmspAuthErrorResponse\("), "next_msp_auth_error"),
]


def collect_names(text: str) -> set[str]:
    names: set[str] = set()
    for m in re.finditer(r"import\s+(?:type\s+)?\{([^}]+)\}", text):
        for part in m.group(1).split(","):
            name = part.strip().split(" as ")[-1].strip()
            if name:
                names.add(name)
    for m in re.finditer(r"import\s+(?:type\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+from", text):
        names.add(m.group(1))
    for m in re.finditer(r"import\s+\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)", text):
        names.add(m.group(1))
    for m in re.finditer(
        r"(?:function|const|let|var|type|interface|class|enum)\s+([A-Za-z_][A-Za-z0-9_]*)",
        text,
    ):
        names.add(m.group(1))
    # params
    for m in re.finditer(r"\(([^)]*)\)\s*(?::[^{=]+)?\s*(?:=>|\{)", text):
        for part in re.split(r"[,=]", m.group(1)):
            part = re.sub(r"^\{|\}$", "", part.strip()).split(":")[0].strip().lstrip("...")
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part):
                names.add(part)
    return names


def looks_like_helper(name: str) -> bool:
    if name[0].isupper():
        return True
    return bool(re.match(r"^(get|set|build|create|parse|format|apply|guard|require|load|save|send|verify|sign|mask|resolve|emit|append|summarize|sanitize|answer|execute|is|has|can|looks|record|mini|auth|env)", name))


def main() -> None:
    issues: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    always_200: list[tuple[str, int]] = []

    files = list((ROOT / "handlers").rglob("*.ts"))
    files += [ROOT / "http-helpers.ts", ROOT / "mini-helpers.ts"]

    for path in files:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = str(path.relative_to(ROOT.parent))
        known = collect_names(text) | ALLOWED

        for m in re.finditer(r"(?<!\.)\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", text):
            name = m.group(1)
            if name in known or name in KEYWORDS or not looks_like_helper(name):
                continue
            lineno = text[: m.start()].count("\n") + 1
            issues["undefined_call"].append((rel, lineno, name))

        for pat, kind in NEXT_PATTERNS:
            for m in pat.finditer(text):
                lineno = text[: m.start()].count("\n") + 1
                issues[kind].append((rel, lineno, m.group(0)))

        for m in re.finditer(r"return\s*\{\s*status:\s*200,\s*body:\s*result\.body", text):
            lineno = text[: m.start()].count("\n") + 1
            always_200.append((rel, lineno))

    for kind, items in sorted(issues.items()):
        # dedupe
        seen = set()
        uniq = []
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            uniq.append(item)

        print(f"=== {kind} ({len(uniq)}) ===")
        if kind == "undefined_call":
            by_name: dict[str, list[tuple[str, int]]] = defaultdict(list)
            for path, line, name in uniq:
                by_name[name].append((path, line))
            for name, locs in sorted(by_name.items(), key=lambda x: (-len(x[1]), x[0])):
                print(f"  {name} ({len(locs)})")
                for path, line in locs:
                    print(f"    {path}:{line}")
        else:
            for path, line, name in uniq:
                print(f"  {path}:{line}: {name}")

    if always_200:
        print(f"=== always_http_200_proxy ({len(always_200)}) ===")
        for path, line in always_200:
            print(f"  {path}:{line}")


if __name__ == "__main__":
    main()
