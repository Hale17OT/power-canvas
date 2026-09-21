# Complaint Management

This is the real specification consumed by the PowerCanvas CLI, copied from the scaffold template. It is desired intent, not a deployed application. Run from the repository root:

```sh
node dist/cli/index.js validate --project examples/complaint-management --json
node dist/cli/index.js doctor --project examples/complaint-management
```

The sample includes four ordinary columns (two are primary names) plus one relationship-owned lookup, standard app intent and a bounded Complaint Agent role. Category is organization-owned; Complaint is user/team-owned. The role is a proposal and still needs base-privilege/effective-access testing in Experiment 2.

Use `init` for a new real project so it receives a fresh project UUID. Keep that UUID stable thereafter. Display labels can change without changing identity; schema names, dictionary keys and numeric choice values require deliberate lifecycle treatment.
