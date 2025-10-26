/**
 * @fileoverview MiniGraph - A minimal async state machine for React Native
 *
 * A lightweight, React Native-compatible implementation of LangGraph-style
 * orchestration for the translation system. Handles the flow:
 * translate → search → translate → done
 */

export type NodeFn<TCtx> = (
  ctx: TCtx,
  input?: any
) => Promise<{ next?: string; output?: any }> | { next?: string; output?: any };

interface NodeMap<TCtx> {
  [name: string]: NodeFn<TCtx>;
}

interface MiniGraphOptions<TCtx> {
  entry: string;
  nodes: NodeMap<TCtx>;
  onTransition?: (state: string, ctx: TCtx) => void;
}

export class MiniGraph<TCtx extends Record<string, any>> {
  private entry: string;
  private nodes: NodeMap<TCtx>;
  private onTransition?: (state: string, ctx: TCtx) => void;

  constructor(opts: MiniGraphOptions<TCtx>) {
    this.entry = opts.entry;
    this.nodes = opts.nodes;
    this.onTransition = opts.onTransition;
  }

  async run(ctx: TCtx, input?: any) {
    let current = this.entry;
    while (current) {
      this.onTransition?.(current, ctx);
      const node = this.nodes[current];
      if (!node) throw new Error(`Unknown node: ${current}`);
      const { next, output } = await node(ctx, input);
      if (!next) break; // finished
      current = next;
      input = output; // pass along results
    }
    return ctx;
  }
}
