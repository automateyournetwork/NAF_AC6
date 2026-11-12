# RIBRush Development Guidelines

Project-specific guidance for work under this directory. The repository-root
agent context is left unchanged.

## Active Technologies

- Static HTML5, CSS, and native ECMAScript modules
- No framework, bundler, runtime package, backend, or persistent storage
- Browser APIs only; no external runtime requests

## Project Structure

```text
src/routing/  Address handling, evaluation, generation, and validation
src/game/     In-memory run state and transitions
src/ui/       Screens, keyboard controls, and feedback
src/audio/    Optional original sound cues
data/         Level definitions and generation constraints
tests/        Browser test runner and independent fixtures
```

## Commands

From this directory, preview with:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`; run the browser checks at
`http://127.0.0.1:8000/tests/`.

## Code Style

Keep route evaluation pure and deterministic. Keep UI, timing, scoring, and
audio outside the evaluator. Do not add fallback challenge data or external
runtime dependencies.
