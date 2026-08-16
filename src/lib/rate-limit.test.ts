import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "./rate-limit";

function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  test("allows attempts under the limit", () => {
    const clock = makeClock();
    const rl = createRateLimiter({ windowMs: 60_000, max: 3, now: clock.now });
    rl.hit("k");
    rl.hit("k");
    expect(rl.isAllowed("k")).toBe(true);
  });

  test("blocks once max hits reached within window", () => {
    const clock = makeClock();
    const rl = createRateLimiter({ windowMs: 60_000, max: 3, now: clock.now });
    rl.hit("k");
    rl.hit("k");
    rl.hit("k");
    expect(rl.isAllowed("k")).toBe(false);
  });

  test("hits expire after the window passes", () => {
    const clock = makeClock();
    const rl = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now });
    rl.hit("k");
    rl.hit("k");
    expect(rl.isAllowed("k")).toBe(false);
    clock.advance(60_001);
    expect(rl.isAllowed("k")).toBe(true);
  });

  test("reset clears a key immediately", () => {
    const clock = makeClock();
    const rl = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
    rl.hit("k");
    expect(rl.isAllowed("k")).toBe(false);
    rl.reset("k");
    expect(rl.isAllowed("k")).toBe(true);
  });

  test("keys are independent", () => {
    const clock = makeClock();
    const rl = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
    rl.hit("a");
    expect(rl.isAllowed("a")).toBe(false);
    expect(rl.isAllowed("b")).toBe(true);
  });
});
