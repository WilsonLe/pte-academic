// Read/write compatibility for transcripts saved before transcription was removed.
// This module contains no speech recognition or model runtime.
import { z } from "zod";
export const transcriptionSchema = z.object({
  text: z.string().max(10_000),
  seconds: z.number().positive().max(125),
  engine: z.string().max(100),
  model: z.string().max(100),
  revision: z.string().max(100),
});
export type Transcription = z.infer<typeof transcriptionSchema>;
