import { CircularProgress, Typography } from '@mui/material';
import Grid2 from "@mui/material/Grid2"
import { Fragment } from 'react';
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from 'rehype-highlight'
import { LLMClient } from './type';
import ModelIcon from './ModelIcon';

export default function Answer({
  client,
  answer,
  isAnswering,
  assumeThoughtUntilClosed = false,
}: {
  client: LLMClient,
  answer: string | null,
  isAnswering: boolean,
  assumeThoughtUntilClosed?: boolean,
}) {
  const hasThinkTag = !!answer && answer.includes("<think>") && answer.includes("</think>");
  const hasThoughtTag = !!answer && answer.includes("<thought>") && answer.includes("</thought>");
  const shouldSplitThought = hasThinkTag || hasThoughtTag;

  let thought: string | null = null;
  let real_answer: string | null = answer;

  if (shouldSplitThought && answer) {
    if (hasThinkTag) {
      const [beforeThink, afterThinkStart] = answer.split("<think>", 2);
      const [thoughtText, answerText] = afterThinkStart.split("</think>", 2);
      thought = thoughtText ?? null;
      real_answer = answerText ?? beforeThink ?? null;
    } else if (hasThoughtTag) {
      const [beforeThought, afterThoughtStart] = answer.split("<thought>", 2);
      const [thoughtText, answerText] = afterThoughtStart.split("</thought>", 2);
      thought = thoughtText ?? null;
      real_answer = answerText ?? beforeThought ?? null;
    }
  } else if (assumeThoughtUntilClosed && answer) {
    if (answer.includes("</thought>")) {
      const [thoughtText, answerText] = answer.split("</thought>", 2);
      thought = thoughtText || null;
      real_answer = answerText || null;
    } else {
      thought = answer;
      real_answer = null;
    }
  }

  const hasRenderableAnswer = thought != null || real_answer != null;

  return (
    <Grid2
      container
      columnSpacing="20px"
      direction="row"
      wrap="nowrap"
      alignItems={hasRenderableAnswer ? "flex-start" : "center"}
    >
      <Grid2
        container
        justifyContent="center"
        alignItems="center"
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "55px",
          backgroundColor: "#FFFFFF",
          border: "1px solid #AAB8C2",
        }}
      >
        <ModelIcon
          model_id={client.model_id}
          width="22px"
        />
      </Grid2>
      <Grid2
        container
        size="grow"
        alignItems={hasRenderableAnswer ? "flex-start" : "center"}
        sx={{
          fontFamily: "Pretendard",
          color: "#212631",
          fontSize: "20px",
          lineHeight: "170%",
          letterSpacing: "-0.3px",
          "& pre, & code": { fontFamily: "CascadiaCode" },
        }}
      >
      {hasRenderableAnswer ?
        <Fragment>
        {thought &&
          <Grid2
            container
            direction="column"
            alignItems="flex-start"
            sx={{
              color: "#898E94",
              "& > *:first-of-type": { marginTop: 0 },
              "& > *:last-of-type": { marginBottom: 0 },
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeHighlight, rehypeKatex]}
            >
              {thought + (isAnswering && !!answer == false ? " ..." : "")}
            </ReactMarkdown>
          </Grid2>
        }{real_answer &&
          <Grid2
            container
            direction="column"
            alignItems="flex-start"
            sx={{
              "& > *:first-of-type": { marginTop: 0 },
              "& > *:last-of-type": { marginBottom: 0 },
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeHighlight, rehypeKatex]}
            >
              {real_answer + (isAnswering ? " ..." : "")}
            </ReactMarkdown>
          </Grid2>
        }
        </Fragment> :
      isAnswering ?
        <Fragment>
          <CircularProgress size={38} />
        {client.tasksNum > 0 &&
          <Typography variant='caption'>
            Waiting for available device... ({client.tasksNum} {client.tasksNum == 1 ? "task" : "tasks"} waiting)
          </Typography>
        }{client.tasksNum <= 0 &&
          <Typography variant='caption'>
            Loading LLM model and processing inputs...
          </Typography>
        }
        </Fragment> :
        <Typography variant='caption' sx={{color: "#898E94"}}>[Aborted]</Typography>
      }
      </Grid2>
    </Grid2>
  );
}
