import { describe, expect, it, vi } from "vitest";
import { WorkerPresenceReporter } from "./presence";

describe("worker presence reporter", () => {
  it("heartbeats immediately and removes ephemeral presence on stop", async () => {
    const heartbeatWorkerPresence = vi.fn(async () => undefined);
    const removeWorkerPresence = vi.fn(async () => undefined);
    const reporter = new WorkerPresenceReporter({ heartbeatWorkerPresence, removeWorkerPresence }, {
      instanceId: "worker_1",
      tier: "deep",
      deploymentVersion: "version_1"
    });

    await reporter.start();
    await reporter.stop();

    expect(heartbeatWorkerPresence).toHaveBeenCalledWith({
      instanceId: "worker_1",
      tier: "deep",
      deploymentVersion: "version_1",
      ttlSeconds: 120
    });
    expect(removeWorkerPresence).toHaveBeenCalledWith("worker_1");
  });

  it("sanitizes heartbeat errors through a callback and remains stoppable", async () => {
    const onError = vi.fn();
    const reporter = new WorkerPresenceReporter({
      heartbeatWorkerPresence: async () => { throw new Error("database unavailable"); },
      removeWorkerPresence: async () => { throw new Error("database unavailable"); }
    }, {
      instanceId: "worker_1",
      tier: "free",
      deploymentVersion: "version_1",
      onError
    });

    await reporter.start();
    await reporter.stop();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
