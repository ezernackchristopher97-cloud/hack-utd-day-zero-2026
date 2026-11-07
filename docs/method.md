# Method and sources

## Observation

The same set of visible readings can fit more than one fault. Relay reports Shannon entropy over the exercise's named hypotheses. It ranks independent probes by expected reduction in uncertainty and shows each probe's time and cost. The reading updates the model weights by Bayes' rule. The forecast retains each case supported by a possible hypothesis. These weights are exercise assumptions.

The observation and intervention distinction draws on Christopher Ezernack's work on interface-limited reconstruction and systems that appear equivalent under passive observation while responding differently to a perturbation. [Boundary Limited Observer Systems](https://github.com/ezernackchristopher97-cloud/BoundaryObserver) · [Toroidal Manifolds and Recursive Neural Dynamics](https://github.com/ezernackchristopher97-cloud/ENTPTCCONPAPER26/blob/main/paper/main.tex)

## Response

Every simulated minute adds the net rate to the state. The water exercise uses a volume balance. The cooling exercises use local temperature ramps. An action starts after its modeled delay and can modify a rate or change the volume in a single step. The engine records the first protective crossing separately from exceeding capacity and propagates disruptions over explicit timed links. The unchecked trace continues beyond the threshold to show what a failed response could expose.

Relay looks for a plan that stays below the protective limit in every retained case. Among those plans it prefers lower cost. If every plan reaches a limit, it shows the trade-off without naming a safe option. The built-in planner compares compatible single actions and pairs. The EOG importer also supplies compound options from shared fleet allocation.

The building exercise joins telemetry, asset relationships, and service commitments by asset ID. Exposure is the representative trace's minutes after disruption times the fixture's cost per minute, through the displayed horizon. Dispatch saves a local simulated work order and a reproducible handoff.

## Tracks

| Track | Workflow |
| --- | --- |
| EOG Resources | Read a new network and sensor file, detect faults or developing anomalies, forecast tank shutdown, and compare truck and well responses. |
| NorthMark Compute & Cloud | Replay a cooling fault, inspect workload exposure, compare recovery options, and hand off the response. |
| CBRE | Join building telemetry, asset relationships, and tenant commitments, compare exposure, and issue a simulated work order. |
| Design | Replay with a keyboard, see uncertainty, and stage an action before applying it. |

## Design references

- EOG describes a focus on water reuse and operational data transparency. Its challenge specifies the data used for the importer. [Sustainability](https://www.eogresources.com/sustainability/) · [Challenge specification](https://github.com/nihaal419/HackUTD-ZeroDay/blob/main/SPEC.md)
- CBRE describes automated facilities workflows and the effect of downtime and cost. That informed the tenant commitments and dispatch view. [CBRE FM Technology](https://www.cbre.com/services/manage-properties-and-portfolios/facilities-management/fm-technology)
- NorthMark highlighted a HackTX winner that made the opportunity cost of simulated alternatives visible. Its incident management role also covers triage, escalation, and service commitments. [HackTX recap](https://nmc2.com/how-hacktx-25-showcased-the-future-of-ai-driven-decision-making/) · [Incident and Problem Manager](https://nmc2.com/jobs/incident-and-problem-manager-r13115/)
- PoyoLabs, a 2025 EOG winner, made the event setting part of a functional demo. DataDriver, a 2025 NorthMark and NVIDIA winner, showed a workflow from an incident to a plan and a live check. Relay follows one incident through a comparison and a recorded response. [PoyoLabs](https://devpost.com/software/poyolabs-47n0fz) · [DataDriver](https://devpost.com/software/datadriver)
