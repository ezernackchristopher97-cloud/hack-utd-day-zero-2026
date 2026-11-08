# Method and sources

## Observation

The same readings can fit more than one fault. Relay uses Shannon entropy to measure uncertainty among the possible faults. It ranks field checks by the expected reduction in uncertainty and shows how much each check costs and how long it takes. Relay updates the fault probabilities with Bayes' rule and keeps the forecast cases supported by the new reading. The starting probabilities come from the exercise.

The time spent on a field check delays the response. In Avon, the contact check takes one minute. A latched contact calls for a truck and reduced flow from North Pad. A clear contact leaves enough time to open the auxiliary tank. The slower meter check leaves both faults possible, so the bypass is the cheapest response that works in either case.

Two systems can have the same readings at rest and respond differently to a new check. Christopher Ezernack develops this distinction in *Toroidal Manifolds and Recursive Neural Dynamics* and *Boundary Limited Observer Systems*. [Boundary Limited Observer Systems](https://github.com/ezernackchristopher97-cloud/BoundaryObserver)

## Disturbance test

*Toroidal Manifolds and Recursive Neural Dynamics* gives the radial displacement as $r(t)-1=(r(0)-1)e^{-\lambda t}$. When $r(0)=1$, all three rates give the same reading. A pulse of size $a$ sets $r(0)=1+a$. The positive rate makes the displacement decay, the zero rate keeps it steady, and the negative rate makes it grow. Relay rounds each sample down to the selected gauge step. The models can be told apart once all three gauge readings differ.

Relay checks the available pulse sizes. It suggests the smallest pulse that separates all three readings by the deadline and keeps every model within the exercise limit. The decaying curve peaks at the start, the flat curve stays constant, and the growing curve peaks at the end. The endpoints cover the peak between samples. Relay reports if none of the pulses meet both requirements.

With a pulse of 0.016, the panel gauge shows 1.00, 1.00, and 1.02 at the deadline of five seconds. The fine gauge distinguishes the models at three seconds with readings of 1.00, 1.01, and 1.02. A pulse of 0.08 separates the readings sooner but reaches 1.209 within eight seconds, above the exercise limit of 1.20.

The exercise uses simulated rates, pulse sizes, and limits. It uses a single displacement value and assumes the gauge has no measurement noise. It runs separately from the EOG forecast and dispatch. [Input design for active fault diagnosis](https://doi.org/10.1016/j.arcontrol.2019.03.002)

### Absurdity Gap

The gap measures how far a pulse exceeds the limit. Divide the amount over the limit by 0.20, the distance from the starting value to the limit. The score is $1-e^{-\text{residual}}$. Relay blocks any pulse that goes over the limit. The 0.08 pulse scores 0.0437. The 0.016 pulse has a gap of zero even on the panel gauge, where two models still share a reading. The calculation comes from Christopher Ezernack's *The Absurdity Gap*, July 2026 draft, sections 4.2, 4.4, and 4.6.

## Phase test

There are eight ways to set three phases when each phase is either $0$ or $\pi$. The test computes the probabilities $p_j=(1+0.6\cos\theta_j)/2$ and sums their binary entropies in nats. These probabilities are 0.8 and 0.2, which have the same binary entropy. All eight states therefore have the same total entropy of 1.501207 and memory value of 1.000805. Each new cosine reading rules out half of the remaining states, leaving four, then two, then one. The phase model comes from Christopher Ezernack's *Consciousness, Toroidal Dynamics, and Recursive Entropic Filtering*, November 2026 draft, section 3.3 and Appendix D.2.

## Response

Every simulated minute adds the net rate to the state. The water exercise uses a volume balance. The cooling exercises use local temperature ramps. An action starts after its modeled delay and can modify a rate or change the volume in a single step. The engine records the first protective crossing separately from exceeding capacity and propagates disruptions over explicit timed links. The unchecked trace continues beyond the threshold to show what a failed response could expose.

Relay looks for the cheapest plan that stays below the protective limit in every remaining case. If every plan reaches a limit, Relay shows the cost and impact of each option. The planner compares single actions and pairs that can work together. The EOG importer also compares options that share trucks across sites.

The building exercise joins telemetry, asset relationships, and service commitments by asset ID. To estimate exposure, Relay multiplies the minutes after the disruption by the exercise cost per minute. Dispatch saves a simulated work order and handoff locally.

## Tracks

| Track | Workflow |
| --- | --- |
| EOG Resources | Read a new network and sensor file, detect faults or developing anomalies, forecast tank shutdown, and compare truck and well responses. |
| NorthMark Compute & Cloud | Replay a cooling fault, inspect workload exposure, compare recovery options, and hand off the response. |
| CBRE | Join building telemetry, asset relationships, and tenant commitments, compare exposure, and issue a simulated work order. |
| Design | Replay with a keyboard, see uncertainty, and stage an action before applying it. |

## Operational references

- EOG describes a focus on water reuse and operational data transparency. Its challenge specifies the data used for the importer. [Sustainability](https://www.eogresources.com/sustainability/) · [Challenge specification](https://github.com/nihaal419/HackUTD-ZeroDay/blob/main/SPEC.md)
- CBRE covers automated facilities workflows and the cost of downtime. [CBRE FM Technology](https://www.cbre.com/services/manage-properties-and-portfolios/facilities-management/fm-technology)
- NorthMark's incident management role covers triage, escalation, and service commitments. [Incident and Problem Manager](https://nmc2.com/jobs/incident-and-problem-manager-r13115/)
