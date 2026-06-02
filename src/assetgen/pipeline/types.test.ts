// AC0.1 — schema.parse(valid) ok, schema.parse(invalid) throws.
// Covers: BriefSchema, EnvelopeSchema, RunStateSchema.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BriefSchema,
  EnvelopeSchema,
  RunStateSchema,
} from "./types.js";

describe("BriefSchema", () => {
  it("accepts minimal valid brief (only style)", () => {
    const parsed = BriefSchema.parse({ style: "heroes3" });
    assert.equal(parsed.style, "heroes3");
  });

  it("accepts brief with prompt + refs", () => {
    const parsed = BriefSchema.parse({
      style: "pixelart",
      prompt: "tower defense, fantasy",
      refs: ["https://example.com/ref1.png", "/local/ref2.png"],
    });
    assert.equal(parsed.refs?.length, 2);
  });

  it("preserves unknown fields (passthrough)", () => {
    const parsed = BriefSchema.parse({
      style: "heroes3",
      futureField: "value",
    }) as Record<string, unknown>;
    assert.equal(parsed.futureField, "value");
  });

  it("throws when style missing", () => {
    assert.throws(() => BriefSchema.parse({ prompt: "x" }));
  });

  it("throws when style is empty string", () => {
    assert.throws(() => BriefSchema.parse({ style: "" }));
  });
});

describe("EnvelopeSchema", () => {
  const validEnvelope = {
    runId: "20260602T131422-a3f1c8d2",
    createdAt: "2026-06-02T13:14:22.000Z",
    brief: { style: "heroes3" },
    assets: [
      {
        key: "btn-frame",
        path: "assets/btn-frame.webp",
        bytes: 12345,
        prompt: "ornate gold UI button frame, ...",
        briefVersion: "1.0.0",
      },
    ],
    font: { family: "Cinzel", path: "assets/Cinzel-700.woff2" },
  };

  it("accepts a complete minimal envelope", () => {
    const parsed = EnvelopeSchema.parse(validEnvelope);
    assert.equal(parsed.runId, validEnvelope.runId);
    assert.equal(parsed.assets.length, 1);
  });

  it("accepts envelope with optional plan / build / validation", () => {
    const parsed = EnvelopeSchema.parse({
      ...validEnvelope,
      plan: {
        screens: [{ id: "intro" }, { id: "endcard" }],
        assetKeys: ["btn-frame", "banner"],
      },
      build: { htmlPath: "index.html", bytes: 1500000 },
      validation: { ok: true, checks: { size: "ok", cta: "ok" } },
    });
    assert.equal(parsed.plan?.screens.length, 2);
    assert.equal(parsed.build?.bytes, 1500000);
    assert.equal(parsed.validation?.ok, true);
  });

  it("throws when runId is missing", () => {
    const { runId: _, ...invalid } = validEnvelope;
    assert.throws(() => EnvelopeSchema.parse(invalid));
  });

  it("throws when assets[].bytes is negative", () => {
    assert.throws(() =>
      EnvelopeSchema.parse({
        ...validEnvelope,
        assets: [{ ...validEnvelope.assets[0], bytes: -1 }],
      }),
    );
  });

  it("throws when font.family is empty", () => {
    assert.throws(() =>
      EnvelopeSchema.parse({
        ...validEnvelope,
        font: { ...validEnvelope.font, family: "" },
      }),
    );
  });
});

describe("RunStateSchema", () => {
  const valid = {
    runId: "20260602T131422-a3f1c8d2",
    style: "heroes3",
    status: "running" as const,
    stages: [
      { name: "assetgen", status: "done" as const, startedAt: "t0", endedAt: "t1" },
      { name: "build", status: "running" as const, startedAt: "t1" },
      { name: "validate", status: "todo" as const },
    ],
  };

  it("accepts a valid run state", () => {
    const parsed = RunStateSchema.parse(valid);
    assert.equal(parsed.stages.length, 3);
    assert.equal(parsed.status, "running");
  });

  it("accepts each declared run status", () => {
    for (const s of ["running", "needs-approval", "done", "failed"] as const) {
      RunStateSchema.parse({ ...valid, status: s });
    }
  });

  it("throws on unknown stage status", () => {
    assert.throws(() =>
      RunStateSchema.parse({
        ...valid,
        stages: [{ name: "x", status: "weird" }],
      }),
    );
  });

  it("throws on unknown run status", () => {
    assert.throws(() => RunStateSchema.parse({ ...valid, status: "paused" }));
  });

  it("throws when stages[].name is empty", () => {
    assert.throws(() =>
      RunStateSchema.parse({
        ...valid,
        stages: [{ name: "", status: "todo" as const }],
      }),
    );
  });
});
