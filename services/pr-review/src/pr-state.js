import { STATUS } from "./task-event.js";

export function evaluateCard(card, pr, now, settings) {
  const e = settings.pr.emojis;
  if (!pr) return { state: "MISSING", reaction: card.reaction ?? null, resendEnabled: false, active: false, reason: "the PR was not found" };
  if (pr.state === "MERGED") return { state: "MERGED", reaction: e.merged, resendEnabled: false, active: false, reason: "the PR is merged" };
  if (pr.state === "CLOSED") return { state: "CLOSED", reaction: null, resendEnabled: false, active: false, reason: "the PR is closed" };

  const reviewState = pr.reviewDecision === "APPROVED" ? "APPROVED" : pr.reviewDecision === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "WAITING";
  const reaction = reviewState === "APPROVED" ? e.approved : reviewState === "CHANGES_REQUESTED" ? e.changesRequested : null;

  if (card.taskStatus && card.taskStatus !== STATUS.READY)
    return { state: reviewState, reaction, resendEnabled: false, active: false, reason: `the task is ${card.taskStatus}` };
  if (reviewState === "APPROVED") return { state: reviewState, reaction, resendEnabled: false, active: true, reason: "the PR is approved" };
  if (reviewState === "CHANGES_REQUESTED") return { state: reviewState, reaction, resendEnabled: false, active: true, reason: "changes are requested" };

  const hours = (new Date(now) - new Date(card.publishedAt)) / 36e5;
  const ready = hours >= settings.pr.resendAfterHours;
  return {
    state: reviewState, reaction: null, resendEnabled: ready, active: true,
    reason: ready ? null : `Resend becomes available ${settings.pr.resendAfterHours} hours after publishing`,
  };
}
