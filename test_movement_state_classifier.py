#!/usr/bin/env python
from __future__ import annotations

import argparse
import csv
from pathlib import Path

from steply_ai.movement_state_classifier import MovementStateClassifier


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-test the RandomForest movement-state classifier.")
    parser.add_argument("--model", default="models/randomforest_landmark_classifier.joblib")
    parser.add_argument("--metadata-csv", default="UPFall_Camera_678_Prepared/metadata.csv")
    parser.add_argument("--sample-json", default="", help="JSON payload with a landmarks array.")
    args = parser.parse_args()

    classifier = MovementStateClassifier(args.model)

    if args.sample_json:
        import json

        payload = json.loads(Path(args.sample_json).read_text(encoding="utf-8"))
        result = classifier.predict(payload.get("landmarks", []))
        print(f"predicted label: {result['label']} confidence={result['confidence']:.3f}")
        print(result)
        return

    metadata_path = Path(args.metadata_csv)
    if not metadata_path.exists():
        print(f"metadata not found: {metadata_path}")
        print("Provide --sample-json to run inference on a prepared landmark sequence.")
        return

    with metadata_path.open("r", encoding="utf-8-sig", newline="") as handle:
        row = next(csv.DictReader(handle), None)
    if not row:
        print(f"metadata is empty: {metadata_path}")
        return

    print(f"sample_id: {row.get('sample_id', '-')}")
    print(f"true label: {row.get('label_name') or row.get('activity_name') or row.get('activity')}")
    print("This smoke test found metadata, but runtime inference expects prepared MediaPipe landmarks.")
    print("Use --sample-json with {'landmarks': [[{'x':..., 'y':..., 'visibility':...}, ...], ...]}.")


if __name__ == "__main__":
    main()

