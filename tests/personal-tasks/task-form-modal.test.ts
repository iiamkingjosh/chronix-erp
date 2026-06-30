// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import TaskFormModal from "@/components/personal-tasks/TaskFormModal";

afterEach(() => {
  cleanup();
});

describe("TaskFormModal: a failed save shows a visible error instead of doing nothing", () => {
  it("shows an error message when onSave rejects, and does not close the modal", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("simulated failure, unrelated to the undefined-field bug"));
    const onClose = vi.fn();

    render(createElement(TaskFormModal, { onSave, onClose }));

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), { target: { value: "A task that will fail to save" } });
    fireEvent.click(screen.getByText("Create Task"));

    await waitFor(() => {
      expect(screen.getByText("Failed to save. Please try again.")).toBeTruthy();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes normally and shows no error when onSave succeeds", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(createElement(TaskFormModal, { onSave, onClose }));

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), { target: { value: "A task that saves fine" } });
    fireEvent.click(screen.getByText("Create Task"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(screen.queryByText("Failed to save. Please try again.")).toBeNull();
  });
});
