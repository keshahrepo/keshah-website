"use client";

// Animated side-by-side blood vessel diagram — left vessel pinched (Tight),
// right vessel open with flowing blood cells (Healthy). Used in FounderStory
// (men's mechanism beat) and WhyItHappens (women's mechanism slide). Vessel
// stroke/fill use currentColor so the diagram inherits the foreground tone
// of whichever theme it sits in (white on /startus3, near-black on /mandy).
//
// Direct port of the Flutter _BloodVesselPainter from founder_story_page.dart:
// sine waves drive the pinch pulse, bobble of stuck cells, and compression
// arrow pulse — same formulas as Flutter so the visual feels identical.

import { useEffect, useState } from "react";

interface Props {
  /** Width in pixels of the SVG viewBox. Default 320. */
  width?: number;
  /** Height in pixels of the SVG viewBox. Default 200. */
  height?: number;
  /** Show the "Tight" / "Healthy" labels at the bottom. Default true. */
  showLabels?: boolean;
  className?: string;
}

const RED = "#DC3545";
const GREEN = "#359033";

export default function BloodVesselAnimation({
  width = 320,
  height = 200,
  showLabels = true,
  className,
}: Props) {
  // animValue cycles 0 → 1 over 3 seconds, matching the Flutter controller.
  const [animValue, setAnimValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const duration = 3000;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = (now - start) % duration;
      setAnimValue(elapsed / duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Layout (matches Flutter Size.width/height calculations)
  const W = width;
  const H = height;
  const vesselHeight = H * 0.55;
  const vesselWidth = 26;
  const leftCx = W * 0.28;
  const rightCx = W * 0.72;
  const cy = H * 0.45;
  const topY = cy - vesselHeight / 2;
  const bottomY = cy + vesselHeight / 2;
  const pinchY = cy;

  const pinchAmount = 0.08 + 0.04 * Math.sin(animValue * 2 * Math.PI);
  const bobble = 2 * Math.sin(animValue * 4 * Math.PI);
  const arrowPulse = 6 + 3 * Math.sin(animValue * 2 * Math.PI);

  const leftPath =
    `M ${leftCx - vesselWidth / 2} ${topY}` +
    ` Q ${leftCx - vesselWidth / 2} ${pinchY - 20}, ${leftCx - vesselWidth * pinchAmount} ${pinchY}` +
    ` Q ${leftCx - vesselWidth / 2} ${pinchY + 20}, ${leftCx - vesselWidth / 2} ${bottomY}` +
    ` Q ${leftCx} ${bottomY + 4}, ${leftCx + vesselWidth / 2} ${bottomY}` +
    ` Q ${leftCx + vesselWidth / 2} ${pinchY + 20}, ${leftCx + vesselWidth * pinchAmount} ${pinchY}` +
    ` Q ${leftCx + vesselWidth / 2} ${pinchY - 20}, ${leftCx + vesselWidth / 2} ${topY}` +
    ` Q ${leftCx} ${topY - 4}, ${leftCx - vesselWidth / 2} ${topY}` +
    ` Z`;

  const rightPath =
    `M ${rightCx - vesselWidth / 2} ${topY}` +
    ` L ${rightCx - vesselWidth / 2} ${bottomY}` +
    ` Q ${rightCx} ${bottomY + 4}, ${rightCx + vesselWidth / 2} ${bottomY}` +
    ` L ${rightCx + vesselWidth / 2} ${topY}` +
    ` Q ${rightCx} ${topY - 4}, ${rightCx - vesselWidth / 2} ${topY}` +
    ` Z`;

  const flowingCells = Array.from({ length: 5 }, (_, i) => {
    const cellProgress = (animValue + i * 0.2) % 1;
    const cellY = topY + 10 + cellProgress * (vesselHeight - 20);
    return { x: rightCx, y: cellY };
  });

  const stuckCells = [
    { x: leftCx, y: pinchY - 25 + bobble },
    { x: leftCx - 6, y: pinchY - 38 + bobble * 0.5 },
    { x: leftCx + 5, y: pinchY - 35 + bobble * 0.7 },
    { x: leftCx - 2, y: pinchY - 50 + bobble * 0.3 },
  ];

  const leftArrowX = leftCx - vesselWidth / 2 - arrowPulse - 12;
  const leftArrowEndX = leftCx - vesselWidth / 2 - 4;
  const rightArrowX = leftCx + vesselWidth / 2 + arrowPulse + 12;
  const rightArrowEndX = leftCx + vesselWidth / 2 + 4;
  const flowArrowY = cy + 20;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left (blocked) vessel */}
      <path d={leftPath} fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />

      {/* Right (healthy) vessel */}
      <path d={rightPath} fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />

      {/* Stuck cells (left) */}
      {stuckCells.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="4" fill={RED} />
      ))}

      {/* X at the blockage */}
      <line x1={leftCx - 6} y1={pinchY - 6} x2={leftCx + 6} y2={pinchY + 6} stroke={RED} strokeWidth="2.5" strokeLinecap="round" />
      <line x1={leftCx + 6} y1={pinchY - 6} x2={leftCx - 6} y2={pinchY + 6} stroke={RED} strokeWidth="2.5" strokeLinecap="round" />

      {/* Compression arrow — left side */}
      <line x1={leftArrowX} y1={pinchY} x2={leftArrowEndX} y2={pinchY} stroke="rgba(220,53,69,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={leftArrowEndX} y1={pinchY} x2={leftArrowEndX - 4} y2={pinchY - 4} stroke="rgba(220,53,69,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={leftArrowEndX} y1={pinchY} x2={leftArrowEndX - 4} y2={pinchY + 4} stroke="rgba(220,53,69,0.7)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Compression arrow — right side */}
      <line x1={rightArrowX} y1={pinchY} x2={rightArrowEndX} y2={pinchY} stroke="rgba(220,53,69,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rightArrowEndX} y1={pinchY} x2={rightArrowEndX + 4} y2={pinchY - 4} stroke="rgba(220,53,69,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rightArrowEndX} y1={pinchY} x2={rightArrowEndX + 4} y2={pinchY + 4} stroke="rgba(220,53,69,0.7)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Flowing cells (right) */}
      {flowingCells.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="4" fill={RED} />
      ))}

      {/* Flow arrow inside the healthy vessel */}
      <line x1={rightCx} y1={flowArrowY - 15} x2={rightCx} y2={flowArrowY + 15} stroke="rgba(53,144,51,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rightCx} y1={flowArrowY + 15} x2={rightCx - 5} y2={flowArrowY + 8} stroke="rgba(53,144,51,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rightCx} y1={flowArrowY + 15} x2={rightCx + 5} y2={flowArrowY + 8} stroke="rgba(53,144,51,0.7)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Labels */}
      {showLabels && (
        <>
          <text x={leftCx} y={H * 0.85 + 10} textAnchor="middle" fill={RED} fontSize="11" fontWeight="600" fontFamily="Poppins, sans-serif">
            Tight
          </text>
          <text x={rightCx} y={H * 0.85 + 10} textAnchor="middle" fill={GREEN} fontSize="11" fontWeight="600" fontFamily="Poppins, sans-serif">
            Healthy
          </text>
        </>
      )}
    </svg>
  );
}
