"use client";

import { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import { defaultLLMClient, LLMClient, LLMState } from "./components/type";
import Grid2 from "@mui/material/Grid2";
import Main from "./components/Main";
import Sidebar from "./components/Sidebar";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, example_questions_by_language, EXAMPLE_MODE_PAUSE_MS, INACTIVITY_TIMEOUT_MS, getLanguageTexts, loadPromptBundle } from "./settings";
import { useDebounce } from "react-simplikit";

const theme = createTheme({
  typography: {
    fontFamily: "Pretendard",
  },
});

export default function Home() {
  const socket = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [client, setClient] = useState<LLMClient>(defaultLLMClient);
  const [backendStatus, setBackendStatus] = useState({
    is_loading: true,
    is_ready: false,
    error: null as string | null,
  });
  const [isPromptConfigReady, setIsPromptConfigReady] = useState(false);
  const [promptStatusMessage, setPromptStatusMessage] = useState<string | null>(null);
  const [isExampleMode, setIsExampleMode] = useState<boolean>(true);
  const [isFirstExample, setIsFirstExample] = useState<boolean>(true);
  const [exampleIndex, setExampleIndex] = useState<number>(0);
  const texts = getLanguageTexts(client.language);

  const debouncedSetIsExampleMode = useDebounce(() => setIsExampleMode(true), INACTIVITY_TIMEOUT_MS);

  useEffect(() => {
    if (client.model_id == "")
      return;

    if (isPromptConfigReady == false)
      return;

    const examplesForLanguage = example_questions_by_language[client.language] ?? example_questions_by_language[DEFAULT_LANGUAGE] ?? {};
    const examplesForModel = examplesForLanguage[client.model_id] ?? [];
    let exampleTimer: ReturnType<typeof setTimeout> | null = null;

    async function askQuestion() {
      if (examplesForModel.length == 0)
        return;

      setExampleIndex((cur) => (cur + 1) % examplesForModel.length);
      reset();
      ask(examplesForModel[exampleIndex % examplesForModel.length]);
    }

    if (isExampleMode && client.state == LLMState.IDLE)
      if (isFirstExample) {
        askQuestion();
        setIsFirstExample(false);
      } else {
        exampleTimer = setTimeout(() => {
          askQuestion();
        }, EXAMPLE_MODE_PAUSE_MS);
      }
    else
      debouncedSetIsExampleMode();

    return () => {
      if (exampleTimer != null)
        clearTimeout(exampleTimer);
    };
  }, [isExampleMode, client.state, client.model_id, client.language, isPromptConfigReady]);

  function onConnect() {
    setIsConnected(true);
    setIsPromptConfigReady(false);
    setPromptStatusMessage(null);
    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(defaultLLMClient));
      newClient.model_id = client.model_id;
      newClient.language = client.language;
      return newClient;
    });
  }

  function onDisconnect() {
    setIsConnected(false);
    setIsPromptConfigReady(false);
    setPromptStatusMessage(null);
    setBackendStatus({
      is_loading: true,
      is_ready: false,
      error: null,
    });
  }

  function onLoadingState(loadingState: { is_loading: boolean, is_ready: boolean, error: string | null; }) {
    setBackendStatus(loadingState);
  }

  function onModels(models: string[]) {
    console.log("models");
    setModels(models);
  }

  function onPromptConfigSaved() {
    setIsPromptConfigReady(true);
    setPromptStatusMessage(null);
    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(client));
      if ([LLMState.CHANGING_MODEL, LLMState.APPLYING_LANGUAGE].includes(client.state))
        newClient.state = LLMState.IDLE;
      return newClient;
    });
  }

  function onPromptConfigState(promptState: { is_ready: boolean, message: string | null }) {
    setIsPromptConfigReady(promptState.is_ready);
    setPromptStatusMessage(promptState.message);
  }

  function onCurrentModel(model: string) {
    console.log("model", model);
    setExampleIndex(0);
    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(client));

      newClient.model_id = model;
      newClient.state = client.state == LLMState.ASKING ? LLMState.ASKING : LLMState.IDLE;

      return newClient;
    });
  }

  function onTasks(tasks: number) {
    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(client));
      newClient.tasksNum = tasks;
      return newClient;
    });
  }

  function onStart() {
    console.log("start");

    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(client));
      if (client.state != LLMState.APPLYING_LANGUAGE)
        newClient.state = LLMState.ANSWERING;
      return newClient;
    });
  }

  function onToken(token: string) {
    debouncedSetIsExampleMode();

    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(client));

      if (client.state != LLMState.ANSWERING)
        return newClient;

      if (client.dialog.length == 0)
        return newClient;

      let old = newClient.recentAnswer;
      newClient.recentAnswer = old == null ? token : old + token;
      return newClient;
    });
  }

  function onEnd(isAborted: boolean) {
    console.log("end", isAborted);

    setClient((client) => {
      let newClient = JSON.parse(JSON.stringify(client));

      if (client.state == LLMState.IDLE)
        return newClient;

      if (client.state == LLMState.APPLYING_LANGUAGE) {
        newClient.recentAnswer = null;
        newClient.tasksNum = 0;
        return newClient;
      }

      // Prevent aborted end comes after asking
      if (client.state != LLMState.ABORTING && isAborted == true)
        return newClient;

      newClient.state = LLMState.IDLE;

      if (client.dialog.length == 0)
        return newClient;

      let newDialog = [...client.dialog];
      newDialog[newDialog.length - 1].answer = client.recentAnswer + (isAborted ? " [ABORTED]" : "");
      newClient.dialog = newDialog;

      newClient.recentAnswer = null;

      return newClient;
    });
  }

  useEffect(() => {
    socket.current = io(`${window.location.protocol == 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:5000`);
    socket.current.on('connect', onConnect);
    socket.current.on('disconnect', onDisconnect);
    socket.current.on('loading_state', onLoadingState);
    socket.current.on('prompt_config_state', onPromptConfigState);
    socket.current.on('models', onModels);
    socket.current.on('current_model', onCurrentModel);
    socket.current.on('prompt_config_saved', onPromptConfigSaved);
    socket.current.on('tasks', onTasks);
    socket.current.on('start', onStart);
    socket.current.on('token', onToken);
    socket.current.on('end', onEnd);

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current.off('connect', onConnect);
        socket.current.off('disconnect', onDisconnect);
        socket.current.off('loading_state', onLoadingState);
        socket.current.off('prompt_config_state', onPromptConfigState);
        socket.current.off('models', onModels);
        socket.current.off('current_model', onCurrentModel);
        socket.current.off('prompt_config_saved', onPromptConfigSaved);
        socket.current.off('tasks', onTasks);
        socket.current.off('start', onStart);
        socket.current.off('token', onToken);
        socket.current.off('end', onEnd);
      }
    };
  }, []);

  useEffect(() => {
    async function syncPromptBundle() {
      if (socket.current == null || isConnected == false)
        return;

      setIsPromptConfigReady(false);
      const promptBundle = await loadPromptBundle(client.language);
      socket.current.emit("prompt_config", promptBundle);
    }

    syncPromptBundle();
  }, [isConnected, client.language]);

  function changeModel(model: string) {
    if (socket.current && client.state == LLMState.IDLE) {
      setClient((client) => {
        let newClient = JSON.parse(JSON.stringify(defaultLLMClient));
        newClient.state = LLMState.CHANGING_MODEL;
        newClient.model_id = model;
        newClient.language = client.language;
        return newClient;
      });

      socket.current.emit("model", model);
    }
  }

  function changeLanguage(language: string) {
    if (socket.current && client.state == LLMState.IDLE && language != client.language) {
      setClient((client) => {
        let newClient = JSON.parse(JSON.stringify(defaultLLMClient));
        newClient.state = LLMState.APPLYING_LANGUAGE;
        newClient.model_id = client.model_id;
        newClient.language = language;
        return newClient;
      });
    }
  }

  function enableAutoMode() {
    if (client.state != LLMState.IDLE)
      return;

    setExampleIndex(0);
    setIsFirstExample(true);
    setIsExampleMode(true);
  }

  function ask(new_question: string) {
    if (socket.current && new_question != "") {
      setClient((client) => {
        let newClient = JSON.parse(JSON.stringify(client));

        let newDialog = [...client.dialog];
        newDialog.push({ question: new_question, answer: null });
        newClient.dialog = newDialog;

        newClient.state = LLMState.ASKING;

        return newClient;
      });

      socket.current.emit("ask", new_question);
    }
  }

  function abort() {
    if (socket.current) {
      setClient((client) => {
        let newClient = JSON.parse(JSON.stringify(client));
        newClient.state = LLMState.ABORTING;
        return newClient;
      });

      socket.current.emit("abort");
    }
  }

  function reset() {
    if (socket.current) {
      console.log("reset");

      setClient((client) => {
        let newClient = JSON.parse(JSON.stringify(client));
        newClient.state = LLMState.IDLE;
        newClient.tasksNum = 0;
        newClient.dialog = [];
        newClient.recentAnswer = null;
        return newClient;
      });

      socket.current.emit("reset");
    }
  }

  const isReady = isConnected && backendStatus.is_ready && isPromptConfigReady;
  let statusMessage = texts.statusConnecting;

  if (backendStatus.error != null)
    statusMessage = backendStatus.error;
  else if (isConnected == false)
    statusMessage = texts.statusConnecting;
  else if (backendStatus.is_loading)
    statusMessage = texts.statusLoadingModels;
  else if (promptStatusMessage != null)
    statusMessage = promptStatusMessage;
  else if (isPromptConfigReady == false)
    statusMessage = texts.statusPreparingPromptBundle;

  return (
    <ThemeProvider theme={theme}>
      <Grid2
        container
        direction="row"
        justifyContent="center"
        alignItems="stretch"
        sx={{
          width: "100vw",
          height: "100vh",
        }}
      >
        <Sidebar
          models={models}
          client={client}
          isReady={isReady}
          statusMessage={statusMessage}
          reset={() => { setIsExampleMode(false); reset(); }}
          changeModel={changeModel}
        />
        <Grid2
          container
          size="grow"
          alignItems="stretch"
        >
          <Main
            client={client}
            languages={[...AVAILABLE_LANGUAGES]}
            isReady={isReady}
            isAutoMode={isExampleMode}
            statusMessage={statusMessage}
            enableAutoMode={enableAutoMode}
            changeLanguage={changeLanguage}
            ask={ask}
            abort={() => { setIsExampleMode(false); abort(); }}
          />
        </Grid2>
      </Grid2>
    </ThemeProvider>
  );
}
