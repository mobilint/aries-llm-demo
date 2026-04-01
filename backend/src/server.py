import os
import time
import logging
import json
from pathlib import Path
from typing import List, Dict
from flask import Flask, request
from flask_socketio import SocketIO, emit
from threading import Lock
from pipeline_handler import LLMHandler
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

MODEL_CATALOG_PATH = Path("src/model_catalog.json")


def parse_model_config(config: Dict) -> tuple[str | None, Dict[str, Dict[str, str]]]:
    if "models" in config:
        return config.get("default_model"), config["models"]

    return None, config


def load_models(config_path: Path) -> tuple[Dict[str, Dict[str, str]], str]:
    if not config_path.exists():
        raise FileNotFoundError(f"Model catalog not found: {config_path}")

    with config_path.open("r", encoding="UTF-8") as f:
        default_model, models = parse_model_config(json.load(f))

    if len(models) == 0:
        raise ValueError(f"Model catalog is empty: {config_path}")

    if default_model is not None and default_model not in models:
        raise ValueError(f"Default model {default_model} is not in {config_path}")

    if default_model is None:
        default_model = next(iter(models))

    return models, default_model


models, default_model = load_models(MODEL_CATALOG_PATH)

load_dotenv()
dev_no = os.getenv("DEV_NO", "0")
logging.info(f"dev no: {dev_no}")

tasks: List[Dict] = []
task_lock = Lock()
session_lock = Lock()
connected_sids = set()
handler: LLMHandler | None = None
handler_error: str | None = None
handler_loading = True
prompt_config_ready = set()


def emit_loading_state(to: str | None = None):
    payload = {
        "is_loading": handler_loading,
        "is_ready": handler is not None and handler_loading == False and handler_error is None,
        "error": handler_error,
    }

    if to is None:
        socketio.emit("loading_state", payload)
    else:
        socketio.emit("loading_state", payload, to=to)


def emit_prompt_config_state(sid: str, is_ready: bool, message: str | None = None):
    socketio.emit("prompt_config_state", {
        "is_ready": is_ready,
        "message": message,
    }, to=sid)


def ensure_session_initialized(target_handler: LLMHandler, sid: str):
    if sid not in target_handler.sessions:
        target_handler.create_session(sid)


def emit_session_state(sid: str):
    global handler
    target_handler = handler

    if target_handler is None:
        current_model = default_model
        available_models = list(models.keys())
    else:
        ensure_session_initialized(target_handler, sid)
        current_model = target_handler.get_session_model(sid)
        available_models = target_handler.get_models()

    socketio.emit("models", available_models, to=sid)
    socketio.emit("current_model", current_model, to=sid)


def initialize_handler():
    global handler, handler_error, handler_loading

    try:
        loaded_handler = LLMHandler(
            dev_no=int(dev_no),
            models=models,
            default_model=default_model,
        )
        handler = loaded_handler
        handler_error = None
    except Exception as e:
        logging.error("Handler initialization failed", exc_info=True)
        handler_error = str(e)
    finally:
        handler_loading = False

    emit_loading_state()

    if handler is not None:
        with session_lock:
            sids = list(connected_sids)

        for sid in sids:
            ensure_session_initialized(handler, sid)
            emit_session_state(sid)


def task_worker():
    global tasks, task_lock, handler
    
    logging.info("Task worker thread started.")
    
    while True:
        task = None
        with task_lock:
            if handler is not None and handler.is_available and tasks:
                task = tasks.pop(0)
                
        if task:
            sid = task["sid"]
            task_type = task["type"]
            task_value = task["value"]
            
            logging.info(f"[{sid}] Processing task type: {task_type}")
            
            with task_lock:
                socketio.emit("tasks", 0, to=sid)
                sids = [task["sid"] for task in tasks]
                for session_id in sids:
                    first_index = next(index for index, task in enumerate(tasks) if task["sid"] == session_id)
                    socketio.emit("tasks", first_index + 1, to=session_id)
            
            if task_type == "LLM":
                run_llm_generation(sid, **task_value)
                
        else:
            time.sleep(0.1)


def run_llm_generation(sid: str, question: str, model_name: str):
    global handler

    if handler is None:
        socketio.emit("error", {"message": "Models are still loading."}, to=sid)
        socketio.emit("end", True, to=sid)
        return
    
    logging.info(f"[{sid}] Model: {model_name}, LLM executing...")
    
    try:
        is_aborted = True
        
        socketio.emit("start", to=sid)

        def forEachGeneratedToken(new_token: str):
            socketio.emit("token", new_token, to=sid)
            socketio.sleep(0)

        is_aborted, _ = handler.generate_response(sid, model_name, question, forEachGeneratedToken)

    finally:
        socketio.sleep(0)
        socketio.emit("end", is_aborted, to=sid)
        logging.info(f"[{sid}] LLM executed")


