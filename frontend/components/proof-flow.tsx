import { useId } from "react";
import "./proof-flow.css";

type FlowNodeProps = {
  name: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  width: number;
  height?: number;
};

function FlowNode({ name, label, detail, x, y, width, height = 86 }: FlowNodeProps) {
  return (
    <g className="proof-flow-node" data-node={name}>
      <rect className="proof-flow-node-shadow" x={x + 5} y={y + 5} width={width} height={height} rx="12" />
      <rect className="proof-flow-node-surface" x={x} y={y} width={width} height={height} rx="12" />
      <text className="proof-flow-node-label" x={x + width / 2} y={y + 35} textAnchor="middle">{label}</text>
      <text className="proof-flow-node-detail" x={x + width / 2} y={y + 57} textAnchor="middle">{detail}</text>
    </g>
  );
}

const stages = [
  ["01", "Describe the task"],
  ["02", "Write and run"],
  ["03", "Repair if a check fails"],
  ["04", "Keep the receipt + code"],
] as const;

export function ProofFlow() {
  const id = useId().replace(/:/g, "");
  const desktopId = `proof-flow-${id}-desktop`;
  const mobileId = `proof-flow-${id}-mobile`;

  return (
    <section className="mend-proof-flow" id="flow" aria-labelledby={`${id}-flow-heading`}>
      <header className="proof-flow-heading">
        <p className="proof-flow-eyebrow"><span aria-hidden="true" /> THE REPAIR LOOP</p>
        <h2 id={`${id}-flow-heading`}>The flow, in four steps.</h2>
        <p>A failed check sends the patch back through Run. A passing run leads to the receipt.</p>
      </header>
      <ol className="proof-flow-stages" aria-label="Four stages of the Mend workflow">
        {stages.map(([number, label]) => (
          <li key={number}><span className="proof-flow-stage-number" aria-hidden="true">{number}</span><span>{label}</span></li>
        ))}
      </ol>
      <figure className="proof-flow-diagram">
        <svg className="proof-flow-desktop" data-layout="desktop" viewBox="0 0 1120 380" role="img" aria-labelledby={`${desktopId}-title ${desktopId}-desc`}>
          <title id={`${desktopId}-title`}>Mend’s write, run and repair workflow</title>
          <desc id={`${desktopId}-desc`}>A task goes to Write, then Run. Run checks code in an isolated Nebius job. A failed check goes to Diagnose and Repair, then returns to Run, with up to three repair attempts. Only a passing run goes to Receipt.</desc>
          <defs>
            <marker id={`${desktopId}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
            <marker id={`${desktopId}-pass-arrow`} className="proof-flow-pass-marker" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          </defs>
          <g className="proof-flow-edges" fill="none" markerEnd={`url(#${desktopId}-arrow)`}>
            <path data-edge="task-write" d="M 208 107 H 276" />
            <path data-edge="write-run" d="M 464 107 H 540" />
            <path data-edge="run-diagnose" d="M 684 150 V 244" />
            <path data-edge="diagnose-repair" d="M 548 295 H 472" />
            <path data-edge="repair-run" d="M 374 252 V 198 H 592 V 158" />
          </g>
          <path className="proof-flow-edge-pass" data-edge="run-receipt" d="M 728 107 H 884" fill="none" markerEnd={`url(#${desktopId}-pass-arrow)`} />
          <text className="proof-flow-edge-label proof-flow-pass-label" x="808" y="89" textAnchor="middle">CHECKS PASS</text>
          <text className="proof-flow-edge-label" x="700" y="207">CHECK FAILS</text>
          <text className="proof-flow-edge-label" x="462" y="183" textAnchor="middle">PATCH → RE-RUN</text>
          <FlowNode name="task" label="Task" detail="Describe the change" x={28} y={64} width={180} />
          <FlowNode name="write" label="Write" detail="Token Factory" x={284} y={64} width={180} />
          <FlowNode name="run" label="Run" detail="Isolated Nebius job" x={548} y={64} width={180} />
          <FlowNode name="diagnose" label="Diagnose" detail="Read the failed check" x={548} y={252} width={180} />
          <FlowNode name="repair" label="Repair" detail="Up to 3 attempts" x={284} y={252} width={180} />
          <FlowNode name="receipt" label="Receipt" detail="Code + check results" x={892} y={64} width={200} />
        </svg>
        <svg className="proof-flow-mobile" data-layout="mobile" viewBox="0 0 370 730" role="img" aria-labelledby={`${mobileId}-title ${mobileId}-desc`}>
          <title id={`${mobileId}-title`}>Mend’s write, run and repair workflow</title>
          <desc id={`${mobileId}-desc`}>Task leads to Write and Run. A failed Run leads to Diagnose and Repair. Repair returns to Run; it never goes directly to Receipt. A separate passing-check path connects Run to Receipt.</desc>
          <defs>
            <marker id={`${mobileId}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
            <marker id={`${mobileId}-pass-arrow`} className="proof-flow-pass-marker" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          </defs>
          <g className="proof-flow-edges" fill="none" markerEnd={`url(#${mobileId}-arrow)`}>
            <path data-edge="task-write" d="M 212 106 V 122" />
            <path data-edge="write-run" d="M 212 216 V 232" />
            <path data-edge="run-diagnose" d="M 212 326 V 362" />
            <path data-edge="diagnose-repair" d="M 212 456 V 472" />
            <path data-edge="repair-run" d="M 105 523 H 50 V 267 H 97" />
          </g>
          <path className="proof-flow-edge-pass" data-edge="run-receipt" d="M 320 293 H 347 V 663 H 328" fill="none" markerEnd={`url(#${mobileId}-pass-arrow)`} />
          <text className="proof-flow-edge-label" x="222" y="351">FAIL</text>
          <text className="proof-flow-edge-label" x="31" y="396" textAnchor="middle" transform="rotate(-90 31 396)">PATCH → RE-RUN</text>
          <text className="proof-flow-edge-label proof-flow-pass-label" x="358" y="473" textAnchor="middle" transform="rotate(90 358 473)">CHECKS PASS</text>
          <FlowNode name="task" label="Task" detail="Describe the change" x={105} y={20} width={215} />
          <FlowNode name="write" label="Write" detail="Token Factory" x={105} y={130} width={215} />
          <FlowNode name="run" label="Run" detail="Isolated Nebius job" x={105} y={240} width={215} />
          <FlowNode name="diagnose" label="Diagnose" detail="Read the failed check" x={105} y={370} width={215} />
          <FlowNode name="repair" label="Repair" detail="Up to 3 attempts" x={105} y={480} width={215} />
          <FlowNode name="receipt" label="Receipt" detail="Code + check results" x={105} y={620} width={215} />
        </svg>
        <figcaption><a className="proof-evidence-tag" href="#evidence-nebius">Planned Nebius workflow · see legend</a></figcaption>
      </figure>
    </section>
  );
}
