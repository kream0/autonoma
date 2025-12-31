import { describe, test, expect } from "bun:test";
import { createTask, updateTask, completeTask, type Task } from "../src/models/task.ts";

describe("Task Model", () => {
  describe("createTask", () => {
    test("creates a task with required fields", () => {
      const task = createTask("Buy groceries");

      expect(task.title).toBe("Buy groceries");
      expect(task.status).toBe("pending");
      expect(task.priority).toBe("medium");
      expect(task.tags).toEqual([]);
      expect(task.id).toBeDefined();
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    test("creates a task with optional fields", () => {
      const task = createTask("Important meeting", {
        priority: "high",
        tags: ["work", "urgent"],
        dueDate: "2025-12-25T00:00:00.000Z",
      });

      expect(task.title).toBe("Important meeting");
      expect(task.priority).toBe("high");
      expect(task.tags).toEqual(["work", "urgent"]);
      expect(task.dueDate).toBe("2025-12-25T00:00:00.000Z");
    });

    test("generates unique IDs", () => {
      const task1 = createTask("Task 1");
      const task2 = createTask("Task 2");

      expect(task1.id).not.toBe(task2.id);
    });
  });

  describe("updateTask", () => {
    test("updates task title", () => {
      const task = createTask("Original title");
      const updated = updateTask(task, { title: "New title" });

      expect(updated.title).toBe("New title");
      expect(updated.id).toBe(task.id);
      expect(updated.createdAt).toBe(task.createdAt);
      expect(updated.updatedAt).not.toBe(task.updatedAt);
    });

    test("updates task priority", () => {
      const task = createTask("Task");
      const updated = updateTask(task, { priority: "high" });

      expect(updated.priority).toBe("high");
    });

    test("updates task status", () => {
      const task = createTask("Task");
      const updated = updateTask(task, { status: "in_progress" });

      expect(updated.status).toBe("in_progress");
    });

    test("updates task tags", () => {
      const task = createTask("Task");
      const updated = updateTask(task, { tags: ["new", "tags"] });

      expect(updated.tags).toEqual(["new", "tags"]);
    });
  });

  describe("completeTask", () => {
    test("marks task as completed", () => {
      const task = createTask("Task to complete");
      const completed = completeTask(task);

      expect(completed.status).toBe("completed");
      expect(completed.completedAt).toBeDefined();
      expect(completed.updatedAt).not.toBe(task.updatedAt);
    });

    test("preserves original task data", () => {
      const task = createTask("Task", { priority: "high", tags: ["important"] });
      const completed = completeTask(task);

      expect(completed.id).toBe(task.id);
      expect(completed.title).toBe("Task");
      expect(completed.priority).toBe("high");
      expect(completed.tags).toEqual(["important"]);
    });
  });
});
