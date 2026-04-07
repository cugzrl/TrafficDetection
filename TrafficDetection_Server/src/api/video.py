import json
import uuid
from os.path import join
from pathlib import Path

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import StreamingResponse

from src.service.detect_infer import run_detection
from src.service.tracker import Fasttracker
from src.service.tracker_adapter import (
    format_det_for_tracker,
    format_tracker_for_frontend,
)
from src.template.response import response_success
from src.utils.video_utils import VideoReader

router = APIRouter()

@router.get("/sse/second/{video_id}")
async def video_infer_sse(request: Request, video_id: str):
    """逐请求创建tracker 并将带轨迹ID的结果按秒推送给前端"""
    base_dir = request.app.state.base_dir
    model = request.app.state.detect_model
    config = request.app.state.config

    upload_dir = join(config.app.static, config.detect.upload_dir)
    sample_rate = config.detect.sample_rate

    video_path = join(base_dir, upload_dir, video_id)
    reader = VideoReader(video_path, sample_rate=sample_rate)

    image_sizes = config.detect.image_sizes
    conf_thresh = config.detect.conf_thresh
    class_names = config.detect.class_names

    fps = max(1, reader.fps // sample_rate)
    tracker = Fasttracker(args=None, config=config.track, frame_rate=fps)

    async def event_generator():
        """按抽帧结果逐帧推理 再整合为一秒一批的SSE数据"""
        try:
            second_result = []
            for frame, idx in reader:
                if frame is None:
                    break

                # 保持检测逻辑不变，在接口中新增tracker
                detect_result = run_detection(
                    model,
                    frame,
                    image_sizes,
                    conf_thresh,
                    class_names,
                )
                orig_h, orig_w = frame.shape[:2]
                tracker_input = format_det_for_tracker(detect_result)
                tracked_stracks = tracker.update(
                    tracker_input,
                    img_info=[orig_h, orig_w],
                    img_size=(orig_h, orig_w),
                )
                frontend_result = format_tracker_for_frontend(
                    tracked_stracks,
                    class_names,
                )
                second_result.append({
                    "idx": idx,
                    "second": round(idx / fps, 6),
                    **frontend_result,
                })

                # 一秒一推送
                if len(second_result) >= fps:
                    yield f"data: {json.dumps(second_result, ensure_ascii=False)}\n\n"
                    second_result.clear()

                if await request.is_disconnected():
                    break

            if len(second_result) > 0:
                yield f"data: {json.dumps(second_result, ensure_ascii=False)}\n\n"

        finally:
            reader.release()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/api/upload/video")
async def upload_video(request: Request, file: UploadFile = File(...)):
    video_id = f"{uuid.uuid4().hex}.mp4"
    base_dir = request.app.state.base_dir
    config = request.app.state.config

    file_path = join(base_dir, config.app.static, config.detect.upload_dir, video_id)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return response_success(data=video_id)


@router.get("/api/list/video")
async def list_videos(request: Request):
    base_dir = request.app.state.base_dir
    config = request.app.state.config

    upload_dir = join(base_dir, config.app.static, config.detect.upload_dir)
    files = Path(upload_dir).glob("*.mp4")
    names = [f.name for f in files]
    return response_success(data=names)
