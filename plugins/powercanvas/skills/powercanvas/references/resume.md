# Facts and resumability

For long work, create optional versioned journals under `.powercanvas/agent/` with `agent journal --spec <json> --out .powercanvas/agent/<task>-<revision>.json --json`. Each revision is new; the command refuses overwrites. This is an execution summary, never private reasoning.

The strict `taskJournalSchema` in `src/agent/journal.ts` stores: version `1.0`, absolute project directory, goal, workflow (`architecture`, `canvas`, `taste`, `flows`, `debug`, `mixed`), phase (`inspect`, `plan`, `validate`, `blocked`, `review`, `complete`), plannedOperations (manifest command IDs only), blockers, facts, mutationState (`NONE`, `PLANNED`, `CONFIRMED`, `UNKNOWN`), artifacts. Each artifact contains kind (`source`, `plan`, `result`, `providerHealth`), project-relative path, raw-file SHA-256 and optional expiresAt. Record the source snapshot and saved plan paths/hashes, not secrets or raw command arguments.

Resume with `agent resume --journal <file> --json --project <directory>`. It verifies project identity, artifact containment including symlinks, hashes and expiry. STALE requires reacquisition/replanning. UNKNOWN is BLOCKED pending reconciliation. Even matching artifacts return INSPECT_BEFORE_RESUME with mutationAuthorized false. Recheck actual provider health and current source/plan guards; a task journal is not approval or durable authoring authority.

If the live source is unavailable, preserve its last evidence but label it historical. Continue local planning without claiming the draft has been reacquired. Record the exact blocker and next bounded diagnostic condition.
