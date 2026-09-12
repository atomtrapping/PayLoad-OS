'use client';

import { useState } from 'react';
import type { ProjectMilestoneDrawContext } from '@/domain/n11MeasurementEconomy';
import { optimizeInspectionTasking } from '@/domain/n11MeasurementEconomy';
import { fmtUtc, shortHash } from '@/lib/format';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';
import type { TaskingOrderRecord } from '@/domain/productionPipeline';
import { getActiveParameterSet } from '@/domain/parameterRegistry';

interface N11VoiTaskingWorkbenchProps {
  initialContexts: readonly ProjectMilestoneDrawContext[];
}

function createCompletedTaskingOrder(
  orderSeq: number,
  projectId: string,
  targetMilestone: string,
  instrumentId: TaskingOrderRecord['instrumentId'],
  sensitivity: number,
  falseAlarmRate: number,
  unitCostCents: number,
  defectExisted: boolean,
  sensorAlerted: boolean,
  latencyHours: number
): TaskingOrderRecord {
  const timestamp = 1786500000000 + orderSeq * 3600000;
  return {
    orderId: `N11-TASK-SESSION-${orderSeq.toString().padStart(4, '0')}`,
    projectId,
    targetMilestone,
    instrumentId,
    status: 'OBSERVED',
    dispatchedAt: new Date(timestamp - 48 * 3600000).toISOString(),
    observedAt: new Date(timestamp).toISOString(),
    priors: {
      assumedSensitivity: sensitivity,
      assumedFalseAlarmRate: falseAlarmRate,
      authorizedCostCents: unitCostCents,
    },
    observationOutcome: {
      defectActuallyExisted: defectExisted,
      instrumentDetectedDefect: sensorAlerted,
      turnaroundHoursElapsed: latencyHours,
      measuredNoiseVarianceMm: 2.1,
    },
  };
}

