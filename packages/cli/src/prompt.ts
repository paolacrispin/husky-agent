import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });

export async function ask(question: string): Promise<string> {
  return rl.question(question);
}

/**
 * Blocking [y/N] prompt. Any answer that isn't explicitly affirmative is a
 * rejection — fail-closed, per docs/04-security-policy-spec.md.
 */
export async function askApproval(summary: string): Promise<boolean> {
  console.log(`\n${summary}\n`);
  const answer = await rl.question("Approve? [y/N] ");
  return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
}

export function closePrompt(): void {
  rl.close();
}
