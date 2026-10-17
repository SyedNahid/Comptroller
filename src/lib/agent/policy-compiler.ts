/**
 * Natural-language → deterministic policy compiler.
 *
 * An operator describes an agent's budget in plain English; an LLM compiles it into
 * a structured AgentPolicy. The LLM only *drafts* the policy — the deterministic
 * mandate engine still enforces it, and the operator key re-signs the mandate. So
 * friendly UX, hard safety.
 */

import OpenAI from "openai";
import { z } from "zod";
import { toMinor } from "../money";
import type { AgentPolicy } from "../mandate/types";

const Schema = z.object({
  baseCurrency: z.string().length(3),
  allowedCurrencies: z.array(z.string().length(3)).min(1),
  allowedMerchantCategories: z.array(z.string()).default([]),
  perTaskCap: z.number().positive(),
  dailyCap: z.number().positive(),
  autoApproveThreshold: z.number().nonnegative(),
});

const SYS =
  "You compile a natural-language spending policy for an AI agent into STRICT JSON. " +
  "Output ONLY a JSON object, no prose, with exactly these keys: " +
  "baseCurrency (ISO 4217), allowedCurrencies (array of ISO 4217), " +
  "allowedMerchantCategories (array of 4-digit MCC strings; [] = any), " +
  "perTaskCap (number, major units), dailyCap (number, major units), " +
  "autoApproveThreshold (number, major units; at or below = auto-approve, above = human approval). " +
  "Infer MCCs from merchant types: advertising=7311, software/SaaS=5734 and 7372, " +
  "information/data services=7375, digital goods=5817, cloud=7372. " +
  "If unspecified, set autoApproveThreshold = perTaskCap and dailyCap = 2x perTaskCap.";

function extractJson(text: string): unknown {
  const fenced = text.replace(/```json\s*|\s*```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM output");
  return JSON.parse(fenced.slice(start, end + 1));
}

export async function compilePolicy(current: AgentPolicy, text: string): Promise<AgentPolicy> {
  const key = process.env.LLM_API_KEY;
  if (!key || key.startsWith("your_")) {
    throw new Error("LLM_API_KEY required for natural-language policy compilation");
  }
  const openai = new OpenAI({
    apiKey: key,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  });
  const model = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";

  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYS },
      {
        role: "user",
        content: `Agent id: ${current.agentId}\nCurrent base currency: ${current.baseCurrency}\n\nPolicy description:\n${text}`,
      },
    ],
  });

  const p = Schema.parse(extractJson(resp.choices[0].message.content ?? "{}"));
  return {
    agentId: current.agentId,
    displayName: current.displayName,
    baseCurrency: p.baseCurrency.toUpperCase(),
    allowedCurrencies: p.allowedCurrencies.map((c) => c.toUpperCase()),
    allowedMerchantCategories: p.allowedMerchantCategories,
    perTaskCapMinor: toMinor(p.perTaskCap),
    dailyCapMinor: toMinor(p.dailyCap),
    autoApproveThresholdMinor: toMinor(p.autoApproveThreshold),
  };
}
