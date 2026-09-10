import { Grid2, Typography } from "@mui/material";
import { Fragment, MutableRefObject, useEffect, useRef } from "react";
import Answer from "./Answer";
import { LLMClient, LLMState } from "./type";

const EXAONE_DEEP_MODELS = [
  "LGAI-EXAONE/EXAONE-Deep-2.4B",
  "LGAI-EXAONE/EXAONE-Deep-7.8B",
];

export default function Dialog({
  client,
  scrollGridRef,
}: {
  client: LLMClient,
  scrollGridRef: MutableRefObject<HTMLDivElement | null>,
}) {
  const bottomDivRef = useRef<HTMLDivElement | null>(null);
  const assumeThoughtUntilClosed = EXAONE_DEEP_MODELS.includes(client.model_id);

  const scrollToBottom = () => {
    bottomDivRef.current?.scrollIntoView({ behavior: "smooth", block: "end", inline: "end" })
  }

  useEffect(() => {
    if (scrollGridRef.current != null) {
      const diff = scrollGridRef.current.scrollHeight - scrollGridRef.current.offsetHeight - scrollGridRef.current.scrollTop;
      if (-100 < diff && diff < 100)
        scrollToBottom();
    }
  }, [client.recentAnswer])

  useEffect(() => {
    scrollToBottom();
  }, [client.dialog.length])

  return (
    <Fragment>
      {client.dialog.map((qna, index) =>
        <Fragment key={`${index}`}>
          <Grid2 container justifyContent="flex-end">
            <Typography
              sx={{
                backgroundColor: "#E9EFFB",
                padding: "25px",
                borderRadius: "23px",
                fontWeight: "regular",
                fontSize: "20px",
                lineHeight: "170%",
                letterSpacing: "-0.3px",
                color: "#212631",
                maxWidth: "500px",
              }}
            >
              {qna.question}
            </Typography>
          </Grid2>
          {!([LLMState.ASKING, LLMState.ANSWERING].includes(client.state) && index == client.dialog.length - 1) &&
            <Answer
              client={client}
              answer={qna.answer}
              isAnswering={false}
              assumeThoughtUntilClosed={assumeThoughtUntilClosed}
            />
          }
        </Fragment>
      )}
      {[LLMState.ASKING, LLMState.ANSWERING].includes(client.state) &&
        <Answer
          client={client}
          answer={client.recentAnswer}
          isAnswering={true}
          assumeThoughtUntilClosed={assumeThoughtUntilClosed}
        />
      }
      <div ref={bottomDivRef}></div>
    </Fragment>
  );
}
