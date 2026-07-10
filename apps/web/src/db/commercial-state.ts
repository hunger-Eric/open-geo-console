import type {
  EmailDeliveryState,
  FulfillmentStatus,
  OrderDeliveryStatus,
  OrderRefundStatus,
  PaymentRefundState,
  PaymentStatus
} from "./schema";

type TransitionMap<State extends string> = Readonly<Record<State, readonly State[]>>;

const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  created: ["pending", "paid", "failed", "cancelled"],
  pending: ["paid", "failed", "cancelled"],
  paid: [],
  failed: [],
  cancelled: []
};

const FULFILLMENT_TRANSITIONS: TransitionMap<FulfillmentStatus> = {
  not_started: ["queued", "failed"],
  queued: ["processing", "completed", "completed_limited", "failed"],
  processing: ["completed", "completed_limited", "failed"],
  completed: [],
  completed_limited: [],
  failed: []
};

const ORDER_REFUND_TRANSITIONS: TransitionMap<OrderRefundStatus> = {
  not_required: ["pending"],
  pending: ["submitted", "refunded", "failed"],
  submitted: ["refunded", "failed"],
  refunded: [],
  failed: []
};

const PAYMENT_REFUND_TRANSITIONS: TransitionMap<PaymentRefundState> = {
  pending: ["submitted", "succeeded", "failed"],
  submitted: ["succeeded", "failed"],
  succeeded: [],
  failed: []
};

const ORDER_DELIVERY_TRANSITIONS: TransitionMap<OrderDeliveryStatus> = {
  not_queued: ["queued"],
  queued: ["sent", "delivered", "bounced", "failed"],
  sent: ["delivered", "bounced", "failed"],
  delivered: [],
  bounced: [],
  failed: []
};

const EMAIL_DELIVERY_TRANSITIONS: TransitionMap<EmailDeliveryState> = {
  queued: ["sent", "delivered", "bounced", "failed"],
  sent: ["delivered", "bounced", "failed"],
  delivered: [],
  bounced: [],
  failed: []
};

export class CommercialStateError extends Error {
  constructor(
    public readonly dimension: string,
    public readonly current: string,
    public readonly target: string
  ) {
    super(`Invalid ${dimension} transition from ${current} to ${target}.`);
  }
}

export function advancePaymentStatus(current: PaymentStatus, target: PaymentStatus): PaymentStatus {
  return advance("payment", PAYMENT_TRANSITIONS, current, target);
}

export function advanceFulfillmentStatus(
  current: FulfillmentStatus,
  target: FulfillmentStatus
): FulfillmentStatus {
  return advance("fulfillment", FULFILLMENT_TRANSITIONS, current, target);
}

export function advanceOrderRefundStatus(
  current: OrderRefundStatus,
  target: OrderRefundStatus
): OrderRefundStatus {
  return advance("order refund", ORDER_REFUND_TRANSITIONS, current, target);
}

export function advancePaymentRefundState(
  current: PaymentRefundState,
  target: PaymentRefundState
): PaymentRefundState {
  return advance("payment refund", PAYMENT_REFUND_TRANSITIONS, current, target);
}

export function advanceOrderDeliveryStatus(
  current: OrderDeliveryStatus,
  target: OrderDeliveryStatus
): OrderDeliveryStatus {
  return advance("order delivery", ORDER_DELIVERY_TRANSITIONS, current, target);
}

export function advanceEmailDeliveryState(
  current: EmailDeliveryState,
  target: EmailDeliveryState
): EmailDeliveryState {
  return advance("email delivery", EMAIL_DELIVERY_TRANSITIONS, current, target);
}

export function shouldApplyEmailProviderEvent(input: {
  current: EmailDeliveryState;
  target: Exclude<EmailDeliveryState, "queued" | "sent">;
  lastProviderEventAt: Date | null;
  providerCreatedAt: Date;
}): boolean {
  if (input.lastProviderEventAt && input.providerCreatedAt < input.lastProviderEventAt) {
    return false;
  }
  try {
    return advanceEmailDeliveryState(input.current, input.target) === input.target;
  } catch (error) {
    if (error instanceof CommercialStateError) return false;
    throw error;
  }
}

function advance<State extends string>(
  dimension: string,
  transitions: TransitionMap<State>,
  current: State,
  target: State
): State {
  if (current === target) return current;
  if (transitions[current].includes(target)) return target;
  throw new CommercialStateError(dimension, current, target);
}
