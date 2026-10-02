# Demo deployment

Run from any directory with an existing CloudBase CLI login:

Before starting the service, set the CloudBase hosting service environment variable
`INVITE_SIGNING_KEY`. Generate an independent random value with
`openssl rand -hex 32`; keep it only in the service's secret environment settings,
never in the repository or image. The backend fails to start if this variable is
missing. Do not hard-code the key in a Dockerfile.

```sh
sh server/demo/deploy.sh --traffic
```

The script reads the environment and service from the project's `cloudbaserc.json`.
It uploads a staging directory containing the demo Dockerfile at the root and a
source archive. The archive preserves `server/src/modules/logs`, which the CLI's
ZIP filters otherwise omit. Dependencies, generated files and local environment
files are excluded.

`--traffic` builds a version without moving traffic. Verify the new version before
promoting it with `tcb cloudrun traffic promote`. Other CLI deploy flags can also
be passed to the script.

This is the existing single-instance demo setup: PostgreSQL and seed data are
embedded in the image. A new deployment starts with seed data, and container
replacement loses any later edits. Use `server/Dockerfile` with an external
database for a persistent deployment; it is not the demo entry point.
