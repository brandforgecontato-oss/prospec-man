import { describe, expect, it } from "vitest";

import {
  DECISION_MAKER_TYPES,
  EVENT_TYPES,
  JOB_STATUSES,
  JOB_TYPES,
  LEAD_CHANNEL_STATES,
  LEAD_PIPELINE_STAGES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
} from "@/db/schema";

import {
  CHANNEL_STATE_LABELS,
  DECISION_MAKER_LABELS,
  EVENT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_DIRECTION_LABELS,
  MESSAGE_STATUS_LABELS,
  PIPELINE_STAGE_LABELS,
} from "./labels";

describe("PT-BR labels", () => {
  it("cover every pipeline stage", () => {
    for (const stage of LEAD_PIPELINE_STAGES) {
      expect(PIPELINE_STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("cover every channel state", () => {
    for (const state of LEAD_CHANNEL_STATES) {
      expect(CHANNEL_STATE_LABELS[state]).toBeTruthy();
    }
  });

  it("cover every decision maker type", () => {
    for (const type of DECISION_MAKER_TYPES) {
      expect(DECISION_MAKER_LABELS[type]).toBeTruthy();
    }
  });

  it("cover every message direction, channel and status", () => {
    for (const direction of MESSAGE_DIRECTIONS) {
      expect(MESSAGE_DIRECTION_LABELS[direction]).toBeTruthy();
    }
    for (const channel of MESSAGE_CHANNELS) {
      expect(MESSAGE_CHANNEL_LABELS[channel]).toBeTruthy();
    }
    for (const status of MESSAGE_STATUSES) {
      expect(MESSAGE_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("cover every job type and status", () => {
    for (const type of JOB_TYPES) {
      expect(JOB_TYPE_LABELS[type]).toBeTruthy();
    }
    for (const status of JOB_STATUSES) {
      expect(JOB_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("cover every event type", () => {
    for (const type of EVENT_TYPES) {
      expect(EVENT_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});