export function N11VoiTaskingWorkbench({ initialContexts }: N11VoiTaskingWorkbenchProps) {
  const [selectedContextId, setSelectedContextId] = useState<string>(initialContexts[0]?.projectId ?? '');
  const [drawAmountMultiplier, setDrawAmountMultiplier] = useState<number>(1.0);
  const [priorProbabilityPct, setPriorProbabilityPct] = useState<number>(14);
  const [ordersHistory, setOrdersHistory] = useState<TaskingOrderRecord[]>([...FIXTURE_TASKING_ORDERS]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [defectExisted, setDefectExisted] = useState(true);
  const [sensorAlerted, setSensorAlerted] = useState(true);

  const baseContext = initialContexts.find((c) => c.projectId === selectedContextId) ?? initialContexts[0];

  const activeContext: ProjectMilestoneDrawContext = {
    ...baseContext,
    requestedDrawAmountCents: Math.round(baseContext.requestedDrawAmountCents * drawAmountMultiplier),
    estimatedDefectCostAtRiskCents: Math.round(baseContext.estimatedDefectCostAtRiskCents * drawAmountMultiplier),
    priorDefectProbability: priorProbabilityPct / 100,
  };

  const paramSet = getActiveParameterSet();
  const schedule = optimizeInspectionTasking(activeContext, {
    paramSet,
    taskingHistory: ordersHistory,
  });
  const recommended = schedule.recommendedInstrument;

  const handleRecordObservation = () => {
    const newOrder = createCompletedTaskingOrder(
      ordersHistory.length + 1,
      activeContext.projectId,
      activeContext.milestoneTitle,
      recommended.instrument.id,
      recommended.instrument.defectDetectionSensitivity,
      recommended.instrument.falseAlarmRate,
      recommended.instrument.unitCostCents,
      defectExisted,
      sensorAlerted,
      recommended.instrument.latencyHours
    );

    setOrdersHistory((prev) => [newOrder, ...prev]);
    setShowLogModal(false);
  };

  return (
    <div className="space-y-6 text-ink">
      {/* Top Banner & Scenario Switcher */}
      <div className="border border-hair surface p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-hair gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-ink">
                N11 Value-of-Information (VOI) Tasking Optimizer
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-cond/15 text-cond font-bold">
                SESSION ONLY — NOT PERSISTED
              </span>
            </div>
            <p className="text-xs text-ink-2 font-mono mt-0.5">
              Bayesian Decision Loss Optimization for Project Finance Milestone Draws • Model Priors: {paramSet.version}
            </p>
          </div>
          {/* A select sizes itself to its longest option, and these project names
              run to 506px. Unconstrained, it pushed the layout viewport of a
              412px phone out to 623 — which scales the whole page down and makes
              every pointer coordinate land somewhere else. It is bounded now,
              and the row wraps rather than compressing. */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs text-ink-2 font-medium">Megaproject Draw:</span>
            <select
              aria-label="Megaproject draw"
              value={selectedContextId}
              onChange={(e) => setSelectedContextId(e.target.value)}
              className="min-w-0 max-w-full text-xs font-semibold surface-inset border border-hair-strong px-2.5 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-ice"
            >
              {initialContexts.map((ctx) => (
                <option key={ctx.projectId} value={ctx.projectId}>
                  {ctx.projectName} (${(ctx.requestedDrawAmountCents / 1e8).toFixed(1)}M Draw)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Sliders for Credit Officers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
          <div>
            <div className="flex justify-between font-medium text-ink mb-1">
              <span>Requested Draw Size</span>
              <span className="font-mono font-bold">${(activeContext.requestedDrawAmountCents / 1e8).toFixed(1)}M USD</span>
            </div>
            <input
              aria-label="Requested draw size, as a multiple of the declared draw"
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={drawAmountMultiplier}
              onChange={(e) => setDrawAmountMultiplier(parseFloat(e.target.value))}
              className="w-full accent-ice h-1.5 bg-ice/10 cursor-pointer"
            />
            <div className="text-[10px] text-ink-2 mt-1">
              Defect cost at risk: ${(activeContext.estimatedDefectCostAtRiskCents / 1e8).toFixed(2)}M
            </div>
          </div>

          <div>
            <div className="flex justify-between font-medium text-ink mb-1">
              <span>Prior Defect Probability P(θ)</span>
              <span className="font-mono font-bold">{priorProbabilityPct}%</span>
            </div>
            <input
              aria-label="Prior defect probability, percent"
              type="range"
              min="1"
              max="45"
              step="1"
              value={priorProbabilityPct}
              onChange={(e) => setPriorProbabilityPct(parseInt(e.target.value, 10))}
              className="w-full accent-ice h-1.5 bg-ice/10 cursor-pointer"
            />
            <div className="text-[10px] text-ink-2 mt-1">
              Subcontractor baseline defect rate prior to metrology inspection
            </div>
          </div>

          <div>
            <div className="flex justify-between font-medium text-ink mb-1">
              <span>Lender Draw Latency Window</span>
              <span className="font-mono font-bold">{activeContext.maxAllowedLatencyHours} Hours</span>
            </div>
            <div className="text-xs text-ink-2 surface-inset p-2.5 border border-hair">
              Dispute Delay Penalty: <strong className="font-mono">${((activeContext.requestedDrawAmountCents * 0.015) / 1e5).toFixed(1)}k</strong>
              <span className="block text-[10px] text-ink-2 mt-0.5">CFMA Prior: 1.5% draw interest carry</span>
            </div>
          </div>
        </div>

        {/* Computation Receipt Strip */}
        <div className="mt-4 pt-3 border-t border-hair flex flex-wrap items-center justify-between text-[11px] text-ink-2 gap-2 font-mono">
          <div className="flex items-center gap-2">
            {/* Not notarized. generateComputationReceipt hashes the inputs and
                the output of this page's own computation; the digests below are
                what a reader can recompute, and no third party has attested
                anything. */}
            <span className="px-1.5 py-0.5 bg-ice/6 text-ink border border-hair-strong font-semibold">
              Receipt digested
            </span>
            <span>ID: <strong className="text-ink">{schedule.computationReceipt.receiptId}</strong></span>
          </div>
          <div className="flex items-center gap-3">
            <span>Inputs: {shortHash(schedule.computationReceipt.inputsDigest)}</span>
            <span>Outputs: {shortHash(schedule.computationReceipt.outputDigest)}</span>
            <span>Params: {schedule.computationReceipt.parameterSetVersion}</span>
          </div>
        </div>
      </div>

      {/* Recommended Pareto Instrument Hero Card */}
      <div className="border border-ok/45 bg-ok/10 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-ok/45 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-ok/25 text-ice uppercase tracking-wider">
                Optimal VOI Instrument
              </span>
              <span className="text-xs text-ok font-mono font-semibold">
                Status: {recommended.calibrationStatus}
              </span>
            </div>
            <h4 className="text-xl font-bold text-ink mt-1">
              {recommended.instrument.label}
            </h4>
            <p className="text-xs text-ink-2 mt-1 max-w-2xl">
              {recommended.reasoning}
            </p>
          </div>

          <div className="flex flex-col items-end">
            <div className="text-xs text-ink-2 font-medium">Net Measurement Surplus</div>
            <div className="text-3xl font-extrabold font-mono text-ok">
              +${(recommended.netMeasurementSurplusCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[11px] font-mono text-ok font-bold">
              ROI: {recommended.returnOnMeasurementSpendRatio}x Information Return
            </div>
          </div>
        </div>

        {/* Bayesian Loss Delta Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs font-mono">
          <div className="surface p-3 border border-ok/45">
            <div className="text-[10px] text-ink-2 uppercase font-sans font-semibold">Prior Expected Loss L₀</div>
            <div className="text-base font-bold text-ink mt-0.5">
              ${(recommended.priorExpectedLossCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[10px] text-ink-2">Unmitigated risk</div>
          </div>

          <div className="surface p-3 border border-ok/45">
            <div className="text-[10px] text-ink-2 uppercase font-sans font-semibold">Posterior Loss L₁</div>
            <div className="text-base font-bold text-ok mt-0.5">
              ${(recommended.posteriorExpectedLossCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[10px] text-ink-2">Post-sensor residual</div>
          </div>

          <div className="surface p-3 border border-ok/45">
            <div className="text-[10px] text-ink-2 uppercase font-sans font-semibold">Authorized Cost</div>
            <div className="text-base font-bold text-ink mt-0.5">
              ${(recommended.instrument.unitCostCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[10px] text-ink-2">Vendor tasking fee</div>
          </div>

          <div className="surface p-3 border border-ok/45">
            <div className="text-[10px] text-ink-2 uppercase font-sans font-semibold">Turnaround Window</div>
            <div className="text-base font-bold text-ink mt-0.5">
              {recommended.instrument.latencyHours}h / {activeContext.maxAllowedLatencyHours}h
            </div>
            <div className="text-[10px] text-ok font-bold">Within lender bound</div>
          </div>
        </div>
      </div>

      {/* Full Candidate Instruments Matrix */}
      <div className="border border-hair surface overflow-hidden">
        <div className="p-4 border-b border-hair surface-inset flex items-center justify-between">
          <div>
            <h4 className="font-bold text-ink text-sm">
              Candidate Instrument Portfolio & Metrology Specs
            </h4>
            <p className="text-xs text-ink-2">
              Ranking candidate inspection technologies by Net Expected Economic Surplus (EVSI − Cost)
            </p>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            className="px-3 py-1.5 bg-ice/10 ring-1 ring-hair-strong hover:bg-ice/16 text-ice text-xs font-semibold transition-colors"
          >
            + Add outcome to this session
          </button>
        </div>

        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full text-left text-xs">
            <thead className="bg-ice/6 text-ink-2 font-semibold border-b border-hair">
              <tr>
                <th className="p-3">Instrument</th>
                <th className="p-3">Category</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Turnaround</th>
                <th className="p-3">EVSI Value</th>
                <th className="p-3">Net Surplus</th>
                <th className="p-3">ROI</th>
                <th className="p-3">Calibration Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {schedule.evaluations.map((evalItem, idx) => {
                const isOptimal = evalItem.recommendationStatus === 'OPTIMAL_SELECTION';
                return (
                  <tr
                    key={evalItem.instrument.id}
                    className={`transition-colors ${
                      isOptimal ? 'bg-ok/10 font-medium' : 'hover:bg-ice/5' }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-ink-2 font-bold">#{idx + 1}</span>
                        <div>
                          <div className="font-semibold text-ink">{evalItem.instrument.label}</div>
                          <div className="text-[10px] text-ink-2 font-mono">
                            Sensitivity {(evalItem.instrument.defectDetectionSensitivity * 100).toFixed(1)}% · False Alarm {(evalItem.instrument.falseAlarmRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-ink-2 text-[11px]">
                      {evalItem.instrument.category}
                    </td>
                    <td className="p-3 font-mono font-semibold text-ink">
                      ${(evalItem.instrument.unitCostCents / 1e5).toFixed(1)}k
                    </td>
                    <td className="p-3 font-mono text-ink-2">
                      {evalItem.instrument.latencyHours}h
                    </td>
                    <td className="p-3 font-mono text-ok font-semibold">
                      ${(evalItem.expectedValueOfInformationCents / 1e5).toFixed(1)}k
                    </td>
                    <td className="p-3 font-mono">
                      <span className={`font-bold ${
                        evalItem.netMeasurementSurplusCents > 0 ? 'text-ok' : 'text-no' }`}>
                        {evalItem.netMeasurementSurplusCents > 0 ? '+' : ''}
                        ${(evalItem.netMeasurementSurplusCents / 1e5).toFixed(1)}k
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-ink">
                      {evalItem.returnOnMeasurementSpendRatio > 100 ? '∞' : `${evalItem.returnOnMeasurementSpendRatio}x`}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5  text-[10px] font-mono font-semibold ${
                        evalItem.calibrationStatus === 'CALIBRATED_EMPIRICAL' ? 'bg-ok/15 text-ok' : 'bg-ice/6 text-ink-2' }`}>
                        {evalItem.calibrationStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closed Loop Calibration History Strip */}
      <div className="border border-hair surface p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-hair pb-2">
          <div>
            <h5 className="font-bold text-ink text-sm">
              Tasking history ({ordersHistory.length} completed {ordersHistory.length === 1 ? 'order' : 'orders'})
            </h5>
            <p className="text-xs text-ink-2">
              Each instrument&rsquo;s sensitivity and false-alarm rate is re-estimated from the outcomes below, where they
              support it. One completed order per instrument is not an empirical calibration, and the status column above
              says PROVISIONAL_FROM_HISTORY rather than CALIBRATED_EMPIRICAL for exactly that reason.
            </p>
          </div>
          <span className="text-xs font-mono text-ink-2">Committed fixture · {FIXTURE_TASKING_ORDERS.length} orders</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {ordersHistory.slice(0, 3).map((ord) => (
            <div key={ord.orderId} className="p-3 surface-inset border border-hair space-y-1">
              <div className="flex justify-between font-mono text-[10px]">
                <strong className="text-ink">{ord.orderId}</strong>
                <span className="text-ok font-bold">{ord.status}</span>
              </div>
              <div className="text-ink font-medium truncate">{ord.targetMilestone}</div>
              <div className="text-[10px] text-ink-2 font-mono">
                Instrument: {ord.instrumentId}
              </div>
              {ord.observationOutcome && (
                <div className="text-[10px] text-ink-2 pt-1 border-t border-hair">
                  Defect Existed: <strong className={ord.observationOutcome.defectActuallyExisted ? 'text-no' : 'text-ok'}>
                    {ord.observationOutcome.defectActuallyExisted ? 'YES' : 'NO'}
                  </strong> • Detected: <strong>{ord.observationOutcome.instrumentDetectedDefect ? 'YES' : 'NO'}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generated Tasking Dispatch Order Draft */}
      <div className="border border-hair bg-ice/10 ring-1 ring-hair-strong text-ice p-5 font-mono text-xs space-y-3">
        <div className="flex justify-between items-center border-b border-ice pb-3">
          <span className="text-ok font-bold tracking-wider">
            N11 MEASUREMENT TASKING ORDER DRAFT
          </span>
          <span className="text-ink-2 text-[11px]">
            {schedule.measurementOrderDraft.orderId}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
          <div>
            <span className="text-ink-2 block">TARGET MILESTONE</span>
            <span className="text-ice font-semibold">{schedule.measurementOrderDraft.targetMilestone}</span>
          </div>
          <div>
            <span className="text-ink-2 block">DISPATCHED INSTRUMENT</span>
            <span className="text-ok font-semibold">{schedule.measurementOrderDraft.dispatchedInstrument}</span>
          </div>
          <div>
            <span className="text-ink-2 block">AUTHORIZED BUDGET</span>
            <span className="text-ice font-semibold">
              ${(schedule.measurementOrderDraft.budgetAuthorizedCents / 1e5).toFixed(2)}k USD
            </span>
          </div>
          <div>
            <span className="text-ink-2 block">PROJECTED SURPLUS VALUE</span>
            <span className="text-ok font-semibold">
              +${(schedule.measurementOrderDraft.expectedSurplusGeneratedCents / 1e5).toFixed(2)}k USD
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-ice text-[10px] text-ink-2 flex justify-between items-center">
          <span>{schedule.measurementOrderDraft.notaryNotice}</span>
          <span>{fmtUtc(schedule.measurementOrderDraft.generatedAt)}</span>
        </div>
      </div>

      {/*
        Ground-truth observation dialog.

        Centred and unscrollable, this was taller than a 412px phone viewport,
        which put its own confirm button below the fold with no way to reach
        it — a fixed backdrop does not scroll, so the footer was simply gone.
        It scrolls now, and the panel is bounded.
      */}
      {showLogModal && (
        <div className="fixed inset-0 bg-scrim z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="surface p-6 max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] text-xs">
            <h4 className="text-base font-bold text-ink">Add a ground-truth inspection outcome</h4>
            <p className="text-ink-2">
              This recomputes the tasking optimizer against the committed history plus the outcome below. The entry lives in
              this page only: nothing is sent to a server, nothing is stored, and it is gone on reload. Closing the N11 loop
              would mean writing the outcome somewhere, and there is nowhere in this system a tasking order is written.
            </p>

            <div className="space-y-3">
              <div>
                <label className="font-semibold text-ink block mb-1">Target Instrument</label>
                <div className="p-2 bg-ice/6 font-mono font-medium">{recommended.instrument.label}</div>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Did a defect actually exist on ground truth physical teardown?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={defectExisted} onChange={() => setDefectExisted(true)} />
                    <span>Yes, defect existed</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={!defectExisted} onChange={() => setDefectExisted(false)} />
                    <span>No, site was sound</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Did the instrument trigger an alert?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={sensorAlerted} onChange={() => setSensorAlerted(true)} />
                    <span>Yes, alerted</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={!sensorAlerted} onChange={() => setSensorAlerted(false)} />
                    <span>No alert</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Wraps and does not shrink: at a 412px viewport the unwrapped row
                squeezed these two together until Cancel sat over the confirm
                button and swallowed its clicks. */}
            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-hair">
              <button
                onClick={() => setShowLogModal(false)}
                className="shrink-0 px-3 py-1.5 border border-hair-strong font-medium text-ink hover:bg-ice/5"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordObservation}
                className="shrink-0 px-3 py-1.5 bg-ice/10 ring-1 ring-hair-strong text-ice font-semibold hover:bg-ice/16"
              >
                Recompute for this session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
