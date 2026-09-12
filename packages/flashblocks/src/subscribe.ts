import WebSocket from "ws";
import { matchesTxHash, type FlashblockMessage } from "./types.js";

export type FlashblocksHandle = {
  /** Tears down the subscription. Safe to call multiple times. */
  close: () => void;
};

/**
 * Subscribes to the HSK testnet Flashblocks websocket and calls
 * `onPreconfirmed` the first time `submittedTxHash` appears in a block diff.
 * This is a pure UX layer — see docs/01-architecture.md's "UX feedback via
 * Flashblocks" section. Never treat `onPreconfirmed` as finality: the caller
 * must still wait for a normal RPC receipt.
 *
 * Per the non-negotiable UX rule in CLAUDE.md, any error or unexpected close
 * degrades silently — `onError` is informational only, it must never be
 * surfaced as if the underlying operation failed.
 */
export function subscribeToFlashblocks(
  wsUrl: string,
  submittedTxHash: string,
  onPreconfirmed: () => void,
  onError?: (error: Error) => void,
): FlashblocksHandle {
  let closed = false;
  let ws: WebSocket;

  try {
    ws = new WebSocket(wsUrl);
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
    return { close: () => {} };
  }

  ws.on("message", (data) => {
    if (closed) return;
    try {
      const message = JSON.parse(data.toString()) as FlashblockMessage;
      if (matchesTxHash(message, submittedTxHash)) {
        onPreconfirmed();
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  });

  ws.on("error", (error) => {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      ws.close();
    },
  };
}
