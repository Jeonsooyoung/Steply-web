from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

import joblib
import numpy as np


LABELS = ["Walking", "Standing", "Sitting"]

LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28

DEBUG_FEATURES = [
    "mean_knee_angle",
    "std_knee_angle",
    "ankle_motion",
    "knee_motion",
    "motion_score",
]


def _is_number(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except Exception:
        return False


def _safe_float(value: Any, default: float = np.nan) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def _visible(arr: np.ndarray, idx: int, min_visibility: float) -> bool:
    return bool(arr[idx, 2] >= min_visibility)


def _midpoint(arr: np.ndarray, i: int, j: int, min_visibility: float) -> Optional[np.ndarray]:
    if not _visible(arr, i, min_visibility) or not _visible(arr, j, min_visibility):
        return None
    return (arr[i, :2] + arr[j, :2]) / 2.0


def _angle_3points(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return np.nan
    cos_angle = np.dot(ba, bc) / (norm_ba * norm_bc)
    cos_angle = float(np.clip(cos_angle, -1.0, 1.0))
    return math.degrees(math.acos(cos_angle))


def _normalize_landmarks(arr: np.ndarray, min_visibility: float) -> np.ndarray:
    out = arr.copy()
    hip_mid = _midpoint(arr, LEFT_HIP, RIGHT_HIP, min_visibility)
    shoulder_mid = _midpoint(arr, LEFT_SHOULDER, RIGHT_SHOULDER, min_visibility)
    if hip_mid is None:
        hip_mid = np.nanmean(arr[:, :2], axis=0)
    if shoulder_mid is not None and hip_mid is not None:
        scale = float(np.linalg.norm(shoulder_mid - hip_mid))
    else:
        scale = 1.0
    if np.isnan(scale) or scale < 1e-6:
        scale = 1.0
    out[:, 0:2] = (arr[:, 0:2] - hip_mid) / scale
    return out


def _frame_engineered_features(arr: np.ndarray, min_visibility: float) -> Dict[str, float]:
    features = {
        "left_knee_angle": np.nan,
        "right_knee_angle": np.nan,
        "mean_knee_angle": np.nan,
        "left_hip_angle": np.nan,
        "right_hip_angle": np.nan,
        "mean_hip_angle": np.nan,
        "torso_angle": np.nan,
        "hip_knee_y_gap": np.nan,
        "ankle_distance": np.nan,
        "ankle_mid_x": np.nan,
        "ankle_mid_y": np.nan,
        "knee_mid_x": np.nan,
        "knee_mid_y": np.nan,
        "hip_mid_x": np.nan,
        "hip_mid_y": np.nan,
    }

    norm = _normalize_landmarks(arr, min_visibility)

    if _visible(arr, LEFT_HIP, min_visibility) and _visible(arr, LEFT_KNEE, min_visibility) and _visible(arr, LEFT_ANKLE, min_visibility):
        features["left_knee_angle"] = _angle_3points(norm[LEFT_HIP, :2], norm[LEFT_KNEE, :2], norm[LEFT_ANKLE, :2])
    if _visible(arr, RIGHT_HIP, min_visibility) and _visible(arr, RIGHT_KNEE, min_visibility) and _visible(arr, RIGHT_ANKLE, min_visibility):
        features["right_knee_angle"] = _angle_3points(norm[RIGHT_HIP, :2], norm[RIGHT_KNEE, :2], norm[RIGHT_ANKLE, :2])

    knee_angles = [x for x in [features["left_knee_angle"], features["right_knee_angle"]] if not np.isnan(x)]
    if knee_angles:
        features["mean_knee_angle"] = float(np.mean(knee_angles))

    if _visible(arr, LEFT_SHOULDER, min_visibility) and _visible(arr, LEFT_HIP, min_visibility) and _visible(arr, LEFT_KNEE, min_visibility):
        features["left_hip_angle"] = _angle_3points(norm[LEFT_SHOULDER, :2], norm[LEFT_HIP, :2], norm[LEFT_KNEE, :2])
    if _visible(arr, RIGHT_SHOULDER, min_visibility) and _visible(arr, RIGHT_HIP, min_visibility) and _visible(arr, RIGHT_KNEE, min_visibility):
        features["right_hip_angle"] = _angle_3points(norm[RIGHT_SHOULDER, :2], norm[RIGHT_HIP, :2], norm[RIGHT_KNEE, :2])

    hip_angles = [x for x in [features["left_hip_angle"], features["right_hip_angle"]] if not np.isnan(x)]
    if hip_angles:
        features["mean_hip_angle"] = float(np.mean(hip_angles))

    shoulder_mid = _midpoint(norm, LEFT_SHOULDER, RIGHT_SHOULDER, min_visibility)
    hip_mid = _midpoint(norm, LEFT_HIP, RIGHT_HIP, min_visibility)
    knee_mid = _midpoint(norm, LEFT_KNEE, RIGHT_KNEE, min_visibility)
    ankle_mid = _midpoint(norm, LEFT_ANKLE, RIGHT_ANKLE, min_visibility)

    if shoulder_mid is not None and hip_mid is not None:
        vec = shoulder_mid - hip_mid
        features["torso_angle"] = math.degrees(math.atan2(abs(vec[0]), abs(vec[1]) + 1e-6))
        features["hip_mid_x"] = float(hip_mid[0])
        features["hip_mid_y"] = float(hip_mid[1])
    if knee_mid is not None:
        features["knee_mid_x"] = float(knee_mid[0])
        features["knee_mid_y"] = float(knee_mid[1])
    if ankle_mid is not None:
        features["ankle_mid_x"] = float(ankle_mid[0])
        features["ankle_mid_y"] = float(ankle_mid[1])
    if hip_mid is not None and knee_mid is not None:
        features["hip_knee_y_gap"] = float(knee_mid[1] - hip_mid[1])
    if _visible(arr, LEFT_ANKLE, min_visibility) and _visible(arr, RIGHT_ANKLE, min_visibility):
        features["ankle_distance"] = float(np.linalg.norm(norm[LEFT_ANKLE, :2] - norm[RIGHT_ANKLE, :2]))

    return features


def _nanmean(values: Sequence[float]) -> float:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0 or np.all(np.isnan(arr)):
        return np.nan
    return float(np.nanmean(arr))


def _nanstd(values: Sequence[float]) -> float:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0 or np.all(np.isnan(arr)):
        return np.nan
    return float(np.nanstd(arr))


def _xy_motion(xs: Sequence[float], ys: Sequence[float]) -> float:
    points = [[x, y] for x, y in zip(xs, ys) if not np.isnan(x) and not np.isnan(y)]
    if len(points) < 2:
        return 0.0
    arr = np.asarray(points, dtype=float)
    diffs = np.linalg.norm(np.diff(arr, axis=0), axis=1)
    return float(np.nanmean(diffs)) if len(diffs) else 0.0


def _landmark_value(point: Any, key: str, default: float = np.nan) -> float:
    if isinstance(point, Mapping):
        return _safe_float(point.get(key), default)
    if key == "x" and isinstance(point, Sequence) and len(point) > 0:
        return _safe_float(point[0], default)
    if key == "y" and isinstance(point, Sequence) and len(point) > 1:
        return _safe_float(point[1], default)
    if key == "visibility" and isinstance(point, Sequence) and len(point) > 2:
        return _safe_float(point[2], default)
    return default


def landmarks_to_array(frame: Sequence[Any]) -> Optional[np.ndarray]:
    if not frame:
        return None
    values = []
    for idx in range(33):
        if idx >= len(frame):
            return None
        point = frame[idx]
        x = _landmark_value(point, "x")
        y = _landmark_value(point, "y")
        visibility = _landmark_value(point, "visibility", 1.0)
        if not _is_number(x) or not _is_number(y):
            return None
        values.append([x, y, visibility if _is_number(visibility) else 1.0])
    return np.asarray(values, dtype=np.float32)


def extract_sequence_features_from_landmarks(
    landmark_sequence: Sequence[Sequence[Any]],
    min_visibility: float = 0.5,
    max_frames: Optional[int] = None,
) -> Dict[str, float]:
    sampled = list(landmark_sequence or [])
    if max_frames and len(sampled) > max_frames:
        indices = np.linspace(0, len(sampled) - 1, max_frames).astype(int)
        sampled = [sampled[i] for i in indices]

    detected = 0
    norm_landmarks = []
    engineered_rows = []

    for frame in sampled:
        arr = landmarks_to_array(frame)
        if arr is None:
            continue
        detected += 1
        norm_landmarks.append(_normalize_landmarks(arr, min_visibility))
        engineered_rows.append(_frame_engineered_features(arr, min_visibility))

    detection_rate = detected / len(sampled) if sampled else 0.0
    features: Dict[str, float] = {
        "sampled_frame_count": len(sampled),
        "detected_frame_count": detected,
        "detection_rate": detection_rate,
    }

    if not norm_landmarks:
        for i in range(33):
            features[f"lm{i:02d}_x_mean"] = np.nan
            features[f"lm{i:02d}_y_mean"] = np.nan
            features[f"lm{i:02d}_v_mean"] = np.nan
            features[f"lm{i:02d}_x_std"] = np.nan
            features[f"lm{i:02d}_y_std"] = np.nan
            features[f"lm{i:02d}_v_std"] = np.nan
        for key in [
            "mean_knee_angle", "std_knee_angle", "mean_hip_angle", "std_hip_angle",
            "mean_torso_angle", "std_torso_angle", "mean_hip_knee_y_gap",
            "std_hip_knee_y_gap", "mean_ankle_distance", "std_ankle_distance",
        ]:
            features[key] = np.nan
        for key in ["ankle_motion", "knee_motion", "hip_motion", "motion_score"]:
            features[key] = 0.0
        return features

    lm_arr = np.stack(norm_landmarks, axis=0)
    for i in range(33):
        features[f"lm{i:02d}_x_mean"] = float(np.nanmean(lm_arr[:, i, 0]))
        features[f"lm{i:02d}_y_mean"] = float(np.nanmean(lm_arr[:, i, 1]))
        features[f"lm{i:02d}_v_mean"] = float(np.nanmean(lm_arr[:, i, 2]))
        features[f"lm{i:02d}_x_std"] = float(np.nanstd(lm_arr[:, i, 0]))
        features[f"lm{i:02d}_y_std"] = float(np.nanstd(lm_arr[:, i, 1]))
        features[f"lm{i:02d}_v_std"] = float(np.nanstd(lm_arr[:, i, 2]))

    def collect(key: str) -> List[float]:
        return [r.get(key, np.nan) for r in engineered_rows]

    features["mean_knee_angle"] = _nanmean(collect("mean_knee_angle"))
    features["std_knee_angle"] = _nanstd(collect("mean_knee_angle"))
    features["mean_hip_angle"] = _nanmean(collect("mean_hip_angle"))
    features["std_hip_angle"] = _nanstd(collect("mean_hip_angle"))
    features["mean_torso_angle"] = _nanmean(collect("torso_angle"))
    features["std_torso_angle"] = _nanstd(collect("torso_angle"))
    features["mean_hip_knee_y_gap"] = _nanmean(collect("hip_knee_y_gap"))
    features["std_hip_knee_y_gap"] = _nanstd(collect("hip_knee_y_gap"))
    features["mean_ankle_distance"] = _nanmean(collect("ankle_distance"))
    features["std_ankle_distance"] = _nanstd(collect("ankle_distance"))

    ankle_motion = _xy_motion(collect("ankle_mid_x"), collect("ankle_mid_y"))
    knee_motion = _xy_motion(collect("knee_mid_x"), collect("knee_mid_y"))
    hip_motion = _xy_motion(collect("hip_mid_x"), collect("hip_mid_y"))
    features["ankle_motion"] = ankle_motion
    features["knee_motion"] = knee_motion
    features["hip_motion"] = hip_motion
    features["motion_score"] = ankle_motion + knee_motion + 0.5 * hip_motion + (
        features["std_knee_angle"] / 100.0 if not np.isnan(features["std_knee_angle"]) else 0.0
    )

    return features


def _jsonable_float(value: Any) -> Optional[float]:
    try:
        number = float(value)
        if math.isfinite(number):
            return number
    except Exception:
        pass
    return None


class MovementStateClassifier:
    def __init__(self, model_path: str | Path):
        self.model_path = Path(model_path)
        payload = joblib.load(self.model_path)
        self.model = payload["model"]
        self.feature_cols = list(payload["feature_cols"])
        self.id_to_label = {int(k): v for k, v in payload.get("id_to_label", {}).items()}
        if not self.id_to_label:
            self.id_to_label = {0: "Walking", 1: "Standing", 2: "Sitting"}
        self.min_visibility = float(payload.get("min_visibility", 0.5))
        self.max_frames = int(payload.get("max_frames", 80))

    def extract_features(self, landmark_sequence: Sequence[Sequence[Any]]) -> Dict[str, float]:
        return extract_sequence_features_from_landmarks(
            landmark_sequence,
            min_visibility=self.min_visibility,
            max_frames=self.max_frames,
        )

    def predict(self, landmark_sequence: Sequence[Sequence[Any]]) -> Dict[str, Any]:
        features = self.extract_features(landmark_sequence)
        x = np.asarray([[_safe_float(features.get(col), default=np.nan) for col in self.feature_cols]], dtype=float)
        pred_id = int(self.model.predict(x)[0])
        label = self.id_to_label.get(pred_id, str(pred_id))

        probabilities: Dict[str, float] = {}
        confidence = None
        if hasattr(self.model, "predict_proba"):
            proba = self.model.predict_proba(x)[0]
            classes: Iterable[Any] = getattr(self.model, "classes_", range(len(proba)))
            for class_id, value in zip(classes, proba):
                class_label = self.id_to_label.get(int(class_id), str(class_id))
                probabilities[class_label] = float(value)
            confidence = probabilities.get(label)

        if confidence is None:
            confidence = 1.0

        return {
            "label": label,
            "label_id": pred_id,
            "confidence": float(confidence),
            "probabilities": probabilities,
            "frames_used": int(features.get("sampled_frame_count", 0) or 0),
            "detected_frame_count": int(features.get("detected_frame_count", 0) or 0),
            "detection_rate": float(features.get("detection_rate", 0.0) or 0.0),
            "feature_values": {key: _jsonable_float(features.get(key)) for key in DEBUG_FEATURES},
        }


def predict_payload(model_path: str | Path, payload: Mapping[str, Any]) -> Dict[str, Any]:
    landmarks = payload.get("landmarks") or payload.get("landmark_sequence") or []
    return MovementStateClassifier(model_path).predict(landmarks)


def main() -> None:
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Predict Walking/Standing/Sitting from MediaPipe landmark sequences.")
    parser.add_argument("--model", default=str(Path("models") / "randomforest_landmark_classifier.joblib"))
    parser.add_argument("--input-json", default="", help="Optional JSON file. Reads stdin when omitted.")
    args = parser.parse_args()

    raw = Path(args.input_json).read_text(encoding="utf-8") if args.input_json else sys.stdin.read()
    payload = json.loads(raw or "{}")
    result = predict_payload(args.model, payload)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()

