import { Button, Grid2 } from "@mui/material";
import ModelIcon from "./ModelIcon";
import { LLMClient, LLMState } from "./type";

export default function ModelButton({
  client,
  model,
  currentModel,
  disabled,
  changeModel,
}: {
  client: LLMClient,
  model: string,
  currentModel: string,
  disabled: boolean,
  changeModel: (model: string) => void,
}) {
  return (
    <Button
      fullWidth
      disableRipple
      disabled={disabled || client.state != LLMState.IDLE}
      onClick={(e) => changeModel(model)}
      sx={{
        padding: "10px 14px",
        textTransform: "none",
        justifyContent: "flex-start",
        alignItems: "center",
        fontWeight: 400,
        fontSize: "17px",
        lineHeight: "130%",
        letterSpacing: "-0.3px",
        color: disabled ? "#FFFFFF55 !important" : "#FFFFFF !important",
        backgroundColor: currentModel == model ? "#0072FF" : "transparent",
        borderRadius: "10px",
        ":hover": {
          backgroundColor: currentModel == model ? "#0072FF" : "#003E8A",
        },
        "&.Mui-disabled": {
          color: "#FFFFFF55 !important",
          backgroundColor: currentModel == model ? "#4A6D99" : "transparent",
        },
      }}
    >
      <Grid2
        style={{
          padding: "5px",
          width: "30px",
          height: "30px",
          backgroundColor: disabled ? "#FFFFFF66" : "#FFFFFF",
          borderRadius: "5px",
          marginRight: "12px",
        }}
      >
        <ModelIcon
          model_id={model}
          width="20px"
        />
      </Grid2>
      <Grid2
        size="grow"
        style={{
          textAlign: "left",
        }}
      >
        {model.split("/")[1]}
      </Grid2>
    </Button>
  );
}
