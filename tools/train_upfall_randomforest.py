#!/usr/bin/env python
# -*- coding: utf-8 -*-

r"""
train_upfall_randomforest.py

UP-Fall / FALL-UP Camera Activity 6/7/8 데이터로
MediaPipe landmark feature를 추출한 뒤 RandomForest 분류기를 학습/평가하는 코드.

대상:
- Activity 6 = Walking
- Activity 7 = Standing
- Activity 8 = Sitting

입력:
- prepare_upfall_camera_678.py로 만든 metadata.csv
- frame_dir 컬럼이 있어야 함

설치:
python -m pip install mediapipe opencv-python numpy scikit-learn joblib tqdm

기본 실행:
python train_upfall_randomforest.py --metadata-csv ".\UPFall_Camera_678_Prepared\metadata.csv" --camera 2 --out-dir ".\RF_Camera2"

전체 카메라:
python train_upfall_randomforest.py --metadata-csv ".\UPFall_Camera_678_Prepared\metadata.csv" --camera both --out-dir ".\RF_Both"

Subject split 직접 지정:
python train_upfall_randomforest.py --metadata-csv ".\UPFall_Camera_678_Prepared\metadata.csv" --camera 2 --train-subjects "1-12" --val-subjects "13-15" --out-dir ".\RF_Camera2"
"""

import argparse
import csv
import json
import math
import random
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import joblib
import numpy as np
from tqdm import tqdm

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
except ImportError:
    raise ImportError(
        "scikit-learn/joblib이 설치되어 있지 않습니다.\n"
        "python -m pip install scikit-learn joblib"
    )


LABELS = ["Walking", "Standing", "Sitting"]
LABEL_TO_ID = {
    "Walking": 0,
    "Standing": 1,
    "Sitting": 2,
}
ID_TO_LABEL = {
    0: "Walking",
    1: "Standing",
    2: "Sitting",
}
ACTIVITY_TO_LABEL = {
    6: "Walking",
    7: "Standing",
    8: "Sitting",
}

# MediaPipe Pose landmark index
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28


