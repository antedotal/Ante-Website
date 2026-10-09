import {
  exact,
  internalId,
  type Observation,
  parsePermit,
  type Permit,
} from "./webPaymentProviderContract.ts";
// The transport is a trusted private repository binding, not a user-selected RPC/table proxy.
// This source port has no Data API grants or deployed worker; dedicated job wiring is a later unit.
export type PrivateRpc = (
  name:
    | "claim"
    | "record_dispatch"
    | "record_observation"
    | "reconcile"
    | "continuation"
    | "consume_continuation",
  args: Record<string, unknown>,
) => Promise<unknown>;
export type ContinuationContext = {
  permit: Permit;
  ticket: {
    ticket_id: string;
    owner_id: string;
    setup_id: string;
    setup_revision: number;
    subaction_id: string;
    operation_revision: number;
    created_at: string;
    expires_at: string;
  };
};
export class ProviderRepository {
  constructor(
    private readonly rpc: PrivateRpc,
    private readonly workerIdentity: string,
  ) {}
  async claim(limit = 20): Promise<Permit[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error("invalid_input");
    }
    const value = await this.rpc("claim", {
      p_limit: limit,
      p_worker: this.workerIdentity,
    });
    if (!Array.isArray(value) || value.length > limit) {
      throw new Error("repository_unknown");
    }
    return value.map(parsePermit);
  }
  // SQL compares the exact claimed plan/object with reconciliation under its owner lock.
  // A changed identity or expired effect horizon denies this claim before SDK construction.
  async recordDispatch(p: Permit): Promise<boolean> {
    parsePermit(p);
    return await this.rpc("record_dispatch", {
      p_subaction: p.subaction_id,
      p_generation: p.lease_generation,
      p_revision: p.operation_revision,
      p_plan: p.plan,
      p_object_id: p.object_id,
    }) === true;
  }
  async recordObservation(p: Permit, o: Observation): Promise<unknown> {
    return await this.rpc("record_observation", {
      p_subaction: p.subaction_id,
      p_generation: p.lease_generation,
      p_revision: p.operation_revision,
      p_observation: o,
    });
  }
  async continuation(
    setupId: string,
    revision: number,
  ): Promise<ContinuationContext | null> {
    if (!internalId(setupId) || !Number.isInteger(revision) || revision < 1) {
      throw new Error("invalid_input");
    }
    const v = await this.rpc("continuation", {
      p_setup: setupId,
      p_revision: revision,
    });
    if (v === null) return null;
    if (!exact(v, ["permit", "ticket"])) throw new Error("repository_unknown");
    const ctx = v as ContinuationContext;
    ctx.permit = parsePermit(ctx.permit);
    const ticket = ctx.ticket, p = ctx.permit;
    if (
      !exact(
        ticket,
        "ticket_id owner_id setup_id setup_revision subaction_id operation_revision created_at expires_at"
          .split(" "),
      ) || !internalId(ticket.ticket_id) || ticket.owner_id !== p.owner_id ||
      ticket.setup_id !== setupId || ticket.setup_id !== p.subject_id ||
      ticket.setup_revision !== revision ||
      ticket.subaction_id !== p.subaction_id ||
      ticket.operation_revision !== p.operation_revision ||
      ticket.expires_at !== p.lease_expires_at || p.kind !== "setup.create" ||
      p.plan !== "retrieve"
    ) throw new Error("repository_unknown");
    return ctx;
  }
  async consumeContinuation(ctx: ContinuationContext) {
    return await this.rpc("consume_continuation", {
      p_ticket: ctx.ticket.ticket_id,
    }) === true;
  }
  async reconcile(
    p: Permit,
  ): Promise<
    {
      plan: "effect" | "retrieve" | "manual_required";
      object_id: string | null;
    }
  > {
    const value = await this.rpc("reconcile", { p_subaction: p.subaction_id });
    if (
      !exact(value, ["plan", "object_id"]) ||
      !["effect", "retrieve", "manual_required"].includes(
        (value as { plan: string }).plan,
      )
    ) throw new Error("repository_unknown");
    return value as {
      plan: "effect" | "retrieve" | "manual_required";
      object_id: string | null;
    };
  }
}
