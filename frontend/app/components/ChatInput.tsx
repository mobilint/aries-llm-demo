import { FormControl, Input, IconButton, Grid2 } from "@mui/material";
import { RefObject, useState } from "react";
import { LLMClient, LLMState } from "./type";
import { Stop, ArrowUpward } from "@mui/icons-material";
import { getLanguageTexts } from "../settings";

export default function ChatInput({
  client,
  disabled,
  ask,
  abort,
  inputRef,
}: {
  client: LLMClient,
  disabled: boolean,
  ask: (question: string) => void,
  abort: () => void,
  inputRef: RefObject<HTMLInputElement | null>,
}) {
  const [value, setValue] = useState<string>("");
  const texts = getLanguageTexts(client.language);
  const isBusy = [LLMState.ASKING, LLMState.ANSWERING].includes(client.state);
  const isInputLocked = disabled || [LLMState.CHANGING_MODEL, LLMState.APPLYING_LANGUAGE].includes(client.state);

  const handleClick = () => {
    if (disabled)
      return;

    if (client.state == LLMState.ASKING || client.state == LLMState.ANSWERING)
      abort();
    else if (client.state == LLMState.IDLE) {
      ask(value);
      setValue("");
    }
  }

  return (
    <FormControl
      fullWidth
      variant="standard"
      sx={{
        backgroundColor: "#FFFFFF !important",
        borderRadius: "20px",
        border: "1px solid #AAB8C2",
        padding: "25px",
        ":hover": {
          border: "1px solid #0072FF",
        },
        ":focus-within": {
          border: "1px solid #0072FF",
        },
      }}
    >
      <Grid2
        container
        direction="column"
        rowSpacing="10px"
      >
        <Input
          id="chat"
          ref={inputRef}
          disabled={isInputLocked}
          placeholder={texts.inputPlaceholder}
          value={value}
          onChange={e => setValue(e.target.value)}
          disableUnderline
          multiline
          maxRows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isBusy == false && !e.shiftKey) {
              if (isInputLocked)
                return;

              e.preventDefault();
              ask(value);
              setValue("");
            }
          }}

          sx={{
            padding: 0,
            alignSelf: "stretch",

            fontWeight: 400,
            fontSize: "20px",
            lineHeight: "170%",
            letterSpacing: "-0.3px",
            textAlign: "left",
            verticalAlign: "middle",
            backgroundColor: "transparent !important",
            
            color: "#000000",
            "& ::placeholder": {
              color: "#7A7B7E",
            },
            "& .Mui-disabled::placeholder": {
              color: "#7A7B7E",
              opacity: 1,
              WebkitTextFillColor: "#7A7B7E",
            },
          }}

          inputProps={{
            maxLength: 500,
          }}
        />
        <Grid2
          container
          justifyContent={"flex-end"}
          alignItems={"flex-end"}
        >
          <IconButton
            disabled={disabled || [LLMState.CHANGING_MODEL, LLMState.APPLYING_LANGUAGE].includes(client.state)}
            onClick={handleClick}
            sx={{
              width: "48px",
              height: "48px",
              alignSelf: "flex-end",
              backgroundColor: value != "" ? "#0072FF !important" : "#AAB8C2 !important",
              ":hover": {
                backgroundColor: "#0072FF !important",
              }
            }}
          >
          {[LLMState.ASKING, LLMState.ANSWERING].includes(client.state) ?
            <Stop sx={{ color: "white" }} /> :
            <ArrowUpward fontSize="large" sx={{ color: "white" }} />
          }
          </IconButton>
        </Grid2>
      </Grid2>
    </FormControl>
  );
}
