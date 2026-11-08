# Method and sources

## Observation

The same set of visible readings can fit more than one fault. Relay reports Shannon entropy over the exercise's named hypotheses. It ranks independent probes by expected reduction in uncertainty and shows each probe's time and cost. Before a reading arrives, the operator can compare its possible outcomes. Relay updates the model weights by Bayes' rule for each outcome and retains each forecast case supported by a possible hypothesis. These weights are exercise assumptions.

The field check uses part of the response window. Every conditional plan is simulated with its actions delayed by the time required to get that reading. For Avon, the one minute contact check separates two different response windows. A latched contact requires the faster truck and throttle plan. A clear contact leaves enough time to open the auxiliary tank. The slower meter check still permits both hypotheses and requires the bypass.

The observation and intervention distinction draws on Christopher Ezernack's work on interface-limited reconstruction and systems that appear equivalent under passive observation while responding differently to a perturbation. [Boundary Limited Observer Systems](https://github.com/ezernackchristopher97-cloud/BoundaryObserver) · [Toroidal Manifolds and Recursive Neural Dynamics](https://github.com/ezernackchristopher97-cloud/ENTPTCCONPAPER26/blob/main/paper/main.tex)

## Disturbance test

The paper gives the radial displacement as $r(t)-1=(r(0)-1)e^{-\lambda t}$. When $r(0)=1$, positive, zero, and negative rates give the same radial history. The exercise starts from that shared baseline. A pulse of size $a$ sets $r(0)=1+a$. Relay computes each trajectory and bins the samples at the selected gauge resolution. One sample separates the models when their three gauge readings differ. [Radial recovery](https://github.com/ezernackchristopher97-cloud/ENTPTCCONPAPER26/blob/main/paper/main.tex#L270-L280) · [Finite readouts](https://github.com/ezernackchristopher97-cloud/ENTPTCCONPAPER26/blob/main/paper/main.tex#L425-L435)

Relay checks a fixed menu of pulse sizes. It selects the smallest one whose first separating sample arrives by the exercise deadline and whose trajectory stays inside the exercise limit for all three models over the observation window. The decaying curve peaks at the start, the flat curve is constant, and the growing curve peaks at the end. Those endpoints bound the entire window between samples. If the gauge, deadline, and limit leave no qualifying pulse, the exercise reports that result.

With a pulse of 0.016, the panel gauge shows 1.00, 1.00, and 1.02 at the five second deadline. The fine gauge distinguishes the models at three seconds with readings of 1.00, 1.01, and 1.02. A pulse of 0.080 separates the readings sooner but reaches 1.209 within eight seconds, above the exercise limit of 1.20.

The rates, pulse sizes, and limits are synthetic. The exercise uses a scalar displacement and a gauge without measurement noise. It runs separately from the EOG forecast and dispatch. The wider field of active fault diagnosis covers the use of designed inputs to distinguish models. [Input design for active fault diagnosis](https://doi.org/10.1016/j.arcontrol.2019.03.002)

### Absurdity Gap

The test uses the normalized residual in Christopher Ezernack’s *The Absurdity Gap: Structural Incompatibility as a Distinct Quantity in Statistical Learning and Complex Systems*, July 2026 draft, §§4.2, 4.4, and 4.6. The limit residual is the positive excess divided by the 0.20 headroom from baseline to limit. The score is $1-e^{-\text{residual}}$. A positive excess blocks the test. The 0.080 pulse scores 0.0437 and is blocked. The 0.016 pulse has a gap of zero even on the panel gauge, where two models still share a reading. The gap measures the limit violation. The gauge reports which models it can distinguish.

### EntPTC phase test

Christopher Ezernack’s *EntPTC: Consciousness, Toroidal Dynamics, and Recursive Entropic Filtering*, November 2026 draft, §3.3 and Appendix D.2, gives eight equilibrium phase combinations in $\{0,\pi\}^3$. The test computes the Bernoulli probabilities $p_j=(1+0.6\cos\theta_j)/2$ and sums their binary entropies in nats. All eight yield the same equilibrium entropy of 1.501207 and memory of 1.000805. Adding one cosine reading at a time narrows the compatible states from eight to four, two, and one. The extra readings illustrate the observation classes described in §4 of the paper and the interface refinement in [Boundary Limited Observer Systems](https://github.com/ezernackchristopher97-cloud/BoundaryObserver).

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