def get_mediapipe_pose_module():
    """
    mediapipe 버전에 따라 pose 모듈 import 방식이 조금 다를 수 있어
    두 경로를 모두 시도한다.
    """
    try:
        import mediapipe as mp
        if hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
            return mp.solutions.pose
    except Exception:
        pass

    try:
        from mediapipe.python.solutions import pose as mp_pose
        return mp_pose
    except Exception as e:
        raise ImportError(
            "MediaPipe Pose API를 찾지 못했습니다.\n"
            "아래처럼 설치 버전을 맞춰보세요:\n"
            "python -m pip uninstall -y mediapipe\n"
            "python -m pip install mediapipe==0.10.14\n\n"
            f"원래 오류: {e}"
        )


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv_rows(path: Path, rows: List[Dict], fieldnames: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def to_int(value, default=0) -> int:
    try:
        return int(float(str(value)))
    except Exception:
        return default


def to_float(value, default=np.nan) -> float:
    try:
        if value == "":
            return default
        return float(value)
    except Exception:
        return default


def parse_subject_set(text: str) -> set[int]:
    """
    "1-12", "1,2,3", "" 형식 지원.
    """
    result = set()
    text = str(text).strip()

    if not text:
        return result

    for part in text.split(","):
        part = part.strip()
        if not part:
            continue

        if "-" in part:
            start, end = part.split("-", 1)
            result.update(range(int(start), int(end) + 1))
        else:
            result.add(int(part))

    return result


def true_label_from_row(row: Dict[str, str]) -> str:
    if row.get("label_name"):
        return str(row["label_name"])

    if row.get("activity_name"):
        return str(row["activity_name"])

    activity = to_int(row.get("activity"), default=-1)
    return ACTIVITY_TO_LABEL.get(activity, f"Activity{activity}")


def filter_rows(rows: List[Dict[str, str]], camera: str) -> List[Dict[str, str]]:
    # Activity 6/7/8만 사용
    filtered = []
    for row in rows:
        label = true_label_from_row(row)
        if label not in LABEL_TO_ID:
            continue

        if camera != "both":
            if str(row.get("camera", "")) != str(camera):
                continue

        frame_dir = Path(str(row.get("frame_dir", "")))
        if not str(frame_dir):
            continue

        filtered.append(row)

    return filtered


def split_rows(
    rows: List[Dict[str, str]],
    train_subjects: str,
    val_subjects: str,
    seed: int,
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]], List[Dict[str, str]], str]:
    """
    1순위: CSV에 split 컬럼이 있고 train/test가 충분하면 그걸 사용
    2순위: subject 번호 기준 split
    3순위: 그래도 test가 없으면 stratified random split
    """
    has_split = any("split" in r and str(r.get("split", "")).strip() for r in rows)

    if has_split:
        train = [r for r in rows if str(r.get("split", "")).strip().lower() == "train"]
        val = [r for r in rows if str(r.get("split", "")).strip().lower() == "val"]
        test = [r for r in rows if str(r.get("split", "")).strip().lower() == "test"]

        if len(train) > 0 and len(test) > 0:
            return train, val, test, "csv_split"

    train_set = parse_subject_set(train_subjects)
    val_set = parse_subject_set(val_subjects)

    train, val, test = [], [], []
    for r in rows:
        subject = to_int(r.get("subject"), default=-1)

        if subject in train_set:
            train.append(r)
        elif subject in val_set:
            val.append(r)
        else:
            test.append(r)

    if len(train) > 0 and len(test) > 0:
        return train, val, test, "subject_split"

    # 샘플을 일부만 받은 상태에서는 subject split이 모두 train으로 몰릴 수 있음.
    # 이 경우 임시 실험용으로 stratified random split 사용.
    y = [LABEL_TO_ID[true_label_from_row(r)] for r in rows]

    if len(rows) < 6 or len(set(y)) < 2:
        return rows, [], [], "all_train_too_few_samples"

    try:
        train_val, test = train_test_split(
            rows,
            test_size=0.2,
            random_state=seed,
            stratify=y,
        )

        y_train_val = [LABEL_TO_ID[true_label_from_row(r)] for r in train_val]

        if len(train_val) >= 6 and len(set(y_train_val)) >= 2:
            train, val = train_test_split(
                train_val,
                test_size=0.2,
                random_state=seed,
                stratify=y_train_val,
            )
        else:
            train, val = train_val, []

        return train, val, test, "stratified_random_fallback"

    except Exception:
        random.Random(seed).shuffle(rows)
        n = len(rows)
        n_test = max(1, int(n * 0.2))
        n_val = max(1, int(n * 0.1)) if n >= 10 else 0
        test = rows[:n_test]
        val = rows[n_test:n_test + n_val]
        train = rows[n_test + n_val:]
        return train, val, test, "random_fallback"


def list_images(frame_dir: Path) -> List[Path]:
    exts = {".png", ".jpg", ".jpeg", ".bmp"}
    return sorted([p for p in frame_dir.rglob("*") if p.suffix.lower() in exts])


def sample_images(image_paths: List[Path], max_frames: int, frame_step: int) -> List[Path]:
    if frame_step > 1:
        image_paths = image_paths[::frame_step]

    if len(image_paths) <= max_frames:
        return image_paths

    indices = np.linspace(0, len(image_paths) - 1, max_frames).astype(int)
    return [image_paths[i] for i in indices]


def landmark_xyv(result) -> Optional[np.ndarray]:
    if result.pose_landmarks is None:
        return None

    arr = []
    for lm in result.pose_landmarks.landmark:
        arr.append([lm.x, lm.y, lm.visibility])

    return np.asarray(arr, dtype=np.float32)


def visible(arr: np.ndarray, idx: int, min_visibility: float) -> bool:
    return bool(arr[idx, 2] >= min_visibility)


