---
name: git-autocommit
description: Use when the user asks to commit changes, autocommit with semver, save progress and update version, or make a hotfix of currently modified files. Inspects staged changes, classifies impact, updates package.json version, and commits with conventional commit messages.
---

# Skill: Smart Git Auto-Commit & Semantic Versioning

## Description
This skill allows the agent to automatically stage changes, inspect the Git staging area, intelligently classify the magnitude and impact of the changes, generate a structured commit message under the *Conventional Commits* convention, and automatically update the `package.json` file by bumping the corresponding semantic version (SemVer).

If no files are staged, the agent can auto-stage all changes (`git add -A`) or specific files provided by the user before proceeding with the commit.

## Commit Taxonomy and Versioning Rules
When this skill is invoked, the agent must analyze the volume and nature of the `git diff --staged` output and strictly apply the following decision matrix to determine the commit prefix and the software version bump ($X.Y.Z$):

| Change Type | Criteria / Change Volume | Commit Prefix | SemVer Impact | Version Bump Example |
| :--- | :--- | :--- | :--- | :--- |
| **Breaking Change** | Drastic changes that break backward compatibility or massive code/architectural refactors. | `feat!` or `fix!` | **MAJOR** ($X.0.0$) | $1.4.2 \rightarrow 2.0.0$ |
| **New Feature** | Addition of new modules, standalone files, new endpoints, or new business logic. | `feat` | **MINOR** ($0.Y.0$) | $1.4.2 \rightarrow 1.5.0$ |
| **Modification / Improvement** | Changes to existing files that modify or refactor current behavior without breaking it. | `change` or `refactor`| **MINOR** ($0.Y.0$) | $1.4.2 \rightarrow 1.5.0$ |
| **Hotfix / Bug Fix** | Minor bug fixes, urgent security patches, or few-line changes in existing files. | `hotfix` or `fix` | **PATCH** ($0.0.Z$) | $1.4.2 \rightarrow 1.4.3$ |
| **Maintenance** | Updates to documentation, comments, `.gitignore` files, or build/development tool configurations. | `docs` or `chore` | **None** | Retains current version |

## Triggers (When to use it)
- When the user explicitly requests: "commit my changes", "autocommit with semver", "save current progress and update the version", or "make a hotfix of what is currently modified".
- When the user says "git add ." or "git add <files>" followed by a commit request.
- When the agent's execution plan requires saving the current code state before switching to another complex task.

## Execution Protocol (Agent Autonomous Steps)

To execute this skill successfully, the agent must strictly follow this sequential order using its command execution and file management tools:

1. **Stage Changes (if needed):**
   - If the user provided specific file paths (e.g., `git commit src/file1.ts src/file2.ts`), stage them: `git add <file1> <file2> ...`
   - If the user said `git add .` or didn't specify files, scan with `git diff --staged`.
   - If `git diff --staged` is empty and no files were specified, auto-stage all unstaged changes: `git add -A`.
   - If after `git add -A` there's still nothing to commit, inform the user there are no changes.
   - Re-check with `git diff --staged` before proceeding.
2. **Evaluate Impact:** Classify the staged changes using the criteria in the *Commit Taxonomy* table.
3. **Modify Project Version:**
   - Read the `package.json` file located at the project root.
   - Extract the current `"version"` field.
   - Calculate the next version based on the classification and overwrite the `"version"` field in `package.json` with the new formatted string.
4. **Consolidate in Git:** Execute a single commit command combining the original changes, the version update, and the generated message.
   *Expected Command:* `git commit -am "<prefix>: <short description of changes in imperative mood> (v<new_version>)"`

## Expected Output Format (Internal Agent Reasoning)
If the agent relies on an internal JSON structured call to map these fields, it must resolve to the following structure before committing:

```json
{
  "classification": "feat | change | hotfix | breaking",
  "reason": "Brief explanation of why this category was chosen based on volume/impact",
  "commit_message": "prefix: short description in imperative",
  "version_bump": "major | minor | patch | none"
}
```
