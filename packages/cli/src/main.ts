import { Conversation, interpret, InterpretError } from "@husky-agent/agent";
import { prepareSwap, prepareTransfer, ResolutionError, type PipelineConfig } from "@husky-agent/core";
import { createSpeculosSigner, healthCheckSpeculos, SignerHealthCheckError } from "@husky-agent/signer";
import { loadAppConfig } from "./config.js";
import { ask, askApproval, closePrompt } from "./prompt.js";
import { sendOperation } from "./sendOperation.js";

const MAX_CLARIFICATION_TURNS = 3;

async function resolveIntent(firstInstruction: string) {
  const conversation = new Conversation(firstInstruction);

  for (let turn = 0; turn <= MAX_CLARIFICATION_TURNS; turn++) {
    const intent = await interpret(conversation.history());
    if (!("needsClarification" in intent)) return intent;

    if (turn === MAX_CLARIFICATION_TURNS) {
      console.log(`${intent.message}\nToo many clarification attempts — cancelling this instruction.`);
      return null;
    }

    const reply = await ask(`${intent.message}\n> `);
    if (reply.trim().toLowerCase() === "cancel") return null;
    conversation.addClarificationTurn(intent.message, reply);
  }
  return null;
}

async function main() {
  const config = loadAppConfig();

  console.log("Checking Speculos...");
  try {
    await healthCheckSpeculos(config.env.speculosTransportUrl);
  } catch (error) {
    if (error instanceof SignerHealthCheckError) {
      console.error("Speculos isn't running, run `npm run speculos:start`");
      process.exit(1);
    }
    throw error;
  }

  const signer = await createSpeculosSigner(config.env.speculosTransportUrl);
  const fromAddress = await signer.getAddress();
  console.log(`Ready. Signing address: ${fromAddress}\n`);

  const pipelineConfig: PipelineConfig = {
    tokens: config.tokens,
    contacts: config.contacts,
    publicClient: config.publicClient,
    fromAddress,
    routerAddress: config.env.routerAddress,
    factoryAddress: config.env.factoryAddress,
    allowedContracts: config.allowedContracts,
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const instruction = await ask("husky-agent> ");
    if (!instruction.trim()) continue;
    if (instruction.trim().toLowerCase() === "exit") break;

    let intent;
    try {
      intent = await resolveIntent(instruction);
    } catch (error) {
      if (error instanceof InterpretError) {
        console.error(`Sorry, I couldn't process that right now: ${error.message}`);
        continue;
      }
      throw error;
    }
    if (!intent) continue;

    try {
      const result =
        intent.tool === "transfer"
          ? await prepareTransfer(intent.params, pipelineConfig)
          : await prepareSwap(intent.params, pipelineConfig);

      if (result.status === "rejected") {
        console.log(`❌ ${result.reason}`);
        continue;
      }

      const approved = await askApproval(result.summary);
      if (!approved) {
        console.log("Cancelled — nothing was signed or sent.");
        continue;
      }

      await sendOperation(
        result.operation,
        signer,
        config.publicClient,
        config.env.chainId,
        config.env.flashblocksWsUrl,
      );
    } catch (error) {
      if (error instanceof ResolutionError) {
        console.log(`❌ ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  closePrompt();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