def midpoint(arr: np.ndarray, i: int, j: int, min_visibility: float) -> Optional[np.ndarray]:
    if not visible(arr, i, min_visibility) or not visible(arr, j, min_visibility):
        return None
    return (arr[i, :2] + arr[j, :2]) / 2.0


def angle_3points(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b

    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)

    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return np.nan

    cos_angle = np.dot(ba, bc) / (norm_ba * norm_bc)
    cos_angle = float(np.clip(cos_angle, -1.0, 1.0))
    return math.degrees(math.acos(cos_angle))


def normalize_landmarks(arr: np.ndarray, min_visibility: float) -> np.ndarray:
    """
    카메라 위치/사람 크기 영향을 줄이기 위해
    hip center 기준으로 x/y를 이동하고, shoulder-hip 거리로 정규화.
    반환 shape: (33, 3), columns = normalized_x, normalized_y, visibility
    """
    out = arr.copy()

    hip_mid = midpoint(arr, LEFT_HIP, RIGHT_HIP, min_visibility)
    shoulder_mid = midpoint(arr, LEFT_SHOULDER, RIGHT_SHOULDER, min_visibility)

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


def frame_engineered_features(arr: np.ndarray, min_visibility: float) -> Dict[str, float]:
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

    norm = normalize_landmarks(arr, min_visibility)

    # Knee angle: hip-knee-ankle
    if visible(arr, LEFT_HIP, min_visibility) and visible(arr, LEFT_KNEE, min_visibility) and visible(arr, LEFT_ANKLE, min_visibility):
        features["left_knee_angle"] = angle_3points(norm[LEFT_HIP, :2], norm[LEFT_KNEE, :2], norm[LEFT_ANKLE, :2])

    if visible(arr, RIGHT_HIP, min_visibility) and visible(arr, RIGHT_KNEE, min_visibility) and visible(arr, RIGHT_ANKLE, min_visibility):
        features["right_knee_angle"] = angle_3points(norm[RIGHT_HIP, :2], norm[RIGHT_KNEE, :2], norm[RIGHT_ANKLE, :2])

    knee_angles = [features["left_knee_angle"], features["right_knee_angle"]]
    knee_angles = [x for x in knee_angles if not np.isnan(x)]
    if knee_angles:
        features["mean_knee_angle"] = float(np.mean(knee_angles))

    # Hip angle: shoulder-hip-knee
    if visible(arr, LEFT_SHOULDER, min_visibility) and visible(arr, LEFT_HIP, min_visibility) and visible(arr, LEFT_KNEE, min_visibility):
        features["left_hip_angle"] = angle_3points(norm[LEFT_SHOULDER, :2], norm[LEFT_HIP, :2], norm[LEFT_KNEE, :2])

    if visible(arr, RIGHT_SHOULDER, min_visibility) and visible(arr, RIGHT_HIP, min_visibility) and visible(arr, RIGHT_KNEE, min_visibility):
        features["right_hip_angle"] = angle_3points(norm[RIGHT_SHOULDER, :2], norm[RIGHT_HIP, :2], norm[RIGHT_KNEE, :2])

    hip_angles = [features["left_hip_angle"], features["right_hip_angle"]]
    hip_angles = [x for x in hip_angles if not np.isnan(x)]
    if hip_angles:
        features["mean_hip_angle"] = float(np.mean(hip_angles))

    shoulder_mid = midpoint(norm, LEFT_SHOULDER, RIGHT_SHOULDER, min_visibility)
    hip_mid = midpoint(norm, LEFT_HIP, RIGHT_HIP, min_visibility)
    knee_mid = midpoint(norm, LEFT_KNEE, RIGHT_KNEE, min_visibility)
    ankle_mid = midpoint(norm, LEFT_ANKLE, RIGHT_ANKLE, min_visibility)

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

    if visible(arr, LEFT_ANKLE, min_visibility) and visible(arr, RIGHT_ANKLE, min_visibility):
        features["ankle_distance"] = float(np.linalg.norm(norm[LEFT_ANKLE, :2] - norm[RIGHT_ANKLE, :2]))

    return features


