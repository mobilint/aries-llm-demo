# ARIES LLM Demo

Offline LLM chat demo for ARIES / Mobilint hardware.

The current implementation uses:

- `Flask-SocketIO` backend for model execution
- `Next.js` frontend for chat UI
- frontend-owned prompt bundles and locale resources
- backend-owned model catalog with optional per-model generation overrides

## Repository Structure

- [backend/src/server.py](./backend/src/server.py): websocket server and session orchestration
- [backend/src/pipeline_handler.py](./backend/src/pipeline_handler.py): model loading and generation loop
- [backend/src/model_catalog.json](./backend/src/model_catalog.json): model list, default model, and optional per-model `generate()` kwargs overrides
- [frontend/public/prompt-bundles](./frontend/public/prompt-bundles): system / inter prompt text by locale
- [frontend/app/i18n](./frontend/app/i18n): UI text resources by locale
- [frontend/app/questions/locales](./frontend/app/questions/locales): example question resources by locale

## Supported Locales

Frontend locale resources are prepared for:

- `en`
- `ko`
- `ja`
- `zh`

Prompt bundles are also loaded from the frontend by locale, then sent to the backend session through the `prompt_config` socket event.

When the language changes:

1. frontend enters an explicit language-application state
2. backend clears in-flight prompt application state for the session
3. backend applies the selected prompt bundle to the session
4. frontend waits for `prompt_config_saved`
5. automatic example prompting resumes only after prompt sync finishes

## Installation & Usage (Windows)

Windows does not support the Docker PCIe/NPU binding flow used on Linux, so run the backend and frontend directly.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

### Backend

```powershell
cd backend
uv sync
uv run src/server.py
```

Open `http://localhost:3000`.

## Installation & Usage (Linux)

The helper script installs dependencies, prepares the Docker network, updates the repository, and downloads required assets.

```bash
./update.sh
```

## Manual Linux Setup

### Install Docker

Follow the official Docker Engine instructions:

- <https://docs.docker.com/engine/install/ubuntu/>
- <https://docs.docker.com/engine/install/linux-postinstall/>

### Create Docker Network

```bash
docker network create mblt_int
```

### Build

```bash
docker compose build
```

### Run (NPU mode)

```bash
docker compose up
```

### Run (GPU mode)

Install NVIDIA Container Toolkit first:

- <https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html>

Then run:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up
```

`docker-compose.gpu.yml` sets `gpus: all`.

### Run in Background

```bash
docker compose up -d
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

### Stop

```bash
docker compose down
```

## Runtime Notes

### Hardware requirement

This demo is designed for hardware-accelerated inference only.
CPU-only execution is not supported.

### Backend model switching

The backend keeps a session-level current model and switches models immediately when the frontend requests a model change.
There is no separate production mode anymore.

### Prompt ownership

Prompt text is not stored on the backend as the active source of truth.

- frontend loads prompt bundle files from [frontend/public/prompt-bundles](./frontend/public/prompt-bundles)
- frontend sends `system_prompt` / `inter_prompt` to the backend session
- backend uses those session prompts during generation

The backend also rejects `ask` requests until the session prompt bundle has been synchronized.

### Frontend/backend state flow

Frontend model state includes:

- `IDLE`
- `ASKING`
- `ANSWERING`
- `CHANGING_MODEL`
- `ABORTING`
- `APPLYING_LANGUAGE`

Backend readiness is exposed through:

- `loading_state`: model loading readiness
- `prompt_config_state`: prompt bundle synchronization readiness

The frontend disables question submission while model switching, prompt synchronization, or generation is in progress. This avoids races where a new question immediately cancels an earlier request.

## Configuration

### Change the list of models

Edit [backend/src/model_catalog.json](./backend/src/model_catalog.json).

`default_model` chooses the initial model.
The `models` object order is also the order exposed to clients.

Example:

```json
{
  "default_model": "Qwen/Qwen3-4B",
  "models": {
    "Qwen/Qwen3-4B": {
      "disable_thinking": true
    },
    "meta-llama/Llama-3.2-3B-Instruct": {}
  }
}
```

### Add per-model generation overrides

Each model entry in [backend/src/model_catalog.json](./backend/src/model_catalog.json) may include extra keyword arguments that are forwarded directly to `model.generate(...)`.

Current reserved keys:

- `disable_thinking`: used only for chat template construction, not passed to `generate()`

Everything else in a model entry is treated as a `generate()` override.

Example:

```json
{
  "Qwen/Qwen3-4B": {
    "disable_thinking": true,
    "temperature": 0.7,
    "top_p": 0.9
  }
}
```

If a model entry is `{}`, the model's own default generation config is used.

### Change prompt text

Edit the locale files under [frontend/public/prompt-bundles](./frontend/public/prompt-bundles):

- `system.txt`
- `inter.txt`

The frontend reloads and sends the selected locale's prompt bundle to the backend session.

### Change UI text

Edit the locale JSON files under [frontend/app/i18n](./frontend/app/i18n).

### Change example questions

Edit the locale JSON files under [frontend/app/questions/locales](./frontend/app/questions/locales).

## Development Checks

Frontend production build:

```powershell
cd frontend
npm run build
```

Backend syntax check:

```powershell
python -m py_compile backend/src/server.py backend/src/pipeline_handler.py
```

## Desktop Shortcut

If you use the provided desktop shortcut, this repository is expected at `~/aries-llm-demo`.

If needed, update the path in:

- [llm-demo.desktop](./llm-demo.desktop)
- [run.sh](./run.sh)

Then install the desktop entry:

```bash
mkdir -p "$HOME/.local/share/applications"
cp llm-demo.desktop "$HOME/.local/share/applications/"
```
