import type { OpportunityHypothesis } from "./types";
import { validateOpportunityHypothesis } from "./validation";

export function createOpportunityHypothesis(value: OpportunityHypothesis): OpportunityHypothesis {
  return validateOpportunityHypothesis({ ...value, evidenceCellIds: [...value.evidenceCellIds] });
}