def nanmean(values: List[float]) -> float:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0 or np.all(np.isnan(arr)):
        return np.nan
    return float(np.nanmean(arr))


def nanstd(values: List[float]) -> float:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0 or np.all(np.isnan(arr)):
        return np.nan
    return float(np.nanstd(arr))


def xy_motion(xs: List[float], ys: List[float]) -> float:
    points = []
    for x, y in zip(xs, ys):
        if not np.isnan(x) and not np.isnan(y):
            points.append([x, y])

    if len(points) < 2:
        return 0.0

    points = np.asarray(points, dtype=float)
    diffs = np.linalg.norm(np.diff(points, axis=0), axis=1)
    return float(np.nanmean(diffs)) if len(diffs) else 0.0


def extract_sequence_features(
    frame_dir: Path,
    pose,
    max_frames: int,
    frame_step: int,
    min_visibility: float,
) -> Dict[str, float]:
    image_paths = list_images(frame_dir)
    sampled = sample_images(image_paths, max_frames=max_frames, frame_step=frame_step)

    detected = 0

    # landmark sequence: list of normalized landmarks
    norm_landmarks = []

    engineered_rows = []

    for img_path in sampled:
        image = cv2.imread(str(img_path))
        if image is None:
            continue

        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        result = pose.process(rgb)
        arr = landmark_xyv(result)

        if arr is None:
            continue

        detected += 1
        norm = normalize_landmarks(arr, min_visibility)
        norm_landmarks.append(norm)
        engineered_rows.append(frame_engineered_features(arr, min_visibility))

    detection_rate = detected / len(sampled) if len(sampled) > 0 else 0.0

    features: Dict[str, float] = {
        "sampled_frame_count": len(sampled),
        "detected_frame_count": detected,
        "detection_rate": detection_rate,
    }

    # MediaPipe가 한 번도 감지 못한 경우
    if not norm_landmarks:
        # 33 landmarks x mean/std for x/y/v
        for i in range(33):
            features[f"lm{i:02d}_x_mean"] = np.nan
            features[f"lm{i:02d}_y_mean"] = np.nan
            features[f"lm{i:02d}_v_mean"] = np.nan
            features[f"lm{i:02d}_x_std"] = np.nan
            features[f"lm{i:02d}_y_std"] = np.nan
            features[f"lm{i:02d}_v_std"] = np.nan

        for key in [
            "mean_knee_angle", "std_knee_angle",
            "mean_hip_angle", "std_hip_angle",
            "mean_torso_angle", "std_torso_angle",
            "mean_hip_knee_y_gap", "std_hip_knee_y_gap",
            "mean_ankle_distance", "std_ankle_distance",
            "ankle_motion", "knee_motion", "hip_motion",
            "motion_score",
        ]:
            features[key] = np.nan if "motion" not in key else 0.0

        return features

    lm_arr = np.stack(norm_landmarks, axis=0)  # (T, 33, 3)

    for i in range(33):
        features[f"lm{i:02d}_x_mean"] = float(np.nanmean(lm_arr[:, i, 0]))
        features[f"lm{i:02d}_y_mean"] = float(np.nanmean(lm_arr[:, i, 1]))
        features[f"lm{i:02d}_v_mean"] = float(np.nanmean(lm_arr[:, i, 2]))
        features[f"lm{i:02d}_x_std"] = float(np.nanstd(lm_arr[:, i, 0]))
        features[f"lm{i:02d}_y_std"] = float(np.nanstd(lm_arr[:, i, 1]))
        features[f"lm{i:02d}_v_std"] = float(np.nanstd(lm_arr[:, i, 2]))

    def collect(key: str) -> List[float]:
        return [r.get(key, np.nan) for r in engineered_rows]

    features["mean_knee_angle"] = nanmean(collect("mean_knee_angle"))
    features["std_knee_angle"] = nanstd(collect("mean_knee_angle"))
    features["mean_hip_angle"] = nanmean(collect("mean_hip_angle"))
    features["std_hip_angle"] = nanstd(collect("mean_hip_angle"))
    features["mean_torso_angle"] = nanmean(collect("torso_angle"))
    features["std_torso_angle"] = nanstd(collect("torso_angle"))
    features["mean_hip_knee_y_gap"] = nanmean(collect("hip_knee_y_gap"))
    features["std_hip_knee_y_gap"] = nanstd(collect("hip_knee_y_gap"))
    features["mean_ankle_distance"] = nanmean(collect("ankle_distance"))
    features["std_ankle_distance"] = nanstd(collect("ankle_distance"))

    ankle_motion = xy_motion(collect("ankle_mid_x"), collect("ankle_mid_y"))
    knee_motion = xy_motion(collect("knee_mid_x"), collect("knee_mid_y"))
    hip_motion = xy_motion(collect("hip_mid_x"), collect("hip_mid_y"))

    features["ankle_motion"] = ankle_motion
    features["knee_motion"] = knee_motion
    features["hip_motion"] = hip_motion
    features["motion_score"] = ankle_motion + knee_motion + 0.5 * hip_motion + (features["std_knee_angle"] / 100.0 if not np.isnan(features["std_knee_angle"]) else 0.0)

    return features


