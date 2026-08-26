# @narsil/cli

CLI tool for Narsil projects. Provides `init`, `dev`, and `db` commands.

## Install

```bash
npm install -g @narsil/cli
```

## Usage

```bash
narsil init                 # TypeScript backend for Bun or Node (default)
narsil init --runtime axum  # Axum backend (Fly/VPS/Docker)
narsil dev                  # tsx watch, or cargo run for Axum
narsil db push              # drizzle-kit (TypeScript runtime)
narsil db generate          # Generate migrations
```

See the [root README](../../README.md) for full documentation.
