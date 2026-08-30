import type { CodingWorker } from "./types";
import { AdkGeminiWorker } from "../adk/gemini-agent";

/** Legacy alias — delegates to ADK Gemini worker path. */
export class GeminiWorker extends AdkGeminiWorker implements CodingWorker {}

export function isGeminiLiveEnabled(): boolean {
  return Boolean(process.env["GEMINI_API_KEY"]);
}