def cache_key(row: Dict[str, str]) -> str:
    if row.get("sample_id"):
        return row["sample_id"]
    return f"S{row.get('subject')}_A{row.get('activity')}_T{row.get('trial')}_C{row.get('camera')}"


def load_feature_cache(path: Path) -> Dict[str, Dict[str, str]]:
    if not path.exists():
        return {}

    rows = read_csv_rows(path)
    return {r["sample_id"]: r for r in rows if r.get("sample_id")}


def build_features(
    rows: List[Dict[str, str]],
    out_dir: Path,
    max_frames: int,
    frame_step: int,
    min_visibility: float,
    reuse_cache: bool,
) -> List[Dict]:
    cache_path = out_dir / "features_cache.csv"
    cache = load_feature_cache(cache_path) if reuse_cache else {}

    all_feature_rows: List[Dict] = []
    mp_pose = get_mediapipe_pose_module()

    # 캐시가 이미 모든 row를 갖고 있으면 MediaPipe를 열 필요는 없지만
    # 간단하게 필요한 경우에만 Pose를 생성한다.
    rows_to_process = [r for r in rows if cache_key(r) not in cache]

    if rows_to_process:
        print(f"[INFO] 새로 feature 추출할 샘플 수: {len(rows_to_process)}")
        with mp_pose.Pose(
            static_image_mode=True,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5,
        ) as pose:
            for row in tqdm(rows_to_process, desc="Extract MediaPipe features"):
                sid = cache_key(row)
                frame_dir = Path(str(row.get("frame_dir", "")))

                label_name = true_label_from_row(row)
                base = {
                    "sample_id": sid,
                    "frame_dir": str(frame_dir),
                    "subject": row.get("subject", ""),
                    "activity": row.get("activity", ""),
                    "trial": row.get("trial", ""),
                    "camera": row.get("camera", ""),
                    "label_name": label_name,
                    "label_id": LABEL_TO_ID[label_name],
                }

                if not frame_dir.exists():
                    feat = {"feature_status": "frame_dir_not_found"}
                    # 빈 feature라도 넣어두기
                    for i in range(33):
                        feat[f"lm{i:02d}_x_mean"] = np.nan
                        feat[f"lm{i:02d}_y_mean"] = np.nan
                        feat[f"lm{i:02d}_v_mean"] = np.nan
                        feat[f"lm{i:02d}_x_std"] = np.nan
                        feat[f"lm{i:02d}_y_std"] = np.nan
                        feat[f"lm{i:02d}_v_std"] = np.nan
                    feat["detection_rate"] = 0.0
                else:
                    feat = extract_sequence_features(
                        frame_dir=frame_dir,
                        pose=pose,
                        max_frames=max_frames,
                        frame_step=frame_step,
                        min_visibility=min_visibility,
                    )
                    feat["feature_status"] = "ok"

                feature_row = {**base, **feat}
                cache[sid] = {k: str(v) for k, v in feature_row.items()}

    for row in rows:
        sid = cache_key(row)
        if sid in cache:
            all_feature_rows.append(cache[sid])

    # cache 저장
    if all_feature_rows:
        fieldnames = []
        for r in all_feature_rows:
            for k in r.keys():
                if k not in fieldnames:
                    fieldnames.append(k)
        write_csv_rows(cache_path, all_feature_rows, fieldnames)

    return all_feature_rows


