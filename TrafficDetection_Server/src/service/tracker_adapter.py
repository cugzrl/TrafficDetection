import numpy as np


def format_det_for_tracker(detect_result):
    """将RT-DETR检测结果转换为FastTracker需要的Nx7矩阵"""
    labels = detect_result.get("labels") or []
    boxes = detect_result.get("boxes") or []
    scores = detect_result.get("scores") or []

    rows = []
    count = max(len(labels), len(boxes), len(scores))
    for index in range(count):
        box = boxes[index] if index < len(boxes) else None
        if not isinstance(box, (list, tuple)) or len(box) < 4:
            continue

        score = float(scores[index]) if index < len(scores) else 0.0
        class_id = int(labels[index]) if index < len(labels) else -1
        x1, y1, x2, y2 = [float(value) for value in box[:4]]
        # RT-DETR只有单一置信度，这里将最终分数放在cls_score，
        # obj_score固定为1.0，避免FastTracker内部相乘后把分数平方
        rows.append([x1, y1, x2, y2, 1.0, score, class_id])

    if not rows:
        return np.empty((0, 7), dtype=np.float64)

    return np.asarray(rows, dtype=np.float64)


def format_tracker_for_frontend(stracks, class_names):
    """将轨迹转换为前端所需的字段"""
    payload = {
        "track_ids": [],
        "labels": [],
        "boxes": [],
        "scores": [],
        "names": [],
    }

    for track in stracks or []:
        tlwh = np.asarray(track.tlwh, dtype=np.float64)
        if tlwh.size < 4:
            continue

        label = int(getattr(track, "classid", -1))
        score = round(float(getattr(track, "score", 0.0)), 4)
        x, y, w, h = [round(float(value), 2) for value in tlwh[:4]]

        if 0 <= label < len(class_names):
            name = class_names[label]
        else:
            name = str(label)

        payload["track_ids"].append(int(getattr(track, "track_id", -1)))
        payload["labels"].append(label)
        payload["boxes"].append([x, y, round(x + w, 2), round(y + h, 2)])
        payload["scores"].append(score)
        payload["names"].append(name)

    return payload
