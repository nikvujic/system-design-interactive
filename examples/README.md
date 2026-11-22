# Example designs

Design files for the command-line runner. Run one from the repository root:

```bash
pnpm sim run examples/two-servers.json
```

| File | What it shows |
|---|---|
| `two-servers.json` | Users → load balancer → two 4-core servers at 2,000 requests/second. Enough capacity: about 60% busy, no errors. |
| `one-server-overloaded.json` | The same traffic on a single 4-core server. Demand exceeds capacity, so the queue fills and requests are rejected. |