def get_feature_columns(feature_rows: List[Dict]) -> List[str]:
    meta_cols = {
        "sample_id", "frame_dir", "subject", "activity", "trial", "camera",
        "label_name", "label_id", "feature_status", "split",
    }

    cols = []
    for row in feature_rows:
        for k in row.keys():
            if k in meta_cols:
                continue
            try:
                float(row[k])
                if k not in cols:
                    cols.append(k)
            except Exception:
                pass

    return cols


def rows_to_xy(rows: List[Dict], feature_cols: List[str]) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    X = []
    y = []
    ids = []

    for r in rows:
        X.append([to_float(r.get(c), default=np.nan) for c in feature_cols])
        y.append(to_int(r.get("label_id"), default=-1))
        ids.append(str(r.get("sample_id", "")))

    return np.asarray(X, dtype=float), np.asarray(y, dtype=int), ids


def index_by_sample_id(rows: List[Dict]) -> Dict[str, Dict]:
    return {str(r.get("sample_id")): r for r in rows}


def features_for_split(feature_rows: List[Dict], split_rows: List[Dict]) -> List[Dict]:
    fmap = index_by_sample_id(feature_rows)
    out = []
    for r in split_rows:
        sid = cache_key(r)
        if sid in fmap:
            out.append(fmap[sid])
    return out


def evaluate_split(
    name: str,
    model,
    rows: List[Dict],
    feature_cols: List[str],
    out_dir: Path,
) -> Dict[str, float]:
    if not rows:
        return {"split": name, "count": 0, "accuracy": np.nan}

    X, y, ids = rows_to_xy(rows, feature_cols)
    pred = model.predict(X)

    acc = accuracy_score(y, pred)

    pred_rows = []
    for r, p in zip(rows, pred):
        true_id = to_int(r.get("label_id"), default=-1)
        pred_id = int(p)

        pred_rows.append({
            "sample_id": r.get("sample_id", ""),
            "subject": r.get("subject", ""),
            "activity": r.get("activity", ""),
            "trial": r.get("trial", ""),
            "camera": r.get("camera", ""),
            "true_label": ID_TO_LABEL.get(true_id, str(true_id)),
            "pred_label": ID_TO_LABEL.get(pred_id, str(pred_id)),
            "correct": int(true_id == pred_id),
            "detection_rate": r.get("detection_rate", ""),
            "mean_knee_angle": r.get("mean_knee_angle", ""),
            "std_knee_angle": r.get("std_knee_angle", ""),
            "motion_score": r.get("motion_score", ""),
        })

    write_csv_rows(
        out_dir / f"predictions_{name}.csv",
        pred_rows,
        [
            "sample_id", "subject", "activity", "trial", "camera",
            "true_label", "pred_label", "correct",
            "detection_rate", "mean_knee_angle", "std_knee_angle", "motion_score",
        ],
    )

    cm = confusion_matrix(y, pred, labels=[0, 1, 2])
    cm_rows = []
    for i, label in enumerate(LABELS):
        cm_rows.append({
            "true_label": label,
            "pred_Walking": int(cm[i][0]),
            "pred_Standing": int(cm[i][1]),
            "pred_Sitting": int(cm[i][2]),
        })

    write_csv_rows(
        out_dir / f"confusion_matrix_{name}.csv",
        cm_rows,
        ["true_label", "pred_Walking", "pred_Standing", "pred_Sitting"],
    )

    report_text = classification_report(
        y,
        pred,
        labels=[0, 1, 2],
        target_names=LABELS,
        digits=4,
        zero_division=0,
    )

    write_text(out_dir / f"classification_report_{name}.txt", report_text)

    return {"split": name, "count": len(rows), "accuracy": float(acc)}


