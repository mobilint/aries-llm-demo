import { Grid2, Typography } from "@mui/material";
import ContactUsButton from "./ContactUsButton";
import MobilintIncPanel from "./MobilintIncPanel";
import { LLMClient, LLMState } from "./type";
import ModelList from "./ModelList";
import { getLanguageTexts } from "../settings";

export default function Sidebar({
  models,
  client,
  isReady,
  statusMessage,
  reset,
  changeModel,
}: {
  models: string[],
  client: LLMClient,
  isReady: boolean,
  statusMessage: string,
  reset: () => void,
  changeModel: (model: string) => void,
}){
  const texts = getLanguageTexts(client.language);

  return (
    <Grid2
      container
      direction="column"
      justifyContent="space-between"
      alignItems="stretch"
      sx={{
        width: "354px",
        padding: "34px 20px 26px 20px",
        backgroundColor: "#002D66",
      }}
    >
      <MobilintIncPanel
        onReset={reset}
        resetDisabled={
          isReady == false ||
          client.dialog.length == 0 ||
          [LLMState.ASKING, LLMState.ANSWERING, LLMState.CHANGING_MODEL].includes(client.state)
        }
      />
      <Typography
        sx={{
          marginTop: "40px",
          marginLeft: "14px",
          marginBottom: "20px",
          fontWeight: 400,
          fontSize: "17px",
          lineHeight: "130%",
          letterSpacing: "-0.3px",
          textAlign: "left",
          verticalAlign: "middle",
          color: "#FFFFFF",
        }}
      >
        {texts.sidebarTitle}
      </Typography>
      {isReady == false &&
        <Typography
          sx={{
            marginLeft: "14px",
            marginBottom: "16px",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "150%",
            letterSpacing: "-0.2px",
            color: "#FFFFFFB2",
          }}
        >
          {statusMessage}
        </Typography>
      }
      <Grid2
        container
        size="grow"
        direction="column"
        wrap="nowrap"
        justifyContent="stretch"
        alignItems="stretch"
        rowSpacing={"8px"}
        sx={{
          overflowY: "auto",
        }}
      >
        <ModelList
          client={client}
          models={models}
          currentModel={client.model_id}
          disabled={isReady == false}
          changeModel={changeModel}
        />
      </Grid2>
      <ContactUsButton />
      <Typography
        sx={{
          marginTop: "29px",
          fontWeight: "400",
          fontSize: "16px",
          lineHeight: "150%",
          letterSpacing: "-0.2px",
          textAlign: "center",
          verticalAlign: "top",
          color: "#FFFFFF88",
        }}
      >
        © 2026 Mobilint, Inc. All rights reserved
      </Typography>
    </Grid2>
  );
}
