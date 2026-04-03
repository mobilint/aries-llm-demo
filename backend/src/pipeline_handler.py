import logging
import torch
import re
import copy
import numpy as np

from time import time
from transformers.generation.streamers import TextIteratorStreamer
from transformers.cache_utils import Cache
from typing import Optional, Callable, List, Dict, Any
from threading import Thread, Event
from transformers import AutoTokenizer, AutoModelForCausalLM
from mblt_model_zoo.hf_transformers.utils.cache_utils import MobilintCache
from qbruntime import Accelerator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

MODEL_CONFIG_RESERVED_KEYS = {
    "disable_thinking",
}

class StopOnSignalTextIteratorStreamer(TextIteratorStreamer):
    def __init__(self, tokenizer, stop_event, **kwargs):
        super().__init__(tokenizer, **kwargs)
        self.stop_event = stop_event

    def put(self, value):
        if self.stop_event.is_set():
            self.end_of_stream = True
            raise StopIteration()
        super().put(value)


class LLMHandler:
    def __init__(
        self,
        dev_no: int = 0,
        models: Dict[str, Dict[str, str]] = {},
        default_model: Optional[str] = None,
    ):
        start = time()
        
        if len(models) == 0:
            raise ValueError("models must not be empty")

        self.model_configs = models
        self.default_model = default_model if default_model in models else next(iter(models))
        self.dev_no = dev_no
        
        self.is_available = True
        logging.info(f"[LLMHandler] Initializing...")
        
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.current_cache_session_id = None
        
        self._select_device()
        
        self._load_model()
        
        logging.info(f"[LLMHandler] Activating default model: {self.default_model}")
        self.change_model(self.default_model)

        if self.is_npu:
            logging.info(f"[LLMHandler] >>> Initialized with {len(self.models)} models <<<")
        logging.info(f"[LLMHandler] Initialization completed in {time() - start:.2f} sec")
        
        # self._debug_print_cache()

    def get_models(self) -> List[str]:
        return list(self.model_configs.keys())

    def get_session_model(self, session_id: str) -> str:
        return self.sessions[session_id]["current_model"]

    def set_session_model(self, session_id: str, model_id: str) -> bool:
        if model_id not in self.model_configs:
            logging.warning(f"[LLMHandler] Unknown model requested: {model_id}")
            return False

        self.sessions[session_id]["current_model"] = model_id
        return True

    def set_session_prompts(self, session_id: str, system_prompt: str, inter_prompt: str) -> None:
        session = self.sessions[session_id]
        session["system_prompt"] = system_prompt
        session["inter_prompt"] = inter_prompt
    
    def _select_device(self) -> None:
        gpu_available = torch.cuda.is_available()
        npu_available = False
        try:
            acc = Accelerator()
            del acc
            npu_available = True
        except:
            pass

        logging.info(f'[DEVICE] GPU: {"O" if gpu_available else "X"}, NPU: {"O" if npu_available else "X"}')
        
        if gpu_available == False and npu_available == False:
            raise SystemError("No AI Accelerator Found!")
        
        self.is_npu = npu_available
        self.device = "cpu" if self.is_npu else "cuda"
    
    def _get_model_id(self, model_id: str):
        if self.is_npu:
            return re.sub(r"^[^/]+", "mobilint", model_id)
        else:
            return model_id
    
    def _load_model(self) -> None:
        if self.is_npu == False:
            self.current_model_id = None
            self.tokenizer = None
            self.model = None
            return
        
        self.models = {}
        self.tokenizers = {}
        
        for model_id in self.model_configs:
            start = time()
            logging.info(f"[LLMHandler] Loading model: {model_id}")
            
            converted_model_id = self._get_model_id(model_id)
            self.current_model_id = model_id
            
            self.tokenizers[model_id] = AutoTokenizer.from_pretrained(
                converted_model_id,
                trust_remote_code=True,
            )
            
            self.models[model_id] = AutoModelForCausalLM.from_pretrained(
                converted_model_id,
                trust_remote_code=True,
                dev_no=self.dev_no,
                no_launch=True,
            ).to(self.device) # type: ignore
            
            self.tokenizer = self.tokenizers[self.current_model_id]
            self.model = self.models[model_id]
            
            logging.info(f"[LLMHandler] Load completed in {time() - start:.2f} sec")
        
        self.model.launch() # type: ignore

    def create_session(
        self,
        session_id: str,
        system_prompt: str = "",
        inter_prompt: str = "",
    ):
        logging.info(f"[LLMHandler] Creating new session context for: {session_id}")
        self.sessions[session_id] = {
            "current_model": self.default_model,
            "system_prompt": system_prompt,
            "inter_prompt": inter_prompt,
            "conversation": [],
            "past_key_values": None,
            "past_token_ids": np.array([[]]),
            "abort_flag": Event(),
            "stop_event": Event(),
        }

    def delete_session(self, session_id: str):
        session = self.sessions.pop(session_id, None)
        del session
    
    def change_model(self, new_model_id: str, during_llm: bool = False):
        if self.current_model_id == new_model_id:
            return
        
        if self.is_available == False and during_llm == False:
            logging.error(f"[LLMHandler] change_model is called when model is busy!")
            return
        
        self.is_available = False

        logging.info(f"[LLMHandler] Changing model to {new_model_id}")
        
        if self.is_npu:
            self.model.dispose() # type: ignore
        else:
            del self.tokenizer
            del self.model

        if self.is_npu:
            self.tokenizer = self.tokenizers[new_model_id]
            self.model = self.models[new_model_id]
            self.models[new_model_id].launch()
        else:
            self.tokenizer = AutoTokenizer.from_pretrained(
                new_model_id,
                trust_remote_code=True,
            )
            
            self.model = AutoModelForCausalLM.from_pretrained(
                new_model_id,
                trust_remote_code=True
            ).to(self.device) # type: ignore
            
        self.current_model_id = new_model_id
        self.current_cache_session_id = None
        self.is_available = True

    def reset_cache(self, session_id: str):
        logging.info(f"[LLMHandler] Reset cache for session: {session_id}")
        
        if self.current_cache_session_id == session_id:
            self.current_cache_session_id = None

        session = self.sessions[session_id]
        session["conversation"] = []
        if session["past_key_values"] is not None:
            del session["past_key_values"]
        session["past_key_values"] = None
        session["past_token_ids"] = np.array([[]])

    def abort_llm(self, session_id: str):
        if session_id in self.sessions:
            logging.info(f"[LLMHandler] Abort signal set for session: {session_id}")
            self.sessions[session_id]["abort_flag"].set()

    def _extract_generate_outputs(self, output: Any) -> tuple[Optional[torch.Tensor], Any]:
        if isinstance(output, torch.Tensor):
            return output, None

        sequences = getattr(output, "sequences", None)
        past_key_values = getattr(output, "past_key_values", None)
        return sequences, past_key_values
        
    def _debug_print_session(self):
        for session_id in self.sessions:
            logging.info("")
            
            logging.info(f"[DEBUG] Session: {session_id}")
            logging.info(f"[DEBUG] Conversation: {self.sessions[session_id]['conversation']}")
            past_key_values = self.sessions[session_id]['past_key_values']
            logging.info(f"[DEBUG] Past Key Values: {past_key_values.__class__.__name__}")
            if isinstance(past_key_values, Cache):
                logging.info(f"[DEBUG] Seq Length: {past_key_values.get_seq_length()}")
            if isinstance(past_key_values, MobilintCache):
                logging.info(f"[DEBUG] buffer: {len(past_key_values.buffer)} {len(past_key_values.buffer[0])}")
            logging.info(f"[DEBUG] Past Token IDs: \n{self.sessions[session_id]['past_token_ids']}")

            logging.info("")

    def generate_response(
        self, session_id: str, model_id: str, prompt: str, forEachGeneratedToken: Optional[Callable[[str], None]] = None
    ) -> tuple[bool, str]:
        if self.is_available == False:
            logging.error(f"[LLMHandler] generate_response is called when model is busy!")
            return False, ""

        if model_id not in self.model_configs:
            logging.error(f"[LLMHandler] Unsupported model: {model_id}")
            return True, ""
        
        self.is_available = False
        
        # self._debug_print_session()
        
        session = self.sessions[session_id]
        
        # Change model
        self.change_model(model_id, during_llm=True)
        
        model_config = self.model_configs[model_id]

        if session["past_key_values"] is None:
            session["conversation"] = (
                [{"role": "system", "content": session["system_prompt"]}]
                if session["system_prompt"] != ""
                else []
            )
            session["past_key_values"] = None
        
        past_key_values = session["past_key_values"]
        
        # Load cache
        if self.current_cache_session_id != session_id:
            self.current_cache_session_id = session_id
            if isinstance(past_key_values, MobilintCache):
                past_key_values.load_cache_memory()
        
        abort_flag = session["abort_flag"]
        stop_event = session["stop_event"]

        answer = ""
        is_aborted = False

        try:
            abort_flag.clear()
            stop_event.clear()

            user_prompt = session["conversation"] + [{"role": "user", "content": prompt}]
            if session["inter_prompt"] != "":
                user_prompt += [{"role": "system", "content": session["inter_prompt"]}]

            chat_template_kwargs = {
                "tokenize": False,
                "add_generation_prompt": True,
            }
            if model_config.get("disable_thinking", False):
                chat_template_kwargs["enable_thinking"] = False

            prompt_text = self.tokenizer.apply_chat_template(user_prompt, **chat_template_kwargs)
            inputs = self.tokenizer(prompt_text, return_tensors="pt").to(self.device)
            streamer = StopOnSignalTextIteratorStreamer(
                self.tokenizer,
                stop_event,
                skip_prompt=True,
                skip_special_tokens=True,
            )
            
            def generation_wrapper(**kwargs):
                try:
                    session = kwargs.pop("session")
                    kwargs.setdefault("pad_token_id", self.tokenizer.eos_token_id)
                    output = self.model.generate(**kwargs)
                    output_sequences, output_past_key_values = self._extract_generate_outputs(output)
                    if output_sequences is not None:
                        session["past_token_ids"] = output_sequences.detach().cpu().numpy()
                    if output_past_key_values is not None:
                        session["past_key_values"] = output_past_key_values
                except StopIteration:
                    pass
                except Exception as e:
                    logging.error(f"Exception in generation thread: {e}", exc_info=True)
                    streamer.end()

            model_generate_kwargs = {
                key: value
                for key, value in model_config.items()
                if key not in MODEL_CONFIG_RESERVED_KEYS
            }
            
            input_ids = inputs["input_ids"].detach().cpu().numpy()
            if past_key_values is not None:
                for i in range(len(session["past_token_ids"][0])):
                    if input_ids[0][i] != session["past_token_ids"][0][i]:
                        if past_key_values.get_seq_length() != i - 1:
                            logging.info(f"Set seq_length from {past_key_values.get_seq_length()} to {i - 1} due to token ids mismatch")
                        past_key_values.layers[0]._seen_tokens = i - 1
                        break

            generation_kwargs = dict(
                **inputs,
                **model_generate_kwargs,
                streamer=streamer,
                max_length=4096,
                use_cache=True,
                past_key_values=past_key_values,
                return_dict_in_generate=True,
                session=session,
            )
            thread = Thread(target=generation_wrapper, kwargs=generation_kwargs)
            thread.start()

            for new_token in streamer:
                if abort_flag.is_set():
                    stop_event.set()
                    break
                answer += new_token
                if forEachGeneratedToken:
                    forEachGeneratedToken(new_token)

            thread.join()
            is_aborted = abort_flag.is_set()
            
            # session is not deleted
            if session_id in self.sessions:
                session["conversation"] = user_prompt + [{"role": "assistant", "content": answer}]
                updated_past_key_values = session["past_key_values"]
                if isinstance(updated_past_key_values, MobilintCache):
                    updated_past_key_values.dump_cache_memory()
            
            # self._debug_print_session()

            return is_aborted, answer

        except Exception as e:
            logging.error(f"Error while generating response: {e}", exc_info=True)
            return True, answer

        finally:
            self.is_available = True
