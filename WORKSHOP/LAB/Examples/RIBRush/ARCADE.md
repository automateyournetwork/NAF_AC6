---
# Adapted from WORKSHOP/LAB/StarterKit/ARCADE.md; project facts verified against RIBRush.
arcade_version: 1

game:
  title: "RIBRush"
  slug: ribrush
  tagline: "Practice the route-selection rules that decide where packets go."
  summary: "Players compare each packet destination with candidate routes and choose the winning next hop. Seven levels move from mixed IPv4 warmups through focused longest-prefix, administrative-distance, and metric practice, then transfer the rules to IPv6."
  topics: [IPv4, IPv6, "longest-prefix match", "administrative distance", "route metrics"]
  category: routing
  skill_level: beginner
  play_minutes: unknown
  levels: 7
  card_image: ""
  card_image_alt: ""
  repo: "https://github.com/AutomateIP/NAF_AC6"
  repo_path: "WORKSHOP/LAB/Examples/RIBRush"
  license: Apache-2.0

creator:
  name: "AutomateIP"
  github: AutomateIP
  location: "Raleigh, NC, USA"
  organization: ""
  links: []
  first_spec_project: false
  workshop: "NAF AC6"
  consent_to_publish: true

build:
  started: unknown
  finished: unknown
  wall_time: unknown
  spec_driven:
    framework: "GitHub Spec Kit"
    framework_version: unknown
    artifacts: [constitution, spec, plan, tasks, checklists, research, data-model, contracts, quickstart]
    task_count: 31
    loops_or_phases: 6
  model: unknown
  helper_models: []
  harness: "Copilot SDK in VS Code"
  harness_version: unknown
  mcp_servers: []
  rag_and_sources: ["Cisco Understand Administrative Distance (Document ID 15986)", "Cisco IOS XE 17.x Basic IP Routing Configuration Guide", "RFC 1812 Section 5.2.4.3", "RFC 7608"]
  skills_and_plugins: ["Spec Kit: constitution, specify, plan, tasks, implement", "Spec Kit git-feature"]
  other_tools: ["Node.js 26.5.0", "Python 3", "Git", "GitHub CLI", "integrated browser"]
  human_prompts: 0
  usage:
    input_tokens: unknown
    output_tokens: unknown
    cost_note: "Not measured; no per-project usage record is available."
  ai_generated_assets: []

runtime:
  kind: static-web
  stack: [HTML, CSS, "JavaScript ES modules"]
  start: "cd WORKSHOP/LAB/Examples/RIBRush && python3 -m http.server 8000 --bind 127.0.0.1"
  url_after_start: "http://127.0.0.1:8000"
  hosted_url: ""
  static_root: "WORKSHOP/LAB/Examples/RIBRush"
  requires_install: false
  requires_network: false
  requires_api_key: false
  uses_ai_at_runtime: false
  browsers: ["Integrated browser (version unknown)"]
  accessibility: "Keyboard controls and a full 35-packet playthrough were checked. Reduced-motion, 320px layout, contrast, and mute checks are recorded in README.md; no screen-reader audit is recorded."
  save_state: "In-memory only; reloading starts a new run."

verification:
  tests: "Start the local server, then open http://127.0.0.1:8000/tests/"
  tests_passing: 12
  facts_sourced_from: ["Cisco IOS/IOS XE administrative-distance documentation", "RFC 1812", "RFC 7608"]
  known_limits: ["Eligible-candidate teaching model; it does not simulate route installation, next-hop recursion, the FIB, or BGP best-path.", "Five-person formative network-engineer playtest remains outstanding."]
---

## In one paragraph

RIBRush is a browser puzzle for people learning how routers choose a next hop.
Players route 35 packets by comparing destinations with IPv4 and IPv6 candidate
routes, then get an explanation of the deciding rule. The seven levels build
from simple longest-prefix decisions to Cisco administrative distance and
same-protocol metrics, with a specific-route-versus-trusted-route trap. It is
designed for early routing practice, not as a simulation of a vendor's full
route-installation pipeline.

## How it was built

The project began with a constitution and a feature specification, then added
research, a plan, data-model and UI contracts, a quickstart, and ordered
implementation tasks. The route rules were grounded in Cisco IOS/IOS XE
administrative-distance documentation and the relevant IPv4 and IPv6
longest-prefix references. The implementation separates address handling,
route evaluation, deterministic scenario generation, run state, and
presentation so the evaluator remains the authority for each answer. Human
feedback shaped the project name, the Cisco AD baseline, the progression from
IPv4 into IPv6, and the decision to mix LPM, AD, and metric warmups in Level 1.
Repeated destination blocks across levels were addressed with distinct IPv4
route pools, and the specification and design documents were synchronized
with those changes. The browser check page reports 12 passing checks, and a
full 35-packet run was verified. The five-person formative playtest is still
outstanding.

## What we'd tell the next builder

- Keep the learning model explicit: LPM first, AD only for identical prefixes,
  then metric only for the same protocol and prefix.
- Preserve seeded generation and independently expected fixtures when adding
  route pools; varied data still needs reproducible correctness checks.
- Complete the five-person playtest and record evidence before calling the
  release criteria finished.
