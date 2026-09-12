/**
 * Shape of a Flashblocks websocket message, per the OP Stack Flashblocks
 * format documented in hskchain/references/developer-workflows.md: an
 * incremental block diff every ~200ms, with `index: 0` carrying the full
 * block header. NOT verified against a live subscription — the exact field
 * names here are a best-effort model and must be confirmed before the demo
 * (see the open item in docs/06-repo-and-tooling.md history / this package's
 * README-equivalent comment).
 */
export type FlashblockMessage = {
  index: number;
  payload_id?: string;
  diff: {
    block_hash?: string;
    /** Either raw tx hash strings or objects carrying a `hash` field — both are accepted, see matchesTxHash. */
    transactions: Array<string | { hash: string }>;
  };
  metadata?: { block_number?: number };
};

export function matchesTxHash(message: FlashblockMessage, submittedTxHash: string): boolean {
  const target = submittedTxHash.toLowerCase();
  return message.diff.transactions.some((tx) => {
    const hash = typeof tx === "string" ? tx : tx.hash;
    return hash.toLowerCase() === target;
  });
}
