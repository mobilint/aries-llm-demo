import { Button, CircularProgress, Grid2, Typography } from "@mui/material";
import ChatInput from "./ChatInput";
import { useEffect, useRef } from "react";
import { LLMClient, LLMState } from "./type";
import Dialog from "./Dialog";
import Greetings from "./Greetings";
import DemoTitle from "./DemoTitle";
import LanguageSwitcher from "./LanguageSwitcher";
import { formatLoadingModelDescription, getLanguageTexts } from "../settings";

export default function Main({
  client,
  languages,
  isReady,
  isAutoMode,
  statusMessage,
  enableAutoMode,
  changeLanguage,
  ask,
  abort,
}: {
  client: LLMClient,
  languages: string[],
  isReady: boolean,
  isAutoMode: boolean,
  statusMessage: string,
  enableAutoMode: () => void,
  changeLanguage: (language: string) => void,
  ask: (question: string) => void,
  abort: () => void,
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollGridRef = useRef<HTMLDivElement | null>(null);
  const texts = getLanguageTexts(client.language);
  const isChangingModel = client.state == LLMState.CHANGING_MODEL;
  const isApplyingLanguage = client.state == LLMState.APPLYING_LANGUAGE;
  const isPreparingModels = isReady == false;
  const showLoadingOverlay = isPreparingModels || isChangingModel || isApplyingLanguage;
  const loadingTitle = isPreparingModels || isApplyingLanguage ? texts.loadingPreparingModels : texts.loadingSwitchingModel;
  const loadingDescription = isPreparingModels
    ? statusMessage
    : isApplyingLanguage
      ? statusMessage
      : formatLoadingModelDescription(client.language, client.model_id.split("/")[1] ?? "selected model");
  
  useEffect(() => {
    if (client.state == LLMState.IDLE)
      inputRef.current?.focus();
  }, [client.state]);
  
  return (
    <Grid2
      container
      direction="column"
      alignItems="center"
      size="grow"
      sx={{
        backgroundColor: "#F8F9FD",
        padding: "43px 53px",
      }}
    >
      <Grid2
        container
        justifyContent="space-between"
        alignItems="center"
        sx={{
          width: "100%",
        }}
      >
        <DemoTitle color="#212631" />
        <Grid2 container alignItems="center" columnSpacing="12px" sx={{ width: "fit-content" }}>
          <Button
            disableElevation
            disabled={isReady == false || [LLMState.ASKING, LLMState.ANSWERING, LLMState.CHANGING_MODEL, LLMState.APPLYING_LANGUAGE].includes(client.state)}
            onClick={enableAutoMode}
            sx={{
              minWidth: "auto",
              height: "46px",
              padding: "0 18px",
              borderRadius: "999px",
              textTransform: "none",
              fontWeight: 700,
              fontSize: "15px",
              color: isAutoMode ? "#FFFFFF" : "#0B4EA2",
              backgroundColor: isAutoMode ? "#0B4EA2" : "#FFFFFF",
              border: isAutoMode ? "1px solid transparent" : "1px solid #D7DFEF",
              boxShadow: "0 10px 30px rgba(13, 35, 67, 0.08)",
              "&:hover": {
                backgroundColor: isAutoMode ? "#0B4EA2" : "#F4F8FD",
              },
              "&.Mui-disabled": {
                color: isAutoMode ? "#FFFFFF" : "#8EA1B8",
                backgroundColor: isAutoMode ? "#7C96B8" : "#F5F7FA",
                borderColor: "#E2E8F0",
              },
            }}
          >
            {texts.autoLabel}
          </Button>
          <LanguageSwitcher
            languages={languages}
            currentLanguage={client.language}
            disabled={isReady == false || [LLMState.ASKING, LLMState.ANSWERING, LLMState.CHANGING_MODEL, LLMState.APPLYING_LANGUAGE].includes(client.state)}
            changeLanguage={changeLanguage}
          />
        </Grid2>
      </Grid2>
      <Grid2
        container
        size="grow"
        direction="column"
        wrap="nowrap"
        justifyContent={client.dialog.length == 0 ? "center" : undefined}
        alignItems="stretch"
        rowSpacing="44px"
        sx={{
          width: "100%",
          maxWidth: "880px",
          overflowY: "scroll",
          margin: "50px 0px",
          position: "relative",
        }}
        ref={scrollGridRef}
      >
        {client.dialog.length == 0 ?
          <Greetings
            model_id={client.model_id}
            language={client.language}
          /> :
          <Dialog
            client={client}
            scrollGridRef={scrollGridRef}
          />
        }
        {showLoadingOverlay &&
          <Grid2
            container
            direction="column"
            alignItems="center"
            justifyContent="center"
            rowSpacing="18px"
            sx={{
              position: "absolute",
              inset: 0,
              backgroundColor: isPreparingModels ? "#F8F9FD" : "rgba(248, 249, 253, 0.82)",
              backdropFilter: isPreparingModels ? "none" : "blur(8px)",
              borderRadius: "24px",
              zIndex: 2,
              padding: "32px",
            }}
          >
            <CircularProgress
              size={40}
              thickness={4}
              sx={{
                color: "#0B4EA2",
              }}
            />
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "34px",
                lineHeight: "130%",
                letterSpacing: "-0.3px",
                color: "#212631",
                textAlign: "center",
              }}
            >
              {loadingTitle}
            </Typography>
            <Typography
              sx={{
                maxWidth: "620px",
                fontWeight: 400,
                fontSize: "20px",
                lineHeight: "160%",
                letterSpacing: "-0.3px",
                color: "#4B5563",
                textAlign: "center",
              }}
            >
              {loadingDescription}
            </Typography>
          </Grid2>
        }
      </Grid2>
      <Grid2
        sx={{
          width: "100%",
          maxWidth: "880px",
          paddingBottom: "39px",
        }}
      >
        <ChatInput
          client={client}
          disabled={isReady == false}
          inputRef={inputRef}
          ask={ask}
          abort={abort}
        />
      </Grid2>
    </Grid2>
  );
}
