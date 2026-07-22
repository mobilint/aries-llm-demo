import { Fragment } from "react";
import ModelButton from "./ModelButton";
import { LLMClient } from "./type";

export default function ModelGroup({
  client,
  group,
  models,
  currentModel,
  disabled,
  changeModel,
}: {
  client: LLMClient,
  group: string,
  models: string[],
  currentModel: string,
  disabled: boolean,
  changeModel: (model: string) => void,
}) {
  return (
    <Fragment>
    {models.map((model) =>
      <ModelButton
        key={model}
        client={client}
        model={model}
        currentModel={currentModel}
        disabled={disabled}
        changeModel={changeModel}
      />
    )}
    </Fragment>
  );
}
