import { Fragment } from "react";
import ModelGroup from "./ModelGroup";
import { LLMClient } from "./type";

export default function ModelList({
  client,
  models,
  currentModel,
  disabled,
  changeModel,
}: {
  client: LLMClient,
  models: string[],
  currentModel: string,
  disabled: boolean,
  changeModel: (model: string) => void,
}) {
  const groups = models.map((model) => model.split("/")[0])
                      .filter((elem, index, arr) => arr.indexOf(elem) == index);

  return (
    <Fragment>
    {groups.map((group, index) => (
      <ModelGroup
        key={group}
        client={client}
        group={group}
        models={models.filter((model) => model.startsWith(group))}
        currentModel={currentModel}
        disabled={disabled}
        changeModel={changeModel}
      />
    ))}
    </Fragment>
  );
}
