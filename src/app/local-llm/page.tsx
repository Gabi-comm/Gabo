import { Suspense } from "react";
import { LocalLlmPage } from "@/components/localllm/LocalLlmPage";

export const metadata = { title: "Local LLM · Gabo" };

export default function Page() {
  // useSearchParams (?setup=1 from the Connect pop-up) needs a Suspense boundary.
  return <Suspense><LocalLlmPage /></Suspense>;
}
