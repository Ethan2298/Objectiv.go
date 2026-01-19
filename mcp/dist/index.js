#!/usr/bin/env node
/**
 * Objectiv MCP Server
 *
 * Read-only MCP server for accessing Objectiv goal tracking data.
 * Provides tools to list and view objectives, priorities, and steps.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
// Supabase configuration (matches main app)
const SUPABASE_URL = "https://uajcwhcfrcqqpgvvfrpz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhamN3aGNmcmNxcXBndnZmcnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNjg2MDYsImV4cCI6MjA4MzY0NDYwNn0.1K6ttNixMSs_QW-_UiWmlB56AXxxt1W2oZKm_ewzxnI";
// Supabase client
let supabase = null;
function getClient() {
    if (!supabase) {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}
// Data access functions
async function loadAllObjectives() {
    const client = getClient();
    const { data, error } = await client
        .from("objectives")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) {
        throw new Error(`Failed to load objectives: ${error.message}`);
    }
    return (data || []).map((row) => ({
        id: row.id,
        name: row.name || "",
        description: row.description || "",
        priorities: row.priorities || [],
        steps: row.steps || [],
        nextStep: row.next_step || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}
async function getObjectiveById(id) {
    const client = getClient();
    const { data, error } = await client
        .from("objectives")
        .select("*")
        .eq("id", id)
        .single();
    if (error) {
        if (error.code === "PGRST116") {
            return null; // Not found
        }
        throw new Error(`Failed to load objective: ${error.message}`);
    }
    return {
        id: data.id,
        name: data.name || "",
        description: data.description || "",
        priorities: data.priorities || [],
        steps: data.steps || [],
        nextStep: data.next_step || null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}
async function createNewObjective(name, description) {
    const client = getClient();
    const now = new Date().toISOString();
    const { data, error } = await client
        .from("objectives")
        .insert({
        name,
        description,
        priorities: [],
        steps: [],
        next_step: null,
        created_at: now,
        updated_at: now,
    })
        .select()
        .single();
    if (error) {
        throw new Error(`Failed to create objective: ${error.message}`);
    }
    return {
        id: data.id,
        name: data.name,
        description: data.description || "",
        priorities: [],
        steps: [],
        nextStep: null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}
async function saveObjective(objective) {
    const client = getClient();
    const { error } = await client
        .from("objectives")
        .update({
        name: objective.name,
        description: objective.description,
        priorities: objective.priorities,
        steps: objective.steps,
        next_step: objective.nextStep,
        updated_at: new Date().toISOString(),
    })
        .eq("id", objective.id);
    if (error) {
        throw new Error(`Failed to save objective: ${error.message}`);
    }
}
// Helper functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
function formatDuration(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
// Create MCP server
const server = new McpServer({
    name: "objectiv-mcp-server",
    version: "1.0.0",
});
// Input schemas
const ListObjectivesSchema = z.object({
    include_steps: z.boolean()
        .default(false)
        .describe("Include step details in the response"),
}).strict();
const GetObjectiveSchema = z.object({
    id: z.string()
        .min(1, "Objective ID is required")
        .describe("The UUID of the objective to retrieve"),
}).strict();
// Register tools
server.registerTool("objectiv_list_objectives", {
    title: "List Objectives",
    description: `List all objectives in Objectiv with summary information.

Returns a list of all objectives including their name, description,
number of priorities, number of steps, and active step if any.

Args:
  - include_steps (boolean): Include step details in response (default: false)

Returns:
  Array of objectives with:
  - id: Objective UUID
  - name: Objective title
  - description: Objective description
  - priorityCount: Number of priorities
  - stepCount: Number of logged steps
  - totalTimeSpent: Total elapsed time across all steps
  - nextStep: Current in-progress step (if any)
  - steps: Array of steps (if include_steps is true)`,
    inputSchema: ListObjectivesSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objectives = await loadAllObjectives();
        const result = objectives.map((obj) => {
            const totalTime = obj.steps.reduce((sum, s) => sum + (s.elapsed || 0), 0);
            const summary = {
                id: obj.id,
                name: obj.name,
                description: obj.description,
                priorityCount: obj.priorities.length,
                stepCount: obj.steps.length,
                totalTimeSpent: formatDuration(totalTime),
                nextStep: obj.nextStep ? obj.nextStep.text : null,
            };
            if (params.include_steps) {
                summary.steps = obj.steps;
            }
            return summary;
        });
        const output = {
            count: result.length,
            objectives: result,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
        };
    }
});
server.registerTool("objectiv_get_objective", {
    title: "Get Objective",
    description: `Get full details of a single objective by ID.

Returns complete objective data including all priorities and steps.

Args:
  - id (string): The UUID of the objective

Returns:
  Complete objective with:
  - id, name, description
  - createdAt, updatedAt timestamps
  - priorities: Array of {id, name, description}
  - steps: Array of {id, name, status, elapsed, loggedAt, completedAt}
  - nextStep: Current in-progress step (if any)
  - stats: Summary statistics (totalTime, completedSteps, etc.)`,
    inputSchema: GetObjectiveSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.id);
        if (!objective) {
            return {
                content: [{
                        type: "text",
                        text: `Error: Objective not found with ID '${params.id}'`
                    }],
            };
        }
        const totalTime = objective.steps.reduce((sum, s) => sum + (s.elapsed || 0), 0);
        const completedSteps = objective.steps.filter((s) => s.status === "completed").length;
        const output = {
            ...objective,
            stats: {
                totalTimeSpent: formatDuration(totalTime),
                totalTimeSeconds: totalTime,
                totalSteps: objective.steps.length,
                completedSteps,
                pendingSteps: objective.steps.length - completedSteps,
                priorityCount: objective.priorities.length,
            },
        };
        return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
        };
    }
});
server.registerTool("objectiv_get_stats", {
    title: "Get Statistics",
    description: `Get aggregate statistics across all objectives.

Returns summary metrics about your objectives, priorities, and time tracking.

Returns:
  - totalObjectives: Number of objectives
  - totalPriorities: Sum of priorities across all objectives
  - totalSteps: Sum of all logged steps
  - totalTimeSpent: Formatted total time
  - objectivesByActivity: Objectives sorted by recent activity`,
    inputSchema: z.object({}).strict(),
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async () => {
    try {
        const objectives = await loadAllObjectives();
        let totalPriorities = 0;
        let totalSteps = 0;
        let totalTime = 0;
        for (const obj of objectives) {
            totalPriorities += obj.priorities.length;
            totalSteps += obj.steps.length;
            totalTime += obj.steps.reduce((sum, s) => sum + (s.elapsed || 0), 0);
        }
        // Sort by most recently updated
        const byActivity = [...objectives]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5)
            .map((obj) => ({
            id: obj.id,
            name: obj.name,
            updatedAt: obj.updatedAt,
            hasActiveStep: obj.nextStep !== null,
        }));
        const output = {
            totalObjectives: objectives.length,
            totalPriorities,
            totalSteps,
            totalTimeSpent: formatDuration(totalTime),
            totalTimeSeconds: totalTime,
            recentlyActive: byActivity,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
        };
    }
});
// ========================================
// Write Tools
// ========================================
// Create Objective
server.registerTool("objectiv_create_objective", {
    title: "Create Objective",
    description: `Create a new objective.

Args:
  - name (string): The name/title of the objective
  - description (string, optional): Detailed description

Returns:
  The newly created objective with its generated ID`,
    inputSchema: z.object({
        name: z.string().min(1, "Name is required").describe("The name of the objective"),
        description: z.string().default("").describe("Optional description"),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await createNewObjective(params.name, params.description);
        return {
            content: [{ type: "text", text: JSON.stringify(objective, null, 2) }],
            structuredContent: objective,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
        };
    }
});
// Update Objective
server.registerTool("objectiv_update_objective", {
    title: "Update Objective",
    description: `Update an objective's name and/or description.

Args:
  - id (string): The objective UUID
  - name (string, optional): New name
  - description (string, optional): New description

Returns:
  The updated objective`,
    inputSchema: z.object({
        id: z.string().min(1, "Objective ID is required"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        if (params.name !== undefined)
            objective.name = params.name;
        if (params.description !== undefined)
            objective.description = params.description;
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify(objective, null, 2) }],
            structuredContent: objective,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Set Next Step
server.registerTool("objectiv_set_next_step", {
    title: "Set Next Step",
    description: `Set or clear the next step for an objective.

Args:
  - objective_id (string): The objective UUID
  - text (string): The next step text. Pass empty string to clear.

Returns:
  The updated objective`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        text: z.string().describe("Next step text (empty to clear)"),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        if (params.text === "") {
            objective.nextStep = null;
        }
        else {
            objective.nextStep = {
                text: params.text,
                elapsedSeconds: objective.nextStep?.elapsedSeconds || 0,
            };
        }
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify(objective, null, 2) }],
            structuredContent: objective,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Add Step
server.registerTool("objectiv_add_step", {
    title: "Add Step",
    description: `Add a new step to an objective.

Args:
  - objective_id (string): The objective UUID
  - name (string): The step name/description
  - status (string, optional): pending, paused, or completed (default: pending)

Returns:
  The updated objective with the new step`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        name: z.string().min(1, "Step name is required"),
        status: z.enum(["pending", "paused", "completed"]).default("pending"),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        const now = new Date().toISOString();
        const newStep = {
            id: generateId(),
            name: params.name,
            loggedAt: now,
            orderNumber: objective.steps.length + 1,
            status: params.status,
            elapsed: 0,
            startedAt: null,
            completedAt: params.status === "completed" ? now : null,
        };
        objective.steps.push(newStep);
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify({ step: newStep, objective }, null, 2) }],
            structuredContent: { step: newStep, objective },
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Update Step
server.registerTool("objectiv_update_step", {
    title: "Update Step",
    description: `Update a step's name or status.

Args:
  - objective_id (string): The objective UUID
  - step_id (string): The step ID
  - name (string, optional): New name
  - status (string, optional): pending, paused, or completed

Returns:
  The updated objective`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        step_id: z.string().min(1, "Step ID is required"),
        name: z.string().optional(),
        status: z.enum(["pending", "paused", "completed"]).optional(),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        const step = objective.steps.find((s) => s.id === params.step_id);
        if (!step) {
            return { content: [{ type: "text", text: `Error: Step not found` }] };
        }
        if (params.name !== undefined)
            step.name = params.name;
        if (params.status !== undefined) {
            step.status = params.status;
            if (params.status === "completed" && !step.completedAt) {
                step.completedAt = new Date().toISOString();
            }
        }
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify({ step, objective }, null, 2) }],
            structuredContent: { step, objective },
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Delete Step
server.registerTool("objectiv_delete_step", {
    title: "Delete Step",
    description: `Remove a step from an objective.

Args:
  - objective_id (string): The objective UUID
  - step_id (string): The step ID to delete

Returns:
  The updated objective`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        step_id: z.string().min(1, "Step ID is required"),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        const stepIndex = objective.steps.findIndex((s) => s.id === params.step_id);
        if (stepIndex === -1) {
            return { content: [{ type: "text", text: `Error: Step not found` }] };
        }
        objective.steps.splice(stepIndex, 1);
        // Renumber remaining steps
        objective.steps.forEach((s, i) => (s.orderNumber = i + 1));
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify(objective, null, 2) }],
            structuredContent: objective,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Add Priority
server.registerTool("objectiv_add_priority", {
    title: "Add Priority",
    description: `Add a new priority to an objective.

Args:
  - objective_id (string): The objective UUID
  - name (string): The priority name
  - description (string, optional): Priority description

Returns:
  The updated objective with the new priority`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        name: z.string().min(1, "Priority name is required"),
        description: z.string().default(""),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        const newPriority = {
            id: generateId(),
            name: params.name,
            description: params.description,
        };
        objective.priorities.push(newPriority);
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify({ priority: newPriority, objective }, null, 2) }],
            structuredContent: { priority: newPriority, objective },
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Update Priority
server.registerTool("objectiv_update_priority", {
    title: "Update Priority",
    description: `Update a priority's name or description.

Args:
  - objective_id (string): The objective UUID
  - priority_id (string): The priority ID
  - name (string, optional): New name
  - description (string, optional): New description

Returns:
  The updated objective`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        priority_id: z.string().min(1, "Priority ID is required"),
        name: z.string().optional(),
        description: z.string().optional(),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        const priority = objective.priorities.find((p) => p.id === params.priority_id);
        if (!priority) {
            return { content: [{ type: "text", text: `Error: Priority not found` }] };
        }
        if (params.name !== undefined)
            priority.name = params.name;
        if (params.description !== undefined)
            priority.description = params.description;
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify({ priority, objective }, null, 2) }],
            structuredContent: { priority, objective },
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Delete Priority
server.registerTool("objectiv_delete_priority", {
    title: "Delete Priority",
    description: `Remove a priority from an objective.

Args:
  - objective_id (string): The objective UUID
  - priority_id (string): The priority ID to delete

Returns:
  The updated objective`,
    inputSchema: z.object({
        objective_id: z.string().min(1, "Objective ID is required"),
        priority_id: z.string().min(1, "Priority ID is required"),
    }).strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async (params) => {
    try {
        const objective = await getObjectiveById(params.objective_id);
        if (!objective) {
            return { content: [{ type: "text", text: `Error: Objective not found` }] };
        }
        const priorityIndex = objective.priorities.findIndex((p) => p.id === params.priority_id);
        if (priorityIndex === -1) {
            return { content: [{ type: "text", text: `Error: Priority not found` }] };
        }
        objective.priorities.splice(priorityIndex, 1);
        await saveObjective(objective);
        return {
            content: [{ type: "text", text: JSON.stringify(objective, null, 2) }],
            structuredContent: objective,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error: ${message}` }] };
    }
});
// Run server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Objectiv MCP server running via stdio");
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