def save_feature_importance(model, feature_cols: List[str], out_dir: Path) -> None:
    try:
        rf = model.named_steps["randomforestclassifier"]
        importances = rf.feature_importances_

        pairs = sorted(
            zip(feature_cols, importances),
            key=lambda x: x[1],
            reverse=True,
        )

        rows = [
            {"rank": i + 1, "feature": name, "importance": float(imp)}
            for i, (name, imp) in enumerate(pairs)
        ]

        write_csv_rows(
            out_dir / "feature_importance.csv",
            rows,
            ["rank", "feature", "importance"],
        )

    except Exception as e:
        write_text(out_dir / "feature_importance_error.txt", str(e))


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--metadata-csv", type=str, required=True)
    parser.add_argument("--out-dir", type=str, default="RF_Result")
    parser.add_argument("--camera", type=str, default="both", choices=["both", "1", "2"])

    parser.add_argument("--train-subjects", type=str, default="1-12")
    parser.add_argument("--val-subjects", type=str, default="13-15")

    parser.add_argument("--max-frames", type=int, default=80)
    parser.add_argument("--frame-step", type=int, default=10)
    parser.add_argument("--min-visibility", type=float, default=0.5)
    parser.add_argument("--no-cache", action="store_true")

    parser.add_argument("--n-estimators", type=int, default=300)
    parser.add_argument("--max-depth", type=int, default=0, help="0이면 None")
    parser.add_argument("--seed", type=int, default=42)

    args = parser.parse_args()

    metadata_csv = Path(args.metadata_csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = read_csv_rows(metadata_csv)
    rows = filter_rows(rows, camera=args.camera)

    if not rows:
        raise ValueError("평가/학습할 row가 없습니다. metadata.csv 경로와 camera 필터를 확인하세요.")

    train_rows, val_rows, test_rows, split_mode = split_rows(
        rows,
        train_subjects=args.train_subjects,
        val_subjects=args.val_subjects,
        seed=args.seed,
    )

    print("[INFO] RandomForest landmark classifier")
    print(f"[INFO] metadata: {metadata_csv}")
    print(f"[INFO] out_dir: {out_dir}")
    print(f"[INFO] camera: {args.camera}")
    print(f"[INFO] split_mode: {split_mode}")
    print(f"[INFO] train/val/test rows: {len(train_rows)} / {len(val_rows)} / {len(test_rows)}")

    # 모든 split에 필요한 rows를 합쳐 feature 추출
    all_split_rows = train_rows + val_rows + test_rows

    feature_rows = build_features(
        all_split_rows,
        out_dir=out_dir,
        max_frames=args.max_frames,
        frame_step=args.frame_step,
        min_visibility=args.min_visibility,
        reuse_cache=not args.no_cache,
    )

    train_features = features_for_split(feature_rows, train_rows)
    val_features = features_for_split(feature_rows, val_rows)
    test_features = features_for_split(feature_rows, test_rows)

    feature_cols = get_feature_columns(feature_rows)

    if not feature_cols:
        raise ValueError("feature column이 없습니다. MediaPipe 감지 여부와 features_cache.csv를 확인하세요.")

    X_train, y_train, _ = rows_to_xy(train_features, feature_cols)

    if len(X_train) == 0:
        raise ValueError("train feature가 비어 있습니다.")

    max_depth = None if args.max_depth == 0 else args.max_depth

    model = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("randomforestclassifier", RandomForestClassifier(
            n_estimators=args.n_estimators,
            max_depth=max_depth,
            class_weight="balanced",
            random_state=args.seed,
            n_jobs=-1,
        )),
    ])

    print(f"[INFO] feature count: {len(feature_cols)}")
    print("[INFO] training RandomForest...")
    model.fit(X_train, y_train)

    # 저장
    joblib.dump(
        {
            "model": model,
            "feature_cols": feature_cols,
            "label_to_id": LABEL_TO_ID,
            "id_to_label": ID_TO_LABEL,
            "camera": args.camera,
            "max_frames": args.max_frames,
            "frame_step": args.frame_step,
            "min_visibility": args.min_visibility,
        },
        out_dir / "randomforest_landmark_classifier.joblib",
    )

    write_text(out_dir / "feature_columns.json", json.dumps(feature_cols, ensure_ascii=False, indent=2))

    # split 저장
    write_csv_rows(out_dir / "train_rows.csv", train_rows, list(train_rows[0].keys()) if train_rows else ["empty"])
    if val_rows:
        write_csv_rows(out_dir / "val_rows.csv", val_rows, list(val_rows[0].keys()))
    if test_rows:
        write_csv_rows(out_dir / "test_rows.csv", test_rows, list(test_rows[0].keys()))

    metrics = []
    metrics.append(evaluate_split("train", model, train_features, feature_cols, out_dir))
    metrics.append(evaluate_split("val", model, val_features, feature_cols, out_dir))
    metrics.append(evaluate_split("test", model, test_features, feature_cols, out_dir))

    write_csv_rows(out_dir / "summary_metrics.csv", metrics, ["split", "count", "accuracy"])
    save_feature_importance(model, feature_cols, out_dir)

    config = {
        "metadata_csv": str(metadata_csv),
        "out_dir": str(out_dir),
        "camera": args.camera,
        "split_mode": split_mode,
        "train_count": len(train_rows),
        "val_count": len(val_rows),
        "test_count": len(test_rows),
        "feature_count": len(feature_cols),
        "max_frames": args.max_frames,
        "frame_step": args.frame_step,
        "min_visibility": args.min_visibility,
        "n_estimators": args.n_estimators,
        "max_depth": max_depth,
        "seed": args.seed,
    }
    write_text(out_dir / "run_config.json", json.dumps(config, ensure_ascii=False, indent=2))

    print()
    print("========== RESULT ==========")
    for m in metrics:
        acc = m["accuracy"]
        acc_text = "nan" if isinstance(acc, float) and np.isnan(acc) else f"{acc:.4f}"
        print(f"{m['split']:>5} | count={m['count']:>4} | accuracy={acc_text}")

    print()
    print(f"model:              {out_dir / 'randomforest_landmark_classifier.joblib'}")
    print(f"features cache:     {out_dir / 'features_cache.csv'}")
    print(f"summary metrics:    {out_dir / 'summary_metrics.csv'}")
    print(f"feature importance: {out_dir / 'feature_importance.csv'}")
    print()
    print("출력 파일:")
    print("- predictions_train.csv / predictions_val.csv / predictions_test.csv")
    print("- confusion_matrix_train.csv / confusion_matrix_val.csv / confusion_matrix_test.csv")
    print("- classification_report_train.txt / val.txt / test.txt")
    print()
    print("주의:")
    print("- split_mode이 stratified_random_fallback이면 아직 Subject가 부족해서 임시 random split을 쓴 것입니다.")
    print("- 성능 보고용으로는 17명 전체를 받은 뒤 subject split 결과를 쓰는 게 더 안전합니다.")


if __name__ == "__main__":
    main()
