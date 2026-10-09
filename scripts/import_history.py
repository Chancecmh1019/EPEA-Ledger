"""Read-only by default. Explicit --execute restores an audited CSV via Supabase REST.
No balancing transactions, deletion, upsert or legacy correction reclassification.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

MAX_AMOUNT = 9007199254740991
FIELDS = ("id", "user_id", "type", "amount", "description", "note", "payment_method", "created_at", "is_urgent")

def load_env(path=Path(".env")):
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def timestamp(value):
    d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("Transaction timestamp requires explicit timezone")
    return d

def validated_rows(path):
    payload = Path(path).read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig"), newline=""))
    if reader.fieldnames != list(FIELDS):
        raise ValueError("CSV schema differs from audited nine-column export")
    records, seen = [], set()
    for index, row in enumerate(reader, 2):
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"CSV fields incomplete at row {index}")
        if not row["id"] or row["id"] in seen:
            raise ValueError(f"Missing or duplicate identifier at row {index}")
        seen.add(row["id"])
        if not row["user_id"] or row["type"] not in ("income", "expense") or row["payment_method"] not in ("cash", "credit_card"):
            raise ValueError(f"Invalid ownership/direction/payment at row {index}")
        if not row["description"].strip():
            raise ValueError(f"Missing description at row {index}")
        try:
            amount = Decimal(row["amount"])
            if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value() or amount > MAX_AMOUNT:
                raise ValueError(f"Invalid TWD amount at row {index}")
        except InvalidOperation as error:
            raise ValueError(f"Malformed amount at row {index}") from error
        timestamp(row["created_at"])
        if row["is_urgent"] not in ("true", "false"):
            raise ValueError(f"Invalid urgent flag at row {index}")
        records.append({**row, "amount": int(amount), "is_urgent": row["is_urgent"] == "true", "import_source": "csv-sha256:" + digest})
    return records, digest

def summarize(rows):
    accounts = {}
    for r in rows:
        a = accounts.setdefault(r["user_id"], {"count": 0, "cash_movement": 0, "income": 0, "expense": 0, "credit_spending": 0, "correction_candidates": 0})
        a["count"] += 1
        a[r["type"]] += r["amount"]
        if r["payment_method"] == "cash":
            a["cash_movement"] += r["amount"] * (1 if r["type"] == "income" else -1)
        elif r["type"] == "expense":
            a["credit_spending"] += r["amount"]
        if re.search("校正|調整|adjustment|correction|reconciliation", r["description"] + " " + r["note"], re.I):
            a["correction_candidates"] += 1
    return accounts

def equivalent(expected, actual):
    for key in FIELDS:
        if key == "created_at":
            if timestamp(expected[key]) != timestamp(actual[key]): return False
        elif key == "amount":
            if Decimal(str(expected[key])) != Decimal(str(actual[key])): return False
        elif expected[key] != actual.get(key): return False
    return not actual.get("deleted_at") and actual.get("kind", "ordinary") == "ordinary"

class SupabaseRest:
    def __init__(self, url, secret):
        if not url.startswith("https://") or not secret:
            raise ValueError("HTTPS Supabase URL and server secret are required")
        self.url, self.secret = url.rstrip("/"), secret
    def call(self, method, endpoint, payload=None):
        headers = {"apikey": self.secret, "Content-Type": "application/json"}
        # New secret API keys belong in apikey; legacy JWT service keys also need Bearer.
        if self.secret.startswith("eyJ"): headers["Authorization"] = "Bearer " + self.secret
        if method == "POST": headers["Prefer"] = "return=representation"
        req = urllib.request.Request(self.url + "/rest/v1/" + endpoint, headers=headers, data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode(), method=method)
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Supabase HTTP {error.code}; import stopped; inspect protected progress log and retry after review") from None
    def snapshot(self, owner):
        result = self.call("POST", "rpc/epea_snapshot", {"account_owner": owner, "owner_column": "user_id"})
        if not isinstance(result, list): raise RuntimeError("Incomplete snapshot response")
        return result

def restore(rows, client, log_dir):
    log_dir.mkdir(parents=True, exist_ok=True)
    owners = set(r["user_id"] for r in rows)
    expected = {r["id"]: r for r in rows}
    existing = {}
    for owner in owners:
        for r in client.snapshot(owner):
            if r["id"] in existing: raise RuntimeError("Duplicate cloud ID")
            existing[r["id"]] = r
    # Fail closed: do not merge any unexpected financial history.
    if set(existing) - set(expected): raise RuntimeError("Unexpected existing records; reconciliation required")
    for key, current in existing.items():
        if not equivalent(expected[key], current): raise RuntimeError("Existing record differs; no overwrite performed")
    missing = [r for r in rows if r["id"] not in existing]
    for start in range(0, len(missing), 200):
        batch = missing[start:start + 200]
        # Rest endpoint has no upsert preference: duplicate IDs never modify amounts.
        saved = client.call("POST", "records", batch)
        if not isinstance(saved, list) or {r["id"] for r in saved} != {r["id"] for r in batch}:
            raise RuntimeError("Cloud did not acknowledge every batch ID")
        for actual in saved:
            if not equivalent(expected[actual["id"]], actual): raise RuntimeError("Acknowledged row differs from source")
        with (log_dir / "progress.jsonl").open("a", encoding="utf-8") as log:
            log.write(json.dumps({"batch": start // 200 + 1, "confirmed_ids": [r["id"] for r in saved]}, ensure_ascii=False) + "\n")
    verified = {}
    for owner in owners:
        for row in client.snapshot(owner):
            if row["id"] in verified: raise RuntimeError("Duplicate ID in final snapshot")
            verified[row["id"]] = row
    if set(verified) != set(expected): raise RuntimeError("Final count or ID set mismatch")
    if any(not equivalent(row, verified[key]) for key, row in expected.items()): raise RuntimeError("Final field verification failed")
    (log_dir / "verified-snapshot.json").write_text(json.dumps(verified, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"uploaded": len(missing), "already_present": len(existing), "verified_count": len(verified), "accounts": summarize(list(verified.values()))}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", default="records_rows.csv")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--expected-sha256")
    args = parser.parse_args()
    load_env()
    rows, digest = validated_rows(args.csv)
    plan = {"source_sha256": digest, "rows": len(rows), "accounts": summarize(rows), "production_writes": False, "correction_policy": "preserve unchanged"}
    directory = Path(".private-audit/python-import")
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.execute:
        if not args.expected_sha256 or args.expected_sha256.lower() != digest:
            raise ValueError("Execution requires the exact reviewed source SHA256")
        client = SupabaseRest(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SECRET_KEY", ""))
        result = restore(rows, client, directory)
        plan.update({"production_writes": result["uploaded"] > 0, "verification": result})
        (directory / "result.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        print(f"STOPPED: {error}", file=sys.stderr)
        sys.exit(1)