@socketio.on("connect")
def connect():
    global handler
    sid = request.sid # type: ignore
    
    logging.info(f"[{sid}] Session connected")

    with session_lock:
        connected_sids.add(sid)

    emit_loading_state(to=sid)
    emit_prompt_config_state(sid, False, "Prompt bundle is not synced yet.")
    emit_session_state(sid)

@socketio.on("disconnect")
def disconnect(reason):
    global tasks, task_lock, handler
    sid = request.sid # type: ignore
    
    logging.info(f"[{sid}] Session disconnected, reason: {reason}")
    
    with session_lock:
        connected_sids.discard(sid)
    prompt_config_ready.discard(sid)

    if handler is not None and sid in handler.sessions:
        handler.abort_llm(sid)
    
    with task_lock:
        tasks = [task for task in tasks if task["sid"] != sid]
        sids = [task["sid"] for task in tasks]
        sids = list(set(sids))
        for session_id in sids:
            first_index = next(index for index, task in enumerate(tasks) if task["sid"] == session_id)
            socketio.emit("tasks", first_index + 1, to=session_id)

    if handler is not None and sid in handler.sessions:
        handler.delete_session(sid)


@socketio.on("model")
def change_model(model_name):
    global tasks, task_lock, handler
    sid = request.sid # type: ignore
    if handler is None:
        emit("error", {"message": "Models are still loading."}, to=sid)
        return

    if not handler.set_session_model(sid, model_name):
        emit("error", {"message": f"Unknown model: {model_name}."}, to=sid)
        return
    
    handler.reset_cache(sid)
    handler.change_model(model_name)
    
    emit("current_model", handler.get_session_model(sid), to=sid)


@socketio.on("prompt_config")
def update_prompt_config(prompt_config: Dict[str, str]):
    global handler
    sid = request.sid # type: ignore

    if handler is None:
        emit("error", {"message": "Models are still loading."}, to=sid)
        return

    if not isinstance(prompt_config, dict):
        emit("error", {"message": "Prompt config is missing."}, to=sid)
        return

    system_prompt = prompt_config.get("system_prompt", "")
    inter_prompt = prompt_config.get("inter_prompt", "")

    emit_prompt_config_state(sid, False, "Applying prompt bundle...")
    prompt_config_ready.discard(sid)
    handler.abort_llm(sid)
    handler.set_session_prompts(sid, system_prompt, inter_prompt)
    handler.reset_cache(sid)
    prompt_config_ready.add(sid)
    emit_prompt_config_state(sid, True, None)
    emit("prompt_config_saved", to=sid)


@socketio.on("ask")
def ask(question: str):
    sid = request.sid # type: ignore
    if handler is None:
        emit("error", {"message": "Models are still loading."}, to=sid)
        return

    if sid not in prompt_config_ready:
        emit("error", {"message": "Prompt bundle is not ready yet."}, to=sid)
        return

    current_model = handler.get_session_model(sid)

    if not question or not current_model:
        emit("error", {"message": "Question or model is missing."}, to=sid)
        return

    if current_model not in handler.get_models():
        emit("error", {"message": f"Unknown model: {current_model}."}, to=sid)
        return

    logging.info(f"Session: {sid}, LLM task enqueued for model {current_model}.")

    with task_lock:
        tasks.append({"sid": sid, "type": "LLM", "value": {"question": question, "model_name": current_model}})
        socketio.emit("tasks", len(tasks), to=sid)


@socketio.on("abort")
def abort():
    global tasks, task_lock, handler
    sid = request.sid # type: ignore
    
    logging.info(f"[{sid}] Abort signal received.")
    
    if handler is not None:
        handler.abort_llm(sid)
    
    with task_lock:
        tasks = [task for task in tasks if task["sid"] != sid]
        sids = [task["sid"] for task in tasks]
        sids = list(set(sids))
        for session_id in sids:
            first_index = next(index for index, task in enumerate(tasks) if task["sid"] == session_id)
            socketio.emit("tasks", first_index + 1, to=session_id)


@socketio.on("reset")
def reset():
    global tasks, task_lock, handler
    sid = request.sid # type: ignore

    if handler is None:
        emit("error", {"message": "Models are still loading."}, to=sid)
        return

    handler.reset_cache(sid)
    socketio.emit("reset_done", to=sid)


socketio.start_background_task(target=task_worker)
socketio.start_background_task(target=initialize_handler)
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
