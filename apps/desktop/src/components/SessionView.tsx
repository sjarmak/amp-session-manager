import React, { useState, useEffect } from "react";
import type { Session } from "@ampsm/types";
import { MergeWizard } from "./MergeWizard";
import { OutputViewer } from "./OutputViewer";
import { SessionMetrics } from "./SessionMetrics";

interface SessionViewProps {
  session: Session;
  onBack: () => void;
  onSessionUpdated: () => void;
}

export function SessionView({
  session,
  onBack,
  onSessionUpdated,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "output" | "actions" | "metrics"
  >("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iterationNotes, setIterationNotes] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [squashMessage, setSquashMessage] = useState("");
  const [rebaseTarget, setRebaseTarget] = useState(session.baseBranch);
  const [showMergeWizard, setShowMergeWizard] = useState(false);



  const handleDelete = async () => {
    console.log("Delete button clicked");
    if (
      !window.confirm(
        `Are you sure you want to delete session "${session.name}"? This will remove the worktree and branch. UNMERGED CHANGES WILL BE LOST.`
      )
    ) {
      console.log("Delete cancelled by user");
      return;
    }
    console.log("Delete confirmed, proceeding...");

    setLoading(true);
    setError(null);

    try {
      console.log("Calling cleanup for session:", session.id);
      const result = await window.electronAPI.sessions.cleanup(session.id);
      console.log("Cleanup result:", result);
      if (result.success) {
        console.log("Cleanup successful, going back to session list");
        onSessionUpdated(); // Refresh session list
        onBack(); // Go back to session list
      } else {
        console.log("Cleanup failed:", result.error);
        // If it's the reachability error, offer force cleanup
        if (result.error?.includes("not reachable from base branch")) {
          setLoading(false); // Clear loading state before showing dialog
          const forceConfirm = window.confirm(
            "Session has unmerged commits. Force delete anyway? This will permanently lose the changes."
          );
          if (forceConfirm) {
            setLoading(true); // Resume loading for force delete
            const forceResult = await window.electronAPI.sessions.cleanup(
              session.id,
              true
            );
            if (forceResult.success) {
              onSessionUpdated();
              onBack();
              return;
            } else {
              setError(forceResult.error || "Failed to force delete session");
            }
          } else {
            setError("Delete cancelled. Session has unmerged commits.");
          }
        } else {
          setError(result.error || "Failed to delete session");
        }
      }
    } catch (err) {
      console.log("Cleanup threw error:", err);
      setError(err instanceof Error ? err.message : "Failed to delete session");
    } finally {
      setLoading(false);
    }
  };

  const handleIterate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sessions.iterate(
        session.id,
        iterationNotes.trim() || undefined,
        includeContext
      );

      if (result.success) {
        onSessionUpdated();
        setIterationNotes("");
        setIncludeContext(false);
      } else {
        setError(result.error || "Failed to continue thread");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to continue thread"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSquash = async () => {
    if (!squashMessage.trim()) {
      setError("Please provide a commit message for squash");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sessions.squash(
        session.id,
        squashMessage
      );

      if (result.success) {
        onSessionUpdated();
        setSquashMessage("");
      } else {
        setError(result.error || "Failed to squash commits");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to squash commits");
    } finally {
      setLoading(false);
    }
  };

  const handleRebase = async () => {
    if (!rebaseTarget.trim()) {
      setError("Please provide a target branch for rebase");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sessions.rebase(
        session.id,
        rebaseTarget
      );

      if (result.success) {
        onSessionUpdated();
      } else {
        setError(result.error || "Failed to rebase");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebase");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: Session["status"]) => {
    switch (status) {
      case "idle":
        return "text-green-600 bg-green-50 border-green-200";
      case "running":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "awaiting-input":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "error":
        return "text-red-600 bg-red-50 border-red-200";
      case "done":
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
          <span
            className={`px-3 py-1 text-sm rounded-full border ${getStatusColor(
              session.status
            )}`}
          >
            {session.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-600 text-sm mt-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex space-x-1 border-b border-gray-200">
        {["overview", "actions", "output", "metrics"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Session Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">ID</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">
                  {session.id}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.status}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Repository
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {session.repoRoot}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Base Branch
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {session.baseBranch}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Session Branch
                </dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">
                  {session.branchName}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Worktree Path
                </dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">
                  {session.worktreePath}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(session.createdAt).toLocaleString()}
                </dd>
              </div>
              {session.lastRun && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Last Run
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(session.lastRun).toLocaleString()}
                  </dd>
                </div>
              )}
              {session.scriptCommand && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">
                    Test Command
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded">
                    {session.scriptCommand}
                  </dd>
                </div>
              )}
              {session.modelOverride && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Model Override
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {session.modelOverride}
                    {session.modelOverride === "gpt-5" && (
                      <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        uses --try-gpt5 flag
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Prompt</h3>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-md border-l-4 border-blue-400">
                <h4 className="text-sm font-medium text-blue-800 mb-2">
                  Original Prompt
                </h4>
                <p className="text-gray-800 whitespace-pre-wrap">
                  {session.ampPrompt}
                </p>
              </div>
              {session.followUpPrompts &&
                session.followUpPrompts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">
                      Follow-up Messages
                    </h4>
                    {session.followUpPrompts.map((prompt, index) => (
                      <div
                        key={index}
                        className="bg-amber-50 p-4 rounded-md border-l-4 border-amber-400"
                      >
                        <p className="text-gray-800 whitespace-pre-wrap">
                          {prompt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* Session Summary */}
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Session Summary</h3>
            <SessionMetrics sessionId={session.id} className="space-y-4" />
          </div>

          {/* Delete Session Button */}
          <div className="bg-white p-6 rounded-lg border border-red-200">
            <h3 className="text-lg font-semibold mb-4 text-red-800">
              Delete Session
            </h3>
            <p className="text-gray-600 mb-4">
              Permanently remove this session, including its worktree and
              branch. This cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete Session
            </button>
          </div>
        </div>
      )}

      {activeTab === "output" && (
        <div className="bg-white rounded-lg border">
          <OutputViewer sessionId={session.id} className="p-6" />
        </div>
      )}

      {activeTab === "actions" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Continue Thread</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Send followup message
                </label>
                <textarea
                  value={iterationNotes}
                  onChange={(e) => setIterationNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Message to continue the thread..."
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="includeContextFollow"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="includeContextFollow" className="text-sm text-gray-700">
                  Include CONTEXT.md file content if it exists
                </label>
              </div>
              <button
                onClick={handleIterate}
                disabled={loading || session.status === "running"}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Running..." : "Continue Thread"}
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Squash Commits</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Commit Message
                </label>
                <input
                  type="text"
                  value={squashMessage}
                  onChange={(e) => setSquashMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`feat: ${session.name}`}
                />
              </div>
              <button
                onClick={handleSquash}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Squashing..." : "Squash Commits"}
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Rebase Session</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Branch
                </label>
                <input
                  type="text"
                  value={rebaseTarget}
                  onChange={(e) => setRebaseTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={session.baseBranch}
                />
              </div>
              <button
                onClick={handleRebase}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Rebasing..." : "Rebase onto Target"}
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-green-200">
            <h3 className="text-lg font-semibold mb-4 text-black">
              Merge to Main
            </h3>
            <p className="text-gray-600 mb-4">
              Use the merge wizard to squash commits, rebase, and merge to the
              base branch in one guided flow.
            </p>
            <button
              onClick={() => setShowMergeWizard(true)}
              disabled={loading}
              className="px-6 py-3 text-white rounded-md hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              style={{ backgroundColor: "#291242" }}
            >
              Start Merge Wizard
            </button>
          </div>
        </div>
      )}

      {activeTab === "metrics" && (
        <div className="bg-white rounded-lg border">
          <SessionMetrics sessionId={session.id} className="p-6" />
        </div>
      )}

      {showMergeWizard && (
        <MergeWizard
          session={session}
          onClose={() => setShowMergeWizard(false)}
          onComplete={onSessionUpdated}
        />
      )}
    </div>
  );
}
